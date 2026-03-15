import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, vi } from 'vitest'

import App from '@/App'
import { bufferedJsonCommitDelayMs } from '@/components/buffered-json-editor'
import {
  computeProjectionPayload,
  type ProjectionWorkerRequest,
  type ProjectionWorkerResponse,
} from '@/lib/projection'
import { AppProviders } from '@/providers/app-providers'

function getFlatPreviewButtonLabels() {
  return within(screen.getAllByRole('table')[0])
    .getAllByRole('button')
    .map((button) => button.textContent?.trim())
}

class FakeStreamingAppWorker {
  private listeners = new Set<
    (event: MessageEvent<ProjectionWorkerResponse>) => void
  >()

  addEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionWorkerResponse>) => void,
  ) {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  postMessage(request: ProjectionWorkerRequest) {
    setTimeout(() => {
      this.emit({
        progress: {
          label: 'Projecting flat CSV rows',
          percent: 45,
          phase: 'flat',
          phaseCompleted: 1,
          phaseTotal: 2,
        },
        requestId: request.requestId,
        type: 'progress',
      })
    }, 10)

    setTimeout(() => {
      this.emit({
        preview: {
          headers: ['id', 'type', 'name'],
          previewRecords: [{ id: '0001', name: 'Cake', type: 'donut' }],
          processedRoots: 1,
          rowCount: 7,
          totalRoots: 2,
        },
        requestId: request.requestId,
        type: 'stream',
      })
    }, 20)

    setTimeout(() => {
      this.emit({
        payload: computeProjectionPayload(request.payload),
        requestId: request.requestId,
        type: 'result',
      })
    }, 600)
  }

  removeEventListener(
    type: string,
    listener: (event: MessageEvent<ProjectionWorkerResponse>) => void,
  ) {
    if (type === 'message') {
      this.listeners.delete(listener)
    }
  }

  terminate() {}

  private emit(data: ProjectionWorkerResponse) {
    const event = { data } as MessageEvent<ProjectionWorkerResponse>

    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

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

  it('shows normalized relational tables and lets the user switch previews', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      await screen.findByRole('heading', {
        name: /relational split preview/i,
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/root -> topping via parent_root_id/i),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^batters_batter$/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/batters_batter inherits parent_root_id from root/i),
      ).toBeInTheDocument()
      expect(
        screen.getByDisplayValue(
          /"batters_batter_id","parent_root_id","id","type"/i,
        ),
      ).toBeInTheDocument()
    })
  })

  it('renders streamed flat-preview rows while the worker is still processing', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await waitFor(() => {
      expect(screen.getByText(/streaming 1\/2 roots/i)).toBeInTheDocument()
      expect(
        screen.getByText(/streaming preview from 1\/2 roots/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/processed 1 of 2 roots/i)).toBeInTheDocument()
    })
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
      const buttonLabels = getFlatPreviewButtonLabels()

      expect(buttonLabels).toContain('id')
      expect(buttonLabels).toContain('email')
      expect(buttonLabels).not.toContain('records.email')
    })

    expect(
      screen.getByText(/incremental selector parsing is active for this path/i),
    ).toBeInTheDocument()

    expect(screen.getByLabelText(/custom json/i)).toBeInTheDocument()
  })

  it('supports nested wildcard selectors for uploaded custom json', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const uploadInput = screen.getByLabelText(/upload \.json/i)
    const file = new File(
      [
        '{"groups":[{"records":[{"id":"1","email":"one@example.com"},{"id":"2","email":"two@example.com"}]},{"records":[{"id":"3","email":"three@example.com","tier":"vip"}]}]}',
      ],
      'groups.json',
      { type: 'application/json' },
    )

    Object.defineProperty(file, 'text', {
      value: vi
        .fn()
        .mockResolvedValue(
          '{"groups":[{"records":[{"id":"1","email":"one@example.com"},{"id":"2","email":"two@example.com"}]},{"records":[{"id":"3","email":"three@example.com","tier":"vip"}]}]}',
        ),
    })

    fireEvent.change(uploadInput, { target: { files: [file] } })

    const rootPath = screen.getByLabelText(/root path/i)

    await waitFor(() => {
      expect(rootPath).toHaveValue('$')
    })

    fireEvent.change(rootPath, {
      target: { value: '$.groups[*].records[*]' },
    })

    await waitFor(() => {
      const buttonLabels = getFlatPreviewButtonLabels()

      expect(buttonLabels).toContain('id')
      expect(buttonLabels).toContain('email')
      expect(buttonLabels).toContain('tier')
    })

    expect(
      screen.getByText(/nested \[\*\] and \[0\] steps can stream directly/i),
    ).toBeInTheDocument()
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

  it('applies buffered custom json on demand and updates the preview', async () => {
    const user = userEvent.setup()

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

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^email$/i }),
      ).toBeInTheDocument()
    })
  })

  it('uses the editor-focused surface while a custom draft is dirty and restores the workbench after apply', async () => {
    const user = userEvent.setup()

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

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByLabelText(/filter visible csv rows/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^email$/i }),
      ).toBeInTheDocument()
    })
  })

  it('keeps single-character typing staged until apply while the editor stays focused', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const editor = screen.getByLabelText(/custom json/i)

    await user.click(editor)
    fireEvent.change(editor, {
      target: { value: '{' },
    })

    await new Promise((resolve) => {
      window.setTimeout(resolve, bufferedJsonCommitDelayMs + 50)
    })

    expect(
      screen.getByRole('heading', {
        name: /preview paused while editing custom json/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    expect(
      screen.queryByLabelText(/filter visible csv rows/i),
    ).not.toBeInTheDocument()
  })

  it('keeps the heavy workbench collapsed while an applied custom draft is rebuilding', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    const user = userEvent.setup()

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

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /rebuilding preview for committed custom json/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /rebuilding preview for committed custom json/i,
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByLabelText(/filter visible csv rows/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^email$/i }),
      ).toBeInTheDocument()
    })
  })

  it('keeps the workbench collapsed while loading the active sample into custom mode', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))
    await user.click(
      screen.getByRole('button', { name: /load active sample/i }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /rebuilding preview for committed custom json/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /rebuilding preview for committed custom json/i,
        }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.items.item[*]')
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^id$/i })).toBeInTheDocument()
    })
  })

  it('shows an invalid-json error after flushing malformed custom input', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{"records": [' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid json:/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /save preset/i }),
      ).toBeDisabled()
    })
  })

  it('loads the active sample into the custom editor and keeps the preview responsive', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))
    await user.click(
      screen.getByRole('button', { name: /load active sample/i }),
    )

    await waitFor(() => {
      expect(
        (screen.getByLabelText(/custom json/i) as HTMLTextAreaElement).value,
      ).toContain('"items"')
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.items.item[*]')
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^id$/i })).toBeInTheDocument()
    })
  })

  it('saves the latest committed custom JSON without storing the raw payload in watched form state', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{"records":[{"id":"1","email":"one@example.com"}]}' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))
    fireEvent.change(screen.getByLabelText(/root path/i), {
      target: { value: '$.records[*]' },
    })

    await waitFor(() => {
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /save preset/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /save preset/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/saved ".*" for custom json/i),
      ).toBeInTheDocument()
    })
  })

  it('accepts null custom JSON without locking the custom preview flow', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.click(screen.getByRole('button', { name: /custom json/i }))

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: 'null' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^column0$/i }),
      ).toBeInTheDocument()
    })
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
      const buttonLabels = getFlatPreviewButtonLabels()

      expect(buttonLabels).toContain('topping')
      expect(buttonLabels).not.toContain('topping.type')
    })

    expect(screen.getByLabelText(/planner path 1/i)).toHaveValue('topping')
    expect(screen.getByLabelText(/planner action 1/i)).toHaveValue('stringify')
  })

  it('whitelists a branch from the workflow tree and narrows the live projection', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      await screen.findByRole('button', { name: /^ppu$/i }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /include name/i }))

    await waitFor(() => {
      const buttonLabels = getFlatPreviewButtonLabels()

      expect(buttonLabels).toContain('name')
      expect(buttonLabels).not.toContain('id')
      expect(buttonLabels).not.toContain('ppu')
      expect(buttonLabels).not.toContain('topping.type')
    })

    expect(screen.getByLabelText(/planner path 1/i)).toHaveValue('name')
    expect(screen.getByLabelText(/planner action 1/i)).toHaveValue('include')
  })

  it('supports explicit header mapping and renaming from the UI', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await user.selectOptions(
      screen.getByLabelText(/header policy/i),
      'explicit',
    )
    await user.click(screen.getByRole('button', { name: /map header name/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/header source 1/i)).toHaveValue('name')
    })

    fireEvent.change(screen.getByLabelText(/export header 1/i), {
      target: { value: 'product_name' },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^product_name$/i }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^ppu$/i }),
      ).not.toBeInTheDocument()
    })
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
      const buttonLabels = getFlatPreviewButtonLabels()

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

  it('switches to the lightweight input debug surface when projection is disabled', async () => {
    const previousUrl = window.location.href

    window.history.pushState({}, '', '/?debug=input&projection=off')

    try {
      render(
        <AppProviders>
          <App />
        </AppProviders>,
      )

      expect(
        screen.getByRole('heading', {
          name: /projection disabled for input debugging/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: /main custom editor/i }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/plain textarea probe/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/custom json/i)).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    } finally {
      window.history.pushState({}, '', previousUrl)
    }
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
