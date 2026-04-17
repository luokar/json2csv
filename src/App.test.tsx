import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, vi } from "vitest";

const { downloadExportArtifactMock } = vi.hoisted(() => ({
  downloadExportArtifactMock: vi.fn(),
}));

vi.mock("@/lib/output-export", async () => {
  const actual = await vi.importActual<typeof import("@/lib/output-export")>("@/lib/output-export");

  return {
    ...actual,
    downloadExportArtifact: downloadExportArtifactMock,
  };
});

import App from "@/App";
import {
  computeProjectionPayload,
  type ProjectionWorkerRequest,
  type ProjectionWorkerResponse,
} from "@/lib/projection";

function getFlatPreviewButtonLabels() {
  return within(screen.getAllByRole("table")[0])
    .getAllByRole("button")
    .map((button) => button.textContent?.trim());
}

const noaaLikeCustomJson = JSON.stringify({
  data: {
    "189512": { anomaly: -1.2, value: 51.4 },
    "189612": { anomaly: -0.9, value: 52.1 },
    "189712": { anomaly: -0.4, value: 52.6 },
    "189812": { anomaly: -0.2, value: 52.8 },
    "189912": { anomaly: 0.1, value: 53.1 },
  },
  description: {
    title: "NOAA style sample",
  },
});

const multiCollectionCustomJson = JSON.stringify({
  damage_relations: {
    double_damage_to: [{ name: "grass" }],
    half_damage_to: [{ name: "water" }],
  },
  game_indices: [{ game_index: 1, version: { name: "red" } }],
  generation: { name: "generation-i" },
  id: 10,
  moves: [{ move: { name: "ember" } }, { move: { name: "flamethrower" } }],
  name: "fire",
  pokemon: [{ pokemon: { name: "charizard" } }],
});

const wideFlatPreviewJson = JSON.stringify([
  Object.fromEntries(
    Array.from({ length: 85 }, (_, index) => [
      `field_${String(index + 1).padStart(2, "0")}`,
      `value_${index + 1}`,
    ]),
  ),
]);

const largeObjectRootJson = `{"blob":"${"x".repeat(600_000)}"}`;

async function switchToCustomMode(
  user: ReturnType<typeof userEvent.setup>,
  options: {
    waitForWorkbench?: boolean;
  } = {},
) {
  const waitForWorkbench = options.waitForWorkbench ?? true;

  await user.click(screen.getByRole("button", { name: /your own json/i }));

  await waitFor(
    () => {
      expect(screen.getByLabelText(/your json/i)).toBeInTheDocument();

      if (waitForWorkbench) {
        expect(screen.getByRole("button", { name: /start over/i })).toBeEnabled();
      }
    },
    {
      timeout: waitForWorkbench ? 3_000 : 1_000,
    },
  );
}

class FakeStreamingAppWorker {
  private listeners = new Set<(event: MessageEvent<ProjectionWorkerResponse>) => void>();

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
          label: "Building spreadsheet rows",
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
    }, 600);
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionWorkerResponse>) => void,
  ) {
    if (type === "message") {
      this.listeners.delete(listener);
    }
  }

  terminate() {}

  private emit(data: ProjectionWorkerResponse) {
    const event = { data } as MessageEvent<ProjectionWorkerResponse>;

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  downloadExportArtifactMock.mockReset();
  window.history.replaceState({}, "", "/");
});

