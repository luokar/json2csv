# UI Performance Analysis

## Scope

This note focuses on UI-side slowness in the React workbench rather than the core JSON-to-CSV engine. The current bottlenecks are mostly caused by how worker progress and preview data are fed back into React and how much synchronous derivation still runs during render.

## Top 3 Likely UI Causes

1. Worker progress and stream messages trigger too many top-level React updates.
2. The app rebuilds preview-side derived values on the main thread during render, including streamed CSV preview text.
3. Heavy UI panels stay hot even when their inputs did not change, so progress-only updates still fan out into expensive subtree work.

## Improvement Plan

### 1. Coalesce worker-driven UI updates

Goal: reduce render churn from `progress` and `stream` worker messages.

Plan:

- Batch intermediate worker updates into a single React commit per frame.
- Keep final `result` commits immediate so the UI settles as soon as the worker finishes.
- Apply the same batching pattern to both flat projection and relational preview hooks.

Status: Completed in the first execution pass.

### 2. Remove streamed CSV preview generation from the main render path

Goal: stop rebuilding streamed CSV preview text inside `App.tsx` on every stream update.

Plan:

- Build streamed CSV preview text inside the worker-side projection pipeline.
- Send the bounded preview text back with each stream chunk.
- Render the worker-provided preview directly in the UI.

Status: Completed in the first execution pass.

### 3. Narrow the re-render surface for the heaviest panels

Goal: stop progress-only updates from forcing row preview, path planner, and header mapper to rebuild when their inputs are unchanged.

Plan:

- Memoize heavy panels with stable props.
- Memoize high-churn derived inputs such as header suggestions, planner trees, visible suggestions, preview rows, and preview columns.
- Prefer stable empty fallbacks so memoized components do not rerender on identical "no data yet" states.

Status: Completed in the first execution pass.

## Executed Changes

### Landed now

- Batched projection hook progress/stream commits before they hit React state.
- Batched relational preview hook progress commits before they hit React state.
- Added streamed CSV preview payloads to worker stream chunks.
- Switched `App.tsx` to use worker-provided streamed CSV preview data instead of rebuilding streamed CSV text on the main thread.
- Memoized `RowPreviewCard`, `PathPlanner`, and `HeaderMapper`.
- Memoized the highest-churn derived data feeding those panels.
- Added bounded live-preview limits for extreme column-count payloads so the row table and schema sidecar do not try to render every column at once.
- Added a staged complex-root gate for broad `$` documents so the full planner and preview stay hidden until the user narrows the scope or explicitly continues.
- Ranked suggested roots by reusable structural breadth and suppressed high-cardinality keyed children such as individual OpenAPI routes.
- Added a grouped-family mode for very large planner suggestion sets so the planner shows structural families first and only builds the literal tree on demand.
- Added grouped-family filtering so users can search large family summaries before they fall back to the literal path tree.

### Next pass

- Replace the large controlled custom JSON textarea in the main workbench with the existing buffered editor path so typing no longer rerenders the whole root component on every keystroke.
- Add drill-down controls on top of grouped planner families so users can expand one family into the next layer without loading the full literal tree.
- Extract the relational preview and CSV/schema side panels into memoized subcomponents if profiler traces still show expensive progress-only rerenders.
- Validate the impact with browser profiling on large nested custom payloads, especially while streaming preview is active.

## Expected Outcome

The first pass should noticeably reduce UI churn during preview rebuilds, especially for large nested payloads where the worker emits multiple progress and streaming updates. It does not change the core conversion algorithm; it reduces how much redundant UI work happens while conversion is in flight.

## Swagger Profile

I ran a structural profile against `/Users/mac/Downloads/swagger.json` after the first optimization pass. The important numbers were:

- file size: about `2.5 MB`
- top-level arrays: `servers=1`, `security=3`, `tags=71`, `x-tagGroups=17`
- OpenAPI path objects: `367`
- component schemas: `987`
- component parameters: `372`
- component responses: `163`
- approximate unique leaf paths: `20,310`
- approximate total unique paths including branches: `39,620`

What this means:

- This payload is not primarily a “too many preview rows” case.
- It is a “far too many paths and columns” case.
- The new bounded table/schema preview limits should reduce the row-preview and sidecar cost.
- The new staged overview gate now prevents the heaviest planner/preview surfaces from mounting immediately at root `$`.
- The grouped planner now prevents the narrow-root path browser from eagerly rendering the full literal tree when the path set is still huge.
- The next likely UI hotspot for this document is the large custom JSON editor path, especially while users are typing or applying very large payloads.
