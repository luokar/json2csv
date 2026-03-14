export const flattenModes = [
  'parallel',
  'cross_product',
  'stringify',
  'strict_leaf',
] as const

export const placeholderStrategies = ['repeat', 'empty', 'custom'] as const
export const missingKeyStrategies = ['omit', 'include'] as const
export const typeMismatchStrategies = ['coerce', 'split'] as const
export const headerPolicies = ['full_scan', 'sampled_scan', 'explicit'] as const
export const booleanRepresentations = [
  'true_false',
  'yes_no',
  'one_zero',
] as const
export const dateFormats = ['iso8601', 'yyyy-mm-dd'] as const
export const collisionStrategies = ['rename_duplicate', 'path_force'] as const
export const emptyArrayBehaviors = ['skip_row', 'include_null'] as const

export type FlattenMode = (typeof flattenModes)[number]
export type PlaceholderStrategy = (typeof placeholderStrategies)[number]
export type MissingKeyStrategy = (typeof missingKeyStrategies)[number]
export type TypeMismatchStrategy = (typeof typeMismatchStrategies)[number]
export type HeaderPolicy = (typeof headerPolicies)[number]
export type BooleanRepresentation = (typeof booleanRepresentations)[number]
export type DateFormat = (typeof dateFormats)[number]
export type CollisionStrategy = (typeof collisionStrategies)[number]
export type EmptyArrayBehavior = (typeof emptyArrayBehaviors)[number]

export type ScalarValue = boolean | null | number | string
export type JsonValue =
  | ScalarValue
  | JsonValue[]
  | {
      [key: string]: JsonValue
    }

export type ValueKind =
  | 'array'
  | 'boolean'
  | 'date'
  | 'null'
  | 'number'
  | 'object'
  | 'string'

export interface MappingConfig {
  rootPath?: string
  flattenMode: FlattenMode
  pathModes?: Record<string, FlattenMode>
  pathSeparator: string
  arrayIndexSuffix: boolean
  placeholderStrategy: PlaceholderStrategy
  customPlaceholder?: string
  onMissingKey: MissingKeyStrategy
  onTypeMismatch: TypeMismatchStrategy
  headerPolicy: HeaderPolicy
  headerSampleSize: number
  headerWhitelist?: string[]
  strictNaming: boolean
  collisionStrategy: CollisionStrategy
  booleanRepresentation: BooleanRepresentation
  dateFormat: DateFormat
  delimiter: string
  quoteAll: boolean
  emptyArrayBehavior: EmptyArrayBehavior
  maxDepth: number
  dropPaths: string[]
  stringifyPaths: string[]
}

export interface ColumnSchema {
  header: string
  sourcePath: string
  kinds: ValueKind[]
  nullable: boolean
}

export interface MappingSchema {
  columns: ColumnSchema[]
  primaryKeys: string[]
}

export interface MappingResult {
  config: MappingConfig
  csv: string
  headers: string[]
  rawRows: Array<Record<string, ScalarValue>>
  records: Array<Record<string, string>>
  rowCount: number
  schema: MappingSchema
}

export interface InspectedPath {
  count: number
  depth: number
  kinds: ValueKind[]
  path: string
}

interface ProjectedRow {
  data: Record<string, ScalarValue>
  repeatableKeys: Set<string>
}

interface ColumnRegistry {
  headers: string[]
  headerByPath: Map<string, string>
  pathByHeader: Map<string, string>
}

interface EngineContext {
  config: MappingConfig
  registry: ColumnRegistry
}

interface PathMatch {
  index: number
  mode: FlattenMode
}

type PathToken =
  | { type: 'property'; value: string }
  | { type: 'wildcard' }
  | { type: 'index'; value: number }

