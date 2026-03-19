import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  Archive,
  ArrowUpDown,
  Braces,
  Database,
  Download,
  FileJson2,
  Rows3,
  Save,
  Search,
  TableProperties,
  Upload,
  Waypoints,
} from 'lucide-react'
import {
  type ChangeEvent,
  memo,
  type ReactNode,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'
import { type UseFormRegisterReturn, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { bufferedJsonEditorServiceProps } from '@/components/buffered-json-editor'
import { HeaderMapper, type HeaderSuggestion } from '@/components/header-mapper'
import { InputDiagnostics } from '@/components/input-diagnostics'
import { PathPlanner } from '@/components/path-planner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useOutputExport } from '@/hooks/use-output-export'
import { useProjectionPreview } from '@/hooks/use-projection-preview'
import { useRelationalPreview } from '@/hooks/use-relational-preview'
import {
  buildComplexJsonOverview,
  type ComplexJsonOverview,
} from '@/lib/complex-json'
import {
  createPreset,
  listPresets,
  type SavedPreset,
  type SourceMode,
} from '@/lib/db'
import {
  appendHangAuditEntry,
  createHangAuditEntry,
  formatHangAuditCategory,
  getNextHangAuditEntryId,
  type HangAuditContext,
  type HangAuditEntry,
  type HangAuditSnapshot,
  hangAuditFrameGapThresholdMs,
  hangAuditLongTaskThresholdMs,
  persistHangAuditSnapshot,
  publishHangAuditSnapshot,
  readInitialHangAuditSnapshot,
} from '@/lib/hang-audit'
import {
  createHeaderRule,
  type HeaderRule,
  headerRulesFromConfig,
  headerRulesToConfig,
} from '@/lib/header-mapper'
import {
  formatJsonInput,
  parseJsonInput,
  stringifyJsonInput,
} from '@/lib/json-input'
import { resolveStreamableJsonPath } from '@/lib/json-root-stream'
import {
  booleanRepresentations,
  type ColumnSchema,
  type ColumnTypeReport,
  collisionStrategies,
  createMappingConfig,
  dateFormats,
  defaultMappingConfig,
  emptyArrayBehaviors,
  flattenModes,
  headerPolicies,
  type InspectedPath,
  type JsonValue,
  type MappingConfig,
  missingKeyStrategies,
  placeholderStrategies,
  selectRootNodes,
  typeMismatchStrategies,
} from '@/lib/mapping-engine'
import { mappingSamples } from '@/lib/mapping-samples'
import {
  createOutputExportRequest,
  downloadExportArtifact,
} from '@/lib/output-export'
import {
  type PlannerRule,
  plannerRulesFromConfig,
  plannerRulesToConfig,
} from '@/lib/path-planner'
import { createRowPreview, createTextPreview } from '@/lib/preview'
import type {
  ProjectionFlatStreamPreview,
  ProjectionProgress,
} from '@/lib/projection'
import {
  type ProjectionConversionResult,
  projectionFlatCsvPreviewCharacterLimit,
  projectionFlatRowPreviewLimit,
  projectionRelationalCsvPreviewCharacterLimit,
  projectionRelationalRowPreviewLimit,
} from '@/lib/projection'
import type { RelationalRelationship } from '@/lib/relational-split'
import {
  detectSmartConfigSuggestion,
  type SmartConfigSuggestion,
} from '@/lib/smart-config'
import { cn } from '@/lib/utils'
import { useWorkbenchStore } from '@/store/use-workbench-store'

const delimiterOptions = [
  { value: ',', label: 'Comma (,)' },
  { value: ';', label: 'Semicolon (;)' },
  { value: '\t', label: 'Tab' },
] as const

const sourceModeOptions: Array<{ label: string; value: SourceMode }> = [
  { value: 'sample', label: 'Sample catalog' },
  { value: 'custom', label: 'Custom JSON' },
]

const defaultRootPaths: Record<string, string> = {
  collisions: '$.rows[*]',
  donuts: '$.items.item[*]',
  heterogeneous: '$.records[*]',
}

const sampleSourcePreviewCharacterLimit = 12_000
const schemaColumnPreviewLimit = 120
const schemaTypeReportPreviewLimit = 40
const tableColumnPreviewLimit = 80
const emptyPreviewHeaders: string[] = []
const emptyPreviewRecords: Array<Record<string, string>> = []

const converterFormSchema = z.object({
  presetName: z
    .string()
    .trim()
    .min(3, 'Preset name must be at least 3 characters.')
    .max(40, 'Preset name must stay under 40 characters.'),
  sourceMode: z.enum(['sample', 'custom']),
  sampleId: z.string().trim().min(1),
  customJson: z.string(),
  rootPath: z.string().trim().min(1, 'Root path is required.'),
  flattenMode: z.enum(flattenModes),
  pathSeparator: z
    .string()
    .trim()
    .min(1, 'Path separator is required.')
    .max(3, 'Path separator is too long.'),
  arrayIndexSuffix: z.boolean(),
  placeholderStrategy: z.enum(placeholderStrategies),
  customPlaceholder: z.string().trim(),
  onMissingKey: z.enum(missingKeyStrategies),
  onTypeMismatch: z.enum(typeMismatchStrategies),
  headerPolicy: z.enum(headerPolicies),
  headerSampleSize: z.number().int().min(1).max(500),
  collisionStrategy: z.enum(collisionStrategies),
  strictNaming: z.boolean(),
  booleanRepresentation: z.enum(booleanRepresentations),
  dateFormat: z.enum(dateFormats),
  delimiter: z.enum([',', ';', '\t']),
  quoteAll: z.boolean(),
  emptyArrayBehavior: z.enum(emptyArrayBehaviors),
  maxDepth: z.number().int().min(1).max(32),
})

type ConverterFormValues = z.infer<typeof converterFormSchema>

const workbenchTransitionWatchdogMs = 2_000

type WorkbenchTransition =
  | 'custom-rebuild'
  | 'import-json'
  | 'load-preset'
  | 'load-sample'
  | 'reset-defaults'
  | 'smart-detect'
  | 'source-switch'

interface PendingWorkbenchTransition {
  hasApplied: boolean
  hasStarted: boolean
  id: number
  kind: WorkbenchTransition
  label: string
}

type WorkbenchTransitionPhase =
  | 'queued'
  | 'applying'
  | 'projecting'
  | 'settled'
  | 'timed-out'

interface WorkbenchTransitionDiagnostic {
  detail: string
  id: number
  kind: WorkbenchTransition
  label: string
  phase: WorkbenchTransitionPhase
  startedAt: number
  updatedAt: number
}

interface SmartDetectFeedback {
  detail: string
  previewHeaders: string[]
  tone: 'error' | 'info' | 'success'
}

const defaultFormValues: ConverterFormValues = {
  presetName: 'Donut relational export',
  sourceMode: 'sample',
  sampleId: 'donuts',
  customJson: '',
  rootPath: defaultRootPaths.donuts,
  flattenMode: defaultMappingConfig.flattenMode,
  pathSeparator: defaultMappingConfig.pathSeparator,
  arrayIndexSuffix: defaultMappingConfig.arrayIndexSuffix,
  placeholderStrategy: defaultMappingConfig.placeholderStrategy,
  customPlaceholder: defaultMappingConfig.customPlaceholder ?? 'NULL',
  onMissingKey: defaultMappingConfig.onMissingKey,
  onTypeMismatch: defaultMappingConfig.onTypeMismatch,
  headerPolicy: defaultMappingConfig.headerPolicy,
  headerSampleSize: defaultMappingConfig.headerSampleSize,
  collisionStrategy: defaultMappingConfig.collisionStrategy,
  strictNaming: defaultMappingConfig.strictNaming,
  booleanRepresentation: defaultMappingConfig.booleanRepresentation,
  dateFormat: defaultMappingConfig.dateFormat,
  delimiter: defaultMappingConfig.delimiter as ConverterFormValues['delimiter'],
  quoteAll: defaultMappingConfig.quoteAll,
  emptyArrayBehavior: defaultMappingConfig.emptyArrayBehavior,
  maxDepth: defaultMappingConfig.maxDepth,
}

const watchedFieldNames = [
  'presetName',
  'sourceMode',
  'sampleId',
  'rootPath',
  'flattenMode',
  'pathSeparator',
  'arrayIndexSuffix',
  'placeholderStrategy',
  'customPlaceholder',
  'onMissingKey',
  'onTypeMismatch',
  'headerPolicy',
  'headerSampleSize',
  'collisionStrategy',
  'strictNaming',
  'booleanRepresentation',
  'dateFormat',
  'delimiter',
  'quoteAll',
  'emptyArrayBehavior',
  'maxDepth',
] as const satisfies ReadonlyArray<keyof ConverterFormValues>

function App() {
  const debugFlags = getAppDebugFlags()
  const isJsdomEnvironment =
    typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)
  const queryClient = useQueryClient()
  const selectedPresetId = useWorkbenchStore((state) => state.selectedPresetId)
  const selectPreset = useWorkbenchStore((state) => state.selectPreset)
  const [headerRules, setHeaderRules] = useState<HeaderRule[]>([])
  const [plannerRules, setPlannerRules] = useState<PlannerRule[]>([])
  const [smartDetectFeedback, setSmartDetectFeedback] =
    useState<SmartDetectFeedback | null>(null)
  const [selectedRelationalTableName, setSelectedRelationalTableName] =
    useState('root')
  const [dismissedComplexJsonOverviewKey, setDismissedComplexJsonOverviewKey] =
    useState<string | null>(null)
  const [committedCustomJson, setCommittedCustomJson] = useState(
    defaultFormValues.customJson,
  )
  const [customJsonDraft, setCustomJsonDraft] = useState(
    defaultFormValues.customJson,
  )
  const [pendingWorkbenchTransition, setPendingWorkbenchTransition] =
    useState<PendingWorkbenchTransition | null>(null)
  const [workbenchTransitionDiagnostic, setWorkbenchTransitionDiagnostic] =
    useState<WorkbenchTransitionDiagnostic | null>(null)
  const [hangAuditSnapshot, setHangAuditSnapshot] = useState<HangAuditSnapshot>(
    () => readInitialHangAuditSnapshot(),
  )
  const [isProjectionDebugDisabled, setProjectionDebugDisabled] = useState(
    debugFlags.projectionOffByDefault,
  )
  const transitionApplyFrameRef = useRef<number | null>(null)
  const transitionApplyTimeoutRef = useRef<number | null>(null)
  const transitionSequenceRef = useRef(0)
  const transitionWatchdogTimeoutRef = useRef<number | null>(null)
  const workbenchTransitionDiagnosticRef =
    useRef<WorkbenchTransitionDiagnostic | null>(null)
  const hangAuditContextRef = useRef<HangAuditContext>({
    columnCount: 0,
    customJsonChars: 0,
    isProjecting: false,
    isWorkbenchSuspended: false,
    projectionLabel: null,
    rootPath: '$',
    rowCount: 0,
    sourceMode: 'sample',
    transitionLabel: null,
    transitionPhase: null,
  })
  const hangAuditSnapshotRef = useRef(hangAuditSnapshot)
  const nextHangAuditEntryIdRef = useRef(
    getNextHangAuditEntryId(hangAuditSnapshot),
  )

  const commitHangAuditSnapshot = useCallback(
    (
      updater: (previous: HangAuditSnapshot) => HangAuditSnapshot,
      options: {
        persistImmediately?: boolean
      } = {},
    ) => {
      const nextSnapshot = updater(hangAuditSnapshotRef.current)

      hangAuditSnapshotRef.current = nextSnapshot

      if (options.persistImmediately) {
        persistHangAuditSnapshot(nextSnapshot)
        publishHangAuditSnapshot(nextSnapshot)
      }

      setHangAuditSnapshot(nextSnapshot)
    },
    [],
  )

  const appendHangAuditEvent = useCallback(
    (options: {
      category: HangAuditEntry['category']
      detail: string
      durationMs?: number | null
      label: string
    }) => {
      const entry = createHangAuditEntry({
        category: options.category,
        context: hangAuditContextRef.current,
        detail: options.detail,
        durationMs: options.durationMs,
        id: nextHangAuditEntryIdRef.current,
        label: options.label,
      })

      nextHangAuditEntryIdRef.current += 1

      commitHangAuditSnapshot((previous) =>
        appendHangAuditEntry(previous, entry),
      )
    },
    [commitHangAuditSnapshot],
  )

  const armHangAuditIntent = useCallback(
    (intent: Pick<PendingWorkbenchTransition, 'kind' | 'label'>) => {
      const now = Date.now()
      const detail = `${intent.label}. Intent recorded before the guarded action begins so a full browser hang still leaves the last risky click recoverable on reload.`
      const entryId = nextHangAuditEntryIdRef.current
      const entry = createHangAuditEntry({
        category: 'intent',
        context: hangAuditContextRef.current,
        detail,
        id: entryId,
        label: `${intent.label} (Intent armed)`,
        now,
      })

      nextHangAuditEntryIdRef.current += 1

      commitHangAuditSnapshot(
        (previous) => {
          const nextSnapshot = appendHangAuditEntry(
            {
              ...previous,
              activeIntent: {
                detail,
                id: entryId,
                kind: intent.kind,
                label: intent.label,
                startedAt: now,
                updatedAt: now,
              },
            },
            entry,
          )

          return {
            ...nextSnapshot,
            activeIntent: {
              detail,
              id: entryId,
              kind: intent.kind,
              label: intent.label,
              startedAt: now,
              updatedAt: now,
            },
          }
        },
        { persistImmediately: true },
      )
    },
    [commitHangAuditSnapshot],
  )

  const clearHangAuditIntent = useCallback(() => {
    commitHangAuditSnapshot(
      (previous) =>
        previous.activeIntent === null
          ? previous
          : {
              ...previous,
              activeIntent: null,
              updatedAt: Date.now(),
            },
      { persistImmediately: true },
    )
  }, [commitHangAuditSnapshot])

  const persistCurrentHangAuditSnapshot = useCallback(
    (tabClosedGracefully: boolean) => {
      const nextSnapshot = {
        ...hangAuditSnapshotRef.current,
        tabClosedGracefully,
        updatedAt: Date.now(),
      }

      hangAuditSnapshotRef.current = nextSnapshot
      persistHangAuditSnapshot(nextSnapshot)
      publishHangAuditSnapshot(nextSnapshot)
    },
    [],
  )

  const updateWorkbenchTransitionDiagnostic = useCallback(
    (
      transition: Pick<PendingWorkbenchTransition, 'id' | 'kind' | 'label'>,
      phase: WorkbenchTransitionPhase,
    ) => {
      const nextDiagnostic = createWorkbenchTransitionDiagnostic(
        workbenchTransitionDiagnosticRef.current,
        transition,
        phase,
      )

      workbenchTransitionDiagnosticRef.current = nextDiagnostic
      publishWorkbenchTransitionDiagnostic(nextDiagnostic)
      setWorkbenchTransitionDiagnostic(nextDiagnostic)

      const entry = createHangAuditEntry({
        category: 'transition',
        context: hangAuditContextRef.current,
        detail: nextDiagnostic.detail,
        id: nextHangAuditEntryIdRef.current,
        label: `${nextDiagnostic.label} (${formatWorkbenchTransitionPhase(nextDiagnostic.phase)})`,
        now: nextDiagnostic.updatedAt,
      })

      nextHangAuditEntryIdRef.current += 1

      commitHangAuditSnapshot(
        (previous) => {
          const nextSnapshot = appendHangAuditEntry(
            {
              ...previous,
              activeIntent: null,
              activeTransition: { ...nextDiagnostic },
            },
            entry,
          )

          return {
            ...nextSnapshot,
            activeIntent: null,
            activeTransition: { ...nextDiagnostic },
          }
        },
        { persistImmediately: true },
      )
    },
    [commitHangAuditSnapshot],
  )

  const { data: presets = [], isLoading: isPresetsLoading } = useQuery({
    queryKey: ['presets'],
    queryFn: listPresets,
  })

  const form = useForm<ConverterFormValues>({
    resolver: zodResolver(converterFormSchema),
    defaultValues: defaultFormValues,
  })
  const {
    activeLabel: outputExportLabel,
    error: outputExportError,
    isExporting: isOutputExporting,
    runExport,
  } = useOutputExport()

  const watchedValues = useWatch({
    control: form.control,
    name: watchedFieldNames,
  })
  const [
    presetName = defaultFormValues.presetName,
    sourceMode = defaultFormValues.sourceMode,
    sampleId = defaultFormValues.sampleId,
    rootPath = defaultFormValues.rootPath,
    flattenMode = defaultFormValues.flattenMode,
    pathSeparator = defaultFormValues.pathSeparator,
    arrayIndexSuffix = defaultFormValues.arrayIndexSuffix,
    placeholderStrategy = defaultFormValues.placeholderStrategy,
    customPlaceholder = defaultFormValues.customPlaceholder,
    onMissingKey = defaultFormValues.onMissingKey,
    onTypeMismatch = defaultFormValues.onTypeMismatch,
    headerPolicy = defaultFormValues.headerPolicy,
    headerSampleSize = defaultFormValues.headerSampleSize,
    collisionStrategy = defaultFormValues.collisionStrategy,
    strictNaming = defaultFormValues.strictNaming,
    booleanRepresentation = defaultFormValues.booleanRepresentation,
    dateFormat = defaultFormValues.dateFormat,
    delimiter = defaultFormValues.delimiter,
    quoteAll = defaultFormValues.quoteAll,
    emptyArrayBehavior = defaultFormValues.emptyArrayBehavior,
    maxDepth = defaultFormValues.maxDepth,
  ] = watchedValues
  const liveValues: ConverterFormValues = {
    arrayIndexSuffix,
    booleanRepresentation,
    collisionStrategy,
    customJson: committedCustomJson,
    customPlaceholder,
    dateFormat,
    delimiter,
    emptyArrayBehavior,
    flattenMode,
    headerPolicy,
    headerSampleSize,
    maxDepth,
    onMissingKey,
    onTypeMismatch,
    pathSeparator,
    placeholderStrategy,
    presetName,
    quoteAll,
    rootPath,
    sampleId,
    sourceMode,
    strictNaming,
  }
  const activeSample = getSampleById(liveValues.sampleId)
  const isCustomJsonDirty = customJsonDraft !== committedCustomJson
  const streamableCustomSelector =
    liveValues.sourceMode === 'custom'
      ? resolveStreamableJsonPath(liveValues.rootPath)
      : null
  const parsedValues = converterFormSchema.safeParse(liveValues)
  const activeConfig = parsedValues.success
    ? toMappingConfig(parsedValues.data, plannerRules, headerRules)
    : undefined
  const projection = useProjectionPreview(
    {
      config: activeConfig,
      customJson: liveValues.customJson,
      includeRelational: false,
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : 'invalid-config',
    {
      enabled: !isProjectionDebugDisabled,
    },
  )
  const relationalPreview = useRelationalPreview(
    {
      config: activeConfig,
      customJson: liveValues.customJson,
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : 'invalid-config',
    {
      enabled:
        !isProjectionDebugDisabled &&
        activeConfig !== undefined &&
        !projection.isProjecting &&
        projection.parseError === null,
    },
  )
  const discoveredPaths = projection.discoveredPaths
  const conversionResult = projection.conversionResult
  const relationalSplitResult = relationalPreview.relationalSplitResult
  const streamingFlatPreview = projection.streamingFlatPreview
  const isStreamingFlatPreview =
    projection.isProjecting && streamingFlatPreview !== null
  const isRelationalPreviewProjecting = relationalPreview.isProjecting
  const headerSuggestions = useMemo(
    () =>
      buildHeaderSuggestions(
        conversionResult?.schema.columns ?? [],
        discoveredPaths,
      ),
    [conversionResult?.schema.columns, discoveredPaths],
  )

  const flatHeaders =
    streamingFlatPreview?.headers ??
    conversionResult?.headers ??
    emptyPreviewHeaders
  const flatRecords =
    streamingFlatPreview?.previewRecords ??
    conversionResult?.records ??
    emptyPreviewRecords
  const flatRowCount =
    streamingFlatPreview?.rowCount ?? conversionResult?.rowCount ?? 0
  const flatCsvLineCount =
    isStreamingFlatPreview || conversionResult
      ? flatRowCount + (flatHeaders.length > 0 ? 1 : 0)
      : 0
  const csvPreview = isStreamingFlatPreview
    ? (streamingFlatPreview?.csvPreview ?? {
        omittedCharacters: 0,
        text: 'No CSV generated.',
        truncated: false,
      })
    : (conversionResult?.csvPreview ?? {
        omittedCharacters: 0,
        text: 'No CSV generated.',
        truncated: false,
      })
  const sampleSourcePreview = useMemo(
    () =>
      liveValues.sourceMode === 'sample'
        ? createTextPreview(
            stringifyJsonInput(activeSample.json),
            sampleSourcePreviewCharacterLimit,
          )
        : null,
    [activeSample.json, liveValues.sourceMode],
  )
  const selectedRelationalTable =
    relationalSplitResult?.tables.find(
      (table) => table.tableName === selectedRelationalTableName,
    ) ??
    relationalSplitResult?.tables[0] ??
    null
  const relationalPreviewRows = createRowPreview(
    selectedRelationalTable?.records ?? [],
    projectionRelationalRowPreviewLimit,
  )
  const relationalPreviewRowsTruncated =
    relationalPreviewRows.truncated ||
    (selectedRelationalTable?.rowCount ?? 0) >
      (selectedRelationalTable?.records.length ?? 0)
  const relationalCsvPreview = selectedRelationalTable?.csvPreview ?? {
    omittedCharacters: 0,
    text: 'No relational tables generated.',
    truncated: false,
  }
  const relationalPreviewStatusMessage = isProjectionDebugDisabled
    ? 'Relational split preview is paused while projection debugging is disabled.'
    : activeConfig === undefined
      ? 'Relational split preview is unavailable while the current mapping config is invalid.'
      : projection.parseError
        ? 'Relational split preview starts after the current JSON parses successfully.'
        : projection.isProjecting
          ? 'Relational split preview starts after the flat preview finishes rebuilding.'
          : isRelationalPreviewProjecting
            ? relationalPreview.progress
              ? `${relationalPreview.progress.label} ${formatProjectionProgressDetail(relationalPreview.progress)}.`
              : 'Building relational tables in the background.'
            : 'No relational tables were generated for the current form values.'
  const outputExportBlockedReason =
    activeConfig === undefined
      ? 'Fix the current mapping config before exporting.'
      : projection.parseError
        ? 'Resolve the current JSON parse error before exporting.'
        : pendingWorkbenchTransition
          ? 'Wait for the current projection transition to settle before exporting.'
          : projection.isProjecting
            ? 'Wait for the current preview rebuild to finish before exporting.'
            : liveValues.sourceMode === 'custom' && isCustomJsonDirty
              ? 'Apply the current custom JSON draft before exporting.'
              : null
  const canExportOutputs = outputExportBlockedReason === null
  const complexJsonOverview = useMemo(
    () =>
      buildComplexJsonOverview(
        discoveredPaths,
        conversionResult?.schema.columns.length ?? flatHeaders.length,
        liveValues.rootPath,
      ),
    [
      conversionResult?.schema.columns.length,
      discoveredPaths,
      flatHeaders.length,
      liveValues.rootPath,
    ],
  )
  const complexJsonOverviewKey = complexJsonOverview
    ? [
        liveValues.sourceMode,
        liveValues.rootPath,
        complexJsonOverview.totalPathCount,
        complexJsonOverview.columnCount,
      ].join(':')
    : null
  const isComplexJsonGuidanceVisible =
    complexJsonOverview !== null &&
    complexJsonOverviewKey !== dismissedComplexJsonOverviewKey
  const activeConfigDescription = activeConfig
    ? describeConfig(activeConfig)
    : 'Invalid configuration'

  useEffect(() => {
    const tableNames = relationalSplitResult?.tables.map(
      (table) => table.tableName,
    ) ?? ['root']

    if (tableNames.includes(selectedRelationalTableName)) {
      return
    }

    setSelectedRelationalTableName(tableNames[0] ?? 'root')
  }, [relationalSplitResult, selectedRelationalTableName])

  useEffect(() => {
    if (complexJsonOverviewKey !== null) {
      return
    }

    setDismissedComplexJsonOverviewKey(null)
  }, [complexJsonOverviewKey])

  useEffect(() => {
    workbenchTransitionDiagnosticRef.current = workbenchTransitionDiagnostic
  }, [workbenchTransitionDiagnostic])

  useEffect(() => {
    hangAuditSnapshotRef.current = hangAuditSnapshot
    persistHangAuditSnapshot(hangAuditSnapshot)
    publishHangAuditSnapshot(hangAuditSnapshot)
  }, [hangAuditSnapshot])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handlePageHide = () => {
      persistCurrentHangAuditSnapshot(true)
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [persistCurrentHangAuditSnapshot])

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
        if (entry.duration < hangAuditLongTaskThresholdMs) {
          continue
        }

        const roundedDuration = Math.round(entry.duration)
        const context = hangAuditContextRef.current

        appendHangAuditEvent({
          category: 'longtask',
          detail: `Main thread blocked for ${roundedDuration} ms while ${describeHangAuditContext(context)}.`,
          durationMs: roundedDuration,
          label:
            context.transitionLabel ??
            context.projectionLabel ??
            'Main-thread long task',
        })
      }
    })

    observer.observe({ entryTypes: ['longtask'] })

    return () => {
      observer.disconnect()
    }
  }, [appendHangAuditEvent, isJsdomEnvironment])

  useEffect(() => {
    if (
      isJsdomEnvironment ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return
    }

    let frameId = 0
    let lastFrameAt: number | null = null

    const tick = (now: number) => {
      if (document.visibilityState !== 'visible') {
        lastFrameAt = now
        frameId = window.requestAnimationFrame(tick)
        return
      }

      if (lastFrameAt !== null) {
        const gapMs = now - lastFrameAt

        if (gapMs >= hangAuditFrameGapThresholdMs) {
          const roundedGapMs = Math.round(gapMs)
          const context = hangAuditContextRef.current

          appendHangAuditEvent({
            category: 'frame-gap',
            detail: `No paint completed for ${roundedGapMs} ms while ${describeHangAuditContext(context)}.`,
            durationMs: roundedGapMs,
            label:
              context.transitionLabel ??
              context.projectionLabel ??
              'Main-thread paint gap',
          })
        }
      }

      lastFrameAt = now
      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [appendHangAuditEvent, isJsdomEnvironment])

  useEffect(() => {
    if (pendingWorkbenchTransition === null) {
      return
    }

    if (!pendingWorkbenchTransition.hasApplied) {
      return
    }

    if (projection.isProjecting) {
      if (pendingWorkbenchTransition.hasStarted) {
        return
      }

      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current)
        transitionWatchdogTimeoutRef.current = null
      }

      updateWorkbenchTransitionDiagnostic(
        pendingWorkbenchTransition,
        'projecting',
      )
      setPendingWorkbenchTransition((previous) =>
        previous === null || previous.hasStarted
          ? previous
          : { ...previous, hasStarted: true },
      )
      return
    }

    if (pendingWorkbenchTransition.hasStarted) {
      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current)
        transitionWatchdogTimeoutRef.current = null
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, 'settled')
      setPendingWorkbenchTransition(null)
      return
    }

    if (isProjectionDebugDisabled || typeof Worker === 'undefined') {
      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current)
        transitionWatchdogTimeoutRef.current = null
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, 'settled')
      setPendingWorkbenchTransition(null)
      return
    }
  }, [
    isProjectionDebugDisabled,
    pendingWorkbenchTransition,
    projection.isProjecting,
    updateWorkbenchTransitionDiagnostic,
  ])

  useEffect(
    () => () => {
      if (transitionApplyFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionApplyFrameRef.current)
        transitionApplyFrameRef.current = null
      }

      if (transitionApplyTimeoutRef.current !== null) {
        window.clearTimeout(transitionApplyTimeoutRef.current)
        transitionApplyTimeoutRef.current = null
      }

      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current)
        transitionWatchdogTimeoutRef.current = null
      }
    },
    [],
  )

  const savePresetMutation = useMutation({
    mutationFn: async (values: ConverterFormValues) => {
      const parsed = converterFormSchema.parse(values)
      const customInput =
        parsed.sourceMode === 'custom'
          ? parseJsonInput(parsed.customJson)
          : null

      if (parsed.sourceMode === 'custom' && customInput?.value === undefined) {
        throw new Error(customInput?.error ?? 'Invalid JSON input.')
      }

      return createPreset({
        name: parsed.presetName.trim(),
        sourceMode: parsed.sourceMode,
        sampleId: parsed.sampleId,
        customJson:
          parsed.sourceMode === 'custom' ? parsed.customJson : undefined,
        config: toMappingConfig(parsed, plannerRules, headerRules),
      })
    },
    onSuccess: async (savedPreset) => {
      await queryClient.invalidateQueries({ queryKey: ['presets'] })
      startTransition(() => {
        selectPreset(savedPreset.id ?? null)
      })
    },
  })

  function clearWorkbenchTransitionWatchdog() {
    if (transitionWatchdogTimeoutRef.current === null) {
      return
    }

    window.clearTimeout(transitionWatchdogTimeoutRef.current)
    transitionWatchdogTimeoutRef.current = null
  }

  async function handleFlatCsvExport() {
    if (!canExportOutputs) {
      return
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        'Preparing full flat CSV export',
      )

      downloadExportArtifact(bundle.flatCsv)
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  async function handleSelectedRelationalExport() {
    if (!canExportOutputs || !selectedRelationalTable) {
      return
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        `Preparing ${selectedRelationalTable.tableName} relational CSV export`,
      )
      const tableArtifact = bundle.relationalTables.find(
        (table) => table.tableName === selectedRelationalTable.tableName,
      )

      if (!tableArtifact) {
        return
      }

      downloadExportArtifact(tableArtifact)
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  async function handleRelationalArchiveExport() {
    if (!canExportOutputs) {
      return
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        'Preparing bundled relational export',
      )

      if (!bundle.relationalArchive) {
        return
      }

      downloadExportArtifact(bundle.relationalArchive)
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  function cancelScheduledWorkbenchTransition() {
    if (transitionApplyFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionApplyFrameRef.current)
      transitionApplyFrameRef.current = null
    }

    if (transitionApplyTimeoutRef.current !== null) {
      window.clearTimeout(transitionApplyTimeoutRef.current)
      transitionApplyTimeoutRef.current = null
    }

    clearWorkbenchTransitionWatchdog()
  }

  function scheduleWorkbenchTransition(
    transition: Omit<
      PendingWorkbenchTransition,
      'hasApplied' | 'hasStarted' | 'id'
    >,
    apply: () => void,
  ) {
    cancelScheduledWorkbenchTransition()

    const nextTransition: PendingWorkbenchTransition = {
      ...transition,
      hasApplied: false,
      hasStarted: false,
      id: transitionSequenceRef.current + 1,
    }

    transitionSequenceRef.current = nextTransition.id
    flushSync(() => {
      setPendingWorkbenchTransition(nextTransition)
      updateWorkbenchTransitionDiagnostic(nextTransition, 'queued')
    })

    transitionApplyFrameRef.current = window.requestAnimationFrame(() => {
      transitionApplyFrameRef.current = window.requestAnimationFrame(() => {
        transitionApplyFrameRef.current = null

        transitionApplyTimeoutRef.current = window.setTimeout(() => {
          transitionApplyTimeoutRef.current = null

          flushSync(() => {
            setPendingWorkbenchTransition((previous) =>
              previous?.id === nextTransition.id
                ? { ...previous, hasApplied: true }
                : previous,
            )
            updateWorkbenchTransitionDiagnostic(nextTransition, 'applying')
          })

          apply()

          transitionWatchdogTimeoutRef.current = window.setTimeout(() => {
            updateWorkbenchTransitionDiagnostic(nextTransition, 'timed-out')
          }, workbenchTransitionWatchdogMs)
        }, 0)
      })
    })
  }

  function applyCustomJson(
    nextText: string = customJsonDraft,
    options: {
      suspendWorkbench?: boolean
    } = {},
  ) {
    const shouldRebuildProjection = nextText !== committedCustomJson

    if (options.suspendWorkbench && shouldRebuildProjection) {
      armHangAuditIntent({
        kind: 'custom-rebuild',
        label: 'Rebuilding preview for committed custom JSON',
      })
    }

    const parsedNextInput = parseJsonInput(nextText)
    const nextSmartSuggestion =
      parsedNextInput.value === undefined
        ? null
        : detectSmartConfigSuggestion(parsedNextInput.value)
    const autoSmartSuggestion = shouldAutoApplySmartSuggestion(
      nextSmartSuggestion,
      parsedNextInput.value,
      liveValues.rootPath,
    )
      ? nextSmartSuggestion
      : null

    const finalizeApply = () => {
      setCustomJsonDraft(nextText)
      setCommittedCustomJson(nextText)

      if (autoSmartSuggestion) {
        applySmartSuggestion(autoSmartSuggestion, { auto: true })
        return
      }

      setSmartDetectFeedback(null)
    }

    if (options.suspendWorkbench && shouldRebuildProjection) {
      scheduleWorkbenchTransition(
        {
          kind: 'custom-rebuild',
          label: 'Rebuilding preview for committed custom JSON',
        },
        finalizeApply,
      )

      return nextText
    }

    cancelScheduledWorkbenchTransition()
    finalizeApply()
    setPendingWorkbenchTransition(null)

    return nextText
  }

  function loadPreset(preset: SavedPreset) {
    armHangAuditIntent({
      kind: 'load-preset',
      label: 'Loading saved preset',
    })

    scheduleWorkbenchTransition(
      {
        kind: 'load-preset',
        label: 'Loading saved preset',
      },
      () => {
        form.reset({
          ...toFormValues(preset),
          customJson: defaultFormValues.customJson,
        })
        setHeaderRules(headerRulesFromConfig(preset.config))
        setSmartDetectFeedback(null)
        setCustomJsonDraft(preset.customJson ?? '')
        setCommittedCustomJson(preset.customJson ?? '')
        setPlannerRules(plannerRulesFromConfig(preset.config))
        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(preset.id ?? null)
        })
      },
    )
  }

  function handleSampleChange(sampleId: string) {
    const sample = getSampleById(sampleId)

    form.setValue('sampleId', sampleId, { shouldValidate: true })
    form.setValue('rootPath', defaultRootPaths[sampleId] ?? '$', {
      shouldValidate: true,
    })
    form.setValue('presetName', `${sample?.title ?? 'Sample'} export`, {
      shouldValidate: true,
    })
    setSmartDetectFeedback(null)
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(null)
    })
  }

  function handleSourceModeChange(sourceMode: SourceMode) {
    if (sourceMode === liveValues.sourceMode) {
      return
    }

    armHangAuditIntent({
      kind: 'source-switch',
      label:
        sourceMode === 'sample'
          ? 'Switching to sample catalog'
          : 'Switching to custom JSON',
    })

    scheduleWorkbenchTransition(
      {
        kind: 'source-switch',
        label:
          sourceMode === 'sample'
            ? 'Switching to sample catalog'
            : 'Switching to custom JSON',
      },
      () => {
        const nextRootPath =
          sourceMode === 'sample'
            ? (defaultRootPaths[liveValues.sampleId] ?? '$')
            : '$'

        form.setValue('sourceMode', sourceMode, { shouldValidate: true })
        form.setValue('rootPath', nextRootPath, { shouldValidate: true })
        setSmartDetectFeedback(null)
        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(null)
        })
      },
    )
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    armHangAuditIntent({
      kind: 'import-json',
      label: 'Importing JSON file',
    })

    const text = await file.text()
    const importedInput = parseJsonInput(text)
    const importedSmartSuggestion =
      importedInput.value === undefined
        ? null
        : detectSmartConfigSuggestion(importedInput.value)

    event.target.value = ''

    scheduleWorkbenchTransition(
      {
        kind: 'import-json',
        label: 'Importing JSON file',
      },
      () => {
        form.setValue('sourceMode', 'custom', { shouldValidate: true })
        setCustomJsonDraft(text)
        setCommittedCustomJson(text)

        if (importedSmartSuggestion) {
          applySmartSuggestion(importedSmartSuggestion, { auto: true })
        } else {
          form.setValue('rootPath', '$', { shouldValidate: true })
          setSmartDetectFeedback(null)
        }

        form.setValue('presetName', `${stripFileExtension(file.name)} export`, {
          shouldValidate: true,
        })
        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(null)
        })
      },
    )
  }

  function handleLoadSampleIntoEditor() {
    armHangAuditIntent({
      kind: 'load-sample',
      label: 'Loading active sample',
    })

    const activeSampleSmartSuggestion = detectSmartConfigSuggestion(
      activeSample.json,
    )

    scheduleWorkbenchTransition(
      {
        kind: 'load-sample',
        label: 'Loading active sample',
      },
      () => {
        const nextCustomJson = stringifyJsonInput(activeSample.json)

        form.setValue('sourceMode', 'custom', { shouldValidate: true })
        setCustomJsonDraft(nextCustomJson)
        setCommittedCustomJson(nextCustomJson)

        if (activeSampleSmartSuggestion) {
          applySmartSuggestion(activeSampleSmartSuggestion, { auto: true })
        } else {
          form.setValue('rootPath', defaultRootPaths[activeSample.id] ?? '$', {
            shouldValidate: true,
          })
          setSmartDetectFeedback(null)
        }

        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(null)
        })
      },
    )
  }

  function handleResetDefaults() {
    armHangAuditIntent({
      kind: 'reset-defaults',
      label: 'Resetting to defaults',
    })

    scheduleWorkbenchTransition(
      {
        kind: 'reset-defaults',
        label: 'Resetting to defaults',
      },
      () => {
        form.reset(defaultFormValues)
        setHeaderRules([])
        setCustomJsonDraft(defaultFormValues.customJson)
        setCommittedCustomJson(defaultFormValues.customJson)
        setPlannerRules([])
        setSmartDetectFeedback(null)
        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(null)
        })
      },
    )
  }

  function handleFormatCustomJson() {
    const formatted = formatJsonInput(customJsonDraft)

    if (!formatted.formattedText) {
      return
    }

    applyCustomJson(formatted.formattedText, {
      suspendWorkbench: true,
    })
  }

  function shouldAutoApplySmartSuggestion(
    suggestion: SmartConfigSuggestion | null,
    input: JsonValue | undefined,
    currentRootPath: string,
  ) {
    if (suggestion === null || input === undefined) {
      return false
    }

    const normalizedRootPath = currentRootPath.trim() || '$'

    if (normalizedRootPath === '$') {
      return true
    }

    return selectRootNodes(input, normalizedRootPath).length === 0
  }

  function applySmartSuggestion(
    suggestion: SmartConfigSuggestion,
    options: {
      auto?: boolean
    } = {},
  ) {
    form.setValue('rootPath', suggestion.rootPath, { shouldValidate: true })

    if (suggestion.flattenMode) {
      form.setValue('flattenMode', suggestion.flattenMode, {
        shouldValidate: true,
      })
    }

    if (suggestion.kind === 'keyed-map') {
      setHeaderRules((previous) =>
        upsertHeaderAliasRule(
          previous,
          suggestion.keySourcePath,
          suggestion.keyAlias,
          {
            overwriteExisting: !options.auto,
          },
        ),
      )
    }

    setSmartDetectFeedback({
      detail: options.auto
        ? `Auto-applied smart row detection. ${suggestion.summary}`
        : suggestion.summary,
      previewHeaders: suggestion.previewHeaders,
      tone: 'success',
    })
  }

  function handleSmartDetect() {
    armHangAuditIntent({
      kind: 'smart-detect',
      label: 'Applying smart row detection',
    })

    const resolvedInput =
      liveValues.sourceMode === 'custom'
        ? parseJsonInput(customJsonDraft)
        : { error: null, value: activeSample.json }

    if (resolvedInput.value === undefined) {
      clearHangAuditIntent()
      setSmartDetectFeedback({
        detail: `Smart detect needs valid JSON before it can analyze the current payload.${resolvedInput.error ? ` ${resolvedInput.error}` : ''}`,
        previewHeaders: [],
        tone: 'error',
      })
      return
    }

    const suggestion = detectSmartConfigSuggestion(resolvedInput.value)

    if (!suggestion) {
      clearHangAuditIntent()
      setSmartDetectFeedback({
        detail:
          'Smart detect did not find a better row-root or preserve-completeness strategy for the current payload.',
        previewHeaders: [],
        tone: 'info',
      })
      return
    }

    scheduleWorkbenchTransition(
      {
        kind: 'smart-detect',
        label: 'Applying smart row detection',
      },
      () => {
        if (liveValues.sourceMode === 'custom') {
          setCustomJsonDraft(customJsonDraft)
          setCommittedCustomJson(customJsonDraft)
        }

        applySmartSuggestion(suggestion)
        savePresetMutation.reset()

        startTransition(() => {
          selectPreset(null)
        })
      },
    )
  }

  function handleComplexJsonRootSelection(nextRootPath: string) {
    form.setValue('rootPath', nextRootPath, { shouldValidate: true })
    setDismissedComplexJsonOverviewKey(null)
  }

  function handleContinueComplexJsonWorkbench() {
    if (complexJsonOverviewKey === null) {
      return
    }

    setDismissedComplexJsonOverviewKey(complexJsonOverviewKey)
  }

  const configErrors = [
    ...(parsedValues.success
      ? []
      : parsedValues.error.issues.map((issue) => issue.message)),
  ]
  const activePreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? null
  const canSavePreset =
    !isProjectionDebugDisabled &&
    parsedValues.success &&
    (liveValues.sourceMode === 'sample' ||
      (!projection.isProjecting && projection.parseError === null))
  const mixedTypeReports = useMemo(
    () =>
      conversionResult?.schema.typeReports.filter(
        (report) => report.typeBreakdown.length > 1,
      ) ?? [],
    [conversionResult?.schema.typeReports],
  )
  const visibleMixedTypeReports = useMemo(
    () => mixedTypeReports.slice(0, schemaTypeReportPreviewLimit),
    [mixedTypeReports],
  )
  const hiddenMixedTypeReportCount = Math.max(
    0,
    mixedTypeReports.length - visibleMixedTypeReports.length,
  )
  const visibleSchemaColumns = useMemo(
    () =>
      (conversionResult?.schema.columns ?? []).slice(
        0,
        schemaColumnPreviewLimit,
      ),
    [conversionResult?.schema.columns],
  )
  const hiddenSchemaColumnCount = Math.max(
    0,
    (conversionResult?.schema.columns.length ?? 0) -
      visibleSchemaColumns.length,
  )
  const committedCustomJsonParseResult =
    liveValues.sourceMode === 'custom' && !isCustomJsonDirty
      ? parseJsonInput(committedCustomJson)
      : null
  const isWorkbenchTransitionPending = pendingWorkbenchTransition !== null
  const isCustomProjectionPending =
    pendingWorkbenchTransition?.kind === 'custom-rebuild'
  const isCustomProjectionRebuilding =
    liveValues.sourceMode === 'custom' &&
    isCustomProjectionPending &&
    !isCustomJsonDirty
  const isCustomWorkbenchSuspended =
    liveValues.sourceMode === 'custom' &&
    (isCustomJsonDirty || isWorkbenchTransitionPending)
  const isWorkbenchSuspended =
    isWorkbenchTransitionPending || isCustomWorkbenchSuspended
  const suspendedWorkbenchTitle = pendingWorkbenchTransition
    ? `${pendingWorkbenchTransition.label}.`
    : isCustomJsonDirty
      ? 'Preview paused while editing custom JSON.'
      : 'Rebuilding preview for committed custom JSON.'
  const suspendedWorkbenchDescription = pendingWorkbenchTransition
    ? 'The previous workbench stays hidden while this transition replaces the active projection state.'
    : isCustomJsonDirty
      ? 'The row preview, relational split, CSV output, and schema sidecar are hidden until the current draft is applied.'
      : 'The row preview, relational split, CSV output, and schema sidecar stay hidden until the next committed custom projection finishes.'
  const suspendedWorkbenchLead = pendingWorkbenchTransition
    ? 'The heavy workbench is collapsed first so risky projection updates do not keep the previous preview surface mounted while the next state is being applied.'
    : isCustomJsonDirty
      ? 'The current editor stays active above, but the projection workbench is temporarily collapsed so large custom payloads do not keep the rest of the UI mounted while you type.'
      : 'The latest custom payload has been committed. The workbench stays collapsed until the worker finishes rebuilding previews from that payload.'
  const suspendedWorkbenchFollowUp = pendingWorkbenchTransition
    ? projection.progress
      ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}.`
      : 'The full workbench returns after the next projection lifecycle settles.'
    : isCustomJsonDirty
      ? 'Use `Apply JSON` to rebuild the previews and restore the full workbench with the latest committed payload.'
      : 'This avoids replaying the full row preview, relational preview, CSV output, and schema sidecar on every progress update during apply.'
  const suspendedWorkbenchSectionEyebrow = pendingWorkbenchTransition
    ? 'Transition guard'
    : isCustomJsonDirty
      ? 'Editor focus'
      : 'Workbench state'
  const suspendedWorkbenchSectionTitle = pendingWorkbenchTransition
    ? 'Workbench transition is in progress'
    : isCustomJsonDirty
      ? 'The editor is holding an unapplied draft'
      : 'The workbench is rebuilding in the background'
  const visibleWorkbenchTransitionDiagnostic =
    workbenchTransitionDiagnostic !== null &&
    (debugFlags.showHangDiagnostics ||
      workbenchTransitionDiagnostic.phase !== 'settled')
  const activeWorkbenchTransitionDiagnostic =
    visibleWorkbenchTransitionDiagnostic ? workbenchTransitionDiagnostic : null
  const isLightweightInputDebugMode =
    debugFlags.showInputDiagnostics && isProjectionDebugDisabled
  const shouldShowHangAuditCard =
    debugFlags.showHangDiagnostics || hangAuditSnapshot.recoveredEntry !== null
  const visibleHangAuditEntries = hangAuditSnapshot.entries.slice(0, 6)

  hangAuditContextRef.current = {
    columnCount: flatHeaders.length,
    customJsonChars: customJsonDraft.length,
    isProjecting: projection.isProjecting,
    isWorkbenchSuspended,
    projectionLabel: projection.progress?.label ?? null,
    rootPath: liveValues.rootPath,
    rowCount: flatRowCount,
    sourceMode: liveValues.sourceMode,
    transitionLabel:
      pendingWorkbenchTransition?.label ??
      workbenchTransitionDiagnostic?.label ??
      null,
    transitionPhase: workbenchTransitionDiagnostic?.phase ?? null,
  }

  if (isLightweightInputDebugMode) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(255,203,153,0.9),transparent_38%),radial-gradient(circle_at_top_right,rgba(147,197,253,0.65),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,247,237,0.92))]" />

        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <section className="space-y-4">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              Input latency isolation / projection disabled
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Projection disabled for input debugging.
              </h1>
              <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
                The flat preview, relational preview, and schema workbench are
                intentionally hidden in this mode so the remaining editor path
                can be tested without the rest of the projection UI mounted.
              </p>
            </div>
          </section>

          <InputDiagnostics
            disableProjection={isProjectionDebugDisabled}
            onDisableProjectionChange={setProjectionDebugDisabled}
          />

          <Card className="bg-white/80">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Braces className="size-5 text-primary" />
                    Main custom editor
                  </CardTitle>
                  <CardDescription>
                    This uses the same staged editor and explicit apply flow as
                    the normal custom JSON panel, but without the projection
                    workbench attached.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {describeActiveSource(
                    liveValues.sourceMode,
                    activeSample.title,
                  )}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="debug-sample">Sample dataset</Label>
                  <select
                    id="debug-sample"
                    className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    value={liveValues.sampleId}
                    onChange={(event) => handleSampleChange(event.target.value)}
                  >
                    {mappingSamples.map((sample) => (
                      <option key={sample.id} value={sample.id}>
                        {sample.title}
                      </option>
                    ))}
                  </select>
                  <p className="text-sm text-muted-foreground">
                    {activeSample.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleLoadSampleIntoEditor}
                  >
                    Load active sample
                  </Button>
                  <Button
                    type="button"
                    disabled={!isCustomJsonDirty}
                    onClick={() =>
                      applyCustomJson(customJsonDraft, {
                        suspendWorkbench: true,
                      })
                    }
                  >
                    Apply JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleFormatCustomJson}
                  >
                    Format JSON
                  </Button>
                  <label
                    htmlFor="json-upload"
                    className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-background/80 px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                  >
                    <Upload className="size-4" />
                    Upload .json
                  </label>
                  <input
                    id="json-upload"
                    type="file"
                    accept=".json,application/json"
                    className="sr-only"
                    onChange={handleFileImport}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-json">Custom JSON</Label>
                <Textarea
                  id="custom-json"
                  {...bufferedJsonEditorServiceProps}
                  placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                  className="min-h-[22rem] font-mono text-xs"
                  value={customJsonDraft}
                  onChange={(event) => {
                    setCustomJsonDraft(event.target.value)
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Projection is paused in this surface by design. Re-enable it
                  from the diagnostics card when you want the full workbench
                  back.
                </p>
                {isCustomJsonDirty ? (
                  <p className="text-sm text-muted-foreground">
                    This draft has unapplied changes. Use Apply JSON or Format
                    JSON to commit them.
                  </p>
                ) : committedCustomJsonParseResult !== null &&
                  committedCustomJsonParseResult.value === undefined ? (
                  <p className="text-sm text-destructive">
                    Invalid JSON: {committedCustomJsonParseResult.error}
                  </p>
                ) : committedCustomJson.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    JSON is committed locally. If typing is still smooth here,
                    the remaining freeze lives in the full workbench path.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The editor is idle. Load a sample or paste a custom payload
                    to test the exact editor path.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(255,203,153,0.9),transparent_38%),radial-gradient(circle_at_top_right,rgba(147,197,253,0.65),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,247,237,0.92))]" />

      <main className="mx-auto flex min-h-screen max-w-[1820px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 xl:gap-8">
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(420px,0.84fr)] xl:items-end">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              Smart relational mapping / Vite / React / TypeScript
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Relational JSON-to-CSV playground for ambiguous nested data.
              </h1>
              <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
                The engine treats JSON projection as a mapping problem, not a
                blind flatten. Switch between parallel zip, cross-product
                explosion, and targeted stringification while inspecting the
                resulting rows, CSV, and schema sidecar.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                'Zip / Parallel',
                'Cross Product',
                'Stringify',
                'Root Path',
                'Header Scan',
                'Collision Repair',
              ].map((item) => (
                <Badge key={item} variant="secondary" className="bg-white/85">
                  {item}
                </Badge>
              ))}
            </div>
          </div>

          <Card className="bg-white/82 backdrop-blur-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>Current projection</CardTitle>
                {projection.isProjecting ? (
                  <Badge variant="secondary">
                    {projection.progress
                      ? `${projection.progress.label} ${projection.progress.percent}%`
                      : 'Updating preview'}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                These numbers update live as you change the mapping policy.
                Heavy parsing and projection now run off the main render path,
                and the worker reports staged progress across parse, inspect,
                flat, and relational passes.
              </CardDescription>
              {projection.isProjecting && projection.progress ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                    <span>{projection.progress.label}</span>
                    <span>
                      {formatProjectionProgressDetail(projection.progress)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary/70">
                    <div
                      className="h-full origin-left rounded-full bg-primary transition-transform duration-200 will-change-transform"
                      style={{
                        transform: `scaleX(${Math.max(0, Math.min(projection.progress.percent, 100)) / 100})`,
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={<Rows3 className="size-5" />}
                label="Rows"
                value={String(flatRowCount)}
              />
              <StatCard
                icon={<TableProperties className="size-5" />}
                label="Columns"
                value={String(flatHeaders.length)}
              />
              <StatCard
                icon={<FileJson2 className="size-5" />}
                label="CSV Lines"
                value={String(flatCsvLineCount)}
              />
            </CardContent>
          </Card>
        </section>

        {debugFlags.showInputDiagnostics ? (
          <InputDiagnostics
            disableProjection={isProjectionDebugDisabled}
            onDisableProjectionChange={setProjectionDebugDisabled}
          />
        ) : null}

        {activeWorkbenchTransitionDiagnostic ? (
          <Card
            aria-live="polite"
            className={cn(
              'bg-white/80',
              activeWorkbenchTransitionDiagnostic.phase === 'timed-out' &&
                'border-amber-300/80',
            )}
          >
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Transition diagnostics</CardTitle>
                  <CardDescription>
                    {activeWorkbenchTransitionDiagnostic.label}
                  </CardDescription>
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    activeWorkbenchTransitionDiagnostic.phase === 'timed-out'
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : 'border-primary/20 bg-primary/5 text-primary',
                  )}
                >
                  {formatWorkbenchTransitionPhase(
                    activeWorkbenchTransitionDiagnostic.phase,
                  )}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>{activeWorkbenchTransitionDiagnostic.detail}</p>
              {debugFlags.showHangDiagnostics ? (
                <p className="font-mono text-xs text-muted-foreground/80">
                  Transition #{activeWorkbenchTransitionDiagnostic.id} ·{' '}
                  {formatDurationMs(
                    activeWorkbenchTransitionDiagnostic.updatedAt -
                      activeWorkbenchTransitionDiagnostic.startedAt,
                  )}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {shouldShowHangAuditCard ? (
          <Card className="bg-white/80">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Hang audit</CardTitle>
                  <CardDescription>
                    Recent transition, long-task, and paint-gap snapshots are
                    persisted to `window.__json2csvHangAudit` and the browser's
                    local storage so the last risky action survives a reload.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {visibleHangAuditEntries.length.toLocaleString()} events
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {hangAuditSnapshot.recoveredEntry ? (
                <p className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-amber-900">
                  {hangAuditSnapshot.recoveredEntry.detail}
                </p>
              ) : null}

              {visibleHangAuditEntries.length > 0 ? (
                <div className="space-y-3">
                  {visibleHangAuditEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-border/70 bg-background/80 p-4"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-foreground">
                        <Badge variant="secondary">
                          {formatHangAuditCategory(entry.category)}
                        </Badge>
                        {entry.durationMs !== null ? (
                          <Badge variant="outline">
                            {formatDurationMs(entry.durationMs)}
                          </Badge>
                        ) : null}
                        <span className="font-medium">{entry.label}</span>
                      </div>
                      <p className="mt-2">{entry.detail}</p>
                      <p className="mt-2 font-mono text-xs text-muted-foreground/80">
                        {entry.context.sourceMode === 'custom'
                          ? 'custom'
                          : 'sample'}{' '}
                        · {entry.context.rootPath} ·{' '}
                        {entry.context.customJsonChars.toLocaleString()} chars ·{' '}
                        {entry.context.rowCount.toLocaleString()} rows ·{' '}
                        {entry.context.columnCount.toLocaleString()} cols
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p>No hang audit events have been recorded in this session.</p>
              )}
            </CardContent>
          </Card>
        ) : null}

        <section className="grid gap-6 xl:grid-cols-[minmax(500px,620px)_minmax(0,1fr)] 2xl:grid-cols-[minmax(560px,680px)_minmax(0,1fr)] xl:items-start">
          <div className="space-y-6">
            <Card className="bg-white/82 backdrop-blur-sm">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Waypoints className="size-5 text-primary" />
                      Mapping controls
                    </CardTitle>
                    <CardDescription>
                      Configure the source payload, how nested records become
                      rows, and how the exported CSV should behave downstream.
                    </CardDescription>
                  </div>
                  <Badge variant="outline">
                    {activePreset ? activePreset.name : 'Unsaved configuration'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <form
                  className="space-y-5"
                  onSubmit={form.handleSubmit((values) => {
                    const latestCustomJson =
                      liveValues.sourceMode === 'custom'
                        ? committedCustomJson
                        : defaultFormValues.customJson

                    savePresetMutation.mutate({
                      ...values,
                      customJson: latestCustomJson,
                    })
                  })}
                >
                  <WorkbenchSection
                    eyebrow="Session"
                    title="Choose the active source and preset"
                    description="Name this mapping, pick the incoming payload, and decide whether the workbench starts from a bundled sample or your own JSON."
                    icon={<FileJson2 className="size-5" />}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="preset-name">Preset name</Label>
                      <Input
                        id="preset-name"
                        placeholder="Donut relational export"
                        {...form.register('presetName')}
                      />
                      <FieldError
                        message={form.formState.errors.presetName?.message}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Input source</Label>
                      <div className="flex flex-wrap gap-2">
                        {sourceModeOptions.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={
                              liveValues.sourceMode === option.value
                                ? 'default'
                                : 'outline'
                            }
                            onClick={() => handleSourceModeChange(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        Samples are useful for learning the flattening behavior.
                        Custom JSON is where you bring real data and stage it
                        safely before projection rebuilds.
                      </p>
                    </div>

                    {liveValues.sourceMode === 'sample' ? (
                      <div className="space-y-2 rounded-[24px] border border-border/70 bg-background/80 p-4">
                        <Label htmlFor="sample-id">Sample dataset</Label>
                        <select
                          id="sample-id"
                          className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                          value={liveValues.sampleId}
                          onChange={(event) =>
                            handleSampleChange(event.target.value)
                          }
                        >
                          {mappingSamples.map((sample) => (
                            <option key={sample.id} value={sample.id}>
                              {sample.title}
                            </option>
                          ))}
                        </select>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {activeSample?.description}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/80 p-5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleLoadSampleIntoEditor}
                          >
                            Load active sample
                          </Button>
                          <Button
                            type="button"
                            disabled={!isCustomJsonDirty}
                            onClick={() =>
                              applyCustomJson(customJsonDraft, {
                                suspendWorkbench: true,
                              })
                            }
                          >
                            Apply JSON
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleFormatCustomJson}
                          >
                            Format JSON
                          </Button>
                          <label
                            htmlFor="json-upload"
                            className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
                          >
                            <Upload className="size-4" />
                            Upload .json
                          </label>
                          <input
                            id="json-upload"
                            type="file"
                            accept=".json,application/json"
                            className="sr-only"
                            onChange={handleFileImport}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="custom-json">Custom JSON</Label>
                          <Textarea
                            id="custom-json"
                            {...bufferedJsonEditorServiceProps}
                            placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                            className="min-h-[22rem] font-mono text-[13px] leading-6"
                            value={customJsonDraft}
                            onChange={(event) => {
                              setCustomJsonDraft(event.target.value)
                            }}
                          />
                          <p className="text-sm leading-6 text-muted-foreground">
                            Custom input stays local to this browser. Saved
                            custom presets persist the raw JSON in IndexedDB so
                            you can resume the exact mapping session later.
                          </p>
                          {isCustomJsonDirty ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                              Preview is paused while this draft has unapplied
                              changes. Apply or format it when you are ready to
                              rebuild the workbench.
                            </p>
                          ) : isCustomProjectionRebuilding ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                              Rebuilding the preview for the latest committed
                              JSON.
                              {projection.progress
                                ? ` ${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}.`
                                : ''}
                            </p>
                          ) : projection.parseError ? (
                            <p className="text-sm leading-6 text-destructive">
                              Invalid JSON: {projection.parseError}
                            </p>
                          ) : projection.isProjecting ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                              Parsing and rebuilding the preview in the
                              background.
                              {projection.progress
                                ? ` ${formatProjectionProgressDetail(projection.progress)}.`
                                : ''}
                            </p>
                          ) : (
                            <p className="text-sm leading-6 text-muted-foreground">
                              Parsed successfully. Next, point the root path at
                              the array or object collection that should become
                              CSV rows.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="space-y-3 rounded-[24px] border border-border/70 bg-background/80 p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={isWorkbenchTransitionPending}
                          onClick={handleSmartDetect}
                        >
                          Smart detect
                        </Button>
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                          Scan the current payload for keyed object maps such as
                          `$.data.*` or complex multi-collection roots that
                          should stay at `$` with `stringify`. When the current
                          custom root is still `$` or no longer matches the
                          payload, the app now auto-applies the strongest
                          suggestion on import or apply.
                        </p>
                      </div>

                      {smartDetectFeedback ? (
                        <div
                          className={cn(
                            'rounded-[22px] border px-4 py-3 text-sm leading-6',
                            smartDetectFeedback.tone === 'error'
                              ? 'border-destructive/30 bg-destructive/5 text-destructive'
                              : smartDetectFeedback.tone === 'success'
                                ? 'border-primary/20 bg-primary/5 text-foreground'
                                : 'border-border/70 bg-background/70 text-muted-foreground',
                          )}
                        >
                          <p>{smartDetectFeedback.detail}</p>
                          {smartDetectFeedback.previewHeaders.length > 0 ? (
                            <p className="mt-2 font-mono text-xs text-muted-foreground/80">
                              Preview columns:{' '}
                              {smartDetectFeedback.previewHeaders.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm leading-6 text-muted-foreground">
                          Useful for payloads where each object key is really a
                          row identifier and the current flattening path would
                          otherwise explode into hundreds of sibling columns.
                        </p>
                      )}
                    </div>
                  </WorkbenchSection>

                  {isWorkbenchSuspended ? (
                    <WorkbenchSection
                      eyebrow={suspendedWorkbenchSectionEyebrow}
                      title={suspendedWorkbenchSectionTitle}
                      description={suspendedWorkbenchDescription}
                      icon={<Braces className="size-5" />}
                    >
                      <div className="rounded-[22px] border border-border/70 bg-background/85 px-4 py-3 text-sm font-medium text-foreground">
                        {suspendedWorkbenchTitle}
                      </div>
                      <p className="text-sm leading-6 text-muted-foreground">
                        {suspendedWorkbenchLead}
                      </p>
                      <div className="rounded-[22px] border border-border/70 bg-background/85 p-4 text-sm leading-6 text-muted-foreground">
                        {pendingWorkbenchTransition
                          ? suspendedWorkbenchFollowUp
                          : isCustomJsonDirty
                            ? 'Additional mapping controls, saved presets, and preview panels are hidden until you apply this draft. This keeps large-payload editing isolated from the rest of the workbench.'
                            : projection.progress
                              ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}. The full workbench returns after this pass completes.`
                              : 'The latest committed JSON is rebuilding in the background. The full workbench returns after this pass completes.'}
                      </div>
                    </WorkbenchSection>
                  ) : (
                    <>
                      <WorkbenchSection
                        eyebrow="Scope"
                        title="Choose where rows begin"
                        description="Set the root path that defines row start, then use the planner to keep only the branches that matter before flattening."
                        icon={<Waypoints className="size-5" />}
                      >
                        <div className="space-y-2">
                          <Label htmlFor="root-path">Root path</Label>
                          <Input
                            id="root-path"
                            placeholder="$.items.item[*]"
                            {...form.register('rootPath')}
                          />
                          <FieldError
                            message={form.formState.errors.rootPath?.message}
                          />
                          {liveValues.sourceMode === 'custom' ? (
                            <p className="text-sm leading-6 text-muted-foreground">
                              {streamableCustomSelector
                                ? 'Incremental selector parsing is active for this path. Nested [*] and [0] steps plus object .* branches can stream directly from the custom JSON text before final materialization.'
                                : 'This custom path currently falls back to full-document parsing.'}
                            </p>
                          ) : null}
                        </div>

                        {isComplexJsonGuidanceVisible && complexJsonOverview ? (
                          <ComplexJsonOverviewPanel
                            overview={complexJsonOverview}
                            onContinue={handleContinueComplexJsonWorkbench}
                            onSelectRootPath={handleComplexJsonRootSelection}
                          />
                        ) : (
                          <PathPlanner
                            defaultMode={liveValues.flattenMode}
                            rules={plannerRules}
                            suggestions={discoveredPaths}
                            onChange={setPlannerRules}
                          />
                        )}
                      </WorkbenchSection>

                      {isComplexJsonGuidanceVisible ? null : (
                        <>
                          <WorkbenchSection
                            eyebrow="Row shaping"
                            title="Control how nested data becomes rows"
                            description="These settings decide whether arrays zip, multiply, stay embedded, or get padded when parent and child shapes do not line up."
                            icon={<Rows3 className="size-5" />}
                          >
                            <div className="grid gap-4 md:grid-cols-2">
                              <SelectField
                                id="flatten-mode"
                                label="Flatten mode"
                                registration={form.register('flattenMode')}
                                options={flattenModes.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="placeholder-strategy"
                                label="Parent fill"
                                registration={form.register(
                                  'placeholderStrategy',
                                )}
                                options={placeholderStrategies.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="missing-keys"
                                label="Missing keys"
                                registration={form.register('onMissingKey')}
                                options={missingKeyStrategies.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="type-mismatch"
                                label="Type mismatch"
                                registration={form.register('onTypeMismatch')}
                                options={typeMismatchStrategies.map(
                                  (value) => ({
                                    label: toTitleCase(value),
                                    value,
                                  }),
                                )}
                              />
                              <SelectField
                                id="empty-array-behavior"
                                label="Empty arrays"
                                registration={form.register(
                                  'emptyArrayBehavior',
                                )}
                                options={emptyArrayBehaviors.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <div className="space-y-2">
                                <Label htmlFor="max-depth">Max depth</Label>
                                <Input
                                  id="max-depth"
                                  type="number"
                                  min={1}
                                  max={32}
                                  {...form.register('maxDepth', {
                                    valueAsNumber: true,
                                  })}
                                />
                              </div>
                            </div>

                            <div className="rounded-[22px] border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                              Use{' '}
                              <span className="font-medium text-foreground">
                                Parallel
                              </span>{' '}
                              when sibling arrays should stay positionally
                              aligned,
                              <span className="font-medium text-foreground">
                                {' '}
                                Cross Product
                              </span>{' '}
                              when every combination matters, and
                              <span className="font-medium text-foreground">
                                {' '}
                                Stringify
                              </span>{' '}
                              when nested arrays should remain in a single cell.
                            </div>
                          </WorkbenchSection>

                          <WorkbenchSection
                            eyebrow="Column output"
                            title="Lock down column behavior and CSV output"
                            description="Use these controls to stabilize headers, formatting, collision repair, and downstream-friendly CSV conventions."
                            icon={<TableProperties className="size-5" />}
                          >
                            <div className="grid gap-4 md:grid-cols-2">
                              <SelectField
                                id="header-policy"
                                label="Header policy"
                                registration={form.register('headerPolicy')}
                                options={headerPolicies.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="collision-strategy"
                                label="Collision strategy"
                                registration={form.register(
                                  'collisionStrategy',
                                )}
                                options={collisionStrategies.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="boolean-representation"
                                label="Boolean output"
                                registration={form.register(
                                  'booleanRepresentation',
                                )}
                                options={booleanRepresentations.map(
                                  (value) => ({
                                    label: toTitleCase(value),
                                    value,
                                  }),
                                )}
                              />
                              <SelectField
                                id="date-format"
                                label="Date output"
                                registration={form.register('dateFormat')}
                                options={dateFormats.map((value) => ({
                                  label: toTitleCase(value),
                                  value,
                                }))}
                              />
                              <SelectField
                                id="delimiter"
                                label="CSV delimiter"
                                registration={form.register('delimiter')}
                                options={delimiterOptions.map((option) => ({
                                  label: option.label,
                                  value: option.value,
                                }))}
                              />
                              <div className="space-y-2">
                                <Label htmlFor="path-separator">
                                  Path separator
                                </Label>
                                <Input
                                  id="path-separator"
                                  placeholder="."
                                  {...form.register('pathSeparator')}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="header-sample-size">
                                  Header sample size
                                </Label>
                                <Input
                                  id="header-sample-size"
                                  type="number"
                                  min={1}
                                  max={500}
                                  {...form.register('headerSampleSize', {
                                    valueAsNumber: true,
                                  })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="custom-placeholder">
                                  Custom placeholder
                                </Label>
                                <Input
                                  id="custom-placeholder"
                                  placeholder="NULL"
                                  {...form.register('customPlaceholder')}
                                />
                              </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                              <ToggleField
                                label="Quote all cells"
                                registration={form.register('quoteAll')}
                              />
                              <ToggleField
                                label="Strict naming"
                                registration={form.register('strictNaming')}
                              />
                              <ToggleField
                                label="Indexed pivot columns"
                                registration={form.register('arrayIndexSuffix')}
                              />
                            </div>

                            <HeaderMapper
                              headerPolicy={liveValues.headerPolicy}
                              rules={headerRules}
                              suggestions={headerSuggestions}
                              onChange={setHeaderRules}
                            />
                          </WorkbenchSection>

                          <WorkbenchSection
                            eyebrow="Actions"
                            title="Save this workbench or reset it"
                            description="Capture reusable mapping recipes in IndexedDB or return to the default donut baseline when you want a clean slate."
                            icon={<Save className="size-5" />}
                          >
                            <div className="flex flex-wrap gap-3">
                              <Button
                                type="submit"
                                disabled={
                                  savePresetMutation.isPending || !canSavePreset
                                }
                              >
                                <Save className="size-4" />
                                {savePresetMutation.isPending
                                  ? 'Saving preset...'
                                  : 'Save preset'}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleResetDefaults}
                              >
                                Reset defaults
                              </Button>
                            </div>

                            {savePresetMutation.isSuccess ? (
                              <p className="text-sm leading-6 text-muted-foreground">
                                Saved "{savePresetMutation.data.name}" for{' '}
                                {describePresetSource(savePresetMutation.data)}.
                              </p>
                            ) : null}

                            {configErrors.length > 0 ? (
                              <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-destructive">
                                {configErrors.slice(0, 3).map((error) => (
                                  <p key={error}>{error}</p>
                                ))}
                              </div>
                            ) : null}
                          </WorkbenchSection>
                        </>
                      )}
                    </>
                  )}
                </form>
              </CardContent>
            </Card>

            {isWorkbenchSuspended || isComplexJsonGuidanceVisible ? null : (
              <Card className="bg-white/82 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Save className="size-4 text-primary" />
                        Saved presets
                      </CardTitle>
                      <CardDescription>
                        Dexie stores the entire mapping config for later replay.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">{presets.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isPresetsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading presets...
                    </p>
                  ) : null}

                  {!isPresetsLoading && presets.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-border bg-background/60 p-4 text-sm leading-6 text-muted-foreground">
                      Save a configuration to compare different mapping
                      strategies over time.
                    </div>
                  ) : null}

                  <div className="grid gap-3">
                    {presets.map((preset) => {
                      const isActive = preset.id === selectedPresetId

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          className={cn(
                            'flex w-full flex-col gap-2 rounded-[24px] border p-4 text-left transition-colors',
                            isActive
                              ? 'border-primary/30 bg-primary/8'
                              : 'border-border/70 bg-background/80 hover:bg-secondary/60',
                          )}
                          onClick={() => loadPreset(preset)}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-semibold text-foreground">
                              {preset.name}
                            </span>
                            <Badge variant={isActive ? 'default' : 'outline'}>
                              {describePresetSource(preset)}
                            </Badge>
                          </div>
                          <p className="text-sm leading-6 text-muted-foreground">
                            {preset.config.rootPath} /{' '}
                            {toTitleCase(preset.config.flattenMode)} /{' '}
                            {preset.config.pathSeparator}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {isWorkbenchSuspended ? (
            <Card className="bg-white/82 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Braces className="size-5 text-primary" />
                  {suspendedWorkbenchTitle}
                </CardTitle>
                <CardDescription>
                  {suspendedWorkbenchDescription}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {pendingWorkbenchTransition && projection.progress ? (
                  <div className="rounded-[20px] border border-border/70 bg-background/80 p-4">
                    {projection.progress.label}{' '}
                    {formatProjectionProgressDetail(projection.progress)}
                  </div>
                ) : null}
                <p>{suspendedWorkbenchLead}</p>
                <p>{suspendedWorkbenchFollowUp}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              {isComplexJsonGuidanceVisible && complexJsonOverview ? (
                <Card className="bg-white/82 backdrop-blur-sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Waypoints className="size-5 text-primary" />
                      Narrow this document first
                    </CardTitle>
                    <CardDescription>
                      The current root is structurally broad enough that the
                      flat preview, relational preview, and full planner are
                      more useful after you narrow the scope.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ComplexJsonOverviewPanel
                      overview={complexJsonOverview}
                      onContinue={handleContinueComplexJsonWorkbench}
                      onSelectRootPath={handleComplexJsonRootSelection}
                    />
                  </CardContent>
                </Card>
              ) : (
                <>
                  <RowPreviewCard
                    activeSampleTitle={activeSample.title}
                    configDescription={activeConfigDescription}
                    conversionResult={conversionResult}
                    flatHeaders={flatHeaders}
                    flatRecords={flatRecords}
                    flatRowCount={flatRowCount}
                    isStreamingFlatPreview={isStreamingFlatPreview}
                    sourceMode={liveValues.sourceMode}
                    streamingFlatPreview={streamingFlatPreview}
                  />

                  <Card className="overflow-hidden bg-white/82 backdrop-blur-sm">
                    <CardHeader className="gap-4 border-b border-border/70">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Database className="size-5 text-primary" />
                            Relational split preview
                          </CardTitle>
                          <CardDescription>
                            Nested one-to-many branches are normalized into
                            linked CSV tables with synthetic primary keys and
                            parent foreign keys.
                          </CardDescription>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {isRelationalPreviewProjecting ? (
                            <Badge variant="outline">
                              {relationalPreview.progress
                                ? `${relationalPreview.progress.label} ${formatProjectionProgressDetail(relationalPreview.progress)}`
                                : 'Building relational preview'}
                            </Badge>
                          ) : null}
                          <Badge variant="secondary">
                            {relationalSplitResult?.tables.length ?? 0} tables
                          </Badge>
                          <Badge variant="secondary">
                            {relationalSplitResult?.relationships.length ?? 0}{' '}
                            links
                          </Badge>
                          {selectedRelationalTable ? (
                            <Badge variant="outline">
                              {selectedRelationalTable.rowCount} rows in{' '}
                              {selectedRelationalTable.tableName}
                            </Badge>
                          ) : null}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={
                              outputExportBlockedReason ??
                              'Download the full selected relational table as CSV.'
                            }
                            disabled={
                              !canExportOutputs ||
                              isOutputExporting ||
                              !selectedRelationalTable
                            }
                            onClick={() => {
                              void handleSelectedRelationalExport()
                            }}
                          >
                            <Download className="size-4" />
                            {isOutputExporting &&
                            outputExportLabel?.includes('relational CSV')
                              ? 'Preparing table CSV'
                              : 'Download selected table CSV'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={
                              outputExportBlockedReason ??
                              'Download every relational table as a ZIP archive.'
                            }
                            disabled={
                              !canExportOutputs ||
                              isOutputExporting ||
                              !relationalSplitResult
                            }
                            onClick={() => {
                              void handleRelationalArchiveExport()
                            }}
                          >
                            <Archive className="size-4" />
                            {isOutputExporting &&
                            outputExportLabel?.includes('bundled relational')
                              ? 'Preparing ZIP archive'
                              : 'Download all tables ZIP'}
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4 pt-4">
                      {relationalSplitResult ? (
                        <>
                          <div className="flex flex-wrap gap-2">
                            {relationalSplitResult.tables.map((table) => (
                              <Button
                                key={table.tableName}
                                type="button"
                                variant={
                                  table.tableName ===
                                  selectedRelationalTableName
                                    ? 'default'
                                    : 'outline'
                                }
                                size="sm"
                                onClick={() =>
                                  setSelectedRelationalTableName(
                                    table.tableName,
                                  )
                                }
                              >
                                {table.tableName}
                              </Button>
                            ))}
                          </div>

                          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                  Linked tables
                                </p>
                                {selectedRelationalTable ? (
                                  <Badge variant="outline">
                                    Source {selectedRelationalTable.sourcePath}
                                  </Badge>
                                ) : null}
                              </div>

                              {relationalSplitResult.relationships.length >
                              0 ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {relationalSplitResult.relationships.map(
                                    (relationship) => (
                                      <Badge
                                        key={`${relationship.parentTable}-${relationship.childTable}`}
                                        variant="secondary"
                                      >
                                        {formatRelationalRelationship(
                                          relationship,
                                        )}
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              ) : (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  No child tables were discovered under the
                                  current root selection.
                                </p>
                              )}
                            </div>

                            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                  Selected table
                                </p>
                                {selectedRelationalTable ? (
                                  <Badge variant="outline">
                                    {selectedRelationalTable.headers.length}{' '}
                                    columns
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="mt-3 text-sm text-muted-foreground">
                                {selectedRelationalTable
                                  ? selectedRelationalTable.parentTable
                                    ? `${selectedRelationalTable.tableName} inherits ${selectedRelationalTable.parentIdColumn} from ${selectedRelationalTable.parentTable}.`
                                    : `${selectedRelationalTable.tableName} is the normalized root table for ${selectedRelationalTable.sourcePath}.`
                                  : 'No relational table is available for the current form values.'}
                              </p>
                            </div>
                          </div>

                          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                    Table rows
                                  </p>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {selectedRelationalTable
                                      ? `${selectedRelationalTable.tableName} preview`
                                      : 'Select a relational table to inspect rows.'}
                                  </p>
                                </div>

                                {relationalPreviewRowsTruncated ? (
                                  <Badge variant="secondary">
                                    Showing first{' '}
                                    {projectionRelationalRowPreviewLimit} rows
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="mt-4 overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      {(
                                        selectedRelationalTable?.headers ?? [
                                          'value',
                                        ]
                                      ).map((header) => (
                                        <TableHead key={header}>
                                          {header}
                                        </TableHead>
                                      ))}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedRelationalTable &&
                                    relationalPreviewRows.rows.length > 0 ? (
                                      relationalPreviewRows.rows.map((row) => (
                                        <TableRow
                                          key={
                                            row[
                                              selectedRelationalTable.idColumn
                                            ] ??
                                            selectedRelationalTable.tableName
                                          }
                                        >
                                          {selectedRelationalTable.headers.map(
                                            (header) => (
                                              <TableCell
                                                key={`${row[selectedRelationalTable.idColumn] ?? selectedRelationalTable.tableName}-${header}`}
                                              >
                                                <span
                                                  className={cn(
                                                    'block max-w-[20rem] truncate',
                                                    (header.includes('id') ||
                                                      header.includes(
                                                        'path',
                                                      )) &&
                                                      'font-mono text-xs',
                                                  )}
                                                >
                                                  {row[header] || ' '}
                                                </span>
                                              </TableCell>
                                            ),
                                          )}
                                        </TableRow>
                                      ))
                                    ) : (
                                      <TableRow>
                                        <TableCell
                                          colSpan={Math.max(
                                            selectedRelationalTable?.headers
                                              .length ?? 1,
                                            1,
                                          )}
                                          className="py-10 text-center text-muted-foreground"
                                        >
                                          {selectedRelationalTable
                                            ? 'The selected relational table has no rows.'
                                            : 'No relational table is available for the current form values.'}
                                        </TableCell>
                                      </TableRow>
                                    )}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>

                            <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                                Linked CSV preview
                              </p>
                              {relationalCsvPreview.truncated ? (
                                <p className="mt-3 text-sm text-muted-foreground">
                                  Showing the first{' '}
                                  {projectionRelationalCsvPreviewCharacterLimit.toLocaleString()}{' '}
                                  characters of the selected relational table.
                                </p>
                              ) : null}
                              <Textarea
                                readOnly
                                value={relationalCsvPreview.text}
                                className="mt-3 min-h-[18rem] font-mono text-[13px] leading-6"
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[24px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                          {relationalPreviewStatusMessage}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(380px,0.8fr)] 2xl:grid-cols-[minmax(0,1.24fr)_minmax(420px,0.88fr)]">
                    <Card className="bg-white/82 backdrop-blur-sm">
                      <CardHeader>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              <Rows3 className="size-5 text-primary" />
                              CSV output
                            </CardTitle>
                            <CardDescription>
                              {isStreamingFlatPreview
                                ? 'This is a streamed partial CSV preview from the roots processed so far.'
                                : 'This is a bounded preview of the emitted CSV so large conversions do not lock the page.'}
                            </CardDescription>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            title={
                              outputExportBlockedReason ??
                              'Download the full flat CSV output.'
                            }
                            disabled={!canExportOutputs || isOutputExporting}
                            onClick={() => {
                              void handleFlatCsvExport()
                            }}
                          >
                            <Download className="size-4" />
                            {isOutputExporting &&
                            outputExportLabel?.includes('flat CSV')
                              ? 'Preparing full CSV'
                              : 'Download full CSV'}
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {outputExportError ? (
                          <div className="rounded-[20px] border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                            {outputExportError}
                          </div>
                        ) : null}
                        {isStreamingFlatPreview ? (
                          <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                            {describeStreamingCsvProgress(streamingFlatPreview)}
                          </div>
                        ) : null}
                        {csvPreview.truncated ? (
                          <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                            Showing the first{' '}
                            {projectionFlatCsvPreviewCharacterLimit.toLocaleString()}{' '}
                            characters.{' '}
                            {csvPreview.omittedCharactersKnown === false
                              ? 'Additional rows are hidden from the live preview.'
                              : `${csvPreview.omittedCharacters.toLocaleString()} more characters are hidden from the live preview.`}
                          </div>
                        ) : null}
                        <Textarea
                          readOnly
                          value={csvPreview.text}
                          className="min-h-[22rem] font-mono text-[13px] leading-6"
                        />
                      </CardContent>
                    </Card>

                    <Card className="bg-white/82 backdrop-blur-sm">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Database className="size-5 text-primary" />
                          Sidecar schema
                        </CardTitle>
                        <CardDescription>
                          Headers, source paths, detected value kinds, and
                          regroup keys derived from structural provenance.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {isStreamingFlatPreview ? (
                          <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                            Schema and type statistics finalize after the
                            current stream completes. The sidecar below reflects
                            the last completed projection.
                          </div>
                        ) : null}
                        <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Regroup keys
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {conversionResult?.schema.primaryKeys.map((key) => (
                              <Badge key={key} variant="outline">
                                {key}
                              </Badge>
                            ))}
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            Keys are relative to the selected root path. They
                            show which structural branches actually define row
                            identity in the current projection.
                          </p>
                        </div>

                        <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                            Type drift report
                          </p>

                          {mixedTypeReports.length > 0 ? (
                            <div className="mt-3 space-y-3">
                              {hiddenMixedTypeReportCount > 0 ? (
                                <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                                  Showing the first{' '}
                                  {schemaTypeReportPreviewLimit.toLocaleString()}{' '}
                                  mixed-type columns.{' '}
                                  {hiddenMixedTypeReportCount} more type-drift
                                  reports are hidden from the live sidecar.
                                </div>
                              ) : null}

                              {visibleMixedTypeReports.map((report) => (
                                <div key={report.header}>
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-semibold text-foreground">
                                      {report.header}
                                    </p>
                                    {report.coercedTo ? (
                                      <Badge variant="secondary">
                                        Coerced to {report.coercedTo}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 text-sm text-muted-foreground">
                                    {formatTypeReport(report)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                              No mixed-type columns detected in the current
                              projection.
                            </p>
                          )}
                        </div>

                        {hiddenSchemaColumnCount > 0 ? (
                          <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                            Showing the first{' '}
                            {schemaColumnPreviewLimit.toLocaleString()} columns
                            in the live sidecar. {hiddenSchemaColumnCount}{' '}
                            additional columns remain available in the full
                            export.
                          </div>
                        ) : null}

                        {visibleSchemaColumns.map((column) => (
                          <div
                            key={column.header}
                            className="rounded-[24px] border border-border/70 bg-background/80 p-4"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="font-semibold text-foreground">
                                {column.header}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {column.kinds.map((kind) => (
                                  <Badge
                                    key={`${column.header}-${kind}`}
                                    variant="secondary"
                                  >
                                    {kind}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground">
                              {column.sourcePath}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              {column.nullable ? 'Nullable' : 'Required'}
                            </p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}

              <Card className="bg-white/82 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Braces className="size-5 text-primary" />
                    Source input
                  </CardTitle>
                  <CardDescription>
                    {liveValues.sourceMode === 'custom'
                      ? 'Custom JSON is edited above. This card stays compact to avoid duplicating large payloads.'
                      : 'Bundled sample JSON from the local playground catalog.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {liveValues.sourceMode === 'custom' ? (
                    <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">
                          {committedCustomJson.length.toLocaleString()} chars
                        </Badge>
                        <Badge variant="outline">
                          Root {liveValues.rootPath || '$'}
                        </Badge>
                        {isCustomJsonDirty ? (
                          <Badge variant="secondary">Draft pending</Badge>
                        ) : null}
                        {projection.isProjecting ? (
                          <Badge variant="secondary">Preview rebuilding</Badge>
                        ) : null}
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground">
                        The editable JSON stays in the upper editor. The
                        duplicate raw preview has been removed so large payloads
                        do not force another oversized textarea render on every
                        interaction.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {sampleSourcePreview?.truncated ? (
                        <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                          Showing the first{' '}
                          {sampleSourcePreviewCharacterLimit.toLocaleString()}{' '}
                          characters of the sample source preview.
                        </div>
                      ) : null}
                      <Textarea
                        readOnly
                        value={sampleSourcePreview?.text ?? ''}
                        className="min-h-[22rem] font-mono text-[13px] leading-6"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function ComplexJsonOverviewPanel({
  overview,
  onContinue,
  onSelectRootPath,
}: {
  overview: ComplexJsonOverview
  onContinue: () => void
  onSelectRootPath: (nextRootPath: string) => void
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/55 p-4">
      <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
        Root `$` currently exposes {overview.totalPathCount.toLocaleString()}{' '}
        discovered paths and about {overview.columnCount.toLocaleString()}{' '}
        preview columns. Pick a narrower branch first, or continue into the full
        workbench anyway.
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Suggested roots
          </p>
          <p className="text-sm text-muted-foreground">
            These branches are ranked by structural usefulness, not by domain.
          </p>
        </div>

        <div className="grid gap-3">
          {overview.candidateRoots.map((branch) => (
            <div
              key={branch.path}
              className="rounded-[20px] border border-border/70 bg-background/80 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                    {branch.rootPath}
                  </code>
                  <Badge variant="outline">
                    {describeComplexJsonBranch(branch)}
                  </Badge>
                  <Badge variant="secondary">
                    {branch.descendantPathCount.toLocaleString()} paths
                  </Badge>
                </div>

                <Button
                  type="button"
                  size="sm"
                  onClick={() => onSelectRootPath(branch.rootPath)}
                >
                  Use this root
                </Button>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                Max depth {branch.maxDepth}. Example paths:{' '}
                {branch.examplePaths.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Top-level branches
          </p>
          <p className="text-sm text-muted-foreground">
            Use this as a structural overview when the root is too broad.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {overview.topLevelBranches.map((branch) => (
            <div
              key={branch.path}
              className="rounded-[20px] border border-border/70 bg-background/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                  {branch.rootPath}
                </code>
                <Badge variant="outline">
                  {describeComplexJsonBranch(branch)}
                </Badge>
                <Badge variant="secondary">
                  {branch.descendantPathCount.toLocaleString()} paths
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Example paths: {branch.examplePaths.join(', ')}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border/70 pt-4">
        <Button type="button" variant="outline" onClick={onContinue}>
          Continue with full workbench
        </Button>
      </div>
    </div>
  )
}

const RowPreviewCard = memo(function RowPreviewCard({
  activeSampleTitle,
  configDescription,
  conversionResult,
  flatHeaders,
  flatRecords,
  flatRowCount,
  isStreamingFlatPreview,
  sourceMode,
  streamingFlatPreview,
}: {
  activeSampleTitle: string
  configDescription: string
  conversionResult: ProjectionConversionResult | null
  flatHeaders: string[]
  flatRecords: Array<Record<string, string>>
  flatRowCount: number
  isStreamingFlatPreview: boolean
  sourceMode: SourceMode
  streamingFlatPreview: ProjectionFlatStreamPreview | null
}) {
  const [searchDraft, setSearchDraft] = useState('')
  const deferredSearch = useDeferredValue(searchDraft)
  const [sorting, setSorting] = useState<SortingState>([])
  const hasBoundedFlatPreview =
    !isStreamingFlatPreview &&
    conversionResult !== null &&
    conversionResult.rowCount > conversionResult.records.length
  const visibleHeaders = useMemo(
    () => flatHeaders.slice(0, tableColumnPreviewLimit),
    [flatHeaders],
  )
  const hiddenColumnCount = Math.max(
    0,
    flatHeaders.length - visibleHeaders.length,
  )
  const filteredRecords = useMemo(
    () => filterRecords(visibleHeaders, flatRecords, deferredSearch),
    [deferredSearch, flatRecords, visibleHeaders],
  )
  const previewRows = useMemo(
    () => createRowPreview(filteredRecords, projectionFlatRowPreviewLimit),
    [filteredRecords],
  )
  const flatPreviewRowsTruncated = isStreamingFlatPreview
    ? flatRowCount > flatRecords.length
    : previewRows.truncated || hasBoundedFlatPreview
  const columns = useMemo(
    () => buildPreviewColumns(visibleHeaders),
    [visibleHeaders],
  )
  const table = useReactTable({
    data: previewRows.rows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <Card className="overflow-hidden bg-white/82 backdrop-blur-sm">
      <CardHeader className="gap-4 border-b border-border/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TableProperties className="size-5 text-primary" />
              Row preview
            </CardTitle>
            <CardDescription>
              TanStack Table renders the projected rows from the current mapping
              config.
            </CardDescription>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {describeActiveSource(sourceMode, activeSampleTitle)}
            </Badge>
            <Badge variant="secondary">{flatRowCount} rows</Badge>
            <Badge variant="secondary">{flatHeaders.length} columns</Badge>
            {hiddenColumnCount > 0 ? (
              <Badge variant="outline">
                Showing first {visibleHeaders.length} columns
              </Badge>
            ) : null}
            {isStreamingFlatPreview ? (
              <Badge variant="secondary">Streaming preview</Badge>
            ) : null}
            {isStreamingFlatPreview && streamingFlatPreview ? (
              <Badge variant="outline">
                {formatStreamingRootProgress(streamingFlatPreview)}
              </Badge>
            ) : null}
            {flatPreviewRowsTruncated ? (
              <Badge variant="secondary">
                Showing first {projectionFlatRowPreviewLimit} rows
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Filter visible CSV rows"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="pl-11"
              placeholder="Filter visible rows across the shown columns"
            />
          </div>

          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            <Waypoints className="size-4 text-primary" />
            {configDescription}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Table>
          <TableCaption>
            {isStreamingFlatPreview && streamingFlatPreview
              ? `${describeStreamingPreviewCaption(streamingFlatPreview)}${hiddenColumnCount > 0 ? ` Showing the first ${visibleHeaders.length} of ${flatHeaders.length} columns in the live table preview.` : ''}`
              : conversionResult
                ? `${hasBoundedFlatPreview ? `Showing first ${conversionResult.records.length} preview rows of ${conversionResult.rowCount} total rows. ${deferredSearch.trim() ? 'Search applies to the preview slice only. ' : ''}` : ''}${hiddenColumnCount > 0 ? `Showing the first ${visibleHeaders.length} of ${flatHeaders.length} columns in the live table preview. ` : ''}Root path ${conversionResult.config.rootPath || '$'} with ${conversionResult.config.flattenMode} mode.`
                : 'Fix the current form errors to generate a preview.'}
          </TableCaption>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={Math.max(visibleHeaders.length, 1)}
                  className="py-16 text-center text-muted-foreground"
                >
                  {isStreamingFlatPreview || conversionResult
                    ? 'No rows match the current filter.'
                    : 'No projection available for the current form values.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
})

function buildPreviewColumns(
  headers: string[],
): ColumnDef<Record<string, string>>[] {
  if (headers.length === 0) {
    return []
  }

  return headers.map((header) => ({
    accessorKey: header,
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex items-center gap-2 text-left text-sm font-semibold text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        {header}
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.original[header]
      const isCompact = header.includes('id') || header.includes('path')

      return (
        <span
          className={cn(
            'block max-w-[20rem] truncate',
            isCompact && 'font-mono text-xs',
          )}
        >
          {value || ' '}
        </span>
      )
    },
  }))
}

function describeComplexJsonBranch(
  branch: ComplexJsonOverview['candidateRoots'][number],
) {
  if (branch.hasArray) {
    return 'Array-heavy'
  }

  if (branch.hasObject) {
    return 'Object-heavy'
  }

  return 'Mixed branch'
}

function filterRecords(
  headers: string[],
  records: Array<Record<string, string>>,
  search: string,
) {
  if (records.length === 0) {
    return []
  }

  const normalizedSearch = search.trim().toLowerCase()

  if (!normalizedSearch) {
    return records
  }

  return records.filter((record) =>
    headers.some((header) =>
      record[header].toLowerCase().includes(normalizedSearch),
    ),
  )
}

function buildHeaderSuggestions(
  columns: ColumnSchema[],
  discoveredPaths: InspectedPath[],
): HeaderSuggestion[] {
  const suggestionsByPath = new Map<string, HeaderSuggestion>()

  for (const column of columns) {
    suggestionsByPath.set(column.sourcePath, {
      currentHeader: column.header,
      kinds: column.kinds,
      sourcePath: column.sourcePath,
    })
  }

  for (const path of discoveredPaths) {
    if (!path.path || suggestionsByPath.has(path.path)) {
      continue
    }

    suggestionsByPath.set(path.path, {
      kinds: path.kinds,
      sourcePath: path.path,
    })
  }

  return [...suggestionsByPath.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  )
}

function toMappingConfig(
  values: ConverterFormValues,
  plannerRules: PlannerRule[],
  headerRules: HeaderRule[],
): MappingConfig {
  const plannerConfig = plannerRulesToConfig(plannerRules)
  const headerConfig = headerRulesToConfig(headerRules)

  return createMappingConfig({
    rootPath: values.rootPath,
    flattenMode: values.flattenMode,
    pathModes: plannerConfig.pathModes,
    pathSeparator: values.pathSeparator,
    arrayIndexSuffix: values.arrayIndexSuffix,
    placeholderStrategy: values.placeholderStrategy,
    customPlaceholder: values.customPlaceholder,
    onMissingKey: values.onMissingKey,
    onTypeMismatch: values.onTypeMismatch,
    headerPolicy: values.headerPolicy,
    headerSampleSize: values.headerSampleSize,
    headerAliases: headerConfig.headerAliases,
    headerWhitelist: headerConfig.headerWhitelist,
    strictNaming: values.strictNaming,
    collisionStrategy: values.collisionStrategy,
    booleanRepresentation: values.booleanRepresentation,
    dateFormat: values.dateFormat,
    delimiter: values.delimiter,
    quoteAll: values.quoteAll,
    emptyArrayBehavior: values.emptyArrayBehavior,
    maxDepth: values.maxDepth,
    includePaths: plannerConfig.includePaths,
    stringifyPaths: plannerConfig.stringifyPaths,
    dropPaths: plannerConfig.dropPaths,
  })
}

function toFormValues(preset: SavedPreset): ConverterFormValues {
  return {
    presetName: preset.name,
    sourceMode: preset.sourceMode ?? 'sample',
    sampleId: preset.sampleId,
    customJson: preset.customJson ?? '',
    rootPath: preset.config.rootPath ?? '$',
    flattenMode: preset.config.flattenMode,
    pathSeparator: preset.config.pathSeparator,
    arrayIndexSuffix: preset.config.arrayIndexSuffix,
    placeholderStrategy: preset.config.placeholderStrategy,
    customPlaceholder: preset.config.customPlaceholder ?? '',
    onMissingKey: preset.config.onMissingKey,
    onTypeMismatch: preset.config.onTypeMismatch,
    headerPolicy: preset.config.headerPolicy,
    headerSampleSize: preset.config.headerSampleSize,
    collisionStrategy: preset.config.collisionStrategy,
    strictNaming: preset.config.strictNaming,
    booleanRepresentation: preset.config.booleanRepresentation,
    dateFormat: preset.config.dateFormat,
    delimiter: preset.config.delimiter as ConverterFormValues['delimiter'],
    quoteAll: preset.config.quoteAll,
    emptyArrayBehavior: preset.config.emptyArrayBehavior,
    maxDepth: preset.config.maxDepth,
  }
}

function getSampleById(sampleId: string) {
  return (
    mappingSamples.find((sample) => sample.id === sampleId) ?? mappingSamples[0]
  )
}

function getAppDebugFlags() {
  if (typeof window === 'undefined') {
    return {
      projectionOffByDefault: false,
      showHangDiagnostics: false,
      showInputDiagnostics: false,
    }
  }

  const params = new URLSearchParams(window.location.search)
  const debugModes = new Set(
    params
      .getAll('debug')
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  )

  return {
    projectionOffByDefault: params.get('projection') === 'off',
    showHangDiagnostics: debugModes.has('hangs'),
    showInputDiagnostics: debugModes.has('input'),
  }
}

function publishWorkbenchTransitionDiagnostic(
  diagnostic: WorkbenchTransitionDiagnostic | null,
) {
  if (typeof window === 'undefined') {
    return
  }

  const debugWindow = window as Window & {
    __json2csvWorkbenchTransition?: WorkbenchTransitionDiagnostic | null
  }

  debugWindow.__json2csvWorkbenchTransition = diagnostic
  window.dispatchEvent(
    new CustomEvent('json2csv:workbench-transition', {
      detail: diagnostic,
    }),
  )
}

function createWorkbenchTransitionDiagnostic(
  previous: WorkbenchTransitionDiagnostic | null,
  transition: Pick<PendingWorkbenchTransition, 'id' | 'kind' | 'label'>,
  phase: WorkbenchTransitionPhase,
): WorkbenchTransitionDiagnostic {
  const now = Date.now()

  return {
    detail: describeWorkbenchTransitionDiagnosticDetail(
      transition.label,
      phase,
    ),
    id: transition.id,
    kind: transition.kind,
    label: transition.label,
    phase,
    startedAt: previous?.id === transition.id ? previous.startedAt : now,
    updatedAt: now,
  }
}

function describeWorkbenchTransitionDiagnosticDetail(
  label: string,
  phase: WorkbenchTransitionPhase,
) {
  switch (phase) {
    case 'queued':
      return `${label}. The heavy workbench is collapsed first so this transition can fail fast instead of blocking inside the click handler.`
    case 'applying':
      return `${label}. The state update has been applied; waiting for the next projection lifecycle to start.`
    case 'projecting':
      return `${label}. Projection is running in the background and the workbench will return after it settles.`
    case 'settled':
      return `${label}. Projection settled and the workbench has been restored.`
    case 'timed-out':
      return `${label}. No projection lifecycle settled within ${formatDurationMs(workbenchTransitionWatchdogMs)}.`
  }
}

function formatWorkbenchTransitionPhase(phase: WorkbenchTransitionPhase) {
  switch (phase) {
    case 'queued':
      return 'Queued'
    case 'applying':
      return 'Applying'
    case 'projecting':
      return 'Projecting'
    case 'settled':
      return 'Settled'
    case 'timed-out':
      return 'Timed out'
  }
}

function formatDurationMs(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString()} ms`
}

function describeHangAuditContext(context: HangAuditContext) {
  const sourceLabel =
    context.sourceMode === 'custom' ? 'custom JSON' : 'sample data'
  const activeLabel =
    context.transitionLabel ??
    context.projectionLabel ??
    'the current workbench state'

  return `${sourceLabel} at ${context.rootPath} with ${context.customJsonChars.toLocaleString()} chars, ${context.rowCount.toLocaleString()} rows, and ${context.columnCount.toLocaleString()} columns under ${activeLabel}`
}

function describeActiveSource(sourceMode: SourceMode, sampleTitle: string) {
  return sourceMode === 'custom' ? 'Custom JSON' : sampleTitle
}

function describePresetSource(
  preset: Pick<SavedPreset, 'sampleId' | 'sourceMode'>,
) {
  return preset.sourceMode === 'custom'
    ? 'Custom JSON'
    : getSampleById(preset.sampleId).title
}

function upsertHeaderAliasRule(
  rules: HeaderRule[],
  sourcePath: string,
  header: string,
  options: {
    overwriteExisting?: boolean
  } = {},
) {
  const normalizedSourcePath = sourcePath.trim()
  const normalizedHeader = header.trim()
  const overwriteExisting = options.overwriteExisting ?? true

  if (!normalizedSourcePath || !normalizedHeader) {
    return rules
  }

  const existingIndex = rules.findIndex(
    (rule) => rule.sourcePath.trim() === normalizedSourcePath,
  )

  if (existingIndex === -1) {
    return [
      createHeaderRule({
        enabled: false,
        header: normalizedHeader,
        sourcePath: normalizedSourcePath,
      }),
      ...rules,
    ]
  }

  if (!overwriteExisting) {
    return rules
  }

  return rules.map((rule, index) =>
    index === existingIndex
      ? { ...rule, header: normalizedHeader, sourcePath: normalizedSourcePath }
      : rule,
  )
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '') || 'Imported JSON'
}

function describeConfig(config: MappingConfig) {
  return `${toTitleCase(config.flattenMode)} / ${config.headerPolicy.replaceAll('_', ' ')} / ${config.delimiter === '\t' ? 'tab' : config.delimiter}`
}

function formatTypeReport(report: ColumnTypeReport) {
  return report.typeBreakdown
    .map((entry) => `${formatPercent(entry.percentage)} ${entry.kind}`)
    .join(' / ')
}

function formatStreamingRootProgress(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Streaming ${preview.processedRoots} roots`
    : `Streaming ${preview.processedRoots}/${preview.totalRoots} roots`
}

function describeStreamingPreviewCaption(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Streaming preview from ${preview.processedRoots} parsed roots. Final schema and relational tables are still building in the worker.`
    : `Streaming preview from ${preview.processedRoots}/${preview.totalRoots} roots. Final schema and relational tables are still building in the worker.`
}

function describeStreamingCsvProgress(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Processed ${preview.processedRoots} roots so far. The final CSV continues materializing in the worker.`
    : `Processed ${preview.processedRoots} of ${preview.totalRoots} roots. The final CSV continues materializing in the worker.`
}

function formatProjectionProgressDetail(progress: ProjectionProgress) {
  if (progress.phase === 'parse' && progress.phaseTotal > 1) {
    return `${progress.phaseCompleted.toLocaleString()}/${progress.phaseTotal.toLocaleString()} chars · ${progress.percent}%`
  }

  if (progress.phaseTotal > 1) {
    return `${progress.phaseCompleted}/${progress.phaseTotal} roots · ${progress.percent}%`
  }

  return `${progress.percent}%`
}

function formatRelationalRelationship(relationship: RelationalRelationship) {
  return `${relationship.parentTable} -> ${relationship.childTable} via ${relationship.foreignKeyColumn}`
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`
}

function toTitleCase(value: string) {
  return value
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(' ')
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
      <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  )
}

function WorkbenchSection({
  children,
  description,
  eyebrow,
  icon,
  title,
}: {
  children: ReactNode
  description: string
  eyebrow: string
  icon: ReactNode
  title: string
}) {
  return (
    <section className="rounded-[28px] border border-border/70 bg-background/75 p-5 shadow-[0_24px_70px_-58px_rgba(15,23,42,0.65)]">
      <div className="flex items-start gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            {eyebrow}
          </p>
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null
}

function SelectField({
  id,
  label,
  options,
  registration,
}: {
  id: string
  label: string
  options: { label: string; value: string }[]
  registration: UseFormRegisterReturn
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
        {...registration}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function ToggleField({
  label,
  registration,
}: {
  label: string
  registration: UseFormRegisterReturn
}) {
  return (
    <label className="flex items-center gap-3 rounded-[24px] border border-border/70 bg-background/80 px-4 py-3 text-sm font-medium text-foreground">
      <input
        type="checkbox"
        className="size-4 rounded border-border"
        {...registration}
      />
      {label}
    </label>
  )
}

export default App
