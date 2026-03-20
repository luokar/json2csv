import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { vi } from "vite-plus/test";

import { InputDiagnostics } from "@/components/input-diagnostics";

describe("InputDiagnostics", () => {
  it("records plain probe input and forwards the projection toggle", async () => {
    const onDisableProjectionChange = vi.fn();

    render(
      <InputDiagnostics
        disableProjection={false}
        onDisableProjectionChange={onDisableProjectionChange}
      />,
    );

    fireEvent.input(screen.getByLabelText(/plain textarea probe/i), {
      target: { value: "abc" },
    });

    await waitFor(() => {
      const logTable = screen.getByRole("table");

      expect(within(logTable).getByText("plain")).toBeInTheDocument();
      expect(within(logTable).getByText("input")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onDisableProjectionChange).toHaveBeenCalledWith(true);
  });
});
