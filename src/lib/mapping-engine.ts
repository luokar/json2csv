import { createTextPreview, type TextPreview } from "@/lib/preview";

export const flattenModes = ["parallel", "cross_product", "stringify", "strict_leaf"] as const;

export const placeholderStrategies = ["repeat", "empty", "custom"] as const;
export const missingKeyStrategies = ["omit", "include"] as const;
export const typeMismatchStrategies = ["coerce", "split"] as const;
export const headerPolicies = ["full_scan", "sampled_scan", "explicit"] as const;
export const booleanRepresentations = ["true_false", "yes_no", "one_zero"] as const;
export const dateFormats = ["iso8601", "yyyy-mm-dd"] as const;
export const collisionStrategies = ["rename_duplicate", "path_force"] as const;
export const emptyArrayBehaviors = ["skip_row", "include_null"] as const;

export type FlattenMode = (typeof flattenModes)[number];
export type PlaceholderStrategy = (typeof placeholderStrategies)[number];
export type MissingKeyStrategy = (typeof missingKeyStrategies)[number];
export type TypeMismatchStrategy = (typeof typeMismatchStrategies)[number];
export type HeaderPolicy = (typeof headerPolicies)[number];
export type BooleanRepresentation = (typeof booleanRepresentations)[number];
export type DateFormat = (typeof dateFormats)[number];
export type CollisionStrategy = (typeof collisionStrategies)[number];
export type EmptyArrayBehavior = (typeof emptyArrayBehaviors)[number];

export type ScalarValue = boolean | null | number | string;
export type JsonValue =
  | ScalarValue
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type ValueKind = "array" | "boolean" | "date" | "null" | "number" | "object" | "string";

export interface MappingConfig {
  rootPath?: string;
  flattenMode: FlattenMode;
  pathModes?: Record<string, FlattenMode>;
  pathSeparator: string;
  arrayIndexSuffix: boolean;
  placeholderStrategy: PlaceholderStrategy;
  customPlaceholder?: string;
  onMissingKey: MissingKeyStrategy;
  onTypeMismatch: TypeMismatchStrategy;
  headerPolicy: HeaderPolicy;
  headerSampleSize: number;
  headerWhitelist?: string[];
  headerAliases?: Record<string, string>;
  reservedColumns?: Array<{
    header: string;
    sourcePath: string;
  }>;
  strictNaming: boolean;
  collisionStrategy: CollisionStrategy;
  booleanRepresentation: BooleanRepresentation;
  dateFormat: DateFormat;
  delimiter: string;
  quoteAll: boolean;
  emptyArrayBehavior: EmptyArrayBehavior;
  maxDepth: number;
  includePaths: string[];
  dropPaths: string[];
  stringifyPaths: string[];
}

export interface ColumnSchema {
  header: string;
  sourcePath: string;
  kinds: ValueKind[];
  nullable: boolean;
}

export interface ColumnTypeBreakdown {
  count: number;
  kind: ValueKind;
  percentage: number;
}

export interface ColumnTypeReport {
  coercedTo: "string" | null;
  dominantKind: ValueKind | null;
  exportHeaders: string[];
  header: string;
  missingCount: number;
  observedCount: number;
  sourcePath: string;
  typeBreakdown: ColumnTypeBreakdown[];
}

export interface MappingSchema {
  columns: ColumnSchema[];
  primaryKeys: string[];
  typeReports: ColumnTypeReport[];
}

export interface MappingResult {
  config: MappingConfig;
  csv: string;
  headers: string[];
  rawRows: Array<Record<string, ScalarValue>>;
  records: Array<Record<string, string>>;
  rowProvenance: RowProvenance[];
  rowCount: number;
  schema: MappingSchema;
}

export interface MappingPreviewOptions {
  csvPreviewCharacterLimit: number;
  previewRowLimit: number;
  rootLimit?: number;
}

export interface MappingPreviewResult {
  config: MappingConfig;
  csvPreview: TextPreview;
  headers: string[];
  records: Array<Record<string, string>>;
  rowCount: number;
  schema: MappingSchema;
}

export interface RowLineageSegment {
  index: number;
  path: string;
}

export interface RowProvenance {
  lineage: RowLineageSegment[];
}

export interface InspectedPath {
  count: number;
  depth: number;
  kinds: ValueKind[];
  path: string;
}

export interface ProcessingProgress {
  completed: number;
  total: number;
}

export interface MappingStreamChunk {
  csvPreview: TextPreview;
  headers: string[];
  previewRecords: Array<Record<string, string>>;
  processedRoots: number;
  rowCount: number;
  totalRoots: number | null;
}

export interface MappingConversionHandlers {
  onProgress?: (progress: ProcessingProgress) => void;
  onStreamChunk?: (chunk: MappingStreamChunk) => void;
  streamChunkSize?: number;
  streamPreviewCharacterLimit?: number;
  streamPreviewRowLimit?: number;
}

export interface MappingProjectionSession {
  appendRoot: (rootNode: unknown) => void;
  buildStreamChunk: (
    totalRoots?: number | null,
    previewRowLimit?: number,
    previewCharacterLimit?: number,
  ) => MappingStreamChunk;
  config: MappingConfig;
  finalize: () => MappingResult;
  finalizePreview: (options: MappingPreviewOptions) => MappingPreviewResult;
  getProcessedRoots: () => number;
  getRenderedRowCount: () => number;
}

interface ProjectedRow {
  data: Record<string, ScalarValue>;
  lineage: Record<string, ProvenanceSegment>;
  owners: Record<string, CellOwner>;
}

interface CellOwner {
  path: string;
  token: string;
}

interface ProvenanceSegment {
  index: number;
  path: string;
  token: string;
}