export const defaultMappingConfig: MappingConfig = {
  rootPath: '$.items.item[*]',
  flattenMode: 'parallel',
  pathModes: {},
  pathSeparator: '.',
  arrayIndexSuffix: false,
  placeholderStrategy: 'repeat',
  customPlaceholder: 'NULL',
  onMissingKey: 'include',
  onTypeMismatch: 'coerce',
  headerPolicy: 'full_scan',
  headerSampleSize: 25,
  headerWhitelist: [],
  strictNaming: true,
  collisionStrategy: 'rename_duplicate',
  booleanRepresentation: 'true_false',
  dateFormat: 'iso8601',
  delimiter: ',',
  quoteAll: true,
  emptyArrayBehavior: 'include_null',
  maxDepth: 12,
  dropPaths: [],
  stringifyPaths: [],
}

export function createMappingConfig(
  overrides: Partial<MappingConfig> = {},
): MappingConfig {
  return {
    ...defaultMappingConfig,
    ...overrides,
    pathModes: {
      ...defaultMappingConfig.pathModes,
      ...overrides.pathModes,
    },
    headerWhitelist:
      overrides.headerWhitelist ?? defaultMappingConfig.headerWhitelist,
    dropPaths: overrides.dropPaths ?? defaultMappingConfig.dropPaths,
    stringifyPaths:
      overrides.stringifyPaths ?? defaultMappingConfig.stringifyPaths,
  }
}

export function convertJsonToCsvTable(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
): MappingResult {
  const config = createMappingConfig(overrides)
  const registry: ColumnRegistry = {
    headers: [],
    headerByPath: new Map<string, string>(),
    pathByHeader: new Map<string, string>(),
  }
  const context: EngineContext = {
    config,
    registry,
  }

  const rootNodes = selectRootNodes(input, config.rootPath)
  const projectedGroups = rootNodes.map((rootNode) =>
    appendNodeToRows([createEmptyRow()], rootNode, [], context, 0),
  )

  const renderedGroups = projectedGroups.map((rows) =>
    applyPlaceholderStrategy(rows, config),
  )
  const renderedRawRows = renderedGroups.flat().map((row) => ({ ...row.data }))
  const splitRows = applyTypeMismatchStrategy(renderedRawRows, registry, config)
  const selectedHeaders = selectHeaders(splitRows, registry, config)
  const records = renderRecords(splitRows, selectedHeaders, config)
  const csv = toCsv(selectedHeaders, records, config)
  const schema = buildSchema(splitRows, selectedHeaders, registry, config)

  return {
    config,
    csv,
    headers: selectedHeaders,
    rawRows: splitRows,
    records,
    rowCount: renderedGroups.flat().length,
    schema,
  }
}

export function inspectMappingPaths(input: unknown, rootPath?: string) {
  const registry = new Map<
    string,
    {
      count: number
      depth: number
      kinds: Set<ValueKind>
    }
  >()

  for (const rootNode of selectRootNodes(input, rootPath)) {
    inspectNodePaths(rootNode, [], registry)
  }

  return [...registry.entries()]
    .map(([path, entry]) => ({
      count: entry.count,
      depth: entry.depth,
      kinds: [...entry.kinds].sort(compareValueKinds),
      path,
    }))
    .filter((entry) => entry.path.length > 0)
    .sort(
      (left, right) =>
        left.depth - right.depth || left.path.localeCompare(right.path),
    ) satisfies InspectedPath[]
}

function createEmptyRow(): ProjectedRow {
  return {
    data: {},
    repeatableKeys: new Set<string>(),
  }
}

function appendNodeToRows(
  rows: ProjectedRow[],
  value: unknown,
  pathSegments: string[],
  context: EngineContext,
  depth: number,
): ProjectedRow[] {
  if (depth > context.config.maxDepth) {
    return appendScalarToRows(
      rows,
      pathSegments,
      '[Max depth reached]',
      context,
    )
  }

  const normalizedPath = normalizeRulePath(pathSegments.join('.'))

  if (shouldDropPath(normalizedPath, context.config.dropPaths)) {
    return rows
  }

  if (value === undefined) {
    return rows
  }

  if (Array.isArray(value)) {
    return appendArrayToRows(rows, value, pathSegments, context, depth + 1)
  }

  if (isPlainObject(value)) {
    if (shouldStringifyPath(normalizedPath, context.config)) {
      return appendScalarToRows(
        rows,
        pathSegments,
        JSON.stringify(value),
        context,
      )
    }

    let nextRows = rows

    for (const [key, childValue] of Object.entries(value)) {
      nextRows = appendNodeToRows(
        nextRows,
        childValue,
        [...pathSegments, key],
        context,
        depth + 1,
      )

      if (nextRows.length === 0) {
        break
      }
    }

    return nextRows
  }

  return appendScalarToRows(rows, pathSegments, value as ScalarValue, context)
}

