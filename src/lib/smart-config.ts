import {
  type FlattenMode,
  type JsonValue,
  objectMapEntryKeyField,
} from '@/lib/mapping-engine'

interface SmartConfigSuggestionBase {
  detail: string
  flattenMode?: FlattenMode
  kind: 'keyed-map' | 'preserve-root'
  previewHeaders: string[]
  rootPath: string
  summary: string
}

export interface SmartKeyedMapSuggestion extends SmartConfigSuggestionBase {
  kind: 'keyed-map'
  entryCount: number
  estimatedSiblingColumnsAvoided: number
  keyAlias: string
  keySourcePath: string
  recordMapPath: string
}

export interface SmartPreserveRootSuggestion extends SmartConfigSuggestionBase {
  flattenMode: 'stringify'
  kind: 'preserve-root'
  repeatingBranches: string[]
}

export type SmartConfigSuggestion =
  | SmartKeyedMapSuggestion
  | SmartPreserveRootSuggestion

interface RecordMapCandidate {
  entryCount: number
  estimatedSiblingColumnsAvoided: number
  keyAlias: string
  previewHeaders: string[]
  recordMapPath: string
  score: number
}

const minimumRecordMapEntries = 5

export function detectSmartConfigSuggestion(
  input: JsonValue,
): SmartConfigSuggestion | null {
  const candidates: RecordMapCandidate[] = []

  collectRecordMapCandidates(input, '$', candidates)

  const preserveRootSuggestion = detectPreserveRootSuggestion(input)

  const bestCandidate = candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.recordMapPath.length - right.recordMapPath.length
  })[0]

  if (!bestCandidate) {
    return preserveRootSuggestion
  }

  if (
    preserveRootSuggestion !== null &&
    shouldPreferPreserveRootSuggestion(input, bestCandidate)
  ) {
    return preserveRootSuggestion
  }

  return {
    detail: `Detected ${bestCandidate.entryCount.toLocaleString()} homogeneous keyed entries under ${bestCandidate.recordMapPath}. Treat them as rows instead of flattening each key into its own column namespace.`,
    kind: 'keyed-map',
    entryCount: bestCandidate.entryCount,
    estimatedSiblingColumnsAvoided:
      bestCandidate.estimatedSiblingColumnsAvoided,
    keyAlias: bestCandidate.keyAlias,
    keySourcePath: objectMapEntryKeyField,
    previewHeaders: bestCandidate.previewHeaders,
    recordMapPath: bestCandidate.recordMapPath,
    rootPath: `${bestCandidate.recordMapPath}.*`,
    summary: `Use ${bestCandidate.recordMapPath}.* and rename ${objectMapEntryKeyField} to ${bestCandidate.keyAlias}. This avoids roughly ${bestCandidate.estimatedSiblingColumnsAvoided.toLocaleString()} extra sibling columns.`,
  }
}

function detectPreserveRootSuggestion(
  input: JsonValue,
): SmartPreserveRootSuggestion | null {
  if (!isPlainObject(input)) {
    return null
  }

  const repeatingBranches = Object.entries(input)
    .filter(([, value]) => branchHasCollections(value))
    .map(([key]) => key)

  if (repeatingBranches.length < 2) {
    return null
  }

  const previewHeaders = collectPreserveRootPreviewHeaders(input)
  const repeatingBranchList = repeatingBranches.slice(0, 4)
  const repeatingBranchDetail = repeatingBranchList.join(', ')

  return {
    detail: `Detected multiple repeating branches at the current root (${repeatingBranchDetail}). Keep the entity root intact and preserve completeness instead of collapsing the payload onto a single collection.`,
    flattenMode: 'stringify',
    kind: 'preserve-root',
    previewHeaders,
    repeatingBranches,
    rootPath: '$',
    summary:
      repeatingBranches.length > repeatingBranchList.length
        ? `Keep $ as the root and switch Flatten mode to stringify. This preserves branches such as ${repeatingBranchDetail}, and ${repeatingBranches.length - repeatingBranchList.length} more, while the relational preview keeps their detail tables explorable.`
        : `Keep $ as the root and switch Flatten mode to stringify. This preserves branches such as ${repeatingBranchDetail} while the relational preview keeps their detail tables explorable.`,
  }
}

function shouldPreferPreserveRootSuggestion(
  input: JsonValue,
  candidate: RecordMapCandidate,
) {
  const pathSegments = candidate.recordMapPath
    .replace(/^\$\.?/, '')
    .split('.')
    .filter(Boolean)

  const candidateKey = pathSegments.at(-1)

  if (!candidateKey) {
    return false
  }

  const parentValue =
    pathSegments.length === 1
      ? input
      : pathSegments
          .slice(0, -1)
          .reduce<JsonValue | null>((currentValue, segment) => {
            if (!isPlainObject(currentValue)) {
              return null
            }

            return currentValue[segment] ?? null
          }, input)

  if (!isPlainObject(parentValue)) {
    return false
  }

  return Object.entries(parentValue).some(
    ([key, value]) => key !== candidateKey && branchHasCollections(value),
  )
}

