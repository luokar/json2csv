import {
  createMappingConfig,
  formatValue,
  type MappingConfig,
  normalizeRulePath,
  type ProcessingProgress,
  type ScalarValue,
  selectRootNodes,
  toCsv,
} from '@/lib/mapping-engine'
import { createTextPreview, type TextPreview } from '@/lib/preview'

const rootTableKey = '__root__'

export interface RelationalSplitResult {
  relationships: RelationalRelationship[]
  tables: RelationalTable[]
}

export interface RelationalSplitPreviewOptions {
  csvPreviewCharacterLimit: number
  previewRowLimit: number
}

export interface RelationalPreviewTable {
  csvPreview: TextPreview
  headers: string[]
  idColumn: string
  parentIdColumn: string | null
  parentTable: string | null
  records: Array<Record<string, string>>
  rowCount: number
  sourcePath: string
  tableName: string
}

export interface RelationalSplitPreviewResult {
  relationships: RelationalRelationship[]
  tables: RelationalPreviewTable[]
}

export interface RelationalTable {
  csv: string
  headers: string[]
  idColumn: string
  parentIdColumn: string | null
  parentTable: string | null
  rawRows: Array<Record<string, ScalarValue>>
  records: Array<Record<string, string>>
  rowCount: number
  sourcePath: string
  tableName: string
}

export interface RelationalRelationship {
  childTable: string
  foreignKeyColumn: string
  parentIdColumn: string
  parentTable: string
  sourcePath: string
}

interface RelationalSplitContext {
  config: MappingConfig
  normalizedAliases: Record<string, string>
  normalizedWhitelist: string[]
  tableByKey: Map<string, DraftTable>
  tableNameCounts: Map<string, number>
  tables: DraftTable[]
}

interface DraftRow {
  data: Record<string, ScalarValue>
  id: string
  parentId: string | null
}

interface DraftTable {
  dataPathSet: Set<string>
  dataPaths: string[]
  entityPath: string
  idColumn: string
  key: string
  parentIdColumn: string | null
  parentKey: string | null
  rows: DraftRow[]
  sourcePath: string
  tableName: string
}

export function splitJsonToRelationalTables(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
  onProgress?: (progress: ProcessingProgress) => void,
) {
  const context = buildRelationalSplitContext(input, overrides, onProgress)

  return {
    relationships: buildRelationalRelationships(context),
    tables: context.tables.map((table) => finalizeTable(table, context)),
  } satisfies RelationalSplitResult
}

export function splitJsonToRelationalTablesPreview(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
  options: RelationalSplitPreviewOptions,
  onProgress?: (progress: ProcessingProgress) => void,
) {
  const context = buildRelationalSplitContext(input, overrides, onProgress)

  return {
    relationships: buildRelationalRelationships(context),
    tables: context.tables.map((table) =>
      finalizePreviewTable(table, context, options),
    ),
  } satisfies RelationalSplitPreviewResult
}

function buildRelationalSplitContext(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
  onProgress?: (progress: ProcessingProgress) => void,
) {
  const config = createMappingConfig(overrides)
  const context: RelationalSplitContext = {
    config,
    normalizedAliases: normalizeAliases(config.headerAliases ?? {}),
    normalizedWhitelist: normalizeWhitelist(config.headerWhitelist ?? []),
    tableByKey: new Map(),
    tableNameCounts: new Map(),
    tables: [],
  }

  const rootTable = registerTable(context, {
    entityPath: '',
    key: rootTableKey,
    parentKey: null,
    sourcePath: config.rootPath ?? '$',
  })
  const rootNodes = selectRootNodes(input, config.rootPath)
  const rootEntities = rootNodes.flatMap((node) =>
    Array.isArray(node) ? node : [node],
  )
  const totalRoots = Math.max(rootEntities.length, 1)

  onProgress?.({ completed: 0, total: totalRoots })

  for (const [index, entity] of rootEntities.entries()) {
    projectEntity(context, rootTable, entity, null)
    onProgress?.({ completed: index + 1, total: totalRoots })
  }

  if (rootEntities.length === 0) {
    onProgress?.({ completed: totalRoots, total: totalRoots })
  }

  return context
}

