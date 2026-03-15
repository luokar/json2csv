import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import {
  BufferedJsonEditor,
  bufferedJsonEditorServiceProps,
} from '@/components/buffered-json-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type ProbeSource = 'buffered' | 'hardened' | 'plain'

interface ProbeLogEntry {
  atMs: number
  chars: number
  detail: string | null
  elapsedMs: number | null
  event: string
  id: number
  source: ProbeSource
}

interface InputDiagnosticsProps {
  disableProjection: boolean
  onDisableProjectionChange: (nextValue: boolean) => void
}

const diagnosticsLogLimit = 32

export function InputDiagnostics({
  disableProjection,
  onDisableProjectionChange,
}: InputDiagnosticsProps) {
  const isJsdomEnvironment =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
  const nextLogIdRef = useRef(1)
  const bufferedCommittedCharsRef = useRef(0)
  const [bufferedChars, setBufferedChars] = useState(0)
  const [bufferedCommittedValue, setBufferedCommittedValue] = useState('')
  const [hardenedChars, setHardenedChars] = useState(0)
  const [logs, setLogs] = useState<ProbeLogEntry[]>([])
  const [plainChars, setPlainChars] = useState(0)

  const appendLog = useCallback(
    (
      source: ProbeSource,
      event: string,
      chars: number,
      detail: string | null = null,
      elapsedMs: number | null = null,
    ) => {
      const entry: ProbeLogEntry = {
        atMs: Math.round(performance.now()),
        chars,
        detail,
        elapsedMs,
        event,
        id: nextLogIdRef.current,
        source,
      }

      nextLogIdRef.current += 1

      startTransition(() => {
        setLogs((previous) =>
          [entry, ...previous].slice(0, diagnosticsLogLimit),
        )
      })
    },
    [],
  )

  function schedulePaintProbe(
    source: ProbeSource,
    chars: number,
    detail: string | null,
  ) {
    if (
      isJsdomEnvironment ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return
    }

    const startedAt = performance.now()

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        appendLog(
          source,
          'next-paint',
          chars,
          detail,
          Math.round(performance.now() - startedAt),
        )
      })
    })
  }

  function recordInput(
    source: ProbeSource,
    chars: number,
    detail: string | null,
  ) {
    appendLog(source, 'input', chars, detail)
    schedulePaintProbe(source, chars, detail)
  }

  const handleBufferedCommit = useCallback(
    (nextValue: string) => {
      const nextLength = nextValue.length

      bufferedCommittedCharsRef.current = nextLength
      setBufferedChars(nextLength)
      setBufferedCommittedValue(nextValue)
      appendLog('buffered', 'commit', nextLength)
    },
    [appendLog],
  )

  const handleBufferedDirtyChange = useCallback(
    (isDirty: boolean) => {
      appendLog(
        'buffered',
        isDirty ? 'dirty' : 'clean',
        bufferedCommittedCharsRef.current,
      )
    },
    [appendLog],
  )

  useEffect(() => {
    if (typeof PerformanceObserver === 'undefined' || isJsdomEnvironment) {
      return
    }

    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? []

    if (!supportedEntryTypes.includes('longtask')) {
      return
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        appendLog(
          'plain',
          'longtask',
          0,
          `main thread blocked for ${Math.round(entry.duration)}ms`,
          Math.round(entry.duration),
        )
      }
    })

    observer.observe({ entryTypes: ['longtask'] })

    return () => {
      observer.disconnect()
    }
  }, [appendLog, isJsdomEnvironment])

  return (
    <Card className="border-amber-300/60 bg-amber-50/80">
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Input diagnostics</CardTitle>
            <CardDescription>
              Compare a plain textarea, a hardened textarea, and the buffered
              JSON editor under the same browser session. If only one probe
              stalls, that narrows the fault line quickly.
            </CardDescription>
          </div>
          <Badge variant="outline">`?debug=input`</Badge>
        </div>

        <label className="flex items-center gap-3 rounded-2xl border border-amber-300/60 bg-white/80 px-4 py-3 text-sm">
          <input
            type="checkbox"
            checked={disableProjection}
            onChange={(event) =>
              onDisableProjectionChange(event.target.checked)
            }
          />
          Disable live projection while debugging input latency
        </label>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-2 rounded-[24px] border border-border/70 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="plain-probe">Plain textarea probe</Label>
              <Badge variant="secondary">{plainChars} chars</Badge>
            </div>
            <Textarea
              id="plain-probe"
              className="min-h-40 font-mono text-xs"
              onBlur={(event) => {
                appendLog('plain', 'blur', event.currentTarget.value.length)
              }}
              onCompositionEnd={(event) => {
                const chars = event.currentTarget.value.length

                setPlainChars(chars)
                appendLog('plain', 'compositionend', chars)
              }}
              onCompositionStart={(event) => {
                appendLog(
                  'plain',
                  'compositionstart',
                  event.currentTarget.value.length,
                )
              }}
              onFocus={(event) => {
                appendLog('plain', 'focus', event.currentTarget.value.length)
              }}
              onInput={(event) => {
                const chars = event.currentTarget.value.length
                const nativeInputEvent = event.nativeEvent as
                  | InputEvent
                  | undefined

                setPlainChars(chars)
                recordInput('plain', chars, nativeInputEvent?.inputType ?? null)
              }}
              placeholder="Type here. If this stalls too, the issue is likely browser- or extension-level."
            />
          </div>

          <div className="space-y-2 rounded-[24px] border border-border/70 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="hardened-probe">Hardened textarea probe</Label>
              <Badge variant="secondary">{hardenedChars} chars</Badge>
            </div>
            <Textarea
              id="hardened-probe"
              {...bufferedJsonEditorServiceProps}
              className="min-h-40 font-mono text-xs"
              onBlur={(event) => {
                appendLog('hardened', 'blur', event.currentTarget.value.length)
              }}
              onCompositionEnd={(event) => {
                const chars = event.currentTarget.value.length

                setHardenedChars(chars)
                appendLog('hardened', 'compositionend', chars)
              }}
              onCompositionStart={(event) => {
                appendLog(
                  'hardened',
                  'compositionstart',
                  event.currentTarget.value.length,
                )
              }}
              onFocus={(event) => {
                appendLog('hardened', 'focus', event.currentTarget.value.length)
              }}
              onInput={(event) => {
                const chars = event.currentTarget.value.length
                const nativeInputEvent = event.nativeEvent as
                  | InputEvent
                  | undefined

                setHardenedChars(chars)
                recordInput(
                  'hardened',
                  chars,
                  nativeInputEvent?.inputType ?? null,
                )
              }}
              placeholder="This uses the same anti-extension/editor-service attributes as the JSON editor."
            />
          </div>

          <div className="space-y-2 rounded-[24px] border border-border/70 bg-white/80 p-4">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="buffered-probe">Buffered editor probe</Label>
              <Badge variant="secondary">{bufferedChars} chars</Badge>
            </div>
            <BufferedJsonEditor
              id="buffered-probe"
              className="min-h-40 font-mono text-xs"
              onBlurCapture={(event) => {
                appendLog('buffered', 'blur', event.currentTarget.value.length)
              }}
              onCommit={handleBufferedCommit}
              onCompositionEndCapture={(event) => {
                const chars = event.currentTarget.value.length

                setBufferedChars(chars)
                appendLog('buffered', 'compositionend', chars)
              }}
              onCompositionStartCapture={(event) => {
                appendLog(
                  'buffered',
                  'compositionstart',
                  event.currentTarget.value.length,
                )
              }}
              onDirtyChange={handleBufferedDirtyChange}
              onFocusCapture={(event) => {
                appendLog('buffered', 'focus', event.currentTarget.value.length)
              }}
              onInputCapture={(event) => {
                const chars = event.currentTarget.value.length
                const nativeInputEvent = event.nativeEvent as
                  | InputEvent
                  | undefined

                setBufferedChars(chars)
                recordInput(
                  'buffered',
                  chars,
                  nativeInputEvent?.inputType ?? null,
                )
              }}
              placeholder="Type here. If plain/hardened are smooth but this probe stalls, the wrapper is still involved."
              value={bufferedCommittedValue}
            />
          </div>
        </div>

        <div className="rounded-[24px] border border-border/70 bg-white/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Recent events
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                `next-paint` above ~80ms or `longtask` entries point to main
                thread blockage.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLogs([])
              }}
            >
              Clear log
            </Button>
          </div>

          {logs.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="pb-2 pr-3 font-medium">t+ms</th>
                    <th className="pb-2 pr-3 font-medium">Source</th>
                    <th className="pb-2 pr-3 font-medium">Event</th>
                    <th className="pb-2 pr-3 font-medium">Chars</th>
                    <th className="pb-2 pr-3 font-medium">Detail</th>
                    <th className="pb-2 font-medium">Elapsed</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((entry) => (
                    <tr key={entry.id} className="border-t border-border/50">
                      <td className="py-2 pr-3 font-mono">{entry.atMs}</td>
                      <td className="py-2 pr-3">{entry.source}</td>
                      <td className="py-2 pr-3">{entry.event}</td>
                      <td className="py-2 pr-3">{entry.chars}</td>
                      <td className="py-2 pr-3">{entry.detail ?? ' '}</td>
                      <td className="py-2 font-mono">
                        {entry.elapsedMs === null
                          ? ' '
                          : `${entry.elapsedMs}ms`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Start typing in one of the probes to populate the log.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