interface ColumnRegistry {
  headers: string[];
  headerByPath: Map<string, string>;
  pathByHeader: Map<string, string>;
}

interface EngineContext {
  config: MappingConfig;
  registry: ColumnRegistry;
}

interface TraversalState {
  activeOwner: CellOwner;
  lineage: Record<string, ProvenanceSegment>;
}

interface PathMatch {
  index: number;
  mode: FlattenMode;
}

export type PathToken =
  | { type: "property"; value: string }
  | { type: "wildcard" }
  | { type: "index"; value: number };

export const objectMapEntryKeyField = "__entryKey";

export const defaultMappingConfig: MappingConfig = {
  rootPath: "$.items.item[*]",
  flattenMode: "parallel",
  pathModes: {},
  pathSeparator: ".",
  arrayIndexSuffix: false,
  placeholderStrategy: "repeat",
  customPlaceholder: "NULL",
  onMissingKey: "include",
  onTypeMismatch: "coerce",
  headerPolicy: "full_scan",
  headerSampleSize: 25,
  headerWhitelist: [],
  headerAliases: {},
  reservedColumns: [],
  strictNaming: true,
  collisionStrategy: "rename_duplicate",
  booleanRepresentation: "true_false",
  dateFormat: "iso8601",
  delimiter: ",",
  quoteAll: true,
  emptyArrayBehavior: "include_null",
  maxDepth: 12,
  includePaths: [],
  dropPaths: [],
  stringifyPaths: [],
};

export function createMappingConfig(overrides: Partial<MappingConfig> = {}): MappingConfig {
  return {
    ...defaultMappingConfig,
    ...overrides,
    pathModes: {
      ...defaultMappingConfig.pathModes,
      ...overrides.pathModes,
    },
    headerWhitelist: overrides.headerWhitelist ?? defaultMappingConfig.headerWhitelist,
    headerAliases: {
      ...defaultMappingConfig.headerAliases,
      ...overrides.headerAliases,
    },
    reservedColumns: overrides.reservedColumns ?? defaultMappingConfig.reservedColumns,
    includePaths: overrides.includePaths ?? defaultMappingConfig.includePaths,
    dropPaths: overrides.dropPaths ?? defaultMappingConfig.dropPaths,
    stringifyPaths: overrides.stringifyPaths ?? defaultMappingConfig.stringifyPaths,
  };
}

export function createMappingProjectionSession(
  overrides: Partial<MappingConfig> = {},
): MappingProjectionSession {
  const config = createMappingConfig(overrides);
  const registry = createColumnRegistry(config);
  const context: EngineContext = {
    config,
    registry,
  };
  const projectedRows: ProjectedRow[] = [];
  const renderedRows: ProjectedRow[] = [];
  let processedRootCount = 0;

  return {
    appendRoot(rootNode) {
      const traversalState = createRootTraversalState(processedRootCount);
      const projectedGroup = appendNodeToRows(
        [createEmptyRow({ lineage: traversalState.lineage })],
        rootNode,
        [],
        context,
        0,
        traversalState,
      );
      const renderedGroup = applyPlaceholderStrategy(projectedGroup, config);

      projectedRows.push(...projectedGroup);
      renderedRows.push(...renderedGroup);
      processedRootCount += 1;
    },
    buildStreamChunk(
      totalRoots,
      previewRowLimit = 100,
      previewCharacterLimit = Number.POSITIVE_INFINITY,
    ) {
      return buildMappingStreamChunk(
        renderedRows,
        registry,
        config,
        processedRootCount,
        totalRoots === undefined ? processedRootCount : totalRoots,
        previewRowLimit,
        previewCharacterLimit,
      );
    },
    config,
    finalize() {
      return finalizeProjectionResult(projectedRows, renderedRows, registry, config);
    },
    finalizePreview(options) {
      return finalizePreviewProjectionResult(
        projectedRows,
        renderedRows,
        registry,
        config,
        options,
      );
    },
    getProcessedRoots() {
      return processedRootCount;
    },
    getRenderedRowCount() {
      return renderedRows.length;
    },
  };
}

export function convertJsonToCsvTable(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
  handlersOrProgress: MappingConversionHandlers | ((progress: ProcessingProgress) => void) = {},
): MappingResult {
  const handlers = normalizeMappingConversionHandlers(handlersOrProgress);
  const session = createMappingProjectionSession(overrides);
  const config = session.config;

  const rootNodes = selectRootNodes(input, config.rootPath);
  const totalRoots = Math.max(rootNodes.length, 1);
  const streamChunkSize = resolveStreamChunkSize(totalRoots, handlers.streamChunkSize);

  handlers.onProgress?.({ completed: 0, total: totalRoots });

  for (const [rootIndex, rootNode] of rootNodes.entries()) {
    session.appendRoot(rootNode);
    handlers.onProgress?.({ completed: rootIndex + 1, total: totalRoots });

    if (shouldEmitStreamChunk(rootIndex + 1, totalRoots, streamChunkSize)) {
      emitMappingStreamChunk(session, handlers, totalRoots);
    }
  }

  if (rootNodes.length === 0) {
    handlers.onProgress?.({ completed: totalRoots, total: totalRoots });
    emitMappingStreamChunk(session, handlers, totalRoots);
  }

  return session.finalize();
}

