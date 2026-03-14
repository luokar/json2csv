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
  Database,
  FileJson2,
  Save,
  Search,
  TableProperties,
} from 'lucide-react'
import { startTransition, useDeferredValue, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

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
import {
  createPreset,
  delimiterOptions,
  describeDelimiter,
  listPresets,
  type SavedPreset,
} from '@/lib/db'
import {
  availableFields,
  defaultFields,
  type PreviewRecord,
  parseFields,
  previewRows,
  toFieldLabel,
} from '@/lib/sample-data'
import { cn } from '@/lib/utils'
import { useWorkbenchStore } from '@/store/use-workbench-store'

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const availableFieldHint = availableFields.join(', ')
const availableFieldLookup = new Set<string>(availableFields)

const presetSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Preset name must be at least 3 characters.')
    .max(40, 'Preset name must stay under 40 characters.'),
  delimiter: z.enum(['comma', 'semicolon', 'tab']),
  fields: z
    .string()
    .trim()
    .min(1, 'Add at least one field.')
    .refine(
      (value) => {
        const fields = value
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean)

        return fields.every((field) => availableFieldLookup.has(field))
      },
      { message: `Use comma-separated fields from: ${availableFieldHint}` },
    )
    .refine(
      (value) => {
        const fields = value
          .split(',')
          .map((field) => field.trim())
          .filter(Boolean)

        return new Set(fields).size === fields.length
      },
      { message: 'Fields must be unique.' },
    ),
})

type PresetFormValues = z.infer<typeof presetSchema>

const initialFormValues: PresetFormValues = {
  name: 'Revenue export',
  delimiter: 'comma',
  fields: defaultFields.join(', '),
}

