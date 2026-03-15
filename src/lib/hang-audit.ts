import type { SourceMode } from '@/lib/db'

export const hangAuditEntryLimit = 16
export const hangAuditFrameGapThresholdMs = 180
export const hangAuditLongTaskThresholdMs = 80

const hangAuditRecoveryAgeMs = 5 * 60_000
const hangAuditStorageKey = 'json2csv:hang-audit'

export type HangAuditCategory =
  | 'intent'
  | 'frame-gap'
  | 'longtask'
  | 'recovered'
  | 'transition'

export interface HangAuditContext {
  columnCount: number
  customJsonChars: number
  isProjecting: boolean
  isWorkbenchSuspended: boolean
  projectionLabel: string | null
  rootPath: string
  rowCount: number
  sourceMode: SourceMode
  transitionLabel: string | null
  transitionPhase: string | null
}

export interface HangAuditEntry {
  at: number
  category: HangAuditCategory
  context: HangAuditContext
  detail: string
  durationMs: number | null
  id: number
  label: string
}

export interface HangAuditTransitionState {
  detail: string
  id: number
  kind: string
  label: string
  phase: string
  startedAt: number
  updatedAt: number
}

export interface HangAuditIntentState {
  detail: string
  id: number
  kind: string
  label: string
  startedAt: number
  updatedAt: number
}

export interface HangAuditSnapshot {
  activeIntent: HangAuditIntentState | null
  activeTransition: HangAuditTransitionState | null
  entries: HangAuditEntry[]
  recoveredEntry: HangAuditEntry | null
  tabClosedGracefully: boolean
  updatedAt: number
}

const defaultHangAuditContext: HangAuditContext = {
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
}

export function createEmptyHangAuditSnapshot(
  now: number = Date.now(),
): HangAuditSnapshot {
  return {
    activeIntent: null,
    activeTransition: null,
    entries: [],
    recoveredEntry: null,
    tabClosedGracefully: true,
    updatedAt: now,
  }
}

export function createHangAuditEntry(options: {
  category: HangAuditCategory
  context?: HangAuditContext
  detail: string
  durationMs?: number | null
  id: number
  label: string
  now?: number
}): HangAuditEntry {
  return {
    at: options.now ?? Date.now(),
    category: options.category,
    context: options.context ?? defaultHangAuditContext,
    detail: options.detail,
    durationMs: options.durationMs ?? null,
    id: options.id,
    label: options.label,
  }
}

export function appendHangAuditEntry(
  snapshot: HangAuditSnapshot,
  entry: HangAuditEntry,
): HangAuditSnapshot {
  return {
    ...snapshot,
    entries: [entry, ...snapshot.entries].slice(0, hangAuditEntryLimit),
    tabClosedGracefully: false,
    updatedAt: entry.at,
  }
}

export function formatHangAuditCategory(category: HangAuditCategory) {
  switch (category) {
    case 'intent':
      return 'Intent'
    case 'frame-gap':
      return 'Paint gap'
    case 'longtask':
      return 'Long task'
    case 'recovered':
      return 'Recovered'
    case 'transition':
      return 'Transition'
  }
}

export function getNextHangAuditEntryId(snapshot: HangAuditSnapshot) {
  return (
    snapshot.entries.reduce((maxId, entry) => Math.max(maxId, entry.id), 0) + 1
  )
}

export function persistHangAuditSnapshot(snapshot: HangAuditSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(hangAuditStorageKey, JSON.stringify(snapshot))
  } catch {
    // Diagnostics should not break the app if storage is unavailable.
  }
}

export function publishHangAuditSnapshot(snapshot: HangAuditSnapshot) {
  if (typeof window === 'undefined') {
    return
  }

  const debugWindow = window as Window & {
    __json2csvHangAudit?: HangAuditSnapshot | null
  }

  debugWindow.__json2csvHangAudit = snapshot
  window.dispatchEvent(
    new CustomEvent('json2csv:hang-audit', {
      detail: snapshot,
    }),
  )
}

export function readInitialHangAuditSnapshot(
  now: number = Date.now(),
): HangAuditSnapshot {
  if (typeof window === 'undefined') {
    return createEmptyHangAuditSnapshot(now)
  }

  const persisted = readPersistedHangAuditSnapshot()

  if (persisted === null) {
    return createEmptyHangAuditSnapshot(now)
  }

  const shouldMarkRecovered =
    !persisted.tabClosedGracefully &&
    persisted.activeTransition !== null &&
    persisted.activeTransition.phase !== 'settled' &&
    now - persisted.updatedAt <= hangAuditRecoveryAgeMs

  if (!shouldMarkRecovered) {
    const activeIntent = persisted.activeIntent
    const shouldRecoverIntent =
      !persisted.tabClosedGracefully &&
      activeIntent !== null &&
      now - persisted.updatedAt <= hangAuditRecoveryAgeMs

    if (!shouldRecoverIntent) {
      return persisted
    }

    const recoveredEntry = createHangAuditEntry({
      category: 'recovered',
      context: persisted.entries[0]?.context,
      detail: `Recovered after the previous session stopped shortly after "${activeIntent.label}" was armed, before the guarded transition reported progress.`,
      id: getNextHangAuditEntryId(persisted),
      label: 'Recovered previous hang signal',
      now,
    })

    return {
      ...appendHangAuditEntry(
        {
          ...persisted,
          activeIntent: null,
        },
        recoveredEntry,
      ),
      activeIntent: null,
      recoveredEntry,
      tabClosedGracefully: true,
      updatedAt: now,
    }
  }

  const activeTransition = persisted.activeTransition

  if (activeTransition === null) {
    return persisted
  }

  const recoveredEntry = createHangAuditEntry({
    category: 'recovered',
    context: persisted.entries[0]?.context,
    detail: `Recovered after the previous session stopped while "${activeTransition.label}" was ${activeTransition.phase}.`,
    id: getNextHangAuditEntryId(persisted),
    label: 'Recovered previous hang signal',
    now,
  })

  return {
    ...appendHangAuditEntry(persisted, recoveredEntry),
    recoveredEntry,
    tabClosedGracefully: true,
    updatedAt: now,
  }
}

