import { type JsonValue, objectMapEntryKeyField } from '@/lib/mapping-engine'

export interface SmartConfigSuggestion {
  detail: string
  entryCount: number
  estimatedSiblingColumnsAvoided: number
  keyAlias: string
  keySourcePath: string
  previewHeaders: string[]
  recordMapPath: string
  rootPath: string
  summary: string
}

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

  const bestCandidate = candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.recordMapPath.length - right.recordMapPath.length
  })[0]

  if (!bestCandidate) {
    return null
  }

  return {
    detail: `Detected ${bestCandidate.entryCount.toLocaleString()} homogeneous keyed entries under ${bestCandidate.recordMapPath}. Treat them as rows instead of flattening each key into its own column namespace.`,
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

function isPlainObject(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