export function convertJsonToCsvPreviewTable(
  input: unknown,
  overrides: Partial<MappingConfig> = {},
  options: MappingPreviewOptions,
  handlersOrProgress: MappingConversionHandlers | ((progress: ProcessingProgress) => void) = {},
) {
  const handlers = normalizeMappingConversionHandlers(handlersOrProgress);
  const session = createMappingProjectionSession(overrides);
  const config = session.config;

  const rootNodes = selectRootNodes(input, config.rootPath, options.rootLimit);
  const totalRoots = Math.max(rootNodes.length, 1);
  const streamChunkSize = resolveStreamChunkSize(totalRoots, handlers.streamChunkSize);

  handlers.onProgress?.({ completed: 0, total: totalRoots });

  for (const [rootIndex, rootNode] of rootNodes.entries()) {
    session.appendRoot(rootNode);
    handlers.onProgress?.({ completed: rootIndex + 1, total: totalRoots });

    if (shouldEmitStreamChunk(rootIndex + 1, totalRoots, streamChunkSize)) {
      emitMappingStreamChunk(session, handlers, totalRoots);
    }
  }

  if (rootNodes.length === 0) {
    handlers.onProgress?.({ completed: totalRoots, total: totalRoots });
    emitMappingStreamChunk(session, handlers, totalRoots);
  }

  return session.finalizePreview(options);
}

export function inspectMappingPaths(
  input: unknown,
  rootPath?: string,
  onProgress?: (progress: ProcessingProgress) => void,
  rootLimit?: number,
) {
  const registry = new Map<
    string,
    {
      count: number;
      depth: number;
      kinds: Set<ValueKind>;
    }
  >();
  const rootNodes = selectRootNodes(input, rootPath, rootLimit);
  const totalRoots = Math.max(rootNodes.length, 1);

  onProgress?.({ completed: 0, total: totalRoots });

  for (const [index, rootNode] of rootNodes.entries()) {
    inspectNodePaths(rootNode, [], registry);
    onProgress?.({ completed: index + 1, total: totalRoots });
  }

  if (rootNodes.length === 0) {
    onProgress?.({ completed: totalRoots, total: totalRoots });
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
      (left, right) => left.depth - right.depth || left.path.localeCompare(right.path),
    ) satisfies InspectedPath[];
}

function finalizeProjectionResult(
  projectedRows: ProjectedRow[],
  renderedRows: ProjectedRow[],
  registry: ColumnRegistry,
  config: MappingConfig,
) {
  const renderedRawRows = renderedRows.map((row) => ({ ...row.data }));
  const sourceRegistry = cloneColumnRegistry(registry);
  const splitRows = applyTypeMismatchStrategy(renderedRawRows, registry, config);
  const selectedHeaders = selectHeaders(splitRows, registry, config);
  const records = renderRecords(splitRows, selectedHeaders, config);
  const csv = toCsv(selectedHeaders, records, config);
  const schema = buildSchema(
    renderedRawRows,
    splitRows,
    selectedHeaders,
    sourceRegistry,
    registry,
    collectPrimaryKeys(projectedRows),
    config,
  );

  return {
    config,
    csv,
    headers: selectedHeaders,
    rawRows: splitRows,
    records,
    rowCount: renderedRows.length,
    rowProvenance: renderedRows.map(toRowProvenance),
    schema,
  } satisfies MappingResult;
}

function finalizePreviewProjectionResult(
  projectedRows: ProjectedRow[],
  renderedRows: ProjectedRow[],
  registry: ColumnRegistry,
  config: MappingConfig,
  options: MappingPreviewOptions,
) {
  const renderedRawRows = renderedRows.map((row) => ({ ...row.data }));
  const sourceRegistry = cloneColumnRegistry(registry);
  const splitRows = applyTypeMismatchStrategy(
    renderedRawRows.map((row) => ({ ...row })),
    registry,
    config,
  );
  const selectedHeaders = selectHeaders(splitRows, registry, config);
  const previewRows = splitRows.slice(0, Math.max(1, options.previewRowLimit));
  const records = renderRecords(previewRows, selectedHeaders, config);
  const schema = buildSchema(
    renderedRawRows,
    splitRows,
    selectedHeaders,
    sourceRegistry,
    registry,
    collectPrimaryKeys(projectedRows),
    config,
  );

  return {
    config,
    csvPreview: buildCsvPreview(
      selectedHeaders,
      splitRows,
      records,
      config,
      options.csvPreviewCharacterLimit,
    ),
    headers: selectedHeaders,
    records,
    rowCount: renderedRows.length,
    schema,
  } satisfies MappingPreviewResult;
}

function emitMappingStreamChunk(
  session: MappingProjectionSession,
  handlers: MappingConversionHandlers,
  totalRoots: number | null,
) {
  if (!handlers.onStreamChunk) {
    return;
  }

  handlers.onStreamChunk(
    session.buildStreamChunk(
      totalRoots,
      handlers.streamPreviewRowLimit,
      handlers.streamPreviewCharacterLimit,
    ),
  );
}

function buildMappingStreamChunk(
  renderedRows: ProjectedRow[],
  registry: ColumnRegistry,
  config: MappingConfig,
  processedRoots: number,
  totalRoots: number | null,
  previewRowLimit: number,
  previewCharacterLimit: number,
) {
  const previewRows = renderedRows.slice(0, Math.max(1, previewRowLimit));
  const previewRawRows = previewRows.map((row) => ({ ...row.data }));
  const previewRegistry = cloneColumnRegistry(registry);
  const splitPreviewRows = applyTypeMismatchStrategy(previewRawRows, previewRegistry, config);
  const selectedHeaders = selectHeaders(splitPreviewRows, previewRegistry, config);
  const previewRecords = renderRecords(splitPreviewRows, selectedHeaders, config);

  return {
    csvPreview: createTextPreview(
      toCsv(selectedHeaders, previewRecords, config),
      previewCharacterLimit,
    ),
    headers: selectedHeaders,
    previewRecords,
    processedRoots,
    rowCount: renderedRows.length,
    totalRoots,
  } satisfies MappingStreamChunk;
}