function readPersistedHangAuditSnapshot() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.localStorage.getItem(hangAuditStorageKey)

    if (!raw) {
      return null
    }

    return normalizeHangAuditSnapshot(JSON.parse(raw))
  } catch {
    return null
  }
}

function normalizeHangAuditSnapshot(value: unknown): HangAuditSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<HangAuditSnapshot>
  const entries = Array.isArray(candidate.entries)
    ? candidate.entries
        .map((entry) => normalizeHangAuditEntry(entry))
        .filter((entry): entry is HangAuditEntry => entry !== null)
    : []
  const recoveredEntry = normalizeHangAuditEntry(candidate.recoveredEntry)
  const activeTransition = normalizeHangAuditTransition(
    candidate.activeTransition,
  )

  return {
    activeIntent: normalizeHangAuditIntent(candidate.activeIntent),
    activeTransition,
    entries,
    recoveredEntry,
    tabClosedGracefully: candidate.tabClosedGracefully === true,
    updatedAt:
      typeof candidate.updatedAt === 'number'
        ? candidate.updatedAt
        : Date.now(),
  }
}

function normalizeHangAuditEntry(value: unknown): HangAuditEntry | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<HangAuditEntry>

  if (
    typeof candidate.at !== 'number' ||
    typeof candidate.detail !== 'string' ||
    typeof candidate.id !== 'number' ||
    typeof candidate.label !== 'string'
  ) {
    return null
  }

  return {
    at: candidate.at,
    category: normalizeHangAuditCategory(candidate.category),
    context: normalizeHangAuditContext(candidate.context),
    detail: candidate.detail,
    durationMs:
      typeof candidate.durationMs === 'number' ? candidate.durationMs : null,
    id: candidate.id,
    label: candidate.label,
  }
}

function normalizeHangAuditTransition(
  value: unknown,
): HangAuditTransitionState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<HangAuditTransitionState>

  if (
    typeof candidate.detail !== 'string' ||
    typeof candidate.id !== 'number' ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.label !== 'string' ||
    typeof candidate.phase !== 'string' ||
    typeof candidate.startedAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }

  return {
    detail: candidate.detail,
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    phase: candidate.phase,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
  }
}

function normalizeHangAuditIntent(value: unknown): HangAuditIntentState | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as Partial<HangAuditIntentState>

  if (
    typeof candidate.detail !== 'string' ||
    typeof candidate.id !== 'number' ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.label !== 'string' ||
    typeof candidate.startedAt !== 'number' ||
    typeof candidate.updatedAt !== 'number'
  ) {
    return null
  }

  return {
    detail: candidate.detail,
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.label,
    startedAt: candidate.startedAt,
    updatedAt: candidate.updatedAt,
  }
}

function normalizeHangAuditCategory(value: unknown): HangAuditCategory {
  switch (value) {
    case 'intent':
    case 'frame-gap':
    case 'longtask':
    case 'recovered':
    case 'transition':
      return value
    default:
      return 'transition'
  }
}

function normalizeHangAuditContext(value: unknown): HangAuditContext {
  if (!value || typeof value !== 'object') {
    return defaultHangAuditContext
  }

  const candidate = value as Partial<HangAuditContext>

  return {
    columnCount:
      typeof candidate.columnCount === 'number' ? candidate.columnCount : 0,
    customJsonChars:
      typeof candidate.customJsonChars === 'number'
        ? candidate.customJsonChars
        : 0,
    isProjecting: candidate.isProjecting === true,
    isWorkbenchSuspended: candidate.isWorkbenchSuspended === true,
    projectionLabel:
      typeof candidate.projectionLabel === 'string'
        ? candidate.projectionLabel
        : null,
    rootPath: typeof candidate.rootPath === 'string' ? candidate.rootPath : '$',
    rowCount: typeof candidate.rowCount === 'number' ? candidate.rowCount : 0,
    sourceMode: candidate.sourceMode === 'custom' ? 'custom' : 'sample',
    transitionLabel:
      typeof candidate.transitionLabel === 'string'
        ? candidate.transitionLabel
        : null,
    transitionPhase:
      typeof candidate.transitionPhase === 'string'
        ? candidate.transitionPhase
        : null,
  }
}
