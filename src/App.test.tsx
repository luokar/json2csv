import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, vi } from 'vitest'

const { downloadExportArtifactMock } = vi.hoisted(() => ({
  downloadExportArtifactMock: vi.fn(),
}))

vi.mock('@/lib/output-export', async () => {
  const actual = await vi.importActual<typeof import('@/lib/output-export')>(
    '@/lib/output-export',
  )

  return {
    ...actual,
    downloadExportArtifact: downloadExportArtifactMock,
  }
})

import App from '@/App'
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

const noaaLikeCustomJson = JSON.stringify({
  data: {
    '189512': { anomaly: -1.2, value: 51.4 },
    '189612': { anomaly: -0.9, value: 52.1 },
    '189712': { anomaly: -0.4, value: 52.6 },
    '189812': { anomaly: -0.2, value: 52.8 },
    '189912': { anomaly: 0.1, value: 53.1 },
  },
  description: {
    title: 'NOAA style sample',
  },
})

const multiCollectionCustomJson = JSON.stringify({
  damage_relations: {
    double_damage_to: [{ name: 'grass' }],
    half_damage_to: [{ name: 'water' }],
  },
  game_indices: [{ game_index: 1, version: { name: 'red' } }],
  generation: { name: 'generation-i' },
  id: 10,
  moves: [{ move: { name: 'ember' } }, { move: { name: 'flamethrower' } }],
  name: 'fire',
  pokemon: [{ pokemon: { name: 'charizard' } }],
})