function normalizeMappingConversionHandlers(
  handlersOrProgress: MappingConversionHandlers | ((progress: ProcessingProgress) => void),
) {
  return typeof handlersOrProgress === "function"
    ? { onProgress: handlersOrProgress }
    : handlersOrProgress;
}

function resolveStreamChunkSize(totalRoots: number, requestedChunkSize?: number) {
  if (requestedChunkSize && requestedChunkSize > 0) {
    return requestedChunkSize;
  }

  return Math.max(1, Math.ceil(totalRoots / 8));
}

function shouldEmitStreamChunk(
  processedRoots: number,
  totalRoots: number,
  streamChunkSize: number,
) {
  return processedRoots === totalRoots || processedRoots % streamChunkSize === 0;
}

function createColumnRegistry(config: MappingConfig): ColumnRegistry {
  const registry: ColumnRegistry = {
    headers: [],
    headerByPath: new Map<string, string>(),
    pathByHeader: new Map<string, string>(),
  };

  for (const column of config.reservedColumns ?? []) {
    const sourcePath = normalizeSourcePath(column.sourcePath);

    if (!column.header || !sourcePath) {
      continue;
    }

    registry.pathByHeader.set(column.header, sourcePath);
  }

  for (const [sourcePath, header] of Object.entries(config.headerAliases ?? {})) {
    const normalizedPath = normalizeSourcePath(sourcePath);

    if (!normalizedPath || !header) {
      continue;
    }

    registry.headerByPath.set(normalizedPath, header);

    if (!registry.pathByHeader.has(header)) {
      registry.pathByHeader.set(header, normalizedPath);
    }
  }

  return registry;
}

function cloneColumnRegistry(registry: ColumnRegistry): ColumnRegistry {
  return {
    headers: [...registry.headers],
    headerByPath: new Map(registry.headerByPath),
    pathByHeader: new Map(registry.pathByHeader),
  };
}

function createEmptyRow(initial: Partial<ProjectedRow> = {}): ProjectedRow {
  return {
    data: initial.data ?? {},
    lineage: initial.lineage ?? {},
    owners: initial.owners ?? {},
  };
}

function createRootTraversalState(rootIndex: number): TraversalState {
  const rootSegment = createProvenanceSegment("$", rootIndex);

  return {
    activeOwner: {
      path: rootSegment.path,
      token: rootSegment.token,
    },
    lineage: {
      [rootSegment.path]: rootSegment,
    },
  };
}

function extendTraversalState(
  traversalState: TraversalState,
  pathSegments: string[],
  index: number,
): TraversalState {
  const path = normalizeRulePath(pathSegments.join(".")) || "$";
  const segment = createProvenanceSegment(path, index);

  return {
    activeOwner: {
      path: segment.path,
      token: segment.token,
    },
    lineage: {
      ...traversalState.lineage,
      [segment.path]: segment,
    },
  };
}

function createPivotTraversalState(
  traversalState: TraversalState,
  pathSegments: string[],
): TraversalState {
  const ownerPath = pathSegments.join(".") || "column0";

  return {
    activeOwner: {
      path: ownerPath,
      token: ownerPath,
    },
    lineage: traversalState.lineage,
  };
}

function createIndexedPathSegments(
  pathSegments: string[],
  index: number,
  arrayIndexSuffix: boolean,
) {
  if (pathSegments.length === 0) {
    return arrayIndexSuffix ? [`column0[${index}]`] : ["column0", `${index}`];
  }

  if (!arrayIndexSuffix) {
    return [...pathSegments, `${index}`];
  }

  return pathSegments.map((segment, segmentIndex) =>
    segmentIndex === pathSegments.length - 1 ? `${segment}[${index}]` : segment,
  );
}

function createProvenanceSegment(path: string, index: number): ProvenanceSegment {
  return {
    index,
    path,
    token: `${path}[${index}]`,
  };
}

function toRowProvenance(row: ProjectedRow): RowProvenance {
  return {
    lineage: Object.values(row.lineage)
      .sort(compareLineageSegments)
      .map((segment) => ({
        index: segment.index,
        path: segment.path,
      })),
  };
}

function appendNodeToRows(
  rows: ProjectedRow[],
  value: unknown,
  pathSegments: string[],
  context: EngineContext,
  depth: number,
  traversalState: TraversalState,
): ProjectedRow[] {
  if (depth > context.config.maxDepth) {
    return appendScalarToRows(rows, pathSegments, "[Max depth reached]", context, traversalState);
  }

  const normalizedPath = normalizeRulePath(pathSegments.join("."));

  if (!shouldIncludePath(normalizedPath, context.config.includePaths)) {
    return rows;
  }

  if (shouldDropPath(normalizedPath, context.config.dropPaths)) {
    return rows;
  }

  if (value === undefined) {
    return rows;
  }

  if (Array.isArray(value)) {
    return appendArrayToRows(rows, value, pathSegments, context, depth + 1, traversalState);
  }

  if (isPlainObject(value)) {
    if (shouldStringifyPath(normalizedPath, context.config)) {
      return appendScalarToRows(rows, pathSegments, JSON.stringify(value), context, traversalState);
    }

    let nextRows = rows;

    for (const [key, childValue] of Object.entries(value)) {
      nextRows = appendNodeToRows(
        nextRows,
        childValue,
        [...pathSegments, key],
        context,
        depth + 1,
        traversalState,
      );

      if (nextRows.length === 0) {
        break;
      }
    }

    return nextRows;
  }

  return appendScalarToRows(rows, pathSegments, value as ScalarValue, context, traversalState);
}

