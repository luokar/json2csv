import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { Checkbox } from "@/components/ui/checkbox";

function CheckboxHarness() {
  const [checked, setChecked] = useState(false);

  return (
    <Checkbox
      aria-label="Include archived rows"
      checked={checked}
      onChange={(event) => setChecked(event.target.checked)}
    />
  );
}

describe("Checkbox", () => {
  it("provides the shared checkbox styling and preserves native interaction", async () => {
    const user = userEvent.setup();
    render(<CheckboxHarness />);

    const checkbox = screen.getByRole("checkbox", { name: "Include archived rows" });

    expect(checkbox).toHaveClass("ui-checkbox");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);

    expect(checkbox).toBeChecked();
  });
});
