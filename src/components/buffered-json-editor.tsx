import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { Textarea } from "@/components/ui/textarea";

export interface BufferedJsonEditorHandle {
  flush: () => string;
  read: () => string;
}

export const bufferedJsonEditorServiceProps = {
  autoCapitalize: "off",
  autoComplete: "off",
  autoCorrect: "off",
  "data-1p-ignore": "true",
  "data-bwignore": "true",
  "data-enable-grammarly": "false",
  "data-gramm": "false",
  "data-grammarly": "false",
  "data-lt-active": "false",
  "data-ms-editor": "false",
  spellCheck: false,
} as const;

interface BufferedJsonEditorProps extends Omit<
  React.ComponentProps<typeof Textarea>,
  "defaultValue" | "onChange" | "value"
> {
  commitOnPause?: boolean;
  commitDelay?: number;
  onCommit: (nextValue: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  value: string;
}

export const bufferedJsonCommitDelayMs = 250;

export const BufferedJsonEditor = forwardRef<BufferedJsonEditorHandle, BufferedJsonEditorProps>(
  function BufferedJsonEditor(
    {
      commitOnPause = true,
      commitDelay = bufferedJsonCommitDelayMs,
      onCommit,
      onDirtyChange,
      value,
      ...props
    },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const draftRef = useRef(value);
    const committedValueRef = useRef(value);
    const dirtyRef = useRef(false);
    const manualCommitUntilBlurRef = useRef(false);
    const timeoutIdRef = useRef<number | null>(null);

    function clearPendingCommit() {
      if (timeoutIdRef.current === null) {
        return;
      }

      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }

    function commit(nextValue = draftRef.current) {
      clearPendingCommit();
      manualCommitUntilBlurRef.current = false;

      if (nextValue === committedValueRef.current) {
        if (dirtyRef.current) {
          dirtyRef.current = false;
          onDirtyChange?.(false);
        }

        return nextValue;
      }

      committedValueRef.current = nextValue;
      dirtyRef.current = false;
      onDirtyChange?.(false);
      onCommit(nextValue);

      return nextValue;
    }

    useImperativeHandle(ref, () => ({
      flush() {
        return commit();
      },
      read() {
        return draftRef.current;
      },
    }));

    useEffect(() => {
      if (timeoutIdRef.current !== null) {
        window.clearTimeout(timeoutIdRef.current);
        timeoutIdRef.current = null;
      }

      committedValueRef.current = value;
      draftRef.current = value;
      dirtyRef.current = false;
      manualCommitUntilBlurRef.current = false;
      onDirtyChange?.(false);

      if (textareaRef.current && textareaRef.current.value !== value) {
        textareaRef.current.value = value;
      }
    }, [onDirtyChange, value]);

    useEffect(
      () => () => {
        if (timeoutIdRef.current !== null) {
          window.clearTimeout(timeoutIdRef.current);
          timeoutIdRef.current = null;
        }
      },
      [],
    );

    return (
      <Textarea
        ref={textareaRef}
        {...props}
        {...bufferedJsonEditorServiceProps}
        defaultValue={value}
        onBlur={() => {
          if (manualCommitUntilBlurRef.current) {
            return;
          }

          commit();
        }}
        onChange={(event) => {
          const previousValue = draftRef.current;
          const nextValue = event.target.value;
          const nativeInputEvent = event.nativeEvent as InputEvent | undefined;
          const isBulkEdit =
            nativeInputEvent?.inputType === "insertFromPaste" ||
            nativeInputEvent?.inputType === "insertFromDrop" ||
            Math.abs(nextValue.length - previousValue.length) > 1;

          draftRef.current = nextValue;
          clearPendingCommit();

          const isDirty = nextValue !== committedValueRef.current;

          if (dirtyRef.current !== isDirty) {
            dirtyRef.current = isDirty;
            onDirtyChange?.(isDirty);
          }

          if (!isDirty) {
            manualCommitUntilBlurRef.current = false;
            return;
          }

          if (isBulkEdit) {
            manualCommitUntilBlurRef.current = true;
            return;
          }

          if (manualCommitUntilBlurRef.current || !commitOnPause) {
            return;
          }

          timeoutIdRef.current = window.setTimeout(() => {
            commit(nextValue);
          }, commitDelay);
        }}
      />
    );
  },
);

BufferedJsonEditor.displayName = "BufferedJsonEditor";