function appendArrayToRows(
  rows: ProjectedRow[],
  values: unknown[],
  pathSegments: string[],
  context: EngineContext,
  depth: number,
): ProjectedRow[] {
  const normalizedPath = normalizeRulePath(pathSegments.join('.'))

  if (shouldStringifyPath(normalizedPath, context.config)) {
    return appendScalarToRows(
      rows,
      pathSegments,
      JSON.stringify(values),
      context,
    )
  }

  if (values.length === 0) {
    return context.config.emptyArrayBehavior === 'skip_row' ? [] : rows
  }

  const elementRows = values.map((value) =>
    appendNodeToRows(
      [createEmptyRow()],
      value,
      pathSegments,
      context,
      depth + 1,
    ),
  )
  const mode = resolveModeForPath(normalizedPath, context.config)

  return mode === 'cross_product'
    ? combineByCrossProduct(rows, elementRows)
    : combineByParallel(rows, elementRows)
}

function appendScalarToRows(
  rows: ProjectedRow[],
  pathSegments: string[],
  value: ScalarValue,
  context: EngineContext,
): ProjectedRow[] {
  const header = resolveHeader(pathSegments, context)

  return rows.map((row) => ({
    data: {
      ...row.data,
      [header]: value,
    },
    repeatableKeys: new Set([...row.repeatableKeys, header]),
  }))
}

function combineByCrossProduct(
  baseRows: ProjectedRow[],
  elementRows: ProjectedRow[][],
): ProjectedRow[] {
  return baseRows.flatMap((baseRow) =>
    elementRows.flatMap((projectedRows) =>
      projectedRows.map((projectedRow) => mergeRows(baseRow, projectedRow)),
    ),
  )
}

function combineByParallel(
  baseRows: ProjectedRow[],
  elementRows: ProjectedRow[][],
): ProjectedRow[] {
  const sharedContextRow = deriveSharedContextRow(baseRows)
  const maxLength = Math.max(baseRows.length, elementRows.length, 1)

  return Array.from({ length: maxLength }, (_, index) => {
    const baseRow = baseRows[index] ?? sharedContextRow
    const projectedRows = elementRows[index] ?? [createEmptyRow()]

    return projectedRows.map((projectedRow) => mergeRows(baseRow, projectedRow))
  }).flat()
}

function mergeRows(left: ProjectedRow, right: ProjectedRow): ProjectedRow {
  return {
    data: {
      ...left.data,
      ...right.data,
    },
    repeatableKeys: new Set([...left.repeatableKeys, ...right.repeatableKeys]),
  }
}

function deriveSharedContextRow(rows: ProjectedRow[]) {
  if (rows.length === 0) {
    return createEmptyRow()
  }

  const sharedData: Record<string, ScalarValue> = {}
  const sharedRepeatableKeys = new Set(rows[0].repeatableKeys)
  const [firstRow, ...remainingRows] = rows

  for (const [key, value] of Object.entries(firstRow.data)) {
    const matchesAllRows = remainingRows.every((row) => row.data[key] === value)

    if (matchesAllRows) {
      sharedData[key] = value
    }
  }

  for (const key of sharedRepeatableKeys) {
    if (!remainingRows.every((row) => row.repeatableKeys.has(key))) {
      sharedRepeatableKeys.delete(key)
    }
  }

  return {
    data: sharedData,
    repeatableKeys: sharedRepeatableKeys,
  }
}

