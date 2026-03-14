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
  useState,
} from 'react'
import { type UseFormRegisterReturn, useForm } from 'react-hook-form'
import { z } from 'zod'
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
import {
  createPreset,
  listPresets,
  type SavedPreset,
  type SourceMode,
} from '@/lib/db'
import {
  formatJsonInput,
  parseJsonInput,
  stringifyJsonInput,
} from '@/lib/json-input'
import {
  booleanRepresentations,
  collisionStrategies,
  convertJsonToCsvTable,
  createMappingConfig,
  dateFormats,
  defaultMappingConfig,
  emptyArrayBehaviors,
  flattenModes,
  headerPolicies,
  inspectMappingPaths,
  type MappingConfig,
  type MappingResult,
  missingKeyStrategies,
  placeholderStrategies,
  typeMismatchStrategies,
} from '@/lib/mapping-engine'
import { mappingSamples } from '@/lib/mapping-samples'
import {
  type PlannerRule,
  plannerRulesFromConfig,
  plannerRulesToConfig,
} from '@/lib/path-planner'
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

function App() {
  const queryClient = useQueryClient()
  const search = useWorkbenchStore((state) => state.search)
  const selectedPresetId = useWorkbenchStore((state) => state.selectedPresetId)
  const setSearch = useWorkbenchStore((state) => state.setSearch)
  const selectPreset = useWorkbenchStore((state) => state.selectPreset)
  const deferredSearch = useDeferredValue(search)
  const [plannerRules, setPlannerRules] = useState<PlannerRule[]>([])
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: presets = [], isLoading: isPresetsLoading } = useQuery({
    queryKey: ['presets'],
    queryFn: listPresets,
  })

  const form = useForm<ConverterFormValues>({
    resolver: zodResolver(converterFormSchema),
    defaultValues: defaultFormValues,
  })

  const watchedValues = form.watch()
  const activeSample = getSampleById(watchedValues.sampleId)
  const parsedCustomInput =
    watchedValues.sourceMode === 'custom'
      ? parseJsonInput(watchedValues.customJson)
      : null
  const parsedValues = converterFormSchema.safeParse(watchedValues)
  const activeInput =
    watchedValues.sourceMode === 'custom'
      ? parsedCustomInput?.value
      : activeSample?.json
  const discoveredPaths =
    activeInput === undefined
      ? []
      : inspectMappingPaths(activeInput, watchedValues.rootPath)
  const activeConfig = parsedValues.success
    ? toMappingConfig(parsedValues.data, plannerRules)
    : undefined
  const conversionResult =
    parsedValues.success && activeInput !== undefined
      ? convertJsonToCsvTable(activeInput, activeConfig)
      : null

  const filteredRecords = filterRecords(conversionResult, deferredSearch)
  const columns = buildPreviewColumns(conversionResult)
  const table = useReactTable({
    data: filteredRecords,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

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
        config: toMappingConfig(parsed, plannerRules),
      })
    },
    onSuccess: async (savedPreset) => {
      await queryClient.invalidateQueries({ queryKey: ['presets'] })
      startTransition(() => {
        selectPreset(savedPreset.id ?? null)
      })
    },
  })

  function loadPreset(preset: SavedPreset) {
    form.reset(toFormValues(preset))
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
    form.setValue('sourceMode', sourceMode, { shouldValidate: true })
    form.setValue(
      'rootPath',
      sourceMode === 'sample'
        ? (defaultRootPaths[watchedValues.sampleId] ?? '$')
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
    form.setValue('customJson', text, { shouldValidate: true })
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
    form.setValue('customJson', stringifyJsonInput(activeSample.json), {
      shouldValidate: true,
    })
    form.setValue('rootPath', defaultRootPaths[activeSample.id] ?? '$', {
      shouldValidate: true,
    })
    savePresetMutation.reset()

    startTransition(() => {
      selectPreset(null)
    })
  }

  function handleFormatCustomJson() {
    const formatted = formatJsonInput(form.getValues('customJson'))

    if (!formatted.formattedText) {
      return
    }

    form.setValue('customJson', formatted.formattedText, {
      shouldValidate: true,
    })
  }

  const previewJson =
    watchedValues.sourceMode === 'custom'
      ? watchedValues.customJson
      : stringifyJsonInput(activeSample.json)
  const configErrors = [
    ...(parsedValues.success
      ? []
      : parsedValues.error.issues.map((issue) => issue.message)),
    ...(parsedCustomInput?.error ? [parsedCustomInput.error] : []),
  ]
  const activePreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? null
  const canSavePreset = parsedValues.success && activeInput !== undefined

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
              <CardTitle>Current projection</CardTitle>
              <CardDescription>
                These numbers update live as you change the mapping policy.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <StatCard
                icon={<Rows3 className="size-5" />}
                label="Rows"
                value={String(conversionResult?.rowCount ?? 0)}
              />
              <StatCard
                icon={<TableProperties className="size-5" />}
                label="Columns"
                value={String(conversionResult?.headers.length ?? 0)}
              />
              <StatCard
                icon={<FileJson2 className="size-5" />}
                label="CSV Lines"
                value={String(conversionResult?.csv.split('\n').length ?? 0)}
              />
            </CardContent>
          </Card>
        </section>

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
                onSubmit={form.handleSubmit((values) =>
                  savePresetMutation.mutate(values),
                )}
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
                          watchedValues.sourceMode === option.value
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

                {watchedValues.sourceMode === 'sample' ? (
                  <div className="space-y-2">
                    <Label htmlFor="sample-id">Sample dataset</Label>
                    <select
                      id="sample-id"
                      className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      value={watchedValues.sampleId}
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
                      <Textarea
                        id="custom-json"
                        placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                        className="min-h-[18rem] font-mono text-xs"
                        {...form.register('customJson')}
                      />
                      <p className="text-sm text-muted-foreground">
                        Custom input stays local to this browser. If you save a
                        preset in custom mode, the raw JSON is stored locally in
                        IndexedDB with it.
                      </p>
                      {parsedCustomInput?.error ? (
                        <p className="text-sm text-destructive">
                          Invalid JSON: {parsedCustomInput.error}
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
                      {...form.register('maxDepth', { valueAsNumber: true })}
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
                  defaultMode={watchedValues.flattenMode}
                  rules={plannerRules}
                  suggestions={discoveredPaths}
                  onChange={setPlannerRules}
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
                    label="Index suffix"
                    registration={form.register('arrayIndexSuffix')}
                  />
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    disabled={savePresetMutation.isPending || !canSavePreset}
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
              </form>

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
                    Save a configuration to compare different mapping strategies
                    over time.
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
            </CardContent>
          </Card>

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
                      TanStack Table renders the projected rows from the current
                      mapping config.
                    </CardDescription>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {describeActiveSource(
                        watchedValues.sourceMode,
                        activeSample.title,
                      )}
                    </Badge>
                    <Badge variant="secondary">
                      {conversionResult?.rowCount ?? 0} rows
                    </Badge>
                    <Badge variant="secondary">
                      {conversionResult?.headers.length ?? 0} columns
                    </Badge>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
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
                    {conversionResult
                      ? `Root path ${conversionResult.config.rootPath || '$'} with ${conversionResult.config.flattenMode} mode.`
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
                          colSpan={Math.max(
                            conversionResult?.headers.length ?? 1,
                            1,
                          )}
                          className="py-16 text-center text-muted-foreground"
                        >
                          {conversionResult
                            ? 'No rows match the current filter.'
                            : 'No projection available for the current form values.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
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
                    The emitted CSV reflects the same live mapping configuration
                    shown above.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    readOnly
                    value={conversionResult?.csv ?? 'No CSV generated.'}
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
                      which structural branches actually define row identity in
                      the current projection.
                    </p>
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
                  {watchedValues.sourceMode === 'custom'
                    ? 'Raw custom JSON text used for the current projection.'
                    : 'Bundled sample JSON from the local playground catalog.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  readOnly
                  value={previewJson}
                  className="min-h-[22rem] font-mono text-xs"
                />
              </CardContent>
            </Card>
          </div>
        </section>
      </main>
    </div>
  )
}

function buildPreviewColumns(
  result: MappingResult | null,
): ColumnDef<Record<string, string>>[] {
  if (!result) {
    return []
  }

  return result.headers.map((header) => ({
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

function filterRecords(result: MappingResult | null, search: string) {
  if (!result) {
    return []
  }

  const normalizedSearch = search.trim().toLowerCase()

  if (!normalizedSearch) {
    return result.records
  }

  return result.records.filter((record) =>
    result.headers.some((header) =>
      record[header].toLowerCase().includes(normalizedSearch),
    ),
  )
}

function toMappingConfig(
  values: ConverterFormValues,
  plannerRules: PlannerRule[],
): MappingConfig {
  const plannerConfig = plannerRulesToConfig(plannerRules)

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
    strictNaming: values.strictNaming,
    collisionStrategy: values.collisionStrategy,
    booleanRepresentation: values.booleanRepresentation,
    dateFormat: values.dateFormat,
    delimiter: values.delimiter,
    quoteAll: values.quoteAll,
    emptyArrayBehavior: values.emptyArrayBehavior,
    maxDepth: values.maxDepth,
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