function buildRelationalRelationships(context: RelationalSplitContext) {
  return context.tables.flatMap((table) => {
    if (!table.parentIdColumn || !table.parentKey) {
      return []
    }

    const parentTable = context.tableByKey.get(table.parentKey)

    if (!parentTable) {
      return []
    }

    return [
      {
        childTable: table.tableName,
        foreignKeyColumn: table.parentIdColumn,
        parentIdColumn: parentTable.idColumn,
        parentTable: parentTable.tableName,
        sourcePath: table.sourcePath,
      },
    ] satisfies RelationalRelationship[]
  })
}

function projectEntity(
  context: RelationalSplitContext,
  table: DraftTable,
  value: unknown,
  parentId: string | null,
) {
  const row: DraftRow = {
    data: {},
    id: `${table.tableName}_${table.rows.length + 1}`,
    parentId,
  }

  projectNodeToRow(context, table, row, value, [])
  table.rows.push(row)
}

function projectNodeToRow(
  context: RelationalSplitContext,
  table: DraftTable,
  row: DraftRow,
  value: unknown,
  relativePathSegments: string[],
) {
  const sourcePath = resolveSourcePath(table.entityPath, relativePathSegments)

  if (
    sourcePath &&
    !shouldIncludePath(sourcePath, context.config.includePaths)
  ) {
    return
  }

  if (sourcePath && shouldDropPath(sourcePath, context.config.dropPaths)) {
    return
  }

  if (Array.isArray(value)) {
    if (
      relativePathSegments.length === 0 ||
      shouldStringifyPath(sourcePath, context.config)
    ) {
      setCellValue(table, row, sourcePath || 'value', JSON.stringify(value))
      return
    }

    const childTable = registerTable(context, {
      entityPath: sourcePath,
      key: sourcePath,
      parentKey: table.key,
      sourcePath,
    })

    for (const entry of value) {
      projectEntity(context, childTable, entry, row.id)
    }

    return
  }

  if (isPlainObject(value)) {
    if (sourcePath && shouldStringifyPath(sourcePath, context.config)) {
      setCellValue(table, row, sourcePath, JSON.stringify(value))
      return
    }

    for (const [key, childValue] of Object.entries(value)) {
      projectNodeToRow(context, table, row, childValue, [
        ...relativePathSegments,
        key,
      ])
    }

    return
  }

  setCellValue(table, row, sourcePath || 'value', value as ScalarValue)
}

function setCellValue(
  table: DraftTable,
  row: DraftRow,
  sourcePath: string,
  value: ScalarValue,
) {
  const normalizedPath = normalizeRulePath(sourcePath) || 'value'

  row.data[normalizedPath] = value

  if (!table.dataPathSet.has(normalizedPath)) {
    table.dataPathSet.add(normalizedPath)
    table.dataPaths.push(normalizedPath)
  }
}

function finalizeTable(
  table: DraftTable,
  context: RelationalSplitContext,
): RelationalTable {
  const { headerByPath, headers, includedDataPaths } = resolveTableProjection(
    table,
    context,
  )
  const rawRows = table.rows.map((row) => {
    const rawRow: Record<string, ScalarValue> = {
      [table.idColumn]: row.id,
    }

    if (table.parentIdColumn) {
      rawRow[table.parentIdColumn] = row.parentId ?? ''
    }

    for (const sourcePath of includedDataPaths) {
      const header = headerByPath.get(sourcePath)

      if (!header) {
        continue
      }

      rawRow[header] = row.data[sourcePath]
    }

    return rawRow
  })
  const records = rawRows.map((row) => {
    const record: Record<string, string> = {}

    for (const header of headers) {
      record[header] = formatValue(row[header], context.config)
    }

    return record
  })

  return {
    csv: toCsv(headers, records, context.config),
    headers,
    idColumn: table.idColumn,
    parentIdColumn: table.parentIdColumn,
    parentTable: table.parentKey
      ? (context.tableByKey.get(table.parentKey)?.tableName ?? null)
      : null,
    rawRows,
    records,
    rowCount: table.rows.length,
    sourcePath: table.sourcePath,
    tableName: table.tableName,
  }
}

