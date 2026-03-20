import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vite-plus/test";

import { useRelationalPreview } from "@/hooks/use-relational-preview";
import { createMappingConfig } from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import {
  computeRelationalProjectionPayload,
  type ProjectionRelationalWorkerRequest,
  type ProjectionRelationalWorkerResponse,
  type ProjectionRequest,
} from "@/lib/projection";

const donutSample = mappingSamples.find((sample) => sample.id === "donuts");

if (!donutSample) {
  throw new Error("Missing donut sample");
}

class FakeRelationalWorker {
  private listeners = new Set<(event: MessageEvent<ProjectionRelationalWorkerResponse>) => void>();

  addEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionRelationalWorkerResponse>) => void,
  ) {
    if (type === "message") {
      this.listeners.add(listener);
    }
  }

  postMessage(request: ProjectionRelationalWorkerRequest) {
    setTimeout(() => {
      this.emit({
        progress: {
          label: "Normalizing relational tables",
          percent: 82,
          phase: "relational",
          phaseCompleted: 1,
          phaseTotal: 2,
        },
        requestId: request.requestId,
        type: "progress",
      });
    }, 10);

    setTimeout(() => {
      this.emit({
        payload: computeRelationalProjectionPayload(request.payload),
        requestId: request.requestId,
        type: "result",
      });
    }, 120);
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionRelationalWorkerResponse>) => void,
  ) {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  terminate() {}

  private emit(data: ProjectionRelationalWorkerResponse) {
    const event = { data } as MessageEvent<ProjectionRelationalWorkerResponse>;

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

function RelationalProjectionHarness({
  configVersion,
  enabled,
  request,
}: {
  configVersion: string;
  enabled?: boolean;
  request: ProjectionRequest;
}) {
  const projection = useRelationalPreview(request, configVersion, { enabled });

  return (
    <div>
      <p>Status: {projection.isProjecting ? "projecting" : "ready"}</p>
      <p>Progress label: {projection.progress?.label ?? "none"}</p>
      <p>Tables: {projection.relationalSplitResult?.tables.length ?? 0}</p>
    </div>
  );
}

describe("useRelationalPreview", () => {
  it("stays idle when relational preview is disabled", () => {
    vi.stubGlobal("Worker", FakeRelationalWorker);

    render(
      <RelationalProjectionHarness
        configVersion="relational-disabled"
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
    expect(screen.getByText(/tables: 0/i)).toBeInTheDocument();
  });

  it("commits relational progress updates before the final result", async () => {
    vi.stubGlobal("Worker", FakeRelationalWorker);

    render(
      <RelationalProjectionHarness
        configVersion="relational-progress"
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
      expect(
        screen.getByText(/progress label: normalizing relational tables/i),
      ).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/status: ready/i)).toBeInTheDocument();
      expect(screen.getByText(/progress label: none/i)).toBeInTheDocument();
      expect(screen.getByText(/tables: 3/i)).toBeInTheDocument();
    });
  });
});
