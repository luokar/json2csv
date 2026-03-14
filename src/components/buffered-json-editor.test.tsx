import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  BufferedJsonEditor,
  bufferedJsonCommitDelayMs,
} from '@/components/buffered-json-editor'

describe('BufferedJsonEditor', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces single-character typing', () => {
    vi.useFakeTimers()

    const handleCommit = vi.fn()

    render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    )

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{' },
    })

    expect(handleCommit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs - 1)

    expect(handleCommit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(handleCommit).toHaveBeenCalledWith('{')
  })

  it('keeps bulk inserts buffered until blur', () => {
    vi.useFakeTimers()

    const handleCommit = vi.fn()

    render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    )

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{"records":[{"id":"1"}]}' },
    })

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs)

    expect(handleCommit).not.toHaveBeenCalled()

    fireEvent.blur(editor)

    expect(handleCommit).toHaveBeenCalledWith('{"records":[{"id":"1"}]}')
  })

  it('flushes the latest value on blur', () => {
    vi.useFakeTimers()

    const handleCommit = vi.fn()

    render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    )

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{"records":[{"id":"2"}]}' },
    })
    fireEvent.blur(editor)

    expect(handleCommit).toHaveBeenCalledWith('{"records":[{"id":"2"}]}')

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs)

    expect(handleCommit).toHaveBeenCalledTimes(1)
  })

  it('syncs externally replaced values into the textarea DOM', () => {
    const handleCommit = vi.fn()

    const { rerender } = render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    )

    rerender(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value='{"records":[{"id":"3"}]}'
      />,
    )

    expect(screen.getByLabelText(/custom json/i)).toHaveValue(
      '{"records":[{"id":"3"}]}',
    )
  })
})