function applyPlaceholderStrategy(
  rows: ProjectedRow[],
  config: MappingConfig,
): ProjectedRow[] {
  if (config.placeholderStrategy === 'repeat') {
    return rows
  }

  const placeholder =
    config.placeholderStrategy === 'custom'
      ? (config.customPlaceholder ?? '')
      : ''

  return rows.map((row, index) => {
    if (index === 0) {
      return row
    }

    const nextData = { ...row.data }

    for (const key of row.repeatableKeys) {
      if (key in nextData) {
        nextData[key] = placeholder
      }
    }

    return {
      data: nextData,
      repeatableKeys: row.repeatableKeys,
    }
  })
}

function applyTypeMismatchStrategy(
  rows: Array<Record<string, ScalarValue>>,
  registry: ColumnRegistry,
  config: MappingConfig,
) {
  if (config.onTypeMismatch === 'coerce') {
    return rows
  }

  const kindsByHeader = inferKindsByHeader(rows)
  const splitHeaders = new Map<string, string[]>()

  for (const header of registry.headers) {
    const kinds = (kindsByHeader.get(header) ?? []).filter(
      (kind) => kind !== 'null',
    )

    if (kinds.length > 1) {
      splitHeaders.set(
        header,
        kinds.map((kind) => `${header}_${kind}`),
      )
    }
  }

  if (splitHeaders.size === 0) {
    return rows
  }

  registry.headers = registry.headers.flatMap(
    (header) => splitHeaders.get(header) ?? [header],
  )

  for (const [header, derivedHeaders] of splitHeaders) {
    const sourcePath = registry.pathByHeader.get(header) ?? header

    derivedHeaders.forEach((derivedHeader) => {
      registry.pathByHeader.set(derivedHeader, sourcePath)
    })
  }

  return rows.map((row) => {
    const nextRow: Record<string, ScalarValue> = {}

    for (const [header, value] of Object.entries(row)) {
      const derivedHeaders = splitHeaders.get(header)

      if (!derivedHeaders) {
        nextRow[header] = value
        continue
      }

      const kind = detectValueKind(value)

      if (kind === 'null') {
        continue
      }

      nextRow[`${header}_${kind}`] = value
    }

    return nextRow
  })
}

function selectHeaders(
  rows: Array<Record<string, ScalarValue>>,
  registry: ColumnRegistry,
  config: MappingConfig,
) {
  const encounteredHeaders = new Set<string>()
  const headerWhitelist = config.headerWhitelist ?? []

  const rowsToScan =
    config.headerPolicy === 'sampled_scan'
      ? rows.slice(0, Math.max(config.headerSampleSize, 1))
      : rows

  for (const row of rowsToScan) {
    for (const header of Object.keys(row)) {
      encounteredHeaders.add(header)
    }
  }

  const whitelisted = new Set(headerWhitelist)

  const orderedHeaders = registry.headers.filter((header) => {
    if (config.headerPolicy === 'explicit') {
      return (
        whitelisted.has(header) ||
        whitelisted.has(registry.pathByHeader.get(header) ?? '')
      )
    }

    if (config.onMissingKey === 'include') {
      return encounteredHeaders.has(header) || whitelisted.has(header)
    }

    return encounteredHeaders.has(header)
  })

  if (config.headerPolicy === 'explicit') {
    const missingExplicitHeaders = headerWhitelist.filter(
      (header) => !orderedHeaders.includes(header),
    )

    return [...orderedHeaders, ...missingExplicitHeaders]
  }

  if (config.onMissingKey === 'include') {
    return [
      ...orderedHeaders,
      ...headerWhitelist.filter((header) => !orderedHeaders.includes(header)),
    ]
  }

  return orderedHeaders
}

function renderRecords(
  rows: Array<Record<string, ScalarValue>>,
  headers: string[],
  config: MappingConfig,
) {
  return rows.map((row) => {
    const record: Record<string, string> = {}

    for (const header of headers) {
      record[header] = formatValue(row[header], config)
    }

    return record
  })
}