function appendArrayToRows(
  rows: ProjectedRow[],
  values: unknown[],
  pathSegments: string[],
  context: EngineContext,
  depth: number,
  traversalState: TraversalState,
): ProjectedRow[] {
  const normalizedPath = normalizeRulePath(pathSegments.join("."));

  if (shouldStringifyPath(normalizedPath, context.config)) {
    return appendScalarToRows(rows, pathSegments, JSON.stringify(values), context, traversalState);
  }

  const mode = resolveModeForPath(normalizedPath, context.config);

  if (mode === "stringify") {
    return context.config.arrayIndexSuffix
      ? appendPivotedArrayToRows(rows, values, pathSegments, context, depth, traversalState)
      : appendScalarToRows(rows, pathSegments, JSON.stringify(values), context, traversalState);
  }

  if (values.length === 0) {
    return context.config.emptyArrayBehavior === "skip_row" ? [] : rows;
  }

  const elementRows = values.map((value, index) => {
    const nextTraversalState = extendTraversalState(traversalState, pathSegments, index);

    return appendNodeToRows(
      [createEmptyRow({ lineage: nextTraversalState.lineage })],
      value,
      pathSegments,
      context,
      depth + 1,
      nextTraversalState,
    );
  });

  return mode === "cross_product"
    ? combineByCrossProduct(rows, elementRows)
    : combineByParallel(rows, elementRows);
}

function appendPivotedArrayToRows(
  rows: ProjectedRow[],
  values: unknown[],
  pathSegments: string[],
  context: EngineContext,
  depth: number,
  traversalState: TraversalState,
) {
  if (values.length === 0) {
    return context.config.emptyArrayBehavior === "skip_row" ? [] : rows;
  }

  let nextRows = rows;

  for (const [index, value] of values.entries()) {
    const indexedPathSegments = createIndexedPathSegments(
      pathSegments,
      index,
      context.config.arrayIndexSuffix,
    );
    const nextTraversalState = createPivotTraversalState(traversalState, indexedPathSegments);

    nextRows = appendNodeToRows(
      nextRows,
      value,
      indexedPathSegments,
      context,
      depth + 1,
      nextTraversalState,
    );
  }

  return nextRows;
}

function appendScalarToRows(
  rows: ProjectedRow[],
  pathSegments: string[],
  value: ScalarValue,
  context: EngineContext,
  traversalState: TraversalState,
): ProjectedRow[] {
  const header = resolveHeader(pathSegments, context);

  return rows.map((row) => ({
    data: {
      ...row.data,
      [header]: value,
    },
    lineage: {
      ...row.lineage,
      ...traversalState.lineage,
    },
    owners: {
      ...row.owners,
      [header]: traversalState.activeOwner,
    },
  }));
}

function combineByCrossProduct(
  baseRows: ProjectedRow[],
  elementRows: ProjectedRow[][],
): ProjectedRow[] {
  return baseRows.flatMap((baseRow) =>
    elementRows.flatMap((projectedRows) =>
      projectedRows.map((projectedRow) => mergeRows(baseRow, projectedRow)),
    ),
  );
}

function combineByParallel(
  baseRows: ProjectedRow[],
  elementRows: ProjectedRow[][],
): ProjectedRow[] {
  const sharedContextRow = deriveSharedContextRow(baseRows);
  const maxLength = Math.max(baseRows.length, elementRows.length, 1);

  return Array.from({ length: maxLength }, (_, index) => {
    const baseRow = baseRows[index] ?? sharedContextRow;
    const projectedRows = elementRows[index] ?? [createEmptyRow()];

    return projectedRows.map((projectedRow) => mergeRows(baseRow, projectedRow));
  }).flat();
}

function mergeRows(left: ProjectedRow, right: ProjectedRow): ProjectedRow {
  return {
    data: {
      ...left.data,
      ...right.data,
    },
    lineage: {
      ...left.lineage,
      ...right.lineage,
    },
    owners: {
      ...left.owners,
      ...right.owners,
    },
  };
}

function deriveSharedContextRow(rows: ProjectedRow[]) {
  if (rows.length === 0) {
    return createEmptyRow();
  }

  const sharedData: Record<string, ScalarValue> = {};
  const sharedOwners: Record<string, CellOwner> = {};
  const sharedLineage: Record<string, ProvenanceSegment> = {};
  const [firstRow, ...remainingRows] = rows;

  for (const [key, value] of Object.entries(firstRow.data)) {
    const owner = firstRow.owners[key];
    const matchesAllRows = remainingRows.every(
      (row) =>
        row.data[key] === value &&
        row.owners[key] !== undefined &&
        row.owners[key].token === owner?.token,
    );

    if (matchesAllRows) {
      sharedData[key] = value;
      if (owner) {
        sharedOwners[key] = owner;
      }
    }
  }

  for (const [path, segment] of Object.entries(firstRow.lineage)) {
    if (remainingRows.every((row) => row.lineage[path]?.token === segment.token)) {
      sharedLineage[path] = segment;
    }
  }

  return createEmptyRow({
    data: sharedData,
    lineage: sharedLineage,
    owners: sharedOwners,
  });
}

function applyPlaceholderStrategy(rows: ProjectedRow[], config: MappingConfig): ProjectedRow[] {
  if (config.placeholderStrategy === "repeat") {
    return rows;
  }

  const placeholder =
    config.placeholderStrategy === "custom" ? (config.customPlaceholder ?? "") : "";

  return rows.map((row, index) => {
    if (index === 0) {
      return row;
    }

    const previousRow = rows[index - 1];
    const nextData = { ...row.data };

    for (const [header, owner] of Object.entries(row.owners)) {
      const previousOwner = previousRow.owners[header];

      if (
        previousOwner?.token === owner.token &&
        previousRow.data[header] === row.data[header] &&
        header in nextData
      ) {
        nextData[header] = placeholder;
      }
    }

    return {
      data: nextData,
      lineage: row.lineage,
      owners: row.owners,
    };
  });
}

