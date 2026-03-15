import type {
  FlattenMode,
  InspectedPath,
  MappingConfig,
  ValueKind,
} from '@/lib/mapping-engine'

export const plannerRuleActions = [
  'mode',
  'stringify',
  'drop',
  'include',
] as const

export type PlannerRuleAction = (typeof plannerRuleActions)[number]

export interface PlannerRule {
  action: PlannerRuleAction
  id: string
  mode: FlattenMode
  path: string
}

export interface PlannerTreeRecommendation {
  label: string
  note: string
}

export interface PlannerSuggestionTreeNode {
  children: PlannerSuggestionTreeNode[]
  count: number
  depth: number
  kinds: ValueKind[]
  path: string
  recommendation: PlannerTreeRecommendation | null
  rule: PlannerRule | null
  segment: string
}

let plannerRuleCount = 0

export function createPlannerRule(
  overrides: Partial<Omit<PlannerRule, 'id'>> = {},
): PlannerRule {
  plannerRuleCount += 1

  return {
    action: 'mode',
    id: `planner-rule-${plannerRuleCount}`,
    mode: 'parallel',
    path: '',
    ...overrides,
  }
}

export function plannerRulesFromConfig(
  config: Pick<
    MappingConfig,
    'dropPaths' | 'includePaths' | 'pathModes' | 'stringifyPaths'
  >,
) {
  const rulesByPath = new Map<string, PlannerRule>()

  for (const path of config.includePaths ?? []) {
    const normalizedPath = normalizePlannerPath(path)

    if (!normalizedPath) {
      continue
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: 'include',
        path: normalizedPath,
      }),
    )
  }

  for (const [path, mode] of Object.entries(config.pathModes ?? {})) {
    const normalizedPath = normalizePlannerPath(path)

    if (!normalizedPath) {
      continue
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: 'mode',
        mode,
        path: normalizedPath,
      }),
    )
  }

  for (const path of config.stringifyPaths ?? []) {
    const normalizedPath = normalizePlannerPath(path)

    if (!normalizedPath) {
      continue
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: 'stringify',
        path: normalizedPath,
      }),
    )
  }

  for (const path of config.dropPaths ?? []) {
    const normalizedPath = normalizePlannerPath(path)

    if (!normalizedPath) {
      continue
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: 'drop',
        path: normalizedPath,
      }),
    )
  }

  return [...rulesByPath.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  )
}

export function plannerRulesToConfig(rules: PlannerRule[]) {
  const includePaths: string[] = []
  const pathModes: Record<string, FlattenMode> = {}
  const stringifyPaths: string[] = []
  const dropPaths: string[] = []
  const seenPaths = new Set<string>()

  for (const rule of [...rules].reverse()) {
    const path = normalizePlannerPath(rule.path)

    if (!path || seenPaths.has(path)) {
      continue
    }

    seenPaths.add(path)

    if (rule.action === 'drop') {
      dropPaths.push(path)
      continue
    }

    if (rule.action === 'include') {
      includePaths.push(path)
      continue
    }

    if (rule.action === 'stringify') {
      stringifyPaths.push(path)
      continue
    }

    pathModes[path] = rule.mode
  }

  return {
    dropPaths: dropPaths.reverse(),
    includePaths: includePaths.reverse(),
    pathModes: Object.fromEntries(
      Object.entries(pathModes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ) as Record<string, FlattenMode>,
    stringifyPaths: stringifyPaths.reverse(),
  }
}

export function buildPlannerSuggestionTree(
  suggestions: InspectedPath[],
  rules: PlannerRule[],
) {
  const nodesByPath = new Map<string, PlannerSuggestionTreeNode>()
  const roots: PlannerSuggestionTreeNode[] = []
  const rulesByPath = new Map<string, PlannerRule>()

  for (const rule of rules) {
    const normalizedPath = normalizePlannerPath(rule.path)

    if (!normalizedPath) {
      continue
    }

    rulesByPath.set(normalizedPath, {
      ...rule,
      path: normalizedPath,
    })
  }

  for (const suggestion of [...suggestions].sort(compareInspectedPaths)) {
    const normalizedPath = normalizePlannerPath(suggestion.path)

    if (!normalizedPath) {
      continue
    }

    const segments = normalizedPath.split('.')

    for (const [segmentIndex, segment] of segments.entries()) {
      const path = segments.slice(0, segmentIndex + 1).join('.')
      const parentPath = segments.slice(0, segmentIndex).join('.')
      const existingNode = nodesByPath.get(path)

      if (existingNode) {
        if (segmentIndex === segments.length - 1) {
          existingNode.count = suggestion.count
          existingNode.depth = suggestion.depth
          existingNode.kinds = suggestion.kinds
          existingNode.recommendation = buildPlannerRecommendation(suggestion)
          existingNode.rule = rulesByPath.get(path) ?? null
        }

        continue
      }

      const node: PlannerSuggestionTreeNode = {
        children: [],
        count: segmentIndex === segments.length - 1 ? suggestion.count : 0,
        depth: segmentIndex + 1,
        kinds: segmentIndex === segments.length - 1 ? suggestion.kinds : [],
        path,
        recommendation:
          segmentIndex === segments.length - 1
            ? buildPlannerRecommendation(suggestion)
            : null,
        rule: rulesByPath.get(path) ?? null,
        segment,
      }

      nodesByPath.set(path, node)

      if (!parentPath) {
        roots.push(node)
        continue
      }

      const parentNode = nodesByPath.get(parentPath)

      if (parentNode) {
        parentNode.children.push(node)
      }
    }
  }

  return roots
}

function buildPlannerRecommendation(suggestion: InspectedPath) {
  if (!suggestion.kinds.includes('array')) {
    return null
  }

  return {
    label: 'Split candidate',
    note:
      suggestion.depth > 1 || suggestion.count > 1
        ? 'One-to-many branch detected. Consider relational export to avoid row bloat in the flat CSV.'
        : 'Repeating branch detected. Consider relational export if the flat preview becomes redundant.',
  } satisfies PlannerTreeRecommendation
}

function compareInspectedPaths(left: InspectedPath, right: InspectedPath) {
  return left.depth - right.depth || left.path.localeCompare(right.path)
}

export function normalizePlannerPath(path: string) {
  return path
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[\*\]/g, '')
}
