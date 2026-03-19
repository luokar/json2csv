import { Plus, Trash2 } from 'lucide-react'
import { memo, useDeferredValue, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type FlattenMode,
  flattenModes,
  type InspectedPath,
} from '@/lib/mapping-engine'
import {
  buildPlannerSuggestionFamilies,
  buildPlannerSuggestionTree,
  createPlannerRule,
  normalizePlannerPath,
  type PlannerRule,
  type PlannerSuggestionFamily,
  type PlannerSuggestionTreeNode,
  plannerFamilyModeSuggestionThreshold,
} from '@/lib/path-planner'

interface PathPlannerProps {
  defaultMode: FlattenMode
  onChange: (rules: PlannerRule[]) => void
  rules: PlannerRule[]
  suggestions: InspectedPath[]
}

export const PathPlanner = memo(function PathPlanner({
  defaultMode,
  onChange,
  rules,
  suggestions,
}: PathPlannerProps) {
  const [showLiteralTree, setShowLiteralTree] = useState(false)
  const [groupedFamilyQuery, setGroupedFamilyQuery] = useState('')
  const deferredGroupedFamilyQuery = useDeferredValue(groupedFamilyQuery)

  function addRule() {
    onChange([...rules, createPlannerRule({ mode: defaultMode })])
  }

  function updateRule(ruleId: string, patch: Partial<Omit<PlannerRule, 'id'>>) {
    onChange(
      rules.map((rule) =>
        rule.id === ruleId
          ? {
              ...rule,
              ...patch,
            }
          : rule,
      ),
    )
  }

  function removeRule(ruleId: string) {
    onChange(rules.filter((rule) => rule.id !== ruleId))
  }

  function upsertSuggestedRule(
    path: string,
    action: PlannerRule['action'],
    mode = defaultMode,
  ) {
    const existingRule = rules.find(
      (rule) => normalizePlannerPath(rule.path) === path,
    )

    if (existingRule) {
      updateRule(existingRule.id, { action, mode, path })
      return
    }

    onChange([
      ...rules,
      createPlannerRule({
        action,
        mode,
        path,
      }),
    ])
  }

  function clearSuggestedRule(path: string) {
    onChange(rules.filter((rule) => normalizePlannerPath(rule.path) !== path))
  }

  const rulesByPath = useMemo(() => {
    const nextRulesByPath = new Map<string, PlannerRule>()

    for (const rule of rules) {
      const normalizedPath = normalizePlannerPath(rule.path)

      if (!normalizedPath) {
        continue
      }

      nextRulesByPath.set(normalizedPath, {
        ...rule,
        path: normalizedPath,
      })
    }

    return nextRulesByPath
  }, [rules])

  const isGroupedFamilyMode =
    !showLiteralTree &&
    suggestions.length >= plannerFamilyModeSuggestionThreshold

  const suggestionFamilies = useMemo(
    () =>
      isGroupedFamilyMode ? buildPlannerSuggestionFamilies(suggestions) : [],
    [isGroupedFamilyMode, suggestions],
  )

  const visibleSuggestionFamilies = useMemo(() => {
    if (!isGroupedFamilyMode) {
      return []
    }

    const normalizedQuery = deferredGroupedFamilyQuery.trim().toLowerCase()

    if (!normalizedQuery) {
      return suggestionFamilies
    }

    return suggestionFamilies.filter(
      (family) =>
        family.path.toLowerCase().includes(normalizedQuery) ||
        family.examplePaths.some((examplePath) =>
          examplePath.toLowerCase().includes(normalizedQuery),
        ),
    )
  }, [deferredGroupedFamilyQuery, isGroupedFamilyMode, suggestionFamilies])

  const suggestionTree = useMemo(
    () =>
      isGroupedFamilyMode ? [] : buildPlannerSuggestionTree(suggestions, rules),
    [isGroupedFamilyMode, rules, suggestions],
  )

  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label>Path planner</Label>
          <p className="text-sm text-muted-foreground">
            Paths are relative to the current root path. Blank planner rows are
            ignored until completed.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus className="size-4" />
          Add rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
          No per-path overrides yet. Use the branch browser below or add a
          manual rule.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="grid gap-3 rounded-[20px] border border-border/70 bg-background/80 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`planner-path-${rule.id}`}>Path</Label>
                  <Input
                    id={`planner-path-${rule.id}`}
                    aria-label={`Planner path ${index + 1}`}
                    placeholder="topping"
                    value={rule.path}
                    onChange={(event) =>
                      updateRule(rule.id, { path: event.target.value })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`planner-action-${rule.id}`}>Policy</Label>
                  <select
                    id={`planner-action-${rule.id}`}
                    aria-label={`Planner action ${index + 1}`}
                    className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                    value={rule.action}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        action: event.target.value as PlannerRule['action'],
                      })
                    }
                  >
                    <option value="mode">Flatten mode</option>
                    <option value="stringify">Stringify</option>
                    <option value="drop">Drop</option>
                    <option value="include">Include</option>
                  </select>
                </div>

                {rule.action === 'mode' ? (
                  <div className="space-y-2">
                    <Label htmlFor={`planner-mode-${rule.id}`}>Mode</Label>
                    <select
                      id={`planner-mode-${rule.id}`}
                      aria-label={`Planner mode ${index + 1}`}
                      className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                      value={rule.mode}
                      onChange={(event) =>
                        updateRule(rule.id, {
                          mode: event.target.value as FlattenMode,
                        })
                      }
                    >
                      {flattenModes.map((mode) => (
                        <option key={mode} value={mode}>
                          {mode.replaceAll('_', ' ')}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="hidden sm:block" />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove planner rule ${index + 1}`}
                  onClick={() => removeRule(rule.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-foreground">
              {isGroupedFamilyMode ? 'Grouped families' : 'Workflow tree'}
            </p>
            <p className="text-sm text-muted-foreground">
              {isGroupedFamilyMode
                ? 'This root exposes too many discovered paths for the literal tree to stay ergonomic. Start with grouped families, then open the raw tree only when you need exact path nodes.'
                : 'Browse nested branches from the active payload, whitelist the branches you need, drop noisy paths, and flag one-to-many arrays before they bloat the flat CSV.'}
            </p>
          </div>

          {suggestions.length >= plannerFamilyModeSuggestionThreshold ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setShowLiteralTree((currentValue) => !currentValue)
              }
            >
              {isGroupedFamilyMode
                ? 'Show literal tree anyway'
                : 'Back to grouped families'}
            </Button>
          ) : null}
        </div>

        {isGroupedFamilyMode ? (
          <div className="space-y-3">
            <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
              Grouped family mode is active for{' '}
              {suggestions.length.toLocaleString()} discovered paths. Family
              actions still create ordinary planner rules, but the overview
              hides high-cardinality one-off keys so large documents stay
              navigable.
            </div>

            <div className="space-y-2 rounded-[20px] border border-border/70 bg-background/80 p-4">
              <Label htmlFor="grouped-family-filter">Filter families</Label>
              <Input
                id="grouped-family-filter"
                placeholder="Search by family path or example path"
                value={groupedFamilyQuery}
                onChange={(event) => setGroupedFamilyQuery(event.target.value)}
              />
            </div>

            {visibleSuggestionFamilies.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
                {groupedFamilyQuery.trim()
                  ? 'No grouped families match the current filter.'
                  : 'No grouped families are available for the current input and root path.'}
              </div>
            ) : (
              <div className="space-y-3">
                {visibleSuggestionFamilies.map((family) => (
                  <PlannerFamilyCard
                    key={family.path}
                    defaultMode={defaultMode}
                    family={family}
                    onClearRule={clearSuggestedRule}
                    onUpsertRule={upsertSuggestedRule}
                    rule={rulesByPath.get(family.path) ?? null}
                  />
                ))}
              </div>
            )}
          </div>
        ) : suggestionTree.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            No paths discovered for the current input and root path.
          </div>
        ) : (
          <div className="space-y-2">
            {suggestionTree.map((node) => (
              <PlannerTreeBranch
                key={node.path}
                defaultMode={defaultMode}
                node={node}
                onClearRule={clearSuggestedRule}
                onUpsertRule={upsertSuggestedRule}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

function PlannerFamilyCard({
  defaultMode,
  family,
  onClearRule,
  onUpsertRule,
  rule,
}: {
  defaultMode: FlattenMode
  family: PlannerSuggestionFamily
  onClearRule: (path: string) => void
  onUpsertRule: (
    path: string,
    action: PlannerRule['action'],
    mode?: FlattenMode,
  ) => void
  rule: PlannerRule | null
}) {
  const supportsMode = family.hasArray
  const supportsStringify = family.hasArray || family.hasObject
  const ruleLabel = describePlannerRule(rule)

  return (
    <div className="rounded-[20px] border border-border/70 bg-background/80 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
          {family.path}
        </code>
        <Badge variant="secondary">
          {family.suggestionCount.toLocaleString()} paths
        </Badge>
        <Badge variant="secondary">
          {family.totalHits.toLocaleString()} hits
        </Badge>
        <Badge variant="outline">Max depth {family.maxDepth}</Badge>
        {family.hasArray ? <Badge variant="outline">array</Badge> : null}
        {family.hasObject ? <Badge variant="outline">object</Badge> : null}
        {ruleLabel ? <Badge variant="secondary">{ruleLabel}</Badge> : null}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        Example paths: {family.examplePaths.join(', ')}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={rule?.action === 'include' ? 'default' : 'outline'}
          size="sm"
          aria-label={`Include ${family.path}`}
          onClick={() => onUpsertRule(family.path, 'include')}
        >
          Include
        </Button>
        {supportsMode ? (
          <Button
            type="button"
            variant={rule?.action === 'mode' ? 'default' : 'outline'}
            size="sm"
            aria-label={`Add mode ${family.path}`}
            onClick={() => onUpsertRule(family.path, 'mode', defaultMode)}
          >
            Use {defaultMode.replaceAll('_', ' ')}
          </Button>
        ) : null}
        {supportsStringify ? (
          <Button
            type="button"
            variant={rule?.action === 'stringify' ? 'default' : 'outline'}
            size="sm"
            aria-label={`Stringify ${family.path}`}
            onClick={() => onUpsertRule(family.path, 'stringify')}
          >
            Stringify
          </Button>
        ) : null}
        {rule?.action === 'drop' ? (
          <Button
            type="button"
            variant="default"
            size="sm"
            aria-label={`Keep ${family.path}`}
            onClick={() => onClearRule(family.path)}
          >
            Keep
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Drop ${family.path}`}
            onClick={() => onUpsertRule(family.path, 'drop')}
          >
            Drop
          </Button>
        )}
        {rule && rule.action !== 'drop' ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Clear ${family.path}`}
            onClick={() => onClearRule(family.path)}
          >
            Clear rule
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function PlannerTreeBranch({
  defaultMode,
  node,
  onClearRule,
  onUpsertRule,
  depth = 0,
}: {
  defaultMode: FlattenMode
  depth?: number
  node: PlannerSuggestionTreeNode
  onClearRule: (path: string) => void
  onUpsertRule: (
    path: string,
    action: PlannerRule['action'],
    mode?: FlattenMode,
  ) => void
}) {
  const supportsMode = node.kinds.includes('array')
  const supportsStringify = node.kinds.some(
    (kind) => kind === 'array' || kind === 'object',
  )
  const ruleLabel = describePlannerRule(node.rule)

  return (
    <div className="space-y-2">
      <div
        className="rounded-[20px] border border-border/70 bg-background/80 p-3"
        style={{ marginLeft: `${depth * 0.9}rem` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
            {node.path}
          </code>
          {node.kinds.map((kind) => (
            <Badge key={`${node.path}-${kind}`} variant="outline">
              {kind}
            </Badge>
          ))}
          {node.count > 0 ? (
            <Badge variant="secondary">{node.count} hits</Badge>
          ) : null}
          {ruleLabel ? <Badge variant="secondary">{ruleLabel}</Badge> : null}
          {node.recommendation ? (
            <Badge variant="outline">{node.recommendation.label}</Badge>
          ) : null}
        </div>

        {node.recommendation ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {node.recommendation.note}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={node.rule?.action === 'include' ? 'default' : 'outline'}
            size="sm"
            aria-label={`Include ${node.path}`}
            onClick={() => onUpsertRule(node.path, 'include')}
          >
            Include
          </Button>
          {supportsMode ? (
            <Button
              type="button"
              variant={node.rule?.action === 'mode' ? 'default' : 'outline'}
              size="sm"
              aria-label={`Add mode ${node.path}`}
              onClick={() => onUpsertRule(node.path, 'mode', defaultMode)}
            >
              Use {defaultMode.replaceAll('_', ' ')}
            </Button>
          ) : null}
          {supportsStringify ? (
            <Button
              type="button"
              variant={
                node.rule?.action === 'stringify' ? 'default' : 'outline'
              }
              size="sm"
              aria-label={`Stringify ${node.path}`}
              onClick={() => onUpsertRule(node.path, 'stringify')}
            >
              Stringify
            </Button>
          ) : null}
          {node.rule?.action === 'drop' ? (
            <Button
              type="button"
              variant="default"
              size="sm"
              aria-label={`Keep ${node.path}`}
              onClick={() => onClearRule(node.path)}
            >
              Keep
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Drop ${node.path}`}
              onClick={() => onUpsertRule(node.path, 'drop')}
            >
              Drop
            </Button>
          )}
          {node.rule && node.rule.action !== 'drop' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`Clear ${node.path}`}
              onClick={() => onClearRule(node.path)}
            >
              Clear rule
            </Button>
          ) : null}
        </div>
      </div>

      {node.children.length > 0 ? (
        <div
          className="space-y-2 border-l border-border/60 pl-3"
          style={{ marginLeft: `${depth * 0.9 + 0.5}rem` }}
        >
          {node.children.map((child) => (
            <PlannerTreeBranch
              key={child.path}
              defaultMode={defaultMode}
              depth={depth + 1}
              node={child}
              onClearRule={onClearRule}
              onUpsertRule={onUpsertRule}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function describePlannerRule(rule: PlannerRule | null) {
  if (!rule) {
    return null
  }

  if (rule.action === 'mode') {
    return `Mode: ${rule.mode.replaceAll('_', ' ')}`
  }

  if (rule.action === 'drop') {
    return 'Dropped'
  }

  return rule.action === 'include' ? 'Included' : 'Stringify'
}
