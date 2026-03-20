import type { FlattenMode, InspectedPath, MappingConfig, ValueKind } from "@/lib/mapping-engine";

export const plannerRuleActions = ["mode", "stringify", "drop", "include"] as const;

export type PlannerRuleAction = (typeof plannerRuleActions)[number];

export interface PlannerRule {
  action: PlannerRuleAction;
  id: string;
  mode: FlattenMode;
  path: string;
}

export interface PlannerTreeRecommendation {
  label: string;
  note: string;
}

export interface PlannerSuggestionTreeNode {
  children: PlannerSuggestionTreeNode[];
  count: number;
  depth: number;
  kinds: ValueKind[];
  path: string;
  recommendation: PlannerTreeRecommendation | null;
  rule: PlannerRule | null;
  segment: string;
}

export interface PlannerSuggestionFamily {
  depth: number;
  examplePaths: string[];
  hasArray: boolean;
  hasObject: boolean;
  maxDepth: number;
  path: string;
  suggestionCount: number;
  totalHits: number;
}

export const plannerFamilyModeSuggestionThreshold = 600;
export const plannerSuggestionFamilyLimit = 10;
export const plannerSuggestionFamilySiblingThreshold = 12;
export const plannerSuggestionFamilyMinParentShare = 0.12;

let plannerRuleCount = 0;

export function createPlannerRule(overrides: Partial<Omit<PlannerRule, "id">> = {}): PlannerRule {
  plannerRuleCount += 1;

  return {
    action: "mode",
    id: `planner-rule-${plannerRuleCount}`,
    mode: "parallel",
    path: "",
    ...overrides,
  };
}