function finalizePreviewTable(
  table: DraftTable,
  context: RelationalSplitContext,
  options: RelationalSplitPreviewOptions,
): RelationalPreviewTable {
  const { headerByPath, headers, includedDataPaths } = resolveTableProjection(
    table,
    context,
  )
  const previewRows = table.rows.slice(0, Math.max(1, options.previewRowLimit))
  const records = previewRows.map((row) => {
    const record: Record<string, string> = {
      [table.idColumn]: row.id,
    }

    if (table.parentIdColumn) {
      record[table.parentIdColumn] = row.parentId ?? ''
    }

    for (const sourcePath of includedDataPaths) {
      const header = headerByPath.get(sourcePath)

      if (!header) {
        continue
      }

      record[header] = formatValue(row.data[sourcePath], context.config)
    }

    return record
  })

  return {
    csvPreview: buildRelationalCsvPreview(
      headers,
      records,
      table.rows.length,
      options.csvPreviewCharacterLimit,
      context.config,
    ),
    headers,
    idColumn: table.idColumn,
    parentIdColumn: table.parentIdColumn,
    parentTable: table.parentKey
      ? (context.tableByKey.get(table.parentKey)?.tableName ?? null)
      : null,
    records,
    rowCount: table.rows.length,
    sourcePath: table.sourcePath,
    tableName: table.tableName,
  }
}

function resolveTableProjection(
  table: DraftTable,
  context: RelationalSplitContext,
) {
  const includedDataPaths = selectIncludedDataPaths(table, context)
  const usedHeaders = new Set<string>([
    table.idColumn,
    ...(table.parentIdColumn ? [table.parentIdColumn] : []),
  ])
  const headerByPath = new Map<string, string>()

  for (const sourcePath of includedDataPaths) {
    const alias = context.normalizedAliases[sourcePath]?.trim()
    const baseHeader = alias || createRelativeHeader(sourcePath, table, context)
    let nextHeader = baseHeader
    let collisionIndex = 1

    while (usedHeaders.has(nextHeader)) {
      nextHeader = `${baseHeader}_${collisionIndex}`
      collisionIndex += 1
    }

    usedHeaders.add(nextHeader)
    headerByPath.set(sourcePath, nextHeader)
  }

  const dataHeaders = includedDataPaths
    .map((sourcePath) => headerByPath.get(sourcePath))
    .filter((header): header is string => header !== undefined)

  return {
    headerByPath,
    headers: [
      table.idColumn,
      ...(table.parentIdColumn ? [table.parentIdColumn] : []),
      ...dataHeaders,
    ],
    includedDataPaths,
  }
}

function buildRelationalCsvPreview(
  headers: string[],
  previewRecords: Array<Record<string, string>>,
  totalRows: number,
  maxCharacters: number,
  config: MappingConfig,
) {
  const previewCsv = toCsv(headers, previewRecords, config)
  const preview = createTextPreview(previewCsv, maxCharacters)

  if (previewRecords.length === totalRows) {
    return preview
  }

  if (preview.truncated) {
    return {
      omittedCharacters: preview.omittedCharacters,
      omittedCharactersKnown: false,
      text: preview.text,
      truncated: true,
    } satisfies TextPreview
  }

  return {
    omittedCharacters: 0,
    omittedCharactersKnown: false,
    text: `${previewCsv.trimEnd()}\n\n[Preview truncated]`,
    truncated: true,
  } satisfies TextPreview
}

function selectIncludedDataPaths(
  table: DraftTable,
  context: RelationalSplitContext,
) {
  if (context.config.headerPolicy !== 'explicit') {
    return table.dataPaths
  }

  const whitelist = context.normalizedWhitelist

  if (whitelist.length === 0) {
    return []
  }

  return whitelist.filter((sourcePath) => table.dataPathSet.has(sourcePath))
}

function createRelativeHeader(
  sourcePath: string,
  table: DraftTable,
  context: RelationalSplitContext,
) {
  const relativePath = toRelativePath(sourcePath, table.entityPath)
  const normalizedRelativePath = normalizeRulePath(relativePath)

  return (
    normalizedRelativePath.split('.').join(context.config.pathSeparator) ||
    'value'
  )
}