function collectRecordMapCandidates(
  value: JsonValue,
  path: string,
  candidates: RecordMapCandidate[],
) {
  if (!isPlainObject(value)) {
    return
  }

  const candidate = analyzeRecordMap(value, path)

  if (candidate) {
    candidates.push(candidate)
  }

  for (const [key, entryValue] of Object.entries(value)) {
    if (!isPlainObject(entryValue)) {
      continue
    }

    collectRecordMapCandidates(entryValue, `${path}.${key}`, candidates)
  }
}

function analyzeRecordMap(
  value: Record<string, JsonValue>,
  path: string,
): RecordMapCandidate | null {
  const entries = Object.entries(value)

  if (entries.length < minimumRecordMapEntries) {
    return null
  }

  const keys = entries.map(([key]) => key)
  const keyAlias = guessEntryKeyAlias(keys)

  if (keyAlias === null) {
    return null
  }

  const childValues = entries.map(([, childValue]) => childValue)

  if (childValues.every(isPlainObject)) {
    const childFieldNames = childValues.map((childValue) =>
      Object.keys(childValue).sort(),
    )
    const fieldCounts = new Map<string, number>()

    for (const fieldList of childFieldNames) {
      for (const fieldName of fieldList) {
        fieldCounts.set(fieldName, (fieldCounts.get(fieldName) ?? 0) + 1)
      }
    }

    const stableFields = [...fieldCounts.entries()]
      .filter(([, count]) => count / entries.length >= 0.8)
      .map(([fieldName]) => fieldName)
      .sort((left, right) => left.localeCompare(right))

    if (stableFields.length === 0) {
      return null
    }

    const estimatedSiblingColumnsAvoided = Math.max(
      0,
      entries.length * stableFields.length - (stableFields.length + 1),
    )

    return {
      entryCount: entries.length,
      estimatedSiblingColumnsAvoided,
      keyAlias,
      previewHeaders: [keyAlias, ...stableFields],
      recordMapPath: path,
      score: entries.length * stableFields.length,
    }
  }

  if (childValues.every((childValue) => !isPlainObject(childValue))) {
    const estimatedSiblingColumnsAvoided = Math.max(0, entries.length - 2)

    return {
      entryCount: entries.length,
      estimatedSiblingColumnsAvoided,
      keyAlias,
      previewHeaders: [keyAlias, 'value'],
      recordMapPath: path,
      score: entries.length,
    }
  }

  return null
}

function guessEntryKeyAlias(keys: string[]) {
  if (keys.every((key) => /^\d{6}$/.test(key))) {
    return 'period'
  }

  if (keys.every((key) => /^\d{4}$/.test(key))) {
    return 'year'
  }

  if (keys.every((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))) {
    return 'date'
  }

  if (keys.every((key) => /^\d{4}-\d{2}$/.test(key))) {
    return 'month'
  }

  if (keys.every((key) => /^\d+$/.test(key))) {
    return 'key'
  }

  return keys.every((key) => /^[A-Za-z0-9_-]+$/.test(key)) ? 'key' : null
}

function collectPreserveRootPreviewHeaders(
  value: Record<string, JsonValue>,
  limit: number = 8,
) {
  const headers: string[] = []

  for (const [key, branchValue] of Object.entries(value)) {
    if (headers.length >= limit) {
      break
    }

    if (branchHasCollections(branchValue)) {
      headers.push(key)
      continue
    }

    collectScalarPreviewPaths(branchValue, key, headers, limit)
  }

  return headers
}

function collectScalarPreviewPaths(
  value: JsonValue,
  path: string,
  headers: string[],
  limit: number,
) {
  if (headers.length >= limit) {
    return
  }

  if (!isPlainObject(value)) {
    headers.push(path)
    return
  }

  for (const [key, childValue] of Object.entries(value)) {
    if (headers.length >= limit) {
      break
    }

    if (branchHasCollections(childValue)) {
      headers.push(`${path}.${key}`)
      continue
    }

    collectScalarPreviewPaths(childValue, `${path}.${key}`, headers, limit)
  }
}

function branchHasCollections(value: JsonValue): boolean {
  if (Array.isArray(value)) {
    return true
  }

  if (!isPlainObject(value)) {
    return false
  }

  return Object.values(value).some(branchHasCollections)
}

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
