import { Plus, Trash2 } from 'lucide-react'
import { memo, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createHeaderRule, type HeaderRule } from '@/lib/header-mapper'
import type { HeaderPolicy, ValueKind } from '@/lib/mapping-engine'

export interface HeaderSuggestion {
  currentHeader?: string
  kinds: ValueKind[]
  sourcePath: string
}

interface HeaderMapperProps {
  headerPolicy: HeaderPolicy
  onChange: (rules: HeaderRule[]) => void
  rules: HeaderRule[]
  suggestions: HeaderSuggestion[]
}

export const HeaderMapper = memo(function HeaderMapper({
  headerPolicy,
  onChange,
  rules,
  suggestions,
}: HeaderMapperProps) {
  function addRule() {
    onChange([
      ...rules,
      createHeaderRule({ enabled: headerPolicy === 'explicit' }),
    ])
  }

  function updateRule(ruleId: string, patch: Partial<Omit<HeaderRule, 'id'>>) {
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

  function upsertSuggestedRule(sourcePath: string) {
    const existingRule = rules.find(
      (rule) => rule.sourcePath.trim() === sourcePath,
    )

    if (existingRule) {
      updateRule(existingRule.id, {
        enabled: headerPolicy === 'explicit' ? true : existingRule.enabled,
        sourcePath,
      })

      return
    }

    onChange([
      ...rules,
      createHeaderRule({
        enabled: headerPolicy === 'explicit',
        sourcePath,
      }),
    ])
  }

  const visibleSuggestions = useMemo(
    () => suggestions.slice(0, 12),
    [suggestions],
  )

  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Label>Header mapping</Label>
          <p className="text-sm text-muted-foreground">
            Rename exported columns by source path. In explicit mode, enabled
            rows define the exact CSV column order.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRule}>
          <Plus className="size-4" />
          Add mapping
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
          No header overrides yet. Add a manual mapping or start from the
          suggestions below.
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={rule.id}
              className="grid gap-3 rounded-[20px] border border-border/70 bg-background/80 p-3"
            >
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor={`header-source-${rule.id}`}>
                    Source path
                  </Label>
                  <Input
                    id={`header-source-${rule.id}`}
                    aria-label={`Header source ${index + 1}`}
                    placeholder="topping.type"
                    value={rule.sourcePath}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        sourcePath: event.target.value,
                      })
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`header-alias-${rule.id}`}>
                    Export header
                  </Label>
                  <Input
                    id={`header-alias-${rule.id}`}
                    aria-label={`Export header ${index + 1}`}
                    placeholder="Batter_Name"
                    value={rule.header}
                    onChange={(event) =>
                      updateRule(rule.id, {
                        header: event.target.value,
                      })
                    }
                  />
                </div>

                <label className="flex h-11 items-center gap-3 rounded-2xl border border-border/70 bg-background/80 px-4 text-sm font-medium text-foreground">
                  <input
                    type="checkbox"
                    aria-label={`Include column ${index + 1}`}
                    checked={rule.enabled}
                    className="size-4 rounded border-border"
                    onChange={(event) =>
                      updateRule(rule.id, {
                        enabled: event.target.checked,
                      })
                    }
                  />
                  Include
                </label>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove header mapping ${index + 1}`}
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
            Suggested source paths
          </p>
          <p className="text-sm text-muted-foreground">
            Suggestions combine current export columns with discovered paths
            under the selected root.
          </p>
        </div>

        {visibleSuggestions.length === 0 ? (
          <div className="rounded-[20px] border border-dashed border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            No header suggestions are available for the current input.
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSuggestions.map((suggestion) => (
              <div
                key={suggestion.sourcePath}
                className="flex flex-col gap-3 rounded-[20px] border border-border/70 bg-background/80 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                    {suggestion.sourcePath}
                  </code>
                  {suggestion.currentHeader &&
                  suggestion.currentHeader !== suggestion.sourcePath ? (
                    <Badge variant="secondary">
                      Now {suggestion.currentHeader}
                    </Badge>
                  ) : null}
                  {suggestion.kinds.map((kind) => (
                    <Badge
                      key={`${suggestion.sourcePath}-${kind}`}
                      variant="outline"
                    >
                      {kind}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Map header ${suggestion.sourcePath}`}
                    onClick={() => upsertSuggestedRule(suggestion.sourcePath)}
                  >
                    Map header
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
