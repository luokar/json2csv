import type { InspectedPath } from '@/lib/mapping-engine'

export const complexJsonRootPathThreshold = 2_500
export const complexJsonRootColumnThreshold = 400
export const complexJsonOverviewBranchLimit = 8
export const complexJsonOverviewCandidateLimit = 8
export const complexJsonCandidateSiblingThreshold = 12
export const complexJsonCandidateMinParentShare = 0.12

export interface ComplexJsonBranchSummary {
  depth: number
  descendantPathCount: number
  directKinds: string[]
  examplePaths: string[]
  hasArray: boolean
  hasObject: boolean
  maxDepth: number
  path: string
  rootPath: string
  totalObservedHits: number
}

export interface ComplexJsonOverview {
  candidateRoots: ComplexJsonBranchSummary[]
  columnCount: number
  topLevelBranches: ComplexJsonBranchSummary[]
  totalPathCount: number
}

export function buildComplexJsonOverview(
  discoveredPaths: InspectedPath[],
  columnCount: number,
  rootPath: string,
) {
  const normalizedRootPath = rootPath.trim() || '$'

  if (
    normalizedRootPath !== '$' ||
    (discoveredPaths.length < complexJsonRootPathThreshold &&
      columnCount < complexJsonRootColumnThreshold)
  ) {
    return null
  }

  const summariesByPath = new Map<string, ComplexJsonBranchSummary>()

  for (const inspectedPath of discoveredPaths) {
    const segments = inspectedPath.path.split('.').filter(Boolean)

    for (
      let segmentIndex = 0;
      segmentIndex < Math.min(segments.length, 2);
      segmentIndex += 1
    ) {
      const path = segments.slice(0, segmentIndex + 1).join('.')
      const existingSummary = summariesByPath.get(path)

      if (existingSummary) {
        existingSummary.descendantPathCount += 1
        existingSummary.totalObservedHits += inspectedPath.count
        existingSummary.maxDepth = Math.max(
          existingSummary.maxDepth,
          inspectedPath.depth,
        )
        existingSummary.hasArray ||= inspectedPath.kinds.includes('array')
        existingSummary.hasObject ||= inspectedPath.kinds.includes('object')

        if (
          existingSummary.examplePaths.length < 3 &&
          !existingSummary.examplePaths.includes(inspectedPath.path)
        ) {
          existingSummary.examplePaths.push(inspectedPath.path)
        }

        if (segmentIndex === segments.length - 1) {
          existingSummary.directKinds = [...new Set(inspectedPath.kinds)].sort()
        }

        continue
      }

      summariesByPath.set(path, {
        depth: segmentIndex + 1,
        descendantPathCount: 1,
        directKinds:
          segmentIndex === segments.length - 1 ? inspectedPath.kinds : [],
        examplePaths: [inspectedPath.path],
        hasArray: inspectedPath.kinds.includes('array'),
        hasObject: inspectedPath.kinds.includes('object'),
        maxDepth: inspectedPath.depth,
        path,
        rootPath: `$.${path}`,
        totalObservedHits: inspectedPath.count,
      })
    }
  }

  const summaries = [...summariesByPath.values()]
  const siblingCountByParentPath = new Map<string, number>()

  for (const summary of summaries) {
    if (summary.depth !== 2) {
      continue
    }

    const parentPath = summary.path.split('.').slice(0, -1).join('.')

    siblingCountByParentPath.set(
      parentPath,
      (siblingCountByParentPath.get(parentPath) ?? 0) + 1,
    )
  }

  return {
    candidateRoots: summaries
      .filter((summary) => summary.depth <= 2)
      .filter((summary) =>
        isComplexJsonCandidateRoot(
          summary,
          siblingCountByParentPath,
          summariesByPath,
        ),
      )
      .sort(compareComplexJsonBranchSummaries)
      .slice(0, complexJsonOverviewCandidateLimit),
    columnCount,
    topLevelBranches: summaries
      .filter((summary) => summary.depth === 1)
      .sort(compareComplexJsonBranchSummaries)
      .slice(0, complexJsonOverviewBranchLimit),
    totalPathCount: discoveredPaths.length,
  } satisfies ComplexJsonOverview
}

function isComplexJsonCandidateRoot(
  summary: ComplexJsonBranchSummary,
  siblingCountByParentPath: Map<string, number>,
  summariesByPath: Map<string, ComplexJsonBranchSummary>,
) {
  if (summary.depth === 1) {
    return true
  }

  const parentPath = summary.path.split('.').slice(0, -1).join('.')
  const siblingCount = siblingCountByParentPath.get(parentPath) ?? 0

  if (siblingCount <= complexJsonCandidateSiblingThreshold) {
    return true
  }

  const parentSummary = summariesByPath.get(parentPath)

  if (!parentSummary) {
    return true
  }

  const descendantShare =
    summary.descendantPathCount / Math.max(parentSummary.descendantPathCount, 1)
  const observedHitShare =
    summary.totalObservedHits / Math.max(parentSummary.totalObservedHits, 1)

  return (
    descendantShare >= complexJsonCandidateMinParentShare ||
    observedHitShare >= complexJsonCandidateMinParentShare
  )
}

function compareComplexJsonBranchSummaries(
  left: ComplexJsonBranchSummary,
  right: ComplexJsonBranchSummary,
) {
  return (
    right.descendantPathCount - left.descendantPathCount ||
    right.totalObservedHits - left.totalObservedHits ||
    right.depth - left.depth ||
    Number(right.hasArray) - Number(left.hasArray) ||
    Number(right.hasObject) - Number(left.hasObject) ||
    left.path.localeCompare(right.path)
  )
}