export function plannerRulesFromConfig(
  config: Pick<MappingConfig, "dropPaths" | "includePaths" | "pathModes" | "stringifyPaths">,
) {
  const rulesByPath = new Map<string, PlannerRule>();

  for (const path of config.includePaths ?? []) {
    const normalizedPath = normalizePlannerPath(path);

    if (!normalizedPath) {
      continue;
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: "include",
        path: normalizedPath,
      }),
    );
  }

  for (const [path, mode] of Object.entries(config.pathModes ?? {})) {
    const normalizedPath = normalizePlannerPath(path);

    if (!normalizedPath) {
      continue;
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: "mode",
        mode,
        path: normalizedPath,
      }),
    );
  }

  for (const path of config.stringifyPaths ?? []) {
    const normalizedPath = normalizePlannerPath(path);

    if (!normalizedPath) {
      continue;
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: "stringify",
        path: normalizedPath,
      }),
    );
  }

  for (const path of config.dropPaths ?? []) {
    const normalizedPath = normalizePlannerPath(path);

    if (!normalizedPath) {
      continue;
    }

    rulesByPath.set(
      normalizedPath,
      createPlannerRule({
        action: "drop",
        path: normalizedPath,
      }),
    );
  }

  return [...rulesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

export function plannerRulesToConfig(rules: PlannerRule[]) {
  const includePaths: string[] = [];
  const pathModes: Record<string, FlattenMode> = {};
  const stringifyPaths: string[] = [];
  const dropPaths: string[] = [];
  const seenPaths = new Set<string>();

  for (const rule of [...rules].reverse()) {
    const path = normalizePlannerPath(rule.path);

    if (!path || seenPaths.has(path)) {
      continue;
    }

    seenPaths.add(path);

    if (rule.action === "drop") {
      dropPaths.push(path);
      continue;
    }

    if (rule.action === "include") {
      includePaths.push(path);
      continue;
    }

    if (rule.action === "stringify") {
      stringifyPaths.push(path);
      continue;
    }

    pathModes[path] = rule.mode;
  }

  return {
    dropPaths: dropPaths.reverse(),
    includePaths: includePaths.reverse(),
    pathModes: Object.fromEntries(
      Object.entries(pathModes).sort(([left], [right]) => left.localeCompare(right)),
    ) as Record<string, FlattenMode>,
    stringifyPaths: stringifyPaths.reverse(),
  };
}

export function buildPlannerSuggestionTree(suggestions: InspectedPath[], rules: PlannerRule[]) {
  const nodesByPath = new Map<string, PlannerSuggestionTreeNode>();
  const roots: PlannerSuggestionTreeNode[] = [];
  const rulesByPath = new Map<string, PlannerRule>();

  for (const rule of rules) {
    const normalizedPath = normalizePlannerPath(rule.path);

    if (!normalizedPath) {
      continue;
    }

    rulesByPath.set(normalizedPath, {
      ...rule,
      path: normalizedPath,
    });
  }

  for (const suggestion of [...suggestions].sort(compareInspectedPaths)) {
    const normalizedPath = normalizePlannerPath(suggestion.path);

    if (!normalizedPath) {
      continue;
    }

    const segments = normalizedPath.split(".");

    for (const [segmentIndex, segment] of segments.entries()) {
      const path = segments.slice(0, segmentIndex + 1).join(".");
      const parentPath = segments.slice(0, segmentIndex).join(".");
      const existingNode = nodesByPath.get(path);

      if (existingNode) {
        if (segmentIndex === segments.length - 1) {
          existingNode.count = suggestion.count;
          existingNode.depth = suggestion.depth;
          existingNode.kinds = suggestion.kinds;
          existingNode.recommendation = buildPlannerRecommendation(suggestion);
          existingNode.rule = rulesByPath.get(path) ?? null;
        }

        continue;
      }

      const node: PlannerSuggestionTreeNode = {
        children: [],
        count: segmentIndex === segments.length - 1 ? suggestion.count : 0,
        depth: segmentIndex + 1,
        kinds: segmentIndex === segments.length - 1 ? suggestion.kinds : [],
        path,
        recommendation:
          segmentIndex === segments.length - 1 ? buildPlannerRecommendation(suggestion) : null,
        rule: rulesByPath.get(path) ?? null,
        segment,
      };

      nodesByPath.set(path, node);

      if (!parentPath) {
        roots.push(node);
        continue;
      }

      const parentNode = nodesByPath.get(parentPath);

      if (parentNode) {
        parentNode.children.push(node);
      }
    }
  }

  return roots;
}

export function buildPlannerSuggestionFamilies(suggestions: InspectedPath[]) {
  const familiesByPath = new Map<string, PlannerSuggestionFamily>();

  for (const suggestion of suggestions) {
    const normalizedPath = normalizePlannerPath(suggestion.path);

    if (!normalizedPath) {
      continue;
    }

    const segments = normalizedPath.split(".");

    for (let segmentIndex = 0; segmentIndex < Math.min(segments.length, 2); segmentIndex += 1) {
      const path = segments.slice(0, segmentIndex + 1).join(".");
      const existingFamily = familiesByPath.get(path);

      if (existingFamily) {
        existingFamily.suggestionCount += 1;
        existingFamily.totalHits += suggestion.count;
        existingFamily.maxDepth = Math.max(existingFamily.maxDepth, suggestion.depth);
        existingFamily.hasArray ||= suggestion.kinds.includes("array");
        existingFamily.hasObject ||= suggestion.kinds.includes("object");

        if (
          existingFamily.examplePaths.length < 3 &&
          !existingFamily.examplePaths.includes(normalizedPath)
        ) {
          existingFamily.examplePaths.push(normalizedPath);
        }

        continue;
      }

      familiesByPath.set(path, {
        depth: segmentIndex + 1,
        examplePaths: [normalizedPath],
        hasArray: suggestion.kinds.includes("array"),
        hasObject: suggestion.kinds.includes("object"),
        maxDepth: suggestion.depth,
        path,
        suggestionCount: 1,
        totalHits: suggestion.count,
      });
    }
  }

  const families = [...familiesByPath.values()];
  const siblingCountByParentPath = new Map<string, number>();

  for (const family of families) {
    if (family.depth !== 2) {
      continue;
    }

    const parentPath = family.path.split(".").slice(0, -1).join(".");

    siblingCountByParentPath.set(parentPath, (siblingCountByParentPath.get(parentPath) ?? 0) + 1);
  }

  return families
    .filter((family) =>
      isPlannerSuggestionFamilyCandidate(family, familiesByPath, siblingCountByParentPath),
    )
    .sort(comparePlannerSuggestionFamilies)
    .slice(0, plannerSuggestionFamilyLimit);
}

function buildPlannerRecommendation(suggestion: InspectedPath) {
  if (!suggestion.kinds.includes("array")) {
    return null;
  }

  return {
    label: "Split candidate",
    note:
      suggestion.depth > 1 || suggestion.count > 1
        ? "One-to-many branch detected. Consider relational export to avoid row bloat in the flat CSV."
        : "Repeating branch detected. Consider relational export if the flat preview becomes redundant.",
  } satisfies PlannerTreeRecommendation;
}

function compareInspectedPaths(left: InspectedPath, right: InspectedPath) {
  return left.depth - right.depth || left.path.localeCompare(right.path);
}

function comparePlannerSuggestionFamilies(
  left: PlannerSuggestionFamily,
  right: PlannerSuggestionFamily,
) {
  return (
    right.suggestionCount - left.suggestionCount ||
    right.totalHits - left.totalHits ||
    right.depth - left.depth ||
    Number(right.hasArray) - Number(left.hasArray) ||
    Number(right.hasObject) - Number(left.hasObject) ||
    left.path.localeCompare(right.path)
  );
}

function isPlannerSuggestionFamilyCandidate(
  family: PlannerSuggestionFamily,
  familiesByPath: Map<string, PlannerSuggestionFamily>,
  siblingCountByParentPath: Map<string, number>,
) {
  if (family.depth === 1) {
    return true;
  }

  const parentPath = family.path.split(".").slice(0, -1).join(".");
  const siblingCount = siblingCountByParentPath.get(parentPath) ?? 0;

  if (siblingCount <= plannerSuggestionFamilySiblingThreshold) {
    return true;
  }

  const parentFamily = familiesByPath.get(parentPath);

  if (!parentFamily) {
    return true;
  }

  const suggestionShare = family.suggestionCount / Math.max(parentFamily.suggestionCount, 1);
  const hitShare = family.totalHits / Math.max(parentFamily.totalHits, 1);

  return (
    suggestionShare >= plannerSuggestionFamilyMinParentShare ||
    hitShare >= plannerSuggestionFamilyMinParentShare
  );
}

export function normalizePlannerPath(path: string) {
  return path
    .trim()
    .replace(/^\$\.?/, "")
    .replace(/\[\*\]/g, "");
}
