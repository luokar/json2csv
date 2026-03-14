import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

import { Textarea } from '@/components/ui/textarea'

export interface BufferedJsonEditorHandle {
  flush: () => string
}

interface BufferedJsonEditorProps
  extends Omit<
    React.ComponentProps<typeof Textarea>,
    'defaultValue' | 'onChange' | 'value'
  > {
  commitDelay?: number
  onCommit: (nextValue: string) => void
  value: string
}

export const bufferedJsonCommitDelayMs = 250

export const BufferedJsonEditor = forwardRef<
  BufferedJsonEditorHandle,
  BufferedJsonEditorProps
>(function BufferedJsonEditor(
  { commitDelay = bufferedJsonCommitDelayMs, onCommit, value, ...props },
  ref,
) {
  const [draft, setDraft] = useState(value)
  const draftRef = useRef(value)
  const committedValueRef = useRef(value)
  const timeoutIdRef = useRef<number | null>(null)

  function clearPendingCommit() {
    if (timeoutIdRef.current === null) {
      return
    }

    window.clearTimeout(timeoutIdRef.current)
    timeoutIdRef.current = null
  }

  function commit(nextValue = draftRef.current) {
    clearPendingCommit()

    if (nextValue === committedValueRef.current) {
      return nextValue
    }

    committedValueRef.current = nextValue
    onCommit(nextValue)

    return nextValue
  }

  useImperativeHandle(ref, () => ({
    flush() {
      return commit()
    },
  }))

  useEffect(() => {
    clearPendingCommit()
    committedValueRef.current = value
    draftRef.current = value
    setDraft(value)
  }, [value])

  useEffect(
    () => () => {
      clearPendingCommit()
    },
    [],
  )

  return (
    <Textarea
      {...props}
      value={draft}
      onBlur={() => {
        commit()
      }}
      onChange={(event) => {
        const nextValue = event.target.value

        draftRef.current = nextValue
        setDraft(nextValue)
        clearPendingCommit()

        if (nextValue === committedValueRef.current) {
          return
        }

        timeoutIdRef.current = window.setTimeout(() => {
          commit(nextValue)
        }, commitDelay)
      }}
    />
  )
})

BufferedJsonEditor.displayName = 'BufferedJsonEditor'
