import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { useProjectionPreview } from "@/hooks/use-projection-preview";
import { createMappingConfig } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import {
  computeProjectionPayload,
  type ProjectionRequest,
  type ProjectionWorkerRequest,
  type ProjectionWorkerResponse,
} from "@/lib/projection";

const donutSample = mappingSamples.find((sample) => sample.id === "donuts");

if (!donutSample) {
  throw new Error("Missing donut sample");
}

class FakeProjectionWorker {
  static instances: FakeProjectionWorker[] = [];
  static terminateCount = 0;

  private listeners = new Set<(event: MessageEvent<ProjectionWorkerResponse>) => void>();

  constructor() {
    FakeProjectionWorker.instances.push(this);
  }

  static reset() {
    FakeProjectionWorker.instances = [];
    FakeProjectionWorker.terminateCount = 0;
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionWorkerResponse>) => void,
  ) {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  postMessage(request: ProjectionWorkerRequest) {
    setTimeout(() => {
      this.emit({
        progress: {
          label: "Projecting flat CSV rows",
          percent: 45,
          phase: "flat",
          phaseCompleted: 1,
          phaseTotal: 2,
        },
        requestId: request.requestId,
        type: "progress",
      });
    }, 10);

    setTimeout(() => {
      this.emit({
        preview: {
          csvPreview: {
            omittedCharacters: 0,
            text: '"id","type","name"\n"0001","donut","Cake"',
            truncated: false,
          },
          headers: ["id", "type", "name"],
          previewRecords: [{ id: "0001", name: "Cake", type: "donut" }],
          processedRoots: 1,
          rowCount: 7,
          totalRoots: 2,
        },
        requestId: request.requestId,
        type: "stream",
      });
    }, 20);

    setTimeout(() => {
      this.emit({
        payload: computeProjectionPayload(request.payload),
        requestId: request.requestId,
        type: "result",
      });
    }, 120);
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionWorkerResponse>) => void,
  ) {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  terminate() {
    FakeProjectionWorker.terminateCount += 1;
    this.listeners.clear();
  }

  private emit(data: ProjectionWorkerResponse) {
    const event = { data } as MessageEvent<ProjectionWorkerResponse>;

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function ProjectionHarness({
  configVersion,
  enabled,
  request,
}: {
  configVersion: string;
  enabled?: boolean;
  request: ProjectionRequest;
}) {
  const projection = useProjectionPreview(request, configVersion, { enabled });

  return (
    <div>
      <p>Status: {projection.isProjecting ? "projecting" : "ready"}</p>
      <p>Progress label: {projection.progress?.label ?? "none"}</p>
      <p>Progress percent: {projection.progress?.percent ?? "none"}</p>
      <p>Streaming rows: {projection.streamingFlatPreview?.rowCount ?? "none"}</p>
      <p>Rows: {projection.conversionResult?.rowCount ?? 0}</p>
    </div>
  );
}

describe("useProjectionPreview", () => {
  it("stays idle when projection is disabled for input debugging", async () => {
    FakeProjectionWorker.reset();
    vi.stubGlobal("Worker", FakeProjectionWorker);

    render(
      <ProjectionHarness
        configVersion="projection-disabled"
        enabled={false}
        request={{
          config: createMappingConfig({
            flattenMode: "parallel",
            rootPath: "$.items.item[*]",
          }),
          customJson: "",
          rootPath: "$.items.item[*]",
          sampleJson: donutSample.json,
          sourceMode: "sample",
        }}
      />,
    );

    expect(screen.getByText(/status: ready/i)).toBeInTheDocument();
    expect(screen.getByText(/progress label: none/i)).toBeInTheDocument();
    expect(screen.getByText(/streaming rows: none/i)).toBeInTheDocument();
    expect(screen.getByText(/rows: 0/i)).toBeInTheDocument();
  });

  it("consumes worker progress updates before committing the final result", async () => {
    FakeProjectionWorker.reset();
    vi.stubGlobal("Worker", FakeProjectionWorker);

    render(
      <ProjectionHarness
        configVersion="streaming-progress"
        request={{
          config: createMappingConfig({
            flattenMode: "parallel",
            rootPath: "$.items.item[*]",
          }),
          customJson: "",
          rootPath: "$.items.item[*]",
          sampleJson: donutSample.json,
          sourceMode: "sample",
        }}
      />,
    );

    expect(screen.getByText(/status: projecting/i)).toBeInTheDocument();
    expect(screen.getByText(/progress label: parsing json/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/progress label: projecting flat csv rows/i)).toBeInTheDocument();
      expect(screen.getByText(/progress percent: 45/i)).toBeInTheDocument();
      expect(screen.getByText(/streaming rows: 7/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/status: ready/i)).toBeInTheDocument();
      expect(screen.getByText(/progress label: none/i)).toBeInTheDocument();
      expect(screen.getByText(/streaming rows: none/i)).toBeInTheDocument();
      expect(screen.getByText(/rows: 10/i)).toBeInTheDocument();
    });
  });

  it("drops stale preview data and replaces the worker when the request changes", async () => {
    FakeProjectionWorker.reset();
    vi.stubGlobal("Worker", FakeProjectionWorker);

    const { rerender } = render(
      <ProjectionHarness
        configVersion="initial-request"
        request={{
          config: createMappingConfig({
            flattenMode: "parallel",
            rootPath: "$.items.item[*]",
          }),
          customJson: "",
          rootPath: "$.items.item[*]",
          sampleJson: donutSample.json,
          sourceMode: "sample",
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/status: ready/i)).toBeInTheDocument();
      expect(screen.getByText(/rows: 10/i)).toBeInTheDocument();
    });

    rerender(
      <ProjectionHarness
        configVersion="replacement-request"
        request={{
          config: createMappingConfig({
            flattenMode: "parallel",
            rootPath: "$.records[*]",
          }),
          customJson: JSON.stringify({
            records: [{ id: "1", email: "user@example.com" }],
          }),
          rootPath: "$.records[*]",
          sampleJson: donutSample.json,
          sourceMode: "custom",
        }}
      />,
    );

    expect(screen.getByText(/status: projecting/i)).toBeInTheDocument();
    expect(screen.getByText(/rows: 0/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(FakeProjectionWorker.terminateCount).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/status: ready/i)).toBeInTheDocument();
      expect(screen.getByText(/rows: 1/i)).toBeInTheDocument();
    });
  });
});
