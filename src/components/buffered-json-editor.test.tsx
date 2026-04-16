import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BufferedJsonEditor,
  type BufferedJsonEditorHandle,
  bufferedJsonCommitDelayMs,
} from "@/components/buffered-json-editor";

describe("BufferedJsonEditor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces single-character typing", () => {
    vi.useFakeTimers();

    const handleCommit = vi.fn();

    render(<BufferedJsonEditor aria-label="Custom JSON" onCommit={handleCommit} value="" />);

    const editor = screen.getByLabelText(/custom json/i);

    fireEvent.change(editor, {
      target: { value: "{" },
    });

    expect(handleCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs - 1);

    expect(handleCommit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);

    expect(handleCommit).toHaveBeenCalledWith("{");
  });

  it("can keep single-character typing staged until blur", () => {
    vi.useFakeTimers();

    const handleCommit = vi.fn();

    render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        commitOnPause={false}
        onCommit={handleCommit}
        value=""
      />,
    );

    const editor = screen.getByLabelText(/custom json/i);

    fireEvent.change(editor, {
      target: { value: "{" },
    });

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs);

    expect(handleCommit).not.toHaveBeenCalled();

    fireEvent.blur(editor);

    expect(handleCommit).toHaveBeenCalledWith("{");
  });

  it("keeps bulk inserts buffered until flushed manually", () => {
    vi.useFakeTimers();

    const handleCommit = vi.fn();
    const editorRef = createRef<BufferedJsonEditorHandle>();

    render(
      <BufferedJsonEditor
        ref={editorRef}
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    );

    const editor = screen.getByLabelText(/custom json/i);

    fireEvent.change(editor, {
      target: { value: '{"records":[{"id":"1"}]}' },
    });

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs);

    expect(handleCommit).not.toHaveBeenCalled();

    fireEvent.blur(editor);

    expect(handleCommit).not.toHaveBeenCalled();

    editorRef.current?.flush();

    expect(handleCommit).toHaveBeenCalledWith('{"records":[{"id":"1"}]}');
  });

  it("flushes the latest single-character draft on blur", () => {
    vi.useFakeTimers();

    const handleCommit = vi.fn();

    render(<BufferedJsonEditor aria-label="Custom JSON" onCommit={handleCommit} value="" />);

    const editor = screen.getByLabelText(/custom json/i);

    fireEvent.change(editor, {
      target: { value: "{" },
    });
    fireEvent.blur(editor);

    expect(handleCommit).toHaveBeenCalledWith("{");

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs);

    expect(handleCommit).toHaveBeenCalledTimes(1);
  });

  it("syncs externally replaced values into the textarea DOM", () => {
    const handleCommit = vi.fn();

    const { rerender } = render(
      <BufferedJsonEditor aria-label="Custom JSON" onCommit={handleCommit} value="" />,
    );

    rerender(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value='{"records":[{"id":"3"}]}'
      />,
    );

    expect(screen.getByLabelText(/custom json/i)).toHaveValue('{"records":[{"id":"3"}]}');
  });

  it("disables browser text services for json editing", () => {
    render(<BufferedJsonEditor aria-label="Custom JSON" onCommit={vi.fn()} value="" />);

    const editor = screen.getByLabelText(/custom json/i);

    expect(editor).toHaveAttribute("autocapitalize", "off");
    expect(editor).toHaveAttribute("autocomplete", "off");
    expect(editor).toHaveAttribute("autocorrect", "off");
    expect(editor).toHaveAttribute("data-1p-ignore", "true");
    expect(editor).toHaveAttribute("data-bwignore", "true");
    expect(editor).toHaveAttribute("data-enable-grammarly", "false");
    expect(editor).toHaveAttribute("data-gramm", "false");
    expect(editor).toHaveAttribute("data-grammarly", "false");
    expect(editor).toHaveAttribute("data-lt-active", "false");
    expect(editor).toHaveAttribute("data-ms-editor", "false");
    expect(editor).toHaveAttribute("spellcheck", "false");
  });
});
