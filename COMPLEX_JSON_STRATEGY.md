# Complex JSON Strategy

## Goal

Handle payloads like `/Users/mac/Downloads/swagger.json` without special-casing OpenAPI, while still working well for other large, irregular, or document-style JSON.

## Problem Shape

The hard cases are not always large because of row count. Some are large because they expose too many paths, too many potential columns, or too much nested structure at the root.

Examples:

- OpenAPI documents with large `paths` and `components.schemas` trees
- event payload collections with highly heterogeneous objects
- configuration or metadata documents with deep nesting but no obvious row root
- mixed object-map and array-heavy JSON where root `$` is technically valid but operationally useless

For these cases, the current risk is that the UI tries to behave like a flat-table workbench too early.

## Option 1: Staged Exploration Before Full Projection

Summary:

- Do not fully build the planner, schema sidecar, and flat preview immediately when the root is broad and the discovered structure is huge.
- Start with a lightweight structural overview first.
- Require the user to narrow the scope before the heavy workbench expands.

How it works:

- Parse once and build a cheap summary of top-level branches, counts, repeated arrays, object maps, and estimated path volume.
- Show candidate row roots and branch-level “cost hints” such as estimated columns, depth, and repetition.
- Only after the user picks a branch or accepts a suggested root do we build the full path planner and projection preview for that narrowed scope.

Why it stays generic:

- This is not OpenAPI-specific. Any payload with a broad root benefits from “overview first, heavy preview second”.
- It works for documents, API schemas, logs, exports, and nested transactional payloads.

Why it helps `swagger.json`:

- The user should see `paths`, `components.schemas`, `tags`, and similar branches as separate work areas instead of immediately forcing `$` through the flat-table workflow.

Pros:

- Highest practical impact for very large path counts.
- Keeps the main workbench focused on the part of the document the user actually wants.
- Lower implementation risk than a full product redesign.

Cons:

- Adds one more step before the full workbench appears.
- Needs good heuristics so it does not feel like unnecessary friction on small JSON.

Recommended triggers:

- discovered path count above a threshold
- estimated visible columns above a threshold
- root `$` selected on a document with many top-level branches

## Option 2: Collapsed Path Families Instead of Literal Path Lists

Summary:

- Replace the current literal path explosion with grouped path families that expand on demand.
- Render `path patterns`, not every concrete path up front.

How it works:

- Group similar paths into families such as:
  - `components.schemas.*`
  - `components.schemas.*.properties.*`
  - `paths.*.*.responses.*`
- Show counts, representative examples, and dominant kinds per family.
- Allow drilling into one family at a time instead of mounting tens of thousands of path nodes.

Why it stays generic:

- Path-family grouping is useful for any JSON with repeated object-map keys, not just API specs.
- It also applies to analytics exports, keyed maps, sparse records, and nested settings documents.

Why it helps `swagger.json`:

- OpenAPI documents contain huge repeated key spaces where the interesting question is usually “which branch family matters”, not “show me every leaf path immediately”.

Pros:

- Directly attacks the path-planner scalability problem.
- Lets users explore complex JSON without losing structural fidelity.
- Generic enough to become the default planner UI for very large payloads.

Cons:

- More complex implementation than simple gating.
- Needs careful UX so grouped paths do not feel too abstract.
- Some users will still need a way to inspect exact concrete paths later.

Best use:

- As the planner UI once payload complexity crosses a threshold.

## Option 3: Adaptive Workbench Modes Based on Payload Shape

Summary:

- Stop using one UI workflow for every JSON shape.
- Detect the payload shape and switch the default workbench mode accordingly.

Possible modes:

- `Row mode`: array-of-records or clear row-root payloads
- `Document mode`: deep object documents with no obvious flat root
- `Schema mode`: metadata/specification payloads with many path families and few natural rows
- `Relational mode`: array-heavy payloads where one-to-many structure is dominant

How it works:

- After parse and structural inspection, choose a default mode.
- Change the first-class UI based on that mode:
  - `Row mode`: keep the current flat preview first
  - `Document mode`: show structure browser and branch summary first
  - `Schema mode`: show grouped path families and schema-oriented summaries first
  - `Relational mode`: emphasize table splitting and branch selection

Why it stays generic:

- The logic is shape-driven, not domain-driven.
- OpenAPI happens to land in `Schema mode`, but the same mode also fits other large configuration and metadata documents.

Why it helps `swagger.json`:

- `swagger.json` is structurally closer to a schema/document explorer than a flat CSV source. The UI should reflect that instead of pretending it is a row table at `$`.

Pros:

- Best long-term UX if the product will support many JSON shapes.
- Reduces the mismatch between payload shape and first-screen UI.
- Creates room for clearer defaults and better automatic guidance.

Cons:

- Largest product and implementation change.
- More state and mode transitions to maintain.
- Riskier if done before simpler guardrails are in place.

## Recommendation

If the goal is to improve the product soon with the best risk-to-impact ratio:

1. Build **Option 1** first.
2. Follow with **Option 2** for the planner once large-path payloads are detected.
3. Treat **Option 3** as the long-term product direction if this tool is going to support a wide range of non-tabular JSON workflows.

## Best Immediate Choice

The best immediate choice is **Option 1: Staged Exploration Before Full Projection**.

Reason:

- It solves the actual failure mode on `swagger.json` without locking the product into OpenAPI-specific behavior.
- It is generic, understandable, and compatible with the current architecture.
- It creates a clean entry point for Option 2 later.

## Suggested Rollout Order

1. Add a complexity gate that detects large path/column documents and shows a structural overview first.
2. Add branch-level cost hints and root recommendations.
3. Replace the literal large-path planner with grouped path families for those gated cases.
4. Consider adaptive workbench modes after the above two prove useful.