async function switchToCustomMode(
  user: ReturnType<typeof userEvent.setup>,
  options: {
    waitForWorkbench?: boolean
  } = {},
) {
  const waitForWorkbench = options.waitForWorkbench ?? true

  await user.click(screen.getByRole('button', { name: /custom json/i }))

  await waitFor(() => {
    expect(screen.getByLabelText(/custom json/i)).toBeInTheDocument()

    if (waitForWorkbench) {
      expect(
        screen.getByRole('button', { name: /reset defaults/i }),
      ).toBeInTheDocument()
    }
  })
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

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>()

  return {
    clear: vi.fn(() => {
      store.clear()
    }),
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size
    },
    removeItem: vi.fn((key: string) => {
      store.delete(key)
    }),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value)
    }),
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createLocalStorageMock(),
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  downloadExportArtifactMock.mockReset()
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
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

  it('downloads the full flat CSV output', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await screen.findByRole('button', { name: /^id$/i })

    await user.click(screen.getByRole('button', { name: /download full csv/i }))

    await waitFor(() => {
      expect(downloadExportArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'donut-relational-export.csv',
          mimeType: 'text/csv;charset=utf-8',
        }),
      )
    })
  })

  it('downloads selected relational tables and the bundled archive', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await screen.findByRole('heading', {
      name: /relational split preview/i,
    })

    await user.click(screen.getByRole('button', { name: /^topping$/i }))
    await user.click(
      screen.getByRole('button', { name: /download selected table csv/i }),
    )

    await waitFor(() => {
      expect(downloadExportArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'donut-relational-export--topping.csv',
          mimeType: 'text/csv;charset=utf-8',
        }),
      )
    })

    await user.click(
      screen.getByRole('button', { name: /download all tables zip/i }),
    )

    await waitFor(() => {
      expect(downloadExportArtifactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'donut-relational-export-relational.zip',
          mimeType: 'application/zip',
        }),
      )
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

  it('filters the row preview without disturbing the broader workbench shell', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    const rowPreviewTable = await screen.findAllByRole('table')
    const filterInput = screen.getByLabelText(/filter visible csv rows/i)

    await user.type(filterInput, 'Maple')

    await waitFor(() => {
      expect(within(rowPreviewTable[0]).getByText(/maple/i)).toBeInTheDocument()
      expect(within(rowPreviewTable[0]).queryByText(/glazed/i)).toBeNull()
      expect(screen.getByLabelText(/preset name/i)).toHaveValue(
        'Donut relational export',
      )
    })
  })

  it('accepts uploaded custom json and projects it with the chosen root path', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user, { waitForWorkbench: false })

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

    const rootPath = await screen.findByLabelText(/root path/i)

    expect(rootPath).toHaveValue('$')

    fireEvent.change(rootPath, {
      target: { value: '$.records[*]' },
    })

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

  it('auto-applies smart row detection when importing a keyed-object json file', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user, { waitForWorkbench: false })

    const uploadInput = screen.getByLabelText(/upload \.json/i)
    const file = new File(
      [noaaLikeCustomJson],
      '110-tavg-ytd-12-1895-2016.json',
      { type: 'application/json' },
    )

    Object.defineProperty(file, 'text', {
      value: vi.fn().mockResolvedValue(noaaLikeCustomJson),
    })

    fireEvent.change(uploadInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.data.*')
      expect(
        screen.getByText(/auto-applied smart row detection/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^period$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^value$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^anomaly$/i }),
      ).toBeInTheDocument()
    })
  })

  it('surfaces nested wildcard selector guidance for staged custom json', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user, { waitForWorkbench: false })

    fireEvent.change(screen.getByLabelText(/custom json/i), {
      target: {
        value:
          '{"groups":[{"records":[{"id":"1","email":"one@example.com"},{"id":"2","email":"two@example.com"}]},{"records":[{"id":"3","email":"three@example.com","tier":"vip"}]}]}',
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    const rootPath = await screen.findByLabelText(/root path/i)

    expect(rootPath).toHaveValue('$')

    fireEvent.input(rootPath, {
      target: { value: '$.groups[*].records[*]' },
    })

    expect(rootPath).toHaveValue('$.groups[*].records[*]')

    await waitFor(() => {
      expect(
        screen.getByText(
          /nested \[\*\] and \[0\] steps plus object \.\* branches can stream directly/i,
        ),
      ).toBeInTheDocument()
    })
  })

  it('smart-detects keyed object maps from custom json and applies the suggested root path', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

    fireEvent.change(screen.getByLabelText(/custom json/i), {
      target: {
        value: noaaLikeCustomJson,
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /smart detect/i }),
      ).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /smart detect/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.data.*')
      expect(
        screen.getByText(/use \$\.data\.\* and rename __entryKey to period/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^period$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^value$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^anomaly$/i }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /^__entryKey$/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('auto-applies smart row detection when applying a keyed-object custom payload at the broad root', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

    fireEvent.change(screen.getByLabelText(/custom json/i), {
      target: {
        value: noaaLikeCustomJson,
      },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.data.*')
      expect(
        screen.getByText(/auto-applied smart row detection/i),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^period$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^value$/i }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /^anomaly$/i }),
      ).toBeInTheDocument()
    })
  })

  it('smart-detect preserves complex multi-collection roots by switching to stringify at $', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

    fireEvent.change(screen.getByLabelText(/custom json/i), {
      target: {
        value: multiCollectionCustomJson,
      },
    })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /smart detect/i }),
      ).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /smart detect/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$')
      expect(screen.getByLabelText(/flatten mode/i)).toHaveValue('stringify')
      expect(
        screen.getByText(
          /keep \$ as the root and switch flatten mode to stringify/i,
        ),
      ).toBeInTheDocument()
    })
  })

  it('shows a validation error when custom json is missing', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user, { waitForWorkbench: false })

    await waitFor(() => {
      expect(screen.getByText(/invalid json:/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /save preset/i }),
      ).toBeDisabled()
    })
  })

  it('applies staged custom json on demand and updates the preview', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user, { waitForWorkbench: false })

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

    await switchToCustomMode(user)

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

  it('keeps custom typing staged until apply even after blur', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

    const editor = screen.getByLabelText(/custom json/i)

    await user.click(editor)
    fireEvent.change(editor, {
      target: { value: '{' },
    })
    fireEvent.blur(editor)

    await new Promise((resolve) => {
      window.setTimeout(resolve, 350)
    })

    expect(
      screen.getByRole('heading', {
        name: /preview paused while editing custom json/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    expect(screen.queryByText(/invalid json:/i)).not.toBeInTheDocument()
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

    await switchToCustomMode(user)

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

  it('keeps the workbench collapsed during a rapid custom-to-sample source switch', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)
    await user.click(screen.getByRole('button', { name: /sample catalog/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /switching to sample catalog/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /switching to sample catalog/i,
        }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByLabelText(/filter visible csv rows/i),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^id$/i })).toBeInTheDocument()
    })
  })

  it('preserves an unapplied custom draft when switching away and back', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
      expect(
        screen.getByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /sample catalog/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/sample dataset/i)).toBeInTheDocument()
      expect(
        screen.getByLabelText(/filter visible csv rows/i),
      ).toBeInTheDocument()
    })

    await switchToCustomMode(user, { waitForWorkbench: false })

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /preview paused while editing custom json/i,
        }),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/custom json/i)).toHaveValue('{')
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
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

    await switchToCustomMode(user)
    await user.click(
      screen.getByRole('button', { name: /load active sample/i }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /loading active sample/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /loading active sample/i,
        }),
      ).not.toBeInTheDocument()
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.items.item[*]')
      expect(screen.getByText(/parsed successfully/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^id$/i })).toBeInTheDocument()
    })
  })

  it('keeps the workbench collapsed while resetting back to defaults from custom mode', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)
    await user.click(screen.getByRole('button', { name: /reset defaults/i }))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', {
          name: /resetting to defaults/i,
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByLabelText(/filter visible csv rows/i),
      ).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', {
          name: /resetting to defaults/i,
        }),
      ).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/custom json/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/root path/i)).toHaveValue('$.items.item[*]')
      expect(screen.getByRole('button', { name: /^id$/i })).toBeInTheDocument()
    })
  })

  it('publishes transition diagnostics when hang debugging is enabled', async () => {
    vi.stubGlobal('Worker', FakeStreamingAppWorker)

    const user = userEvent.setup()

    window.history.replaceState({}, '', '/?debug=hangs')

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)
    await user.click(screen.getByRole('button', { name: /reset defaults/i }))

    await waitFor(() => {
      expect(screen.getByText(/transition diagnostics/i)).toBeInTheDocument()

      const diagnosticWindow = window as Window & {
        __json2csvWorkbenchTransition?: {
          label: string
          phase: string
        } | null
        __json2csvHangAudit?: {
          entries: Array<{
            category: string
            label: string
          }>
        } | null
      }

      expect(diagnosticWindow.__json2csvWorkbenchTransition?.label).toBe(
        'Resetting to defaults',
      )
      expect(diagnosticWindow.__json2csvWorkbenchTransition?.phase).toBe(
        'settled',
      )
      expect(diagnosticWindow.__json2csvHangAudit?.entries[0]?.category).toBe(
        'transition',
      )
      expect(
        diagnosticWindow.__json2csvHangAudit?.entries.some(
          (entry) =>
            entry.category === 'intent' &&
            entry.label.includes('Resetting to defaults'),
        ),
      ).toBe(true)
      expect(diagnosticWindow.__json2csvHangAudit?.entries[0]?.label).toContain(
        'Resetting to defaults',
      )
      expect(
        JSON.parse(window.localStorage.getItem('json2csv:hang-audit') ?? '{}')
          .entries?.[0]?.label,
      ).toContain('Resetting to defaults')
    })
  })

  it('recovers a previous unresolved hang audit on the next load', async () => {
    window.localStorage.setItem(
      'json2csv:hang-audit',
      JSON.stringify({
        activeTransition: {
          detail:
            'Resetting to defaults. The state update has been applied; waiting for the next projection lifecycle to start.',
          id: 7,
          kind: 'reset-defaults',
          label: 'Resetting to defaults',
          phase: 'applying',
          startedAt: 100,
          updatedAt: 200,
        },
        entries: [],
        recoveredEntry: null,
        tabClosedGracefully: false,
        updatedAt: Date.now(),
      }),
    )

    window.history.replaceState({}, '', '/?debug=hangs')

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      await screen.findAllByText(
        /recovered after the previous session stopped while "Resetting to defaults" was applying/i,
      ),
    ).not.toHaveLength(0)
  })

  it('recovers a previous unresolved hang intent on the next load', async () => {
    window.localStorage.setItem(
      'json2csv:hang-audit',
      JSON.stringify({
        activeIntent: {
          detail:
            'Resetting to defaults. Intent recorded before the guarded action begins so a full browser hang still leaves the last risky click recoverable on reload.',
          id: 9,
          kind: 'reset-defaults',
          label: 'Resetting to defaults',
          startedAt: 100,
          updatedAt: 200,
        },
        activeTransition: null,
        entries: [],
        recoveredEntry: null,
        tabClosedGracefully: false,
        updatedAt: Date.now(),
      }),
    )

    window.history.replaceState({}, '', '/?debug=hangs')

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    expect(
      await screen.findAllByText(
        /recovered after the previous session stopped shortly after "Resetting to defaults" was armed/i,
      ),
    ).not.toHaveLength(0)
  })

  it('shows an invalid-json error after applying malformed custom input', async () => {
    const user = userEvent.setup()

    render(
      <AppProviders>
        <App />
      </AppProviders>,
    )

    await switchToCustomMode(user)

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

    await switchToCustomMode(user)
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

    await switchToCustomMode(user)

    const editor = screen.getByLabelText(/custom json/i)

    fireEvent.change(editor, {
      target: { value: '{"records":[{"id":"1","email":"one@example.com"}]}' },
    })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /apply json/i })).toBeEnabled()
    })

    await user.click(screen.getByRole('button', { name: /apply json/i }))

    await waitFor(() => {
      expect(screen.getByLabelText(/root path/i)).toBeInTheDocument()
    })

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

    await switchToCustomMode(user)

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

    await switchToCustomMode(user)

    await waitFor(() => {
      expect(
        screen.getByText(/duplicate raw preview has been removed/i),
      ).toBeInTheDocument()
      expect(screen.getByText(/chars/i)).toBeInTheDocument()
    })
  })
})
