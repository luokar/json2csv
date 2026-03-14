import { Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  type FlattenMode,
  flattenModes,
  type InspectedPath,
} from '@/lib/mapping-engine'
import { createPlannerRule, type PlannerRule } from '@/lib/path-planner'

interface PathPlannerProps {
  defaultMode: FlattenMode
  onChange: (rules: PlannerRule[]) => void
  rules: PlannerRule[]
  suggestions: InspectedPath[]
}

export function PathPlanner({
  defaultMode,
  onChange,
  rules,
  suggestions,
}: PathPlannerProps) {
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
    const existingRule = rules.find((rule) => rule.path.trim() === path)

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

  const visibleSuggestions = suggestions.slice(0, 12)

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
          No per-path overrides yet. Use the discovered paths below or add a
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
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Discovered paths
          </p>
          <p className="text-sm text-muted-foreground">
            Suggestions come from the active JSON payload under the selected
            root path.
          </p>
        </div>

        {visibleSuggestions.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            No paths discovered for the current input and root path.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSuggestions.map((suggestion) => {
              const supportsMode = suggestion.kinds.includes('array')
              const supportsStringify = suggestion.kinds.some(
                (kind) => kind === 'array' || kind === 'object',
              )

              return (
                <div
                  key={suggestion.path}
                  className="flex flex-col gap-3 rounded-[20px] border border-border/70 bg-background/80 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                      {suggestion.path}
                    </code>
                    {suggestion.kinds.map((kind) => (
                      <Badge
                        key={`${suggestion.path}-${kind}`}
                        variant="outline"
                      >
                        {kind}
                      </Badge>
                    ))}
                    <Badge variant="secondary">{suggestion.count} hits</Badge>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {supportsMode ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Add mode ${suggestion.path}`}
                        onClick={() =>
                          upsertSuggestedRule(suggestion.path, 'mode')
                        }
                      >
                        Add mode
                      </Button>
                    ) : null}
                    {supportsStringify ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Stringify ${suggestion.path}`}
                        onClick={() =>
                          upsertSuggestedRule(suggestion.path, 'stringify')
                        }
                      >
                        Stringify
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Drop ${suggestion.path}`}
                      onClick={() =>
                        upsertSuggestedRule(suggestion.path, 'drop')
                      }
                    >
                      Drop
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