describe("App", () => {
  it("renders the converter workspace", async () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /json to spreadsheet/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByLabelText(/data location/i)).toHaveValue("$.items.item[*]");
    expect(screen.getByLabelText(/file name/i)).toHaveValue("Donut CSV export");
    expect(screen.getByRole("button", { name: /column details/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/header policy/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /header mapping/i })).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /^id$/i })).toBeInTheDocument();
  });

  it("downloads the full flat CSV output", async () => {
    const user = userEvent.setup();

    render(<App />);

    await screen.findByRole("button", { name: /^id$/i });
    await user.click(screen.getAllByRole("button", { name: /download csv/i })[0]!);

    await waitFor(() => {
      expect(downloadExportArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "donut-csv-export.csv",
          mimeType: "text/csv;charset=utf-8",
        }),
      );
    });
  });

  it("renders streamed flat-preview rows while the worker is still processing", async () => {
    vi.stubGlobal("Worker", FakeStreamingAppWorker);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/building spreadsheet rows 1\/2 items/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^cake$/i })).toBeInTheDocument();
    });
  });

  it("filters the row preview without disturbing the broader workbench shell", async () => {
    const user = userEvent.setup();

    render(<App />);

    const filterInput = screen.getByLabelText(/filter rows/i);
    await user.type(filterInput, "Maple");

    await waitFor(() => {
      expect(filterInput).toHaveValue("Maple");
      expect(screen.getByText(/^1 shown$/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/file name/i)).toHaveValue("Donut CSV export");
    });
  });

  it("accepts uploaded custom json and projects it with the chosen root path", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user, { waitForWorkbench: false });

    const uploadInput = screen.getByLabelText(/upload \.json/i);
    const file = new File(['{"records":[{"id":"1","email":"one@example.com"}]}'], "contacts.json", {
      type: "application/json",
    });

    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue('{"records":[{"id":"1","email":"one@example.com"}]}'),
    });

    fireEvent.change(uploadInput, { target: { files: [file] } });

    expect(await screen.findByDisplayValue(/contacts export/i)).toBeInTheDocument();

    const rootPath = await screen.findByLabelText(/data location/i);
    expect(rootPath).toHaveValue("$");

    fireEvent.change(rootPath, {
      target: { value: "$.records[*]" },
    });

    await waitFor(() => {
      const buttonLabels = getFlatPreviewButtonLabels();

      expect(buttonLabels).toContain("id");
      expect(buttonLabels).toContain("email");
      expect(buttonLabels).not.toContain("records.email");
    });

    expect(
      screen.getByText(/incremental parsing is active for this location/i),
    ).toBeInTheDocument();
  });

  it("auto-applies smart row detection when importing a keyed-object json file", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user, { waitForWorkbench: false });

    const uploadInput = screen.getByLabelText(/upload \.json/i);
    const file = new File([noaaLikeCustomJson], "110-tavg-ytd-12-1895-2016.json", {
      type: "application/json",
    });

    Object.defineProperty(file, "text", {
      value: vi.fn().mockResolvedValue(noaaLikeCustomJson),
    });

    fireEvent.change(uploadInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByLabelText(/data location/i)).toHaveValue("$.data.*");
      expect(screen.getByText(/auto-applied row detection/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^period$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^value$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^anomaly$/i })).toBeInTheDocument();
    });
  });

  it("smart-detect preserves complex multi-collection roots by switching to stringify at $", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user);

    fireEvent.change(screen.getByLabelText(/your json/i), {
      target: {
        value: multiCollectionCustomJson,
      },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^auto-detect$/i })).toBeEnabled();
    });

    await user.click(screen.getByRole("button", { name: /^auto-detect$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/data location/i)).toHaveValue("$");
      expect(screen.getByLabelText(/nesting style/i)).toHaveValue("stringify");
      expect(
        screen.getByText(/keep the current data location and switch nesting style to text/i),
      ).toBeInTheDocument();
    });
  });

  it("updates the preview immediately while editing custom json", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user, { waitForWorkbench: false });

    expect(screen.queryByRole("button", { name: /apply json/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /format json/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load active sample/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/your json/i), {
      target: { value: '{"id":"1","email":"one@example.com"}' },
    });

    await waitFor(() => {
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^email$/i })).toBeInTheDocument();
    });
  });

  it("suspends live preview for very large object-root custom json", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user, { waitForWorkbench: false });

    fireEvent.change(screen.getByLabelText(/your json/i), {
      target: { value: largeObjectRootJson },
    });

    await waitFor(() => {
      expect(
        screen.getAllByText(/preview is paused for large object-root json/i).length,
      ).toBeGreaterThan(0);
      expect(screen.getAllByRole("button", { name: /download csv/i })[0]).toBeDisabled();
    });

    expect(
      screen.queryByText(/parsing and rebuilding the preview in the background/i),
    ).not.toBeInTheDocument();
  });

  it("pivots arrays into indexed columns from the config form", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/example dataset/i), "heterogeneous");
    await user.selectOptions(screen.getByLabelText(/nesting style/i), "stringify");

    const indexedPivotToggle = screen.getByLabelText(/number list items/i);
    await user.click(indexedPivotToggle);

    await waitFor(() => {
      expect(indexedPivotToggle).toBeChecked();
    });

    await waitFor(() => {
      const buttonLabels = getFlatPreviewButtonLabels();

      expect(buttonLabels).toContain("tags[0]");
      expect(buttonLabels).toContain("tags[1]");
      expect(buttonLabels).not.toContain("tags");
    });
  });

  it("keeps overflow flat columns available through the column controls", async () => {
    const user = userEvent.setup();

    render(<App />);

    await switchToCustomMode(user);

    fireEvent.change(screen.getByLabelText(/your json/i), {
      target: { value: wideFlatPreviewJson },
    });

    expect(screen.queryByRole("button", { name: /apply json/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^field_01$/i })).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: /^field_85$/i })).not.toBeInTheDocument();
    expect(
      screen.getByText(/some columns are hidden by default/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^columns$/i }));

    expect(screen.getByLabelText(/field_85 column visibility/i)).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: /show all columns/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^field_85$/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/field_85 column visibility/i)).toBeChecked();
    });
  }, 15_000);

  it("shows a type drift summary for mixed columns in the schema sidecar", async () => {
    const user = userEvent.setup();

    render(<App />);

    await user.selectOptions(screen.getByLabelText(/example dataset/i), "heterogeneous");
    await user.click(screen.getByRole("button", { name: /column details/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/mixed data types/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/converted to string/i)).toBeInTheDocument();
      expect(screen.getByText(/50% string \/ 50% number/i)).toBeInTheDocument();
    });
  });
});
