import { ChevronDown, ChevronUp, Copy, Pencil, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CONDITION_LABELS,
  createRuleId,
  FORMAT_PRESETS,
  type FormatCondition,
  type FormatRule,
} from "@/lib/conditional-formatting";
import { cn } from "@/lib/utils";

interface FormatRulesPanelProps {
  formatRules: FormatRule[];
  onFormatRulesChange: (rules: FormatRule[]) => void;
  headers: string[];
}

function findPresetKeyForStyle(style: FormatRule["style"]): string | null {
  for (const [key, preset] of Object.entries(FORMAT_PRESETS)) {
    const p = preset.style;
    if (
      (p.bg ?? null) === (style.bg ?? null) &&
      (p.text ?? null) === (style.text ?? null) &&
      Boolean(p.bold) === Boolean(style.bold)
    ) {
      return key;
    }
  }
  return null;
}

/**
 * Active conditional-formatting rules editor: list of existing rules with
 * reorder/duplicate/edit/remove controls plus an add/edit form.
 */
export function FormatRulesPanel({
  formatRules,
  onFormatRulesChange,
  headers,
}: FormatRulesPanelProps) {
  const [newRuleColumn, setNewRuleColumn] = useState<string | null>(null);
  const [newRuleConditionType, setNewRuleConditionType] = useState<FormatCondition["type"]>(
    "contains",
  );
  const [newRuleConditionValue, setNewRuleConditionValue] = useState("");
  const [newRulePreset, setNewRulePreset] = useState("redBg");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      {formatRules.length > 0 ? (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Active rules</span>
          {formatRules.map((rule, ruleIndex) => (
            <div
              key={rule.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs"
            >
              <span
                className="size-3 shrink-0 rounded-sm border border-border"
                style={{ backgroundColor: rule.style.bg ?? "transparent" }}
              />
              <span className="min-w-0 truncate">
                {rule.columnId ?? "All columns"}: {CONDITION_LABELS[rule.condition.type]}
                {"value" in rule.condition ? ` "${rule.condition.value}"` : ""}
              </span>
              <button
                type="button"
                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move up"
                disabled={ruleIndex === 0}
                onClick={() => {
                  const next = [...formatRules];
                  [next[ruleIndex - 1]!, next[ruleIndex]!] = [next[ruleIndex]!, next[ruleIndex - 1]!];
                  onFormatRulesChange(next);
                }}
              >
                <ChevronUp className="size-3" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                title="Move down"
                disabled={ruleIndex === formatRules.length - 1}
                onClick={() => {
                  const next = [...formatRules];
                  [next[ruleIndex]!, next[ruleIndex + 1]!] = [next[ruleIndex + 1]!, next[ruleIndex]!];
                  onFormatRulesChange(next);
                }}
              >
                <ChevronDown className="size-3" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Duplicate rule"
                onClick={() => {
                  const clone: FormatRule = {
                    ...rule,
                    id: createRuleId(),
                    condition: { ...rule.condition },
                    style: { ...rule.style },
                  };
                  const next = [...formatRules];
                  next.splice(ruleIndex + 1, 0, clone);
                  onFormatRulesChange(next);
                }}
              >
                <Copy className="size-3" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Edit rule"
                onClick={() => {
                  setEditingRuleId(rule.id);
                  setNewRuleColumn(rule.columnId);
                  setNewRuleConditionType(rule.condition.type);
                  setNewRuleConditionValue(
                    "value" in rule.condition ? String(rule.condition.value) : "",
                  );
                  const presetKey = findPresetKeyForStyle(rule.style) ?? "redBg";
                  setNewRulePreset(presetKey);
                }}
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
                title="Remove rule"
                onClick={() => {
                  if (editingRuleId === rule.id) {
                    setEditingRuleId(null);
                    setNewRuleConditionValue("");
                  }
                  onFormatRulesChange(formatRules.filter((r) => r.id !== rule.id));
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">
          {editingRuleId ? "Edit rule" : "Add rule"}
        </span>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Column</label>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={newRuleColumn ?? ""}
              onChange={(e) => setNewRuleColumn(e.target.value || null)}
            >
              <option value="">All columns</option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Condition</label>
            <select
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              value={newRuleConditionType}
              onChange={(e) =>
                setNewRuleConditionType(e.target.value as FormatCondition["type"])
              }
            >
              {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          {newRuleConditionType !== "empty" && newRuleConditionType !== "not-empty" ? (
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Value</label>
              <Input
                className="h-8 w-32 text-xs"
                placeholder="Value..."
                value={newRuleConditionValue}
                onChange={(e) => setNewRuleConditionValue(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground">Style</label>
            <div className="flex gap-1">
              {Object.entries(FORMAT_PRESETS).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className={cn(
                    "size-8 rounded-md border text-[10px] font-medium transition-colors",
                    newRulePreset === key
                      ? "border-primary ring-1 ring-primary"
                      : "border-border",
                  )}
                  style={{
                    backgroundColor: preset.style.bg ?? "transparent",
                    color: preset.style.text ?? "inherit",
                    fontWeight: preset.style.bold ? "bold" : "normal",
                  }}
                  onClick={() => setNewRulePreset(key)}
                >
                  {preset.style.bold ? "B" : "A"}
                </button>
              ))}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const condType = newRuleConditionType;
              let condition: FormatCondition;
              if (condType === "empty" || condType === "not-empty") {
                condition = { type: condType };
              } else if (condType === "gt" || condType === "lt") {
                const num = Number(newRuleConditionValue);
                if (Number.isNaN(num)) return;
                condition = { type: condType, value: num };
              } else {
                condition = { type: condType, value: newRuleConditionValue } as FormatCondition;
              }
              const preset = FORMAT_PRESETS[newRulePreset];
              if (!preset) return;
              if (editingRuleId) {
                onFormatRulesChange(
                  formatRules.map((r) =>
                    r.id === editingRuleId
                      ? {
                          id: r.id,
                          columnId: newRuleColumn,
                          condition,
                          style: { ...preset.style },
                        }
                      : r,
                  ),
                );
                setEditingRuleId(null);
              } else {
                onFormatRulesChange([
                  ...formatRules,
                  {
                    id: createRuleId(),
                    columnId: newRuleColumn,
                    condition,
                    style: { ...preset.style },
                  },
                ]);
              }
              setNewRuleConditionValue("");
            }}
          >
            {editingRuleId ? "Save" : "Add"}
          </Button>
          {editingRuleId ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingRuleId(null);
                setNewRuleConditionValue("");
              }}
            >
              Cancel
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