function applyTypeMismatchStrategy(
  rows: Array<Record<string, ScalarValue>>,
  registry: ColumnRegistry,
  config: MappingConfig,
) {
  if (config.onTypeMismatch === "coerce") {
    return rows;
  }

  const kindsByHeader = inferKindsByHeader(rows);
  const splitHeaders = new Map<string, string[]>();

  for (const header of registry.headers) {
    const kinds = (kindsByHeader.get(header) ?? []).filter((kind) => kind !== "null");

    if (kinds.length > 1) {
      splitHeaders.set(
        header,
        kinds.map((kind) => `${header}_${kind}`),
      );
    }
  }

  if (splitHeaders.size === 0) {
    return rows;
  }

  registry.headers = registry.headers.flatMap((header) => splitHeaders.get(header) ?? [header]);

  for (const [header, derivedHeaders] of splitHeaders) {
    const sourcePath = registry.pathByHeader.get(header) ?? header;

    derivedHeaders.forEach((derivedHeader) => {
      registry.pathByHeader.set(derivedHeader, sourcePath);
    });
  }

  return rows.map((row) => {
    const nextRow: Record<string, ScalarValue> = {};

    for (const [header, value] of Object.entries(row)) {
      const derivedHeaders = splitHeaders.get(header);

      if (!derivedHeaders) {
        nextRow[header] = value;
        continue;
      }

      const kind = detectValueKind(value);

      if (kind === "null") {
        continue;
      }

      nextRow[`${header}_${kind}`] = value;
    }

    return nextRow;
  });
}

function selectHeaders(
  rows: Array<Record<string, ScalarValue>>,
  registry: ColumnRegistry,
  config: MappingConfig,
) {
  const encounteredHeaders = new Set<string>();
  const headerWhitelist = config.headerWhitelist ?? [];

  const rowsToScan =
    config.headerPolicy === "sampled_scan"
      ? rows.slice(0, Math.max(config.headerSampleSize, 1))
      : rows;

  for (const row of rowsToScan) {
    for (const header of Object.keys(row)) {
      encounteredHeaders.add(header);
    }
  }

  const whitelisted = new Set(headerWhitelist);

  if (config.headerPolicy === "explicit") {
    return headerWhitelist
      .map((header) => resolveExplicitHeader(header, registry))
      .filter((header, index, headers) => header.length > 0 && headers.indexOf(header) === index);
  }

  const orderedHeaders = registry.headers.filter((header) => {
    if (config.onMissingKey === "include") {
      return encounteredHeaders.has(header) || whitelisted.has(header);
    }

    return encounteredHeaders.has(header);
  });

  if (config.onMissingKey === "include") {
    return [
      ...orderedHeaders,
      ...headerWhitelist.filter((header) => !orderedHeaders.includes(header)),
    ];
  }

  return orderedHeaders;
}

function renderRecords(
  rows: Array<Record<string, ScalarValue>>,
  headers: string[],
  config: MappingConfig,
) {
  return rows.map((row) => {
    const record: Record<string, string> = {};

    for (const header of headers) {
      record[header] = formatValue(row[header], config);
    }

    return record;
  });
}

function buildCsvPreview(
  headers: string[],
  rows: Array<Record<string, ScalarValue>>,
  previewRecords: Array<Record<string, string>>,
  config: MappingConfig,
  maxCharacters: number,
) {
  const previewCsv = toCsv(headers, previewRecords, config);
  const preview = createTextPreview(previewCsv, maxCharacters);

  if (previewRecords.length === rows.length) {
    return preview;
  }

  if (preview.truncated) {
    return {
      omittedCharacters: preview.omittedCharacters,
      omittedCharactersKnown: false,
      text: preview.text,
      truncated: true,
    } satisfies TextPreview;
  }

  return {
    omittedCharacters: 0,
    omittedCharactersKnown: false,
    text: `${previewCsv.trimEnd()}\n\n[Preview truncated]`,
    truncated: true,
  } satisfies TextPreview;
}

function buildSchema(
  sourceRows: Array<Record<string, ScalarValue>>,
  rows: Array<Record<string, ScalarValue>>,
  headers: string[],
  sourceRegistry: ColumnRegistry,
  registry: ColumnRegistry,
  primaryKeys: string[],
  config: MappingConfig,
): MappingSchema {
  const kindsByHeader = inferKindsByHeader(rows);

  return {
    columns: headers.map((header) => ({
      header,
      sourcePath: registry.pathByHeader.get(header) ?? header,
      kinds: kindsByHeader.get(header) ?? ["string"],
      nullable: rows.some((row) => row[header] === null || row[header] === undefined),
    })),
    primaryKeys,
    typeReports: buildTypeReports(sourceRows, sourceRegistry, registry, config),
  };
}

function buildTypeReports(
  rows: Array<Record<string, ScalarValue>>,
  sourceRegistry: ColumnRegistry,
  finalRegistry: ColumnRegistry,
  config: MappingConfig,
) {
  const encounteredHeaders = sourceRegistry.headers.filter((header) =>
    rows.some((row) => header in row),
  );

  return encounteredHeaders.map((header) => {
    const sourcePath = sourceRegistry.pathByHeader.get(header) ?? header;
    const counts = new Map<ValueKind, number>();
    let missingCount = 0;

    for (const row of rows) {
      const value = row[header];

      if (value === null || value === undefined) {
        missingCount += 1;
        continue;
      }

      const kind = detectValueKind(value);
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }

    const observedCount = [...counts.values()].reduce((total, count) => total + count, 0);
    const typeBreakdown = [...counts.entries()]
      .sort(
        ([leftKind, leftCount], [rightKind, rightCount]) =>
          rightCount - leftCount || compareValueKinds(leftKind, rightKind),
      )
      .map(([kind, count]) => ({
        count,
        kind,
        percentage: observedCount === 0 ? 0 : roundToSingleDecimal((count / observedCount) * 100),
      }));

    return {
      coercedTo: config.onTypeMismatch === "coerce" && typeBreakdown.length > 1 ? "string" : null,
      dominantKind: typeBreakdown[0]?.kind ?? null,
      exportHeaders: findHeadersForSourcePath(sourcePath, finalRegistry),
      header,
      missingCount,
      observedCount,
      sourcePath,
      typeBreakdown,
    } satisfies ColumnTypeReport;
  });
}

