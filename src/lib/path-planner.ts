import type { FlattenMode, MappingConfig } from '@/lib/mapping-engine'

export const plannerRuleActions = ['mode', 'stringify', 'drop'] as const

export type PlannerRuleAction = (typeof plannerRuleActions)[number]

export interface PlannerRule {
  action: PlannerRuleAction
  id: string
  mode: FlattenMode
  path: string
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
  config: Pick<MappingConfig, 'dropPaths' | 'pathModes' | 'stringifyPaths'>,
) {
  const rulesByPath = new Map<string, PlannerRule>()

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

    if (rule.action === 'stringify') {
      stringifyPaths.push(path)
      continue
    }

    pathModes[path] = rule.mode
  }

  return {
    dropPaths: dropPaths.reverse(),
    pathModes: Object.fromEntries(
      Object.entries(pathModes).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ) as Record<string, FlattenMode>,
    stringifyPaths: stringifyPaths.reverse(),
  }
}

function normalizePlannerPath(path: string) {
  return path
    .trim()
    .replace(/^\$\.?/, '')
    .replace(/\[\*\]/g, '')
}