function buildSchema(
  rows: Array<Record<string, ScalarValue>>,
  headers: string[],
  registry: ColumnRegistry,
  config: MappingConfig,
): MappingSchema {
  const kindsByHeader = inferKindsByHeader(rows)

  return {
    columns: headers.map((header) => ({
      header,
      sourcePath: registry.pathByHeader.get(header) ?? header,
      kinds: kindsByHeader.get(header) ?? ['string'],
      nullable: rows.some(
        (row) => row[header] === null || row[header] === undefined,
      ),
    })),
    primaryKeys: config.rootPath ? [config.rootPath] : ['$'],
  }
}

function toCsv(
  headers: string[],
  records: Array<Record<string, string>>,
  config: MappingConfig,
) {
  const lines = [
    headers
      .map((header) => escapeCsvCell(header, config))
      .join(config.delimiter),
  ]

  for (const record of records) {
    lines.push(
      headers
        .map((header) => escapeCsvCell(record[header] ?? '', config))
        .join(config.delimiter),
    )
  }

  return lines.join('\n')
}

function escapeCsvCell(value: string, config: MappingConfig) {
  const needsQuotes =
    config.quoteAll ||
    value.includes(config.delimiter) ||
    value.includes('"') ||
    value.includes('\n')

  const escaped = value.replaceAll('"', '""')

  return needsQuotes ? `"${escaped}"` : escaped
}

function formatValue(value: ScalarValue | undefined, config: MappingConfig) {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'boolean') {
    switch (config.booleanRepresentation) {
      case 'one_zero':
        return value ? '1' : '0'
      case 'yes_no':
        return value ? 'Yes' : 'No'
      default:
        return value ? 'TRUE' : 'FALSE'
    }
  }

  if (typeof value === 'number') {
    return String(value)
  }

  if (config.dateFormat === 'yyyy-mm-dd' && looksLikeIsoDate(value)) {
    return value.slice(0, 10)
  }

  return value
}

function inferKindsByHeader(rows: Array<Record<string, ScalarValue>>) {
  const kindsByHeader = new Map<string, ValueKind[]>()

  for (const row of rows) {
    for (const [header, value] of Object.entries(row)) {
      const kind = detectValueKind(value)
      const kinds = kindsByHeader.get(header) ?? []

      if (!kinds.includes(kind)) {
        kinds.push(kind)
        kindsByHeader.set(header, kinds)
      }
    }
  }

  return kindsByHeader
}

function detectValueKind(value: unknown): ValueKind {
  if (value === null || value === undefined) {
    return 'null'
  }

  if (Array.isArray(value)) {
    return 'array'
  }

  if (typeof value === 'boolean') {
    return 'boolean'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (typeof value === 'string') {
    return looksLikeIsoDate(value) ? 'date' : 'string'
  }

  return 'object'
}

function inspectNodePaths(
  value: unknown,
  pathSegments: string[],
  registry: Map<
    string,
    {
      count: number
      depth: number
      kinds: Set<ValueKind>
    }
  >,
  shouldCountCurrentPath = true,
) {
  const path = pathSegments.join('.')
  const kind = detectValueKind(value)

  if (path) {
    const existingEntry = registry.get(path)

    if (existingEntry) {
      if (shouldCountCurrentPath) {
        existingEntry.count += 1
      }

      existingEntry.kinds.add(kind)
    } else {
      registry.set(path, {
        count: shouldCountCurrentPath ? 1 : 0,
        depth: pathSegments.length,
        kinds: new Set([kind]),
      })
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      inspectNodePaths(entry, pathSegments, registry, false)
    }

    return
  }

  if (!isPlainObject(value)) {
    return
  }

  for (const [key, childValue] of Object.entries(value)) {
    inspectNodePaths(childValue, [...pathSegments, key], registry)
  }
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

function looksLikeIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)
}