function resolveExplicitHeader(reference: string, registry: ColumnRegistry) {
  const normalizedReference = reference.trim();

  if (!normalizedReference) {
    return "";
  }

  if (registry.pathByHeader.has(normalizedReference)) {
    return normalizedReference;
  }

  const sourcePathMatch = findHeadersForSourcePath(normalizedReference, registry)[0];

  return sourcePathMatch ?? normalizedReference;
}

function findHeadersForSourcePath(path: string, registry: ColumnRegistry) {
  return [...registry.pathByHeader.entries()]
    .filter(([, sourcePath]) => sourcePath === path)
    .map(([header]) => header)
    .filter((header, index, headers) => headers.indexOf(header) === index);
}

function collectPrimaryKeys(rows: ProjectedRow[]) {
  const primaryKeys = new Set<string>();

  for (const row of rows) {
    for (const path of Object.keys(row.lineage)) {
      primaryKeys.add(path);
    }
  }

  if (primaryKeys.size === 0) {
    primaryKeys.add("$");
  }

  return [...primaryKeys].sort(comparePrimaryKeys);
}

export function toCsv(
  headers: string[],
  records: Array<Record<string, string>>,
  config: MappingConfig,
) {
  const lines = [headers.map((header) => escapeCsvCell(header, config)).join(config.delimiter)];

  for (const record of records) {
    lines.push(
      headers.map((header) => escapeCsvCell(record[header] ?? "", config)).join(config.delimiter),
    );
  }

  return lines.join("\n");
}

function escapeCsvCell(value: string, config: MappingConfig) {
  const needsQuotes =
    config.quoteAll ||
    value.includes(config.delimiter) ||
    value.includes('"') ||
    value.includes("\n");

  const escaped = value.replaceAll('"', '""');

  return needsQuotes ? `"${escaped}"` : escaped;
}

export function formatValue(value: ScalarValue | undefined, config: MappingConfig) {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "boolean") {
    switch (config.booleanRepresentation) {
      case "one_zero":
        return value ? "1" : "0";
      case "yes_no":
        return value ? "Yes" : "No";
      default:
        return value ? "TRUE" : "FALSE";
    }
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (config.dateFormat === "yyyy-mm-dd" && looksLikeIsoDate(value)) {
    return value.slice(0, 10);
  }

  return value;
}

function inferKindsByHeader(rows: Array<Record<string, ScalarValue>>) {
  const kindsByHeader = new Map<string, ValueKind[]>();

  for (const row of rows) {
    for (const [header, value] of Object.entries(row)) {
      const kind = detectValueKind(value);
      const kinds = kindsByHeader.get(header) ?? [];

      if (!kinds.includes(kind)) {
        kinds.push(kind);
        kindsByHeader.set(header, kinds);
      }
    }
  }

  return kindsByHeader;
}

function detectValueKind(value: unknown): ValueKind {
  if (value === null || value === undefined) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  if (typeof value === "string") {
    return looksLikeIsoDate(value) ? "date" : "string";
  }

  return "object";
}

function inspectNodePaths(
  value: unknown,
  pathSegments: string[],
  registry: Map<
    string,
    {
      count: number;
      depth: number;
      kinds: Set<ValueKind>;
    }
  >,
  shouldCountCurrentPath = true,
) {
  const path = pathSegments.join(".");
  const kind = detectValueKind(value);

  if (path) {
    const existingEntry = registry.get(path);

    if (existingEntry) {
      if (shouldCountCurrentPath) {
        existingEntry.count += 1;
      }

      existingEntry.kinds.add(kind);
    } else {
      registry.set(path, {
        count: shouldCountCurrentPath ? 1 : 0,
        depth: pathSegments.length,
        kinds: new Set([kind]),
      });
    }
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      inspectNodePaths(entry, pathSegments, registry, false);
    }

    return;
  }

  if (!isPlainObject(value)) {
    return;
  }

  for (const [key, childValue] of Object.entries(value)) {
    inspectNodePaths(childValue, [...pathSegments, key], registry);
  }
}

function compareValueKinds(left: ValueKind, right: ValueKind) {
  const order: ValueKind[] = ["array", "object", "string", "date", "number", "boolean", "null"];

  return order.indexOf(left) - order.indexOf(right);
}

function compareLineageSegments(left: ProvenanceSegment, right: ProvenanceSegment) {
  return comparePrimaryKeys(left.path, right.path) || left.index - right.index;
}

function comparePrimaryKeys(left: string, right: string) {
  return getPathDepth(left) - getPathDepth(right) || left.localeCompare(right);
}

function roundToSingleDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function getPathDepth(path: string) {
  if (path === "$") {
    return 0;
  }

  return path.split(".").length;
}

function looksLikeIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value);
}

