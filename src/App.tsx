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
  ArrowUpDown,
  Braces,
  Database,
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
  type ReactNode,
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'
import { type UseFormRegisterReturn, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import {
  BufferedJsonEditor,
  type BufferedJsonEditorHandle,
} from '@/components/buffered-json-editor'
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
import { useProjectionPreview } from '@/hooks/use-projection-preview'
import {
  createPreset,
  listPresets,
  type SavedPreset,
  type SourceMode,
} from '@/lib/db'
import {
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
  type MappingConfig,
  missingKeyStrategies,
  placeholderStrategies,
  toCsv,
  typeMismatchStrategies,
} from '@/lib/mapping-engine'
import { mappingSamples } from '@/lib/mapping-samples'
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
  projectionFlatCsvPreviewCharacterLimit,
  projectionFlatRowPreviewLimit,
  projectionRelationalCsvPreviewCharacterLimit,
  projectionRelationalRowPreviewLimit,
} from '@/lib/projection'
import type { RelationalRelationship } from '@/lib/relational-split'
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
  const queryClient = useQueryClient()
  const search = useWorkbenchStore((state) => state.search)
  const selectedPresetId = useWorkbenchStore((state) => state.selectedPresetId)
  const setSearch = useWorkbenchStore((state) => state.setSearch)
  const selectPreset = useWorkbenchStore((state) => state.selectPreset)
  const deferredSearch = useDeferredValue(search)
  const [headerRules, setHeaderRules] = useState<HeaderRule[]>([])
  const [plannerRules, setPlannerRules] = useState<PlannerRule[]>([])
  const [selectedRelationalTableName, setSelectedRelationalTableName] =
    useState('root')
  const [sorting, setSorting] = useState<SortingState>([])
  const [committedCustomJson, setCommittedCustomJson] = useState(
    defaultFormValues.customJson,
  )
  const [isCustomJsonDirty, setIsCustomJsonDirty] = useState(false)
  const [isCustomProjectionPending, setIsCustomProjectionPending] =
    useState(false)
  const [isProjectionDebugDisabled, setProjectionDebugDisabled] = useState(
    debugFlags.projectionOffByDefault,
  )
  const customJsonEditorRef = useRef<BufferedJsonEditorHandle | null>(null)

  const { data: presets = [], isLoading: isPresetsLoading } = useQuery({
    queryKey: ['presets'],
    queryFn: listPresets,
  })

  const form = useForm<ConverterFormValues>({
    resolver: zodResolver(converterFormSchema),
    defaultValues: defaultFormValues,
  })

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
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : 'invalid-config',
    {
      enabled: !isProjectionDebugDisabled,
    },
  )
  const discoveredPaths = projection.discoveredPaths
  const conversionResult = projection.conversionResult
  const relationalSplitResult = projection.relationalSplitResult
  const streamingFlatPreview = projection.streamingFlatPreview
  const isStreamingFlatPreview =
    projection.isProjecting && streamingFlatPreview !== null
  const headerSuggestions = buildHeaderSuggestions(
    conversionResult?.schema.columns ?? [],
    discoveredPaths,
  )

  const flatHeaders =
    streamingFlatPreview?.headers ?? conversionResult?.headers ?? []
  const flatRecords =
    streamingFlatPreview?.previewRecords ?? conversionResult?.records ?? []
  const flatRowCount =
    streamingFlatPreview?.rowCount ?? conversionResult?.rowCount ?? 0
  const hasBoundedFlatPreview =
    !isStreamingFlatPreview &&
    conversionResult !== null &&
    conversionResult.rowCount > conversionResult.records.length
  const flatCsvSource =
    isStreamingFlatPreview && activeConfig
      ? toCsv(flatHeaders, flatRecords, activeConfig)
      : (conversionResult?.csvPreview.text ?? 'No CSV generated.')
  const flatCsvLineCount =
    isStreamingFlatPreview || conversionResult
      ? flatRowCount + (flatHeaders.length > 0 ? 1 : 0)
      : 0
  const filteredRecords = filterRecords(
    flatHeaders,
    flatRecords,
    deferredSearch,
  )
  const previewRows = createRowPreview(
    filteredRecords,
    projectionFlatRowPreviewLimit,
  )
  const flatPreviewRowsTruncated = isStreamingFlatPreview
    ? flatRowCount > flatRecords.length
    : previewRows.truncated || hasBoundedFlatPreview
  const csvPreview =
    isStreamingFlatPreview && activeConfig
      ? createTextPreview(flatCsvSource, projectionFlatCsvPreviewCharacterLimit)
      : (conversionResult?.csvPreview ?? {
          omittedCharacters: 0,
          text: 'No CSV generated.',
          truncated: false,
        })
  const sampleSourcePreview =
    liveValues.sourceMode === 'sample'
      ? createTextPreview(
          stringifyJsonInput(activeSample.json),
          sampleSourcePreviewCharacterLimit,
        )
      : null
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
  const columns = buildPreviewColumns(flatHeaders)
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
    if (liveValues.sourceMode !== 'custom') {
      if (isCustomProjectionPending) {
        setIsCustomProjectionPending(false)
      }

      return
    }

    if (
      isCustomJsonDirty ||
      !isCustomProjectionPending ||
      projection.isProjecting
    ) {
      return
    }

    setIsCustomProjectionPending(false)
  }, [
    isCustomJsonDirty,
    isCustomProjectionPending,
    liveValues.sourceMode,
    projection.isProjecting,
  ])

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

  function commitCustomJson(nextText: string) {
    startTransition(() => {
      setCommittedCustomJson(nextText)
    })
  }

  function replaceCustomJson(nextText: string) {
    setCommittedCustomJson(nextText)
    setIsCustomJsonDirty(false)
  }

  function flushCustomJson() {
    const latestText =
      customJsonEditorRef.current?.flush() ?? committedCustomJson
    const shouldRebuildProjection =
      isCustomJsonDirty || latestText !== committedCustomJson

    if (latestText !== committedCustomJson) {
      setCommittedCustomJson(latestText)
    }

    setIsCustomJsonDirty(false)

    if (shouldRebuildProjection) {
      setIsCustomProjectionPending(true)
    }

    return latestText
  }

  function loadPreset(preset: SavedPreset) {
    form.reset({
      ...toFormValues(preset),
      customJson: defaultFormValues.customJson,
    })
    setHeaderRules(headerRulesFromConfig(preset.config))
    setCommittedCustomJson(preset.customJson ?? '')
    setIsCustomJsonDirty(false)
    setIsCustomProjectionPending(false)
    setPlannerRules(plannerRulesFromConfig(preset.config))
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(preset.id ?? null)
    })
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
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(null)
    })
  }

  function handleSourceModeChange(sourceMode: SourceMode) {
    if (liveValues.sourceMode === 'custom') {
      const latestCustomJson =
        customJsonEditorRef.current?.read() ?? committedCustomJson

      if (latestCustomJson !== committedCustomJson) {
        setCommittedCustomJson(latestCustomJson)
      }

      setIsCustomJsonDirty(false)
      setIsCustomProjectionPending(false)
    }

    form.setValue('sourceMode', sourceMode, { shouldValidate: true })
    form.setValue(
      'rootPath',
      sourceMode === 'sample'
        ? (defaultRootPaths[liveValues.sampleId] ?? '$')
        : '$',
      { shouldValidate: true },
    )
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(null)
    })
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const text = await file.text()

    form.setValue('sourceMode', 'custom', { shouldValidate: true })
    replaceCustomJson(text)
    form.setValue('rootPath', '$', { shouldValidate: true })
    form.setValue('presetName', `${stripFileExtension(file.name)} export`, {
      shouldValidate: true,
    })
    savePresetMutation.reset()
    event.target.value = ''

    startTransition(() => {
      selectPreset(null)
    })
  }

  function handleLoadSampleIntoEditor() {
    form.setValue('sourceMode', 'custom', { shouldValidate: true })
    replaceCustomJson(stringifyJsonInput(activeSample.json))
    form.setValue('rootPath', defaultRootPaths[activeSample.id] ?? '$', {
      shouldValidate: true,
    })
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(null)
    })
  }

  function handleFormatCustomJson() {
    const formatted = formatJsonInput(flushCustomJson())

    if (!formatted.formattedText) {
      return
    }

    replaceCustomJson(formatted.formattedText)
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
  const mixedTypeReports =
    conversionResult?.schema.typeReports.filter(
      (report) => report.typeBreakdown.length > 1,
    ) ?? []
  const committedCustomJsonParseResult =
    liveValues.sourceMode === 'custom' && !isCustomJsonDirty
      ? parseJsonInput(committedCustomJson)
      : null
  const isCustomProjectionRebuilding =
    liveValues.sourceMode === 'custom' &&
    isCustomProjectionPending &&
    !isCustomJsonDirty
  const isCustomWorkbenchSuspended =
    liveValues.sourceMode === 'custom' &&
    (isCustomJsonDirty || isCustomProjectionPending)
  const isLightweightInputDebugMode =
    debugFlags.showInputDiagnostics && isProjectionDebugDisabled

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
                    This uses the same buffered editor and apply flow as the
                    normal custom JSON panel, but without the projection
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
                    onClick={() => {
                      flushCustomJson()
                    }}
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
                <BufferedJsonEditor
                  ref={customJsonEditorRef}
                  id="custom-json"
                  placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                  className="min-h-[22rem] font-mono text-xs"
                  value={committedCustomJson}
                  onCommit={commitCustomJson}
                  onDirtyChange={setIsCustomJsonDirty}
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

      <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
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

          <Card className="bg-white/75">
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
                      className="h-full rounded-full bg-primary transition-[width] duration-200"
                      style={{ width: `${projection.progress.percent}%` }}
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

        <section className="grid gap-6 xl:grid-cols-[400px_1fr]">
          <Card className="bg-white/75">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Waypoints className="size-5 text-primary" />
                    Mapping controls
                  </CardTitle>
                  <CardDescription>
                    Configure how the tree becomes rows and how values are
                    rendered.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {activePreset ? activePreset.name : 'Unsaved configuration'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((values) => {
                  const latestCustomJson = flushCustomJson()

                  savePresetMutation.mutate({
                    ...values,
                    customJson: latestCustomJson,
                  })
                })}
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
                  <p className="text-sm text-muted-foreground">
                    Work from the bundled ambiguity samples or switch to real
                    JSON input with paste/upload.
                  </p>
                </div>

                {liveValues.sourceMode === 'sample' ? (
                  <div className="space-y-2">
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
                    <p className="text-sm text-muted-foreground">
                      {activeSample?.description}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/70 p-4">
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
                        onClick={() => {
                          flushCustomJson()
                        }}
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

                    <div className="space-y-2">
                      <Label htmlFor="custom-json">Custom JSON</Label>
                      <BufferedJsonEditor
                        ref={customJsonEditorRef}
                        id="custom-json"
                        placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                        className="min-h-[18rem] font-mono text-xs"
                        value={committedCustomJson}
                        onCommit={commitCustomJson}
                        onDirtyChange={setIsCustomJsonDirty}
                      />
                      <p className="text-sm text-muted-foreground">
                        Custom input stays local to this browser. If you save a
                        preset in custom mode, the raw JSON is stored locally in
                        IndexedDB with it.
                      </p>
                      {isCustomJsonDirty ? (
                        <p className="text-sm text-muted-foreground">
                          Preview is paused while this draft has unapplied
                          changes. Use Apply JSON, Format JSON, or save the
                          preset to apply it.
                        </p>
                      ) : isCustomProjectionRebuilding ? (
                        <p className="text-sm text-muted-foreground">
                          Rebuilding the preview for the latest committed JSON.
                          {projection.progress
                            ? ` ${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}.`
                            : ''}
                        </p>
                      ) : projection.parseError ? (
                        <p className="text-sm text-destructive">
                          Invalid JSON: {projection.parseError}
                        </p>
                      ) : projection.isProjecting ? (
                        <p className="text-sm text-muted-foreground">
                          Parsing and rebuilding the preview in the background.
                          {projection.progress
                            ? ` ${formatProjectionProgressDetail(projection.progress)}.`
                            : ''}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Parsed successfully. Adjust the root path to choose
                          where CSV rows begin.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {isCustomWorkbenchSuspended ? (
                  <div className="rounded-[24px] border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground">
                      {isCustomJsonDirty
                        ? 'Preview paused while editing custom JSON.'
                        : 'Rebuilding preview for committed custom JSON.'}
                    </p>
                    <p className="mt-2">
                      {isCustomJsonDirty
                        ? 'Additional mapping controls, saved presets, and preview panels are hidden until you apply this draft. This keeps the editor isolated while you paste or type large payloads.'
                        : projection.progress
                          ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}. The full workbench returns after this pass completes.`
                          : 'The latest committed JSON is rebuilding in the background. The full workbench returns after this pass completes.'}
                    </p>
                  </div>
                ) : (
                  <>
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
                        <p className="text-sm text-muted-foreground">
                          {streamableCustomSelector
                            ? 'Incremental selector parsing is active for this path. Nested [*] and [0] steps can stream directly from the custom JSON text before final materialization.'
                            : 'This custom path currently falls back to full-document parsing.'}
                        </p>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                        registration={form.register('placeholderStrategy')}
                        options={placeholderStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                        options={typeMismatchStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                        registration={form.register('collisionStrategy')}
                        options={collisionStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                      <SelectField
                        id="boolean-representation"
                        label="Boolean output"
                        registration={form.register('booleanRepresentation')}
                        options={booleanRepresentations.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
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
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                      <SelectField
                        id="delimiter"
                        label="CSV delimiter"
                        registration={form.register('delimiter')}
                        options={delimiterOptions.map((option) => ({
                          label: option.label,
                          value: option.value,
                        }))}
                      />
                      <SelectField
                        id="empty-array-behavior"
                        label="Empty arrays"
                        registration={form.register('emptyArrayBehavior')}
                        options={emptyArrayBehaviors.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="path-separator">Path separator</Label>
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

                    <PathPlanner
                      defaultMode={liveValues.flattenMode}
                      rules={plannerRules}
                      suggestions={discoveredPaths}
                      onChange={setPlannerRules}
                    />

                    <HeaderMapper
                      headerPolicy={liveValues.headerPolicy}
                      rules={headerRules}
                      suggestions={headerSuggestions}
                      onChange={setHeaderRules}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
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
                        onClick={() => {
                          form.reset(defaultFormValues)
                          setHeaderRules([])
                          setCommittedCustomJson(defaultFormValues.customJson)
                          setIsCustomJsonDirty(false)
                          setPlannerRules([])
                          savePresetMutation.reset()
                          startTransition(() => {
                            selectPreset(null)
                          })
                        }}
                      >
                        Reset defaults
                      </Button>
                    </div>

                    {savePresetMutation.isSuccess ? (
                      <p className="text-sm text-muted-foreground">
                        Saved "{savePresetMutation.data.name}" for{' '}
                        {describePresetSource(savePresetMutation.data)}.
                      </p>
                    ) : null}

                    {configErrors.length > 0 ? (
                      <div className="rounded-[24px] border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                        {configErrors.slice(0, 3).map((error) => (
                          <p key={error}>{error}</p>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </form>

              {isCustomWorkbenchSuspended ? null : (
                <div className="space-y-3 border-t border-border/70 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Saved presets
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        Dexie stores the entire mapping config for later replay.
                      </p>
                    </div>
                    <Badge variant="secondary">{presets.length}</Badge>
                  </div>

                  {isPresetsLoading ? (
                    <p className="text-sm text-muted-foreground">
                      Loading presets...
                    </p>
                  ) : null}

                  {!isPresetsLoading && presets.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-border bg-background/60 p-4 text-sm text-muted-foreground">
                      Save a configuration to compare different mapping
                      strategies over time.
                    </div>
                  ) : null}

                  <div className="space-y-3">
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
                          <p className="text-sm text-muted-foreground">
                            {preset.config.rootPath} /{' '}
                            {toTitleCase(preset.config.flattenMode)} /{' '}
                            {preset.config.pathSeparator}
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {isCustomWorkbenchSuspended ? (
            <Card className="bg-white/75">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Braces className="size-5 text-primary" />
                  {isCustomJsonDirty
                    ? 'Preview paused while editing custom JSON.'
                    : 'Rebuilding preview for committed custom JSON.'}
                </CardTitle>
                <CardDescription>
                  {isCustomJsonDirty
                    ? 'The row preview, relational split, CSV output, and schema sidecar are hidden until the current draft is applied.'
                    : 'The row preview, relational split, CSV output, and schema sidecar stay hidden until the next committed custom projection finishes.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                {isCustomProjectionRebuilding && projection.progress ? (
                  <div className="rounded-[20px] border border-border/70 bg-background/80 p-4">
                    {projection.progress.label}{' '}
                    {formatProjectionProgressDetail(projection.progress)}
                  </div>
                ) : null}
                {isCustomJsonDirty ? (
                  <>
                    <p>
                      The current editor stays active above, but the projection
                      workbench is temporarily collapsed so large custom
                      payloads do not keep the rest of the UI mounted while you
                      type.
                    </p>
                    <p>
                      Use `Apply JSON` to rebuild the previews and restore the
                      full workbench with the latest committed payload.
                    </p>
                  </>
                ) : (
                  <>
                    <p>
                      The latest custom payload has been committed. The
                      workbench stays collapsed until the worker finishes
                      rebuilding previews from that payload.
                    </p>
                    <p>
                      This avoids replaying the full row preview, relational
                      preview, CSV output, and schema sidecar on every progress
                      update during apply.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6">
              <Card className="overflow-hidden bg-white/75">
                <CardHeader className="gap-4 border-b border-border/70">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <TableProperties className="size-5 text-primary" />
                        Row preview
                      </CardTitle>
                      <CardDescription>
                        TanStack Table renders the projected rows from the
                        current mapping config.
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {describeActiveSource(
                          liveValues.sourceMode,
                          activeSample.title,
                        )}
                      </Badge>
                      <Badge variant="secondary">{flatRowCount} rows</Badge>
                      <Badge variant="secondary">
                        {flatHeaders.length} columns
                      </Badge>
                      {isStreamingFlatPreview ? (
                        <Badge variant="secondary">Streaming preview</Badge>
                      ) : null}
                      {isStreamingFlatPreview ? (
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
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        className="pl-11"
                        placeholder="Filter visible CSV rows"
                      />
                    </div>

                    <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                      <Waypoints className="size-4 text-primary" />
                      {activeConfig
                        ? describeConfig(activeConfig)
                        : 'Invalid configuration'}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  <Table>
                    <TableCaption>
                      {isStreamingFlatPreview
                        ? describeStreamingPreviewCaption(streamingFlatPreview)
                        : conversionResult
                          ? `${hasBoundedFlatPreview ? `Showing first ${conversionResult.records.length} preview rows of ${conversionResult.rowCount} total rows. ${deferredSearch.trim() ? 'Search applies to the preview slice only. ' : ''}` : ''}Root path ${conversionResult.config.rootPath || '$'} with ${conversionResult.config.flattenMode} mode.`
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
                            colSpan={Math.max(flatHeaders.length, 1)}
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

              <Card className="overflow-hidden bg-white/75">
                <CardHeader className="gap-4 border-b border-border/70">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="size-5 text-primary" />
                        Relational split preview
                      </CardTitle>
                      <CardDescription>
                        Nested one-to-many branches are normalized into linked
                        CSV tables with synthetic primary keys and parent
                        foreign keys.
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {relationalSplitResult?.tables.length ?? 0} tables
                      </Badge>
                      <Badge variant="secondary">
                        {relationalSplitResult?.relationships.length ?? 0} links
                      </Badge>
                      {selectedRelationalTable ? (
                        <Badge variant="outline">
                          {selectedRelationalTable.rowCount} rows in{' '}
                          {selectedRelationalTable.tableName}
                        </Badge>
                      ) : null}
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
                              table.tableName === selectedRelationalTableName
                                ? 'default'
                                : 'outline'
                            }
                            size="sm"
                            onClick={() =>
                              setSelectedRelationalTableName(table.tableName)
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

                          {relationalSplitResult.relationships.length > 0 ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {relationalSplitResult.relationships.map(
                                (relationship) => (
                                  <Badge
                                    key={`${relationship.parentTable}-${relationship.childTable}`}
                                    variant="secondary"
                                  >
                                    {formatRelationalRelationship(relationship)}
                                  </Badge>
                                ),
                              )}
                            </div>
                          ) : (
                            <p className="mt-3 text-sm text-muted-foreground">
                              No child tables were discovered under the current
                              root selection.
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
                                {selectedRelationalTable.headers.length} columns
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
                                    <TableHead key={header}>{header}</TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedRelationalTable &&
                                relationalPreviewRows.rows.length > 0 ? (
                                  relationalPreviewRows.rows.map((row) => (
                                    <TableRow
                                      key={
                                        row[selectedRelationalTable.idColumn] ??
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
                                                  header.includes('path')) &&
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
                            className="mt-3 min-h-[18rem] font-mono text-xs"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                      Relational split preview is unavailable while the current
                      mapping config is invalid.
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                <Card className="bg-white/75">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Rows3 className="size-5 text-primary" />
                      CSV output
                    </CardTitle>
                    <CardDescription>
                      {isStreamingFlatPreview
                        ? 'This is a streamed partial CSV preview from the roots processed so far.'
                        : 'This is a bounded preview of the emitted CSV so large conversions do not lock the page.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
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
                        {csvPreview.omittedCharacters.toLocaleString()} more
                        characters are hidden from the live preview.
                      </div>
                    ) : null}
                    <Textarea
                      readOnly
                      value={csvPreview.text}
                      className="min-h-[22rem] font-mono text-xs"
                    />
                  </CardContent>
                </Card>

                <Card className="bg-white/75">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Database className="size-5 text-primary" />
                      Sidecar schema
                    </CardTitle>
                    <CardDescription>
                      Headers, source paths, detected value kinds, and regroup
                      keys derived from structural provenance.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {isStreamingFlatPreview ? (
                      <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                        Schema and type statistics finalize after the current
                        stream completes. The sidecar below reflects the last
                        completed projection.
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
                        Keys are relative to the selected root path. They show
                        which structural branches actually define row identity
                        in the current projection.
                      </p>
                    </div>

                    <div className="rounded-[24px] border border-border/70 bg-background/80 p-4">
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Type drift report
                      </p>

                      {mixedTypeReports.length > 0 ? (
                        <div className="mt-3 space-y-3">
                          {mixedTypeReports.map((report) => (
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

                    {conversionResult?.schema.columns.map((column) => (
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

              <Card className="bg-white/75">
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
                        className="min-h-[22rem] font-mono text-xs"
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
      showInputDiagnostics: false,
    }
  }

  const params = new URLSearchParams(window.location.search)

  return {
    projectionOffByDefault: params.get('projection') === 'off',
    showInputDiagnostics: params.get('debug') === 'input',
  }
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
