import type { MappingConfig } from '@/lib/mapping-engine'

export interface HeaderRule {
  enabled: boolean
  header: string
  id: string
  sourcePath: string
}

let headerRuleCount = 0

export function createHeaderRule(
  overrides: Partial<Omit<HeaderRule, 'id'>> = {},
): HeaderRule {
  headerRuleCount += 1

  return {
    enabled: true,
    header: '',
    id: `header-rule-${headerRuleCount}`,
    sourcePath: '',
    ...overrides,
  }
}

export function headerRulesFromConfig(
  config: Pick<MappingConfig, 'headerAliases' | 'headerWhitelist'>,
) {
  const normalizedAliases = normalizeHeaderAliases(config.headerAliases ?? {})
  const rulesByPath = new Map<string, HeaderRule>()
  const orderedPaths: string[] = []

  for (const reference of config.headerWhitelist ?? []) {
    const sourcePath = resolveHeaderReference(reference, normalizedAliases)

    if (!sourcePath) {
      continue
    }

    orderedPaths.push(sourcePath)
    rulesByPath.set(
      sourcePath,
      createHeaderRule({
        enabled: true,
        header: normalizedAliases[sourcePath] ?? '',
        sourcePath,
      }),
    )
  }

  for (const [sourcePath, header] of Object.entries(normalizedAliases)) {
    if (rulesByPath.has(sourcePath)) {
      continue
    }

    rulesByPath.set(
      sourcePath,
      createHeaderRule({
        enabled: false,
        header,
        sourcePath,
      }),
    )
  }

  return [...new Set(orderedPaths)]
    .concat(
      [...rulesByPath.keys()]
        .filter((sourcePath) => !orderedPaths.includes(sourcePath))
        .sort((left, right) => left.localeCompare(right)),
    )
    .map((sourcePath) => rulesByPath.get(sourcePath))
    .filter((rule): rule is HeaderRule => rule !== undefined)
}

export function headerRulesToConfig(rules: HeaderRule[]) {
  const survivingRules: Array<{
    enabled: boolean
    header: string
    sourcePath: string
  }> = []
  const seenPaths = new Set<string>()

  for (const rule of [...rules].reverse()) {
    const sourcePath = normalizeHeaderSourcePath(rule.sourcePath)

    if (!sourcePath || seenPaths.has(sourcePath)) {
      continue
    }

    seenPaths.add(sourcePath)
    survivingRules.push({
      enabled: rule.enabled,
      header: rule.header.trim(),
      sourcePath,
    })
  }

  const headerAliases: Record<string, string> = {}
  const headerWhitelist: string[] = []

  for (const rule of survivingRules.reverse()) {
    if (rule.enabled) {
      headerWhitelist.push(rule.sourcePath)
    }

    if (rule.header) {
      headerAliases[rule.sourcePath] = rule.header
    }
  }

  return {
    headerAliases,
    headerWhitelist,
  }
}

function normalizeHeaderAliases(headerAliases: Record<string, string>) {
  const normalizedAliases: Record<string, string> = {}

  for (const [sourcePath, header] of Object.entries(headerAliases)) {
    const normalizedPath = normalizeHeaderSourcePath(sourcePath)
    const trimmedHeader = header.trim()

    if (!normalizedPath || !trimmedHeader) {
      continue
    }

    normalizedAliases[normalizedPath] = trimmedHeader
  }

  return normalizedAliases
}

function resolveHeaderReference(
  reference: string,
  headerAliases: Record<string, string>,
) {
  const trimmedReference = reference.trim()

  if (!trimmedReference) {
    return ''
  }

  const aliasMatch = Object.entries(headerAliases).find(
    ([, header]) => header === trimmedReference,
  )

  if (aliasMatch) {
    return aliasMatch[0]
  }

  return normalizeHeaderSourcePath(trimmedReference)
}

function normalizeHeaderSourcePath(path: string) {
  const trimmedPath = path.trim()

  if (trimmedPath === 'column0') {
    return trimmedPath
  }

  return trimmedPath
    .replace(/^\$\.?/, '')
    .replace(/\[\*\]/g, '')
    .replace(/\[\d+\]/g, '')
    .split('.')
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment))
    .join('.')
}