function App() {
  const queryClient = useQueryClient()
  const search = useWorkbenchStore((state) => state.search)
  const selectedPresetId = useWorkbenchStore((state) => state.selectedPresetId)
  const setSearch = useWorkbenchStore((state) => state.setSearch)
  const selectPreset = useWorkbenchStore((state) => state.selectPreset)
  const deferredSearch = useDeferredValue(search)
  const [sorting, setSorting] = useState<SortingState>([])

  const { data: presets = [], isLoading: isPresetsLoading } = useQuery({
    queryKey: ['presets'],
    queryFn: listPresets,
  })

  const form = useForm<PresetFormValues>({
    resolver: zodResolver(presetSchema),
    defaultValues: initialFormValues,
  })

  const watchedName = form.watch('name')
  const watchedDelimiter = form.watch('delimiter')
  const previewFields = parseFields(form.watch('fields'))
  const activeFields = previewFields.length > 0 ? previewFields : defaultFields
  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? null

  function loadPreset(preset: SavedPreset | null) {
    form.reset(
      preset
        ? {
            name: preset.name,
            delimiter: preset.delimiter,
            fields: preset.fields.join(', '),
          }
        : initialFormValues,
    )

    startTransition(() => {
      selectPreset(preset?.id ?? null)
    })
  }

  const savePresetMutation = useMutation({
    mutationFn: async (values: PresetFormValues) =>
      createPreset({
        name: values.name.trim(),
        delimiter: values.delimiter,
        fields: parseFields(values.fields),
      }),
    onSuccess: async (savedPreset) => {
      await queryClient.invalidateQueries({ queryKey: ['presets'] })
      loadPreset(savedPreset)
    },
  })

  const normalizedSearch = deferredSearch.trim().toLowerCase()
  const filteredRows = previewRows.filter((row) => {
    if (!normalizedSearch) {
      return true
    }

    return activeFields.some((field) =>
      String(row[field]).toLowerCase().includes(normalizedSearch),
    )
  })

  const columns: ColumnDef<PreviewRecord>[] = activeFields.map((field) => ({
    accessorKey: field,
    header: ({ column }) => (
      <button
        type="button"
        className="inline-flex items-center gap-2 text-left text-sm font-semibold text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
      >
        {toFieldLabel(field)}
        <ArrowUpDown className="size-3.5 text-muted-foreground" />
      </button>
    ),
    cell: ({ row }) => {
      const value = row.original[field]

      if (field === 'amount' && typeof value === 'number') {
        return (
          <span className="font-medium text-foreground">
            {currencyFormatter.format(value)}
          </span>
        )
      }

      if (field === 'createdAt' && typeof value === 'string') {
        return (
          <span className="text-muted-foreground">
            {dateFormatter.format(new Date(value))}
          </span>
        )
      }

      if (field === 'status' && typeof value === 'string') {
        return (
          <Badge variant="secondary" className="w-fit capitalize">
            {value}
          </Badge>
        )
      }

      return (
        <span className="font-medium text-foreground/90">{String(value)}</span>
      )
    },
  }))

  const table = useReactTable({
    data: filteredRows,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const activePresetName =
    (selectedPreset?.name ?? watchedName.trim()) || 'Draft mapping'

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top_left,rgba(255,203,153,0.88),transparent_38%),radial-gradient(circle_at_top_right,rgba(147,197,253,0.6),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,247,237,0.92))]" />

      <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div className="space-y-4">
            <Badge
              variant="outline"
              className="border-primary/20 bg-primary/5 text-primary"
            >
              Vite 8 / React 19 / TypeScript 5.9
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                JSON2CSV workbench starter with the full frontend stack wired
                in.
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
                Biome, Vitest, Tailwind CSS, shadcn/ui, Zustand, TanStack Query,
                TanStack Table, React Hook Form, Zod, Dexie, and Lucide are all
                live in this screen.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                'Biome',
                'Vitest',
                'Zustand',
                'TanStack Query',
                'TanStack Table',
                'React Hook Form + Zod',
                'Dexie',
                'shadcn/ui',
              ].map((item) => (
                <Badge key={item} variant="secondary" className="bg-white/80">
                  {item}
                </Badge>
              ))}
            </div>
          </div>

          <Card className="bg-white/75">
            <CardHeader>
              <CardTitle>Stack check</CardTitle>
              <CardDescription>
                The starter app persists presets locally, validates a form, and
                previews a sortable export table.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Database className="size-5" />
                </div>
                <p className="text-2xl font-semibold">{presets.length}</p>
                <p className="text-sm text-muted-foreground">
                  Saved Dexie presets
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <TableProperties className="size-5" />
                </div>
                <p className="text-2xl font-semibold">{activeFields.length}</p>
                <p className="text-sm text-muted-foreground">Mapped columns</p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
                <div className="mb-3 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <FileJson2 className="size-5" />
                </div>
                <p className="text-2xl font-semibold">{previewRows.length}</p>
                <p className="text-sm text-muted-foreground">
                  Sample JSON rows
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 xl:grid-cols-[390px_1fr]">
          <Card className="bg-white/75">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Save className="size-5 text-primary" />
                    Mapping presets
                  </CardTitle>
                  <CardDescription>
                    Validate with Zod, submit with React Hook Form, and persist
                    with Dexie.
                  </CardDescription>
                </div>
                <Badge variant="outline">Saved locally with Dexie</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {availableFields.map((field) => (
                  <Badge
                    key={field}
                    variant="secondary"
                    className="bg-background/90"
                  >
                    {field}
                  </Badge>
                ))}
              </div>

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
                    placeholder="Revenue export"
                    {...form.register('name')}
                  />
                  {form.formState.errors.name ? (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.name.message}
                    </p>
                  ) : null}
                </div>

                <div className="grid gap-4 sm:grid-cols-[1fr_1.15fr] xl:grid-cols-1">
                  <div className="space-y-2">
                    <Label htmlFor="delimiter">Delimiter</Label>
                    <select
                      id="delimiter"
                      className={cn(
                        'flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        form.formState.errors.delimiter && 'border-destructive',
                      )}
                      {...form.register('delimiter')}
                    >
                      {delimiterOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="fields">CSV fields</Label>
                    <Input
                      id="fields"
                      placeholder="id, customer, plan, amount"
                      {...form.register('fields')}
                    />
                    <p className="text-sm text-muted-foreground">
                      Use comma-separated keys from {availableFieldHint}.
                    </p>
                    {form.formState.errors.fields ? (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.fields.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button type="submit" disabled={savePresetMutation.isPending}>
                    <Save className="size-4" />
                    {savePresetMutation.isPending
                      ? 'Saving preset...'
                      : 'Save preset'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      savePresetMutation.reset()
                      loadPreset(null)
                    }}
                  >
                    Reset starter mapping
                  </Button>
                </div>

                {savePresetMutation.isSuccess ? (
                  <p className="text-sm text-muted-foreground">
                    Saved "{savePresetMutation.data.name}" to IndexedDB.
                  </p>
                ) : null}
              </form>

              <div className="space-y-3 border-t border-border/70 pt-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Saved presets
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Click a preset to load it back into the form and preview.
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
                    Save your first preset to see Dexie + TanStack Query in
                    action.
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
                        onClick={() => {
                          savePresetMutation.reset()
                          loadPreset(preset)
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-foreground">
                            {preset.name}
                          </span>
                          <Badge variant={isActive ? 'default' : 'outline'}>
                            {describeDelimiter(preset.delimiter)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {preset.fields.join(', ')}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden bg-white/75">
            <CardHeader className="gap-4 border-b border-border/70">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TableProperties className="size-5 text-primary" />
                    Preview table
                  </CardTitle>
                  <CardDescription>
                    TanStack Table handles sorting. The filter is stored in
                    Zustand and read through a deferred value.
                  </CardDescription>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{activePresetName}</Badge>
                  <Badge variant="secondary">
                    {activeFields.length} columns
                  </Badge>
                  <Badge variant="secondary">{filteredRows.length} rows</Badge>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="pl-11"
                    placeholder="Filter rows across visible fields"
                  />
                </div>

                <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                  <FileJson2 className="size-4 text-primary" />
                  Sample dataset: {previewRows.length} JSON records
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              <Table>
                <TableCaption>
                  Export fields: {activeFields.join(', ')}. Delimiter:{' '}
                  {describeDelimiter(watchedDelimiter)}.
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
                        colSpan={activeFields.length}
                        className="py-16 text-center text-muted-foreground"
                      >
                        No rows match the current filter.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  )
}

export default App