function resolveHeader(pathSegments: string[], context: EngineContext) {
  const canonicalPath = pathSegments.join('.') || 'column0'
  const existingHeader = context.registry.headerByPath.get(canonicalPath)

  if (existingHeader) {
    return existingHeader
  }

  const baseHeader =
    canonicalPath === 'column0'
      ? 'column0'
      : pathSegments.join(context.config.pathSeparator)

  let nextHeader = baseHeader

  if (
    context.config.strictNaming ||
    context.config.collisionStrategy === 'rename_duplicate'
  ) {
    let collisionIndex = 1

    while (context.registry.pathByHeader.has(nextHeader)) {
      nextHeader = `${baseHeader}_${collisionIndex}`
      collisionIndex += 1
    }
  }

  context.registry.headerByPath.set(canonicalPath, nextHeader)
  context.registry.pathByHeader.set(nextHeader, canonicalPath)
  context.registry.headers.push(nextHeader)

  return nextHeader
}

function resolveModeForPath(path: string, config: MappingConfig) {
  if (shouldStringifyPath(path, config)) {
    return 'stringify'
  }

  const pathMatch = Object.entries(
    config.pathModes ?? {},
  ).reduce<PathMatch | null>((bestMatch, [candidatePath, mode]) => {
    if (!doesPathMatch(path, candidatePath)) {
      return bestMatch
    }

    if (!bestMatch || candidatePath.length > bestMatch.index) {
      return {
        index: candidatePath.length,
        mode,
      }
    }

    return bestMatch
  }, null)

  if (pathMatch) {
    return pathMatch.mode
  }

  return config.flattenMode === 'strict_leaf' ? 'stringify' : config.flattenMode
}

function shouldStringifyPath(path: string, config: MappingConfig) {
  return doesAnyPathMatch(path, config.stringifyPaths)
}

function shouldDropPath(path: string, rules: string[]) {
  return doesAnyPathMatch(path, rules)
}

function doesAnyPathMatch(path: string, rules: string[]) {
  return rules.some((rule) => doesPathMatch(path, rule))
}

function doesPathMatch(path: string, rule: string) {
  const normalizedPath = normalizeRulePath(path)
  const normalizedRule = normalizeRulePath(rule)

  return (
    normalizedPath === normalizedRule ||
    normalizedPath.startsWith(`${normalizedRule}.`) ||
    normalizedPath.startsWith(`${normalizedRule}[`)
  )
}

function normalizeRulePath(path: string) {
  return path.replace(/^\$\.?/, '').replace(/\[\*\]/g, '')
}

function selectRootNodes(input: unknown, rootPath?: string) {
  if (!rootPath) {
    return Array.isArray(input) ? input : [input]
  }

  const tokens = tokenizeJsonPath(rootPath)
  return walkPath(input, tokens)
}

function tokenizeJsonPath(path: string) {
  const source = path.replace(/^\$\.?/, '')
  const tokens: PathToken[] = []
  let index = 0

  while (index < source.length) {
    const character = source[index]

    if (character === '.') {
      index += 1
      continue
    }

    if (character === '[') {
      const endIndex = source.indexOf(']', index)
      const selector = source.slice(index + 1, endIndex)

      tokens.push(
        selector === '*'
          ? { type: 'wildcard' }
          : { type: 'index', value: Number.parseInt(selector, 10) },
      )

      index = endIndex + 1
      continue
    }

    let endIndex = index

    while (
      endIndex < source.length &&
      source[endIndex] !== '.' &&
      source[endIndex] !== '['
    ) {
      endIndex += 1
    }

    tokens.push({
      type: 'property',
      value: source.slice(index, endIndex),
    })
    index = endIndex
  }

  return tokens
}

function walkPath(value: unknown, tokens: PathToken[]): unknown[] {
  if (tokens.length === 0) {
    return [value]
  }

  const [token, ...rest] = tokens

  if (token.type === 'property') {
    if (!isPlainObject(value) || !(token.value in value)) {
      return []
    }

    return walkPath(value[token.value], rest)
  }

  if (!Array.isArray(value)) {
    return []
  }

  if (token.type === 'wildcard') {
    return value.flatMap((entry) => walkPath(entry, rest))
  }

  const entry = value[token.value]
  return entry === undefined ? [] : walkPath(entry, rest)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
