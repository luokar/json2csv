import {
  type ColumnTypeReport,
  convertJsonToCsvTable,
  createMappingConfig,
  type MappingConfig,
  type MappingResult,
  type ValueKind,
} from '@/lib/mapping-engine'

export const schemaDriftModes = ['strict', 'lax'] as const

export type SchemaDriftMode = (typeof schemaDriftModes)[number]

export interface SchemaSnapshotEntry {
  header: string
  sourcePath: string
}

export interface SchemaSnapshot {
  columns: SchemaSnapshotEntry[]
  headers: string[]
  sourceHeaders: SchemaSnapshotEntry[]
  version: string
}

export interface SchemaDriftIssue {
  inputIndex: number
  newHeaders: string[]
  snapshotVersion: string
}

export interface SchemaSnapshotRevision {
  inputIndex: number
  newHeaders: string[]
  snapshot: SchemaSnapshot
}

export interface BatchFileResult {
  appliedSnapshotVersion: string
  headers: string[]
  inputIndex: number
  newHeaders: string[]
  result?: MappingResult
  status: 'failed' | 'success'
}

export interface BatchMappingOptions {
  initialSnapshot?: SchemaSnapshot
  schemaMode?: SchemaDriftMode
}

export interface BatchMappingResult {
  config: MappingConfig
  driftIssues: SchemaDriftIssue[]
  files: BatchFileResult[]
  finalSnapshot: SchemaSnapshot
  initialSnapshot: SchemaSnapshot
  mode: SchemaDriftMode
  snapshotHistory: SchemaSnapshotRevision[]
  typeReports: ColumnTypeReport[]
}

export function createSchemaSnapshot(result: MappingResult): SchemaSnapshot {
  return buildSchemaSnapshot(
    result.schema.columns.map(({ header, sourcePath }) => ({
      header,
      sourcePath,
    })),
    result.schema.typeReports.map(({ header, sourcePath }) => ({
      header,
      sourcePath,
    })),
  )
}

export function convertJsonBatchToCsvTables(
  inputs: unknown[],
  overrides: Partial<MappingConfig> = {},
  options: BatchMappingOptions = {},
): BatchMappingResult {
  const config = createMappingConfig(overrides)
  const mode = options.schemaMode ?? 'lax'
  const initialDiscoveryResult =
    options.initialSnapshot || inputs.length === 0
      ? null
      : convertJsonToCsvTable(inputs[0], config)

  let currentSnapshot = options.initialSnapshot
    ? normalizeSchemaSnapshot(options.initialSnapshot)
    : initialDiscoveryResult
      ? createSchemaSnapshot(initialDiscoveryResult)
      : buildSchemaSnapshot([], [])

  const initialSnapshot = currentSnapshot
  const files: BatchFileResult[] = []
  const driftIssues: SchemaDriftIssue[] = []
  const snapshotHistory: SchemaSnapshotRevision[] = []

  inputs.forEach((input, inputIndex) => {
    const discoveryResult =
      inputIndex === 0 && initialDiscoveryResult
        ? initialDiscoveryResult
        : convertJsonToCsvTable(
            input,
            createSnapshotConfig(config, currentSnapshot, 'full_scan'),
          )

    const newColumns = discoveryResult.schema.columns.filter(
      (column) => !currentSnapshot.headers.includes(column.header),
    )
    const newHeaders = newColumns.map((column) => column.header)

    if (mode === 'strict' && newHeaders.length > 0) {
      driftIssues.push({
        inputIndex,
        newHeaders,
        snapshotVersion: currentSnapshot.version,
      })
      files.push({
        appliedSnapshotVersion: currentSnapshot.version,
        headers: currentSnapshot.headers,
        inputIndex,
        newHeaders,
        status: 'failed',
      })
      return
    }

    if (newColumns.length > 0) {
      currentSnapshot = mergeSchemaSnapshot(currentSnapshot, discoveryResult)
      snapshotHistory.push({
        inputIndex,
        newHeaders,
        snapshot: currentSnapshot,
      })
    }

    const result = convertJsonToCsvTable(
      input,
      createSnapshotConfig(config, currentSnapshot, 'explicit'),
    )

    files.push({
      appliedSnapshotVersion: currentSnapshot.version,
      headers: result.headers,
      inputIndex,
      newHeaders,
      result,
      status: 'success',
    })
  })

  return {
    config,
    driftIssues,
    files,
    finalSnapshot: currentSnapshot,
    initialSnapshot,
    mode,
    snapshotHistory,
    typeReports: aggregateTypeReports(
      files
        .filter(
          (file): file is BatchFileResult & { result: MappingResult } =>
            file.status === 'success' && file.result !== undefined,
        )
        .flatMap((file) => file.result.schema.typeReports),
      config.onTypeMismatch,
    ),
  }
}

function buildSchemaSnapshot(
  columns: SchemaSnapshotEntry[],
  sourceHeaders: SchemaSnapshotEntry[],
): SchemaSnapshot {
  const normalizedColumns = dedupeSnapshotEntries(columns, 'header')
  const normalizedSourceHeaders = dedupeSnapshotEntries(
    sourceHeaders,
    'sourcePath',
  )

  return {
    columns: normalizedColumns,
    headers: normalizedColumns.map((column) => column.header),
    sourceHeaders: normalizedSourceHeaders,
    version: createSnapshotVersion(normalizedColumns, normalizedSourceHeaders),
  }
}