function registerTable(
  context: RelationalSplitContext,
  definition: {
    entityPath: string
    key: string
    parentKey: string | null
    sourcePath: string
  },
) {
  const existingTable = context.tableByKey.get(definition.key)

  if (existingTable) {
    return existingTable
  }

  const baseName = sanitizeTableName(
    definition.entityPath ? definition.entityPath.replaceAll('.', '_') : 'root',
  )
  const tableName = createUniqueTableName(baseName, context.tableNameCounts)
  const parentTable = definition.parentKey
    ? context.tableByKey.get(definition.parentKey)
    : null
  const table: DraftTable = {
    dataPathSet: new Set(),
    dataPaths: [],
    entityPath: definition.entityPath,
    idColumn: `${tableName}_id`,
    key: definition.key,
    parentIdColumn: parentTable ? `parent_${parentTable.tableName}_id` : null,
    parentKey: definition.parentKey,
    rows: [],
    sourcePath: definition.sourcePath,
    tableName,
  }

  context.tableByKey.set(definition.key, table)
  context.tables.push(table)

  return table
}

function createUniqueTableName(
  baseName: string,
  tableNameCounts: Map<string, number>,
) {
  const normalizedBaseName = sanitizeTableName(baseName) || 'table'
  const count = tableNameCounts.get(normalizedBaseName) ?? 0

  tableNameCounts.set(normalizedBaseName, count + 1)

  return count === 0 ? normalizedBaseName : `${normalizedBaseName}_${count}`
}

function sanitizeTableName(value: string) {
  return value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'root'
}

function resolveSourcePath(entityPath: string, relativePathSegments: string[]) {
  if (relativePathSegments.length === 0) {
    return entityPath
  }

  return [...(entityPath ? [entityPath] : []), ...relativePathSegments].join(
    '.',
  )
}

function toRelativePath(sourcePath: string, entityPath: string) {
  if (!entityPath) {
    return sourcePath
  }

  if (sourcePath === entityPath) {
    return ''
  }

  const prefix = `${entityPath}.`

  return sourcePath.startsWith(prefix)
    ? sourcePath.slice(prefix.length)
    : sourcePath
}

function shouldStringifyPath(path: string, config: MappingConfig) {
  const normalizedPath = normalizeRulePath(path)

  if (!normalizedPath) {
    return false
  }

  if (config.pathModes?.[normalizedPath] === 'stringify') {
    return true
  }

  return doesAnyPathMatch(normalizedPath, config.stringifyPaths)
}

function shouldDropPath(path: string, rules: string[]) {
  const normalizedPath = normalizeRulePath(path)

  if (!normalizedPath) {
    return false
  }

  return doesAnyPathMatch(normalizedPath, rules)
}

function shouldIncludePath(path: string, rules: string[]) {
  const normalizedPath = normalizeRulePath(path)

  if (!normalizedPath || rules.length === 0) {
    return true
  }

  return rules.some((rule) => doesIncludedPathMatch(normalizedPath, rule))
}

function doesAnyPathMatch(path: string, rules: string[]) {
  return rules.some((rule) => doesPathMatch(path, rule))
}

function doesIncludedPathMatch(path: string, rule: string) {
  const normalizedRule = normalizeRulePath(rule)

  if (!normalizedRule) {
    return true
  }

  return (
    path === normalizedRule ||
    path.startsWith(`${normalizedRule}.`) ||
    normalizedRule.startsWith(`${path}.`)
  )
}

function doesPathMatch(path: string, rule: string) {
  const normalizedPath = normalizeRulePath(path)
  const normalizedRule = normalizeRulePath(rule)

  if (!normalizedPath || !normalizedRule) {
    return false
  }

  return (
    normalizedPath === normalizedRule ||
    normalizedPath.startsWith(`${normalizedRule}.`) ||
    normalizedPath.startsWith(`${normalizedRule}[`)
  )
}

function normalizeAliases(headerAliases: Record<string, string>) {
  const normalizedAliases: Record<string, string> = {}

  for (const [sourcePath, alias] of Object.entries(headerAliases)) {
    const normalizedPath = normalizeRulePath(sourcePath)
    const trimmedAlias = alias.trim()

    if (!normalizedPath || !trimmedAlias) {
      continue
    }

    normalizedAliases[normalizedPath] = trimmedAlias
  }

  return normalizedAliases
}

function normalizeWhitelist(headerWhitelist: string[]) {
  return headerWhitelist
    .map((path) => normalizeRulePath(path))
    .filter((path, index, paths): path is string => {
      return path.length > 0 && paths.indexOf(path) === index
    })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
