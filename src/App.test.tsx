import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import App from '@/App'
import { bufferedJsonCommitDelayMs } from '@/components/buffered-json-editor'
import { AppProviders } from '@/providers/app-providers'

describe('App', () => {
  it('renders the converter playground', async () => {
    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      screen.getByRole('heading', {
        name: /relational json-to-csv playground for ambiguous nested data/i,
      }),
    ).toBeInTheDocument()

    expect(screen.getByLabelText(/root path/i)).toHaveValue('$.items.item[*]')
    expect(
      screen.getByText(/dexie stores the entire mapping config/i),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/regroup keys/i)).toHaveLength(2)
    expect(
      await screen.findByRole('button', { name: /^id$/i }),
    ).toBeInTheDocument()
  })

  it('accepts uploaded custom json and projects it with the chosen root path', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const uploadInput = screen.getByLabelText(/upload \.json/i)
    const file = new File(
      ['{"records":[{"id":"1","email":"one@example.com"}]}'],
      'contacts.json',
      { type: 'application/json' },
    )

    Object.defineProperty(file, 'text', {
      value: vi
        .fn()
        .mockResolvedValue(
          '{"records":[{"id":"1","email":"one@example.com"}]}',
        ),
    })

    fireEvent.change(uploadInput, { target: { files: [file] } })

    expect(
      await screen.findByDisplayValue(/contacts export/i),
    ).toBeInTheDocument()

    const rootPath = screen.getByLabelText(/root path/i)
    await waitFor(() => {
      expect(rootPath).toHaveValue('$')
    })

    fireEvent.change(rootPath, { target: { value: '$.records[*]' } })

    await waitFor(() => {
      const buttonLabels = screen
        .getAllByRole('button')
        .map((button) => button.textContent?.trim())

      expect(buttonLabels).toContain('id')
      expect(buttonLabels).toContain('email')
      expect(buttonLabels).not.toContain('records.email')
    })

    expect(screen.getByLabelText(/custom json/i)).toBeInTheDocument()
  })

  it('shows a validation error when custom json is missing', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid json:/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /save preset/i }),
      ).toBeDisabled()
    })
  })

  it('buffers custom json projection updates until the commit delay elapses', async () => {
    vi.useFakeTimers()

    const user = userEvent.setup({
      advanceTimers: vi.advanceTimersByTime,
    })

    try {
      render(
        <AppProviders>
          <App />
        </AppProviders>,
      )

      await user.click(screen.getByRole('button', { name: /custom json/i }))

      const editor = screen.getByLabelText(/custom json/i)

      fireEvent.change(editor, {
        target: { value: '{"id":"1","email":"one@example.com"}' },
      })

      expect(screen.getByText(/invalid json:/i)).toBeInTheDocument()

      vi.advanceTimersByTime(bufferedJsonCommitDelayMs)

      await waitFor(() => {
        expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('adds a discovered path rule and updates the live projection', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      await screen.findByRole('button', { name: /^topping.type$/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /stringify topping/i }))

    await waitFor(() => {
      const buttonLabels = screen
        .getAllByRole('button')
        .map((button) => button.textContent?.trim())

      expect(buttonLabels).toContain('topping')
      expect(buttonLabels).not.toContain('topping.type')
    })

    expect(screen.getByLabelText(/planner path 1/i)).toHaveValue('topping')
    expect(screen.getByLabelText(/planner action 1/i)).toHaveValue('stringify')
  })

  it('pivots arrays into indexed columns from the config form', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.selectOptions(
      screen.getByLabelText(/sample dataset/i),
      'heterogeneous',
    )
    await user.selectOptions(
      screen.getByLabelText(/flatten mode/i),
      'stringify',
    )

    const indexedPivotToggle = screen.getByLabelText(/indexed pivot columns/i)
    await user.click(indexedPivotToggle)

    await waitFor(() => {
      expect(indexedPivotToggle).toBeChecked()
    })

    await waitFor(() => {
      const buttonLabels = screen
        .getAllByRole('button')
        .map((button) => button.textContent?.trim())

      expect(buttonLabels).toContain('tags[0]')
      expect(buttonLabels).toContain('tags[1]')
      expect(buttonLabels).not.toContain('tags')
    })
  })

  it('shows a type drift summary for mixed columns in the sidecar schema', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.selectOptions(
      screen.getByLabelText(/sample dataset/i),
      'heterogeneous',
    )

    await waitFor(() => {
      expect(screen.getByText(/type drift report/i)).toBeInTheDocument()
      expect(screen.getByText(/coerced to string/i)).toBeInTheDocument()
      expect(screen.getByText(/50% string \/ 50% number/i)).toBeInTheDocument()
    })
  })

  it('keeps the source panel compact in custom mode to avoid duplicate payload renders', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/duplicate raw preview has been removed/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/chars/i)).toBeInTheDocument()
    })
  })
})