function normalizeSchemaSnapshot(snapshot: SchemaSnapshot): SchemaSnapshot {
  return buildSchemaSnapshot(snapshot.columns, snapshot.sourceHeaders)
}

function mergeSchemaSnapshot(
  snapshot: SchemaSnapshot,
  result: MappingResult,
): SchemaSnapshot {
  const nextColumns = [...snapshot.columns]
  const knownHeaders = new Set(snapshot.headers)

  for (const column of result.schema.columns) {
    if (knownHeaders.has(column.header)) {
      continue
    }

    nextColumns.push({
      header: column.header,
      sourcePath: column.sourcePath,
    })
    knownHeaders.add(column.header)
  }

  const nextSourceHeaders = [...snapshot.sourceHeaders]
  const knownSourcePaths = new Set(
    snapshot.sourceHeaders.map((entry) => entry.sourcePath),
  )

  for (const report of result.schema.typeReports) {
    if (knownSourcePaths.has(report.sourcePath)) {
      continue
    }

    nextSourceHeaders.push({
      header: report.header,
      sourcePath: report.sourcePath,
    })
    knownSourcePaths.add(report.sourcePath)
  }

  return buildSchemaSnapshot(nextColumns, nextSourceHeaders)
}

function createSnapshotConfig(
  config: MappingConfig,
  snapshot: SchemaSnapshot,
  headerPolicy: MappingConfig['headerPolicy'],
): Partial<MappingConfig> {
  return {
    ...config,
    headerAliases: Object.fromEntries(
      snapshot.sourceHeaders.map((entry) => [entry.sourcePath, entry.header]),
    ),
    headerPolicy,
    headerWhitelist: snapshot.headers,
    onMissingKey: 'include',
    reservedColumns: snapshot.columns,
  }
}

function aggregateTypeReports(
  reports: ColumnTypeReport[],
  onTypeMismatch: MappingConfig['onTypeMismatch'],
) {
  const aggregates = new Map<
    string,
    {
      counts: Map<ValueKind, number>
      exportHeaders: string[]
      exportHeaderSet: Set<string>
      header: string
      missingCount: number
      sourcePath: string
    }
  >()

  for (const report of reports) {
    const existing = aggregates.get(report.sourcePath)

    if (existing) {
      existing.missingCount += report.missingCount

      report.exportHeaders.forEach((header) => {
        if (existing.exportHeaderSet.has(header)) {
          return
        }

        existing.exportHeaderSet.add(header)
        existing.exportHeaders.push(header)
      })

      report.typeBreakdown.forEach((entry) => {
        existing.counts.set(
          entry.kind,
          (existing.counts.get(entry.kind) ?? 0) + entry.count,
        )
      })

      continue
    }

    const counts = new Map<ValueKind, number>()

    report.typeBreakdown.forEach((entry) => {
      counts.set(entry.kind, entry.count)
    })

    aggregates.set(report.sourcePath, {
      counts,
      exportHeaders: [...report.exportHeaders],
      exportHeaderSet: new Set(report.exportHeaders),
      header: report.header,
      missingCount: report.missingCount,
      sourcePath: report.sourcePath,
    })
  }

  return [...aggregates.values()].map((aggregate) => {
    const observedCount = [...aggregate.counts.values()].reduce(
      (total, count) => total + count,
      0,
    )
    const typeBreakdown = [...aggregate.counts.entries()]
      .sort(
        ([leftKind, leftCount], [rightKind, rightCount]) =>
          rightCount - leftCount || compareValueKinds(leftKind, rightKind),
      )
      .map(([kind, count]) => ({
        count,
        kind,
        percentage:
          observedCount === 0
            ? 0
            : roundToSingleDecimal((count / observedCount) * 100),
      }))

    return {
      coercedTo:
        onTypeMismatch === 'coerce' && typeBreakdown.length > 1
          ? 'string'
          : null,
      dominantKind: typeBreakdown[0]?.kind ?? null,
      exportHeaders: aggregate.exportHeaders,
      header: aggregate.header,
      missingCount: aggregate.missingCount,
      observedCount,
      sourcePath: aggregate.sourcePath,
      typeBreakdown,
    } satisfies ColumnTypeReport
  })
}

function dedupeSnapshotEntries(
  entries: SchemaSnapshotEntry[],
  key: keyof SchemaSnapshotEntry,
) {
  const seen = new Set<string>()

  return entries.filter((entry) => {
    const value = entry[key]

    if (!entry.header || !entry.sourcePath || seen.has(value)) {
      return false
    }

    seen.add(value)
    return true
  })
}

function createSnapshotVersion(
  columns: SchemaSnapshotEntry[],
  sourceHeaders: SchemaSnapshotEntry[],
) {
  const signature = JSON.stringify({ columns, sourceHeaders })
  let hash = 2166136261

  for (const character of signature) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }

  return `schema-${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function compareValueKinds(left: ValueKind, right: ValueKind) {
  const order: ValueKind[] = [
    'array',
    'object',
    'string',
    'date',
    'number',
    'boolean',
    'null',
  ]

  return order.indexOf(left) - order.indexOf(right)
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10
}
