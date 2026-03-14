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

  it('debounces commits while typing', () => {
    vi.useFakeTimers()

    const handleCommit = vi.fn()

    render(
      <BufferedJsonEditor
        aria-label="Custom JSON"
        onCommit={handleCommit}
        value=""
      />,
    )

    fireEvent.change(screen.getByLabelText(/custom json/i), {
      target: { value: '{"records":[{"id":"1"}]}' },
    })

    expect(handleCommit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(bufferedJsonCommitDelayMs - 1)

    expect(handleCommit).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

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
})