function resolveHeader(pathSegments: string[], context: EngineContext) {
  const canonicalPath = pathSegments.join(".") || "column0";
  const existingHeader = context.registry.headerByPath.get(canonicalPath);

  if (existingHeader) {
    if (!context.registry.headers.includes(existingHeader)) {
      context.registry.headers.push(existingHeader);
    }

    return existingHeader;
  }

  const baseHeader =
    canonicalPath === "column0" ? "column0" : pathSegments.join(context.config.pathSeparator);

  let nextHeader = baseHeader;

  if (context.config.strictNaming || context.config.collisionStrategy === "rename_duplicate") {
    let collisionIndex = 1;

    while (context.registry.pathByHeader.has(nextHeader)) {
      nextHeader = `${baseHeader}_${collisionIndex}`;
      collisionIndex += 1;
    }
  }

  context.registry.headerByPath.set(canonicalPath, nextHeader);
  context.registry.pathByHeader.set(nextHeader, canonicalPath);
  context.registry.headers.push(nextHeader);

  return nextHeader;
}

function resolveModeForPath(path: string, config: MappingConfig) {
  if (shouldStringifyPath(path, config)) {
    return "stringify";
  }

  const pathMatch = Object.entries(config.pathModes ?? {}).reduce<PathMatch | null>(
    (bestMatch, [candidatePath, mode]) => {
      if (!doesPathExactlyMatch(path, candidatePath)) {
        return bestMatch;
      }

      if (!bestMatch || candidatePath.length > bestMatch.index) {
        return {
          index: candidatePath.length,
          mode,
        };
      }

      return bestMatch;
    },
    null,
  );

  if (pathMatch) {
    return pathMatch.mode;
  }

  return config.flattenMode === "strict_leaf" ? "stringify" : config.flattenMode;
}

function shouldStringifyPath(path: string, config: MappingConfig) {
  return doesAnyPathMatch(path, config.stringifyPaths);
}

function shouldIncludePath(path: string, rules: string[]) {
  if (rules.length === 0 || path.length === 0) {
    return true;
  }

  return rules.some((rule) => doesIncludedPathMatch(path, rule));
}

function shouldDropPath(path: string, rules: string[]) {
  return doesAnyPathMatch(path, rules);
}

function doesIncludedPathMatch(path: string, rule: string) {
  const normalizedPath = normalizeRulePath(path);
  const normalizedRule = normalizeRulePath(rule);

  if (!normalizedRule) {
    return true;
  }

  return (
    normalizedPath === normalizedRule ||
    normalizedPath.startsWith(`${normalizedRule}.`) ||
    normalizedPath.startsWith(`${normalizedRule}[`) ||
    normalizedRule.startsWith(`${normalizedPath}.`) ||
    normalizedRule.startsWith(`${normalizedPath}[`)
  );
}

function doesAnyPathMatch(path: string, rules: string[]) {
  return rules.some((rule) => doesPathMatch(path, rule));
}

function doesPathExactlyMatch(path: string, rule: string) {
  return normalizeRulePath(path) === normalizeRulePath(rule);
}

function doesPathMatch(path: string, rule: string) {
  const normalizedPath = normalizeRulePath(path);
  const normalizedRule = normalizeRulePath(rule);

  return (
    normalizedPath === normalizedRule ||
    normalizedPath.startsWith(`${normalizedRule}.`) ||
    normalizedPath.startsWith(`${normalizedRule}[`)
  );
}

export function normalizeRulePath(path: string) {
  return path
    .replace(/^\$\.?/, "")
    .replace(/\[\*\]/g, "")
    .replace(/\[\d+\]/g, "")
    .split(".")
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment))
    .join(".");
}

function normalizeSourcePath(path: string) {
  return normalizeRulePath(path) || (path === "column0" ? "column0" : "");
}

export function selectRootNodes(input: unknown, rootPath?: string, limit?: number) {
  const selectedNodes = !rootPath
    ? Array.isArray(input)
      ? input
      : [input]
    : walkPath(input, tokenizeJsonPath(rootPath));

  if (!limit || limit < 1 || selectedNodes.length <= limit) {
    return selectedNodes;
  }

  return selectedNodes.slice(0, limit);
}

export function tokenizeJsonPath(path: string) {
  const source = path.replace(/^\$\.?/, "");
  const tokens: PathToken[] = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === ".") {
      index += 1;
      continue;
    }

    if (character === "[") {
      const endIndex = source.indexOf("]", index);
      const selector = source.slice(index + 1, endIndex);

      tokens.push(
        selector === "*"
          ? { type: "wildcard" }
          : { type: "index", value: Number.parseInt(selector, 10) },
      );

      index = endIndex + 1;
      continue;
    }

    let endIndex = index;

    while (endIndex < source.length && source[endIndex] !== "." && source[endIndex] !== "[") {
      endIndex += 1;
    }

    tokens.push({
      type: "property",
      value: source.slice(index, endIndex),
    });
    index = endIndex;
  }

  return tokens;
}

function walkPath(value: unknown, tokens: PathToken[]): unknown[] {
  if (tokens.length === 0) {
    return [value];
  }

  const [token, ...rest] = tokens;

  if (token.type === "property") {
    if (token.value === "*") {
      if (!isPlainObject(value)) {
        return [];
      }

      return Object.entries(value).flatMap(([key, entryValue]) => {
        const matches = walkPath(entryValue, rest);

        return rest.length === 0
          ? matches.map((match) => createObjectMapEntryRootNode(key, match))
          : matches;
      });
    }

    if (!isPlainObject(value) || !(token.value in value)) {
      return [];
    }

    return walkPath(value[token.value], rest);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  if (token.type === "wildcard") {
    return value.flatMap((entry) => walkPath(entry, rest));
  }

  const entry = value[token.value];
  return entry === undefined ? [] : walkPath(entry, rest);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createObjectMapEntryRootNode(entryKey: string, value: unknown) {
  if (isPlainObject(value)) {
    return {
      [objectMapEntryKeyField]: entryKey,
      ...value,
    };
  }

  return {
    [objectMapEntryKeyField]: entryKey,
    value: value as JsonValue,
  };
}
