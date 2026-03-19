# Performance Analysis

## Executive Summary

I do **not** think the current failure point is simply “JSON larger than 1 MB”. The code can parse a 1.25 MB JSON string quickly. The real problem is the amount of derived work the app does after parsing, especially when the JSON structure contains nested arrays.

I benchmarked four scenarios around the same input size:

- large flat records, `parallel`
- large nested records, `parallel`
- large nested records, `stringify`
- large nested records, `strict_leaf`

The strongest conclusions are:

1. Native JSON parsing is cheap here. It is not the primary bottleneck.
2. The actual worker-style preview path is much slower than the core computation because streaming preview updates rebuild the preview repeatedly.
3. Nested array structure is a major multiplier. On the same 1.25 MB nested payload, switching flat projection from `parallel` to `stringify`/`strict_leaf` cut flat conversion time from about `127 ms` to about `19 ms`.
4. Relational splitting remains expensive even after flat projection is made cheaper, because it is always computed eagerly and fully.

My current ranking of the top 3 slowness causes is:

1. Streaming flat-preview rebuild churn.
2. Flat row amplification and eager flat materialization.
3. Eager relational split on every preview.

## Methodology

This study combines:

1. Code-path analysis of the preview pipeline in `App.tsx`, `use-projection-preview.ts`, `projection.ts`, `mapping-engine.ts`, and `relational-split.ts`.
2. Targeted benchmarks on synthetic payloads slightly above `1.25 MB`.

The benchmark was run in the project test environment rather than in a live browser tab, so browser-main-thread numbers can be somewhat worse in practice. The relative ranking is still clear enough to support architectural recommendations.

## Benchmark Matrix

### Input shapes

- `flat records`: large array of shallow objects, no row-multiplying nested arrays.
- `nested groups`: large nested payload with arrays under each selected root (`flags`, `lineItems`, `discounts`, `metrics`, `notes.tags`).

### Results

| Scenario | Input chars | Selected roots | Flat rows | Relational rows | `convertJsonToCsvTable` | `splitJsonToRelationalTables` | `computeProjectionPayload` | Worker-style `streamProjectionPayload` | Preview events |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| flat records, `parallel` | `1,250,175` | `4,056` | `4,056` | `4,056` | `38.41 ms` | `32.63 ms` | `74.79 ms` | `164.32 ms` | `511` |
| nested groups, `parallel` | `1,253,822` | `1,704` | `8,520` | `25,560` | `127.23 ms` | `79.97 ms` | `225.92 ms` | `427.15 ms` | `217` |
| nested groups, `stringify` | `1,253,822` | `1,704` | `1,704` | `25,560` | `18.43 ms` | `77.79 ms` | `120.40 ms` | `157.59 ms` | `217` |
| nested groups, `strict_leaf` | `1,253,822` | `1,704` | `1,704` | `25,560` | `19.51 ms` | `77.56 ms` | `121.49 ms` | `150.48 ms` | `217` |

### Supporting parse numbers

Native parse was consistently cheap:

- flat payload: `1.74 ms`
- nested payload: `3.49-3.55 ms`

The custom streaming parser was slower than native parse, but still not the top cost:

- flat payload: `10.53 ms`
- nested payload: `12.15-12.64 ms`

## What the Matrix Means

The matrix answers the “1 MB” question pretty clearly:

- The app can parse `~1.25 MB` just fine.
- The app slows down when that input expands into many derived rows and tables.
- The app slows down even more because the worker path keeps rebuilding preview output while the final result is still being computed.

Two comparisons are especially important:

### 1. Flat vs nested, same approximate size

On similarly sized inputs:

- flat `parallel` worker-style preview: `164.32 ms`
- nested `parallel` worker-style preview: `427.15 ms`

So the difference is not just bytes. It is structure.

### 2. Same nested payload, different flatten mode

On the exact same nested input:

- nested `parallel` flat conversion: `127.23 ms`
- nested `stringify` flat conversion: `18.43 ms`
- nested `strict_leaf` flat conversion: `19.51 ms`

That isolates flat row amplification as a major bottleneck.

At the same time, relational split stayed around `78-80 ms` in all nested scenarios, which means that even when flat projection is made cheaper, relational normalization still remains a large fixed cost.

## Current Large-JSON Pipeline

For custom JSON, the hot path is:

1. `App.tsx` commits `committedCustomJson`.
2. `useProjectionPreview()` posts the full request, including the full JSON string, to a worker.
3. The worker calls `streamProjectionPayload()`.
4. That function parses the JSON, discovers paths, computes flat preview data, and computes relational split data.
5. While it is doing that, it sends many progress and flat-preview messages back to React.

Relevant code:

- `src/App.tsx:596-608`
- `src/hooks/use-projection-preview.ts:66-172`
- `src/workers/projection-worker.ts:14-33`
- `src/lib/projection.ts:126-200`
- `src/lib/projection.ts:231-320`

The app already contains UI mitigation work such as suspending the heavy workbench during custom rebuilds. That is a useful symptom: the author already had to guard against hangs. The remaining problem is that the core compute path is still doing too much work.

## Top 3 Slowness Causes

## 1. Streaming flat-preview updates rebuild the preview from all accumulated rows hundreds of times

### Evidence

This is the clearest bottleneck in the **actual app path**, because the worker uses `streamProjectionPayload()` with preview callbacks.

Measured worker-style overhead:

- flat records:
  - `computeProjectionPayload`: `74.79 ms`
  - worker-style `streamProjectionPayload`: `164.32 ms`
  - extra cost: about `89.53 ms`
- nested groups, `parallel`:
  - `computeProjectionPayload`: `225.92 ms`
  - worker-style `streamProjectionPayload`: `427.15 ms`
  - extra cost: about `201.23 ms`

Event counts:

- flat records: `511` preview events
- nested groups: `217` preview events

Relevant code:

- `src/lib/projection.ts:258-275`
- `src/lib/mapping-engine.ts:295-303`
- `src/lib/mapping-engine.ts:432-470`
- `src/hooks/use-projection-preview.ts:96-168`

### Why it happens

Every time the streaming path emits a flat preview, the code rebuilds that preview from all accumulated rows so far:

- clone accumulated `renderedRows`
- apply type-mismatch logic again
- reselect headers again
- rerender preview rows again
- post the result back to the main thread

This is not incremental. It is repeated reprocessing of already-seen data.

### Why it gets worse on large inputs

The preview cadence is tied directly to processed root count. In `projection.ts`, `shouldEmitProjectionStreamPreview()` emits for the first `3` roots and then again every `8` roots. Root counts can be large even when the output is not structurally explosive. That is why even the “flat records” case had `511` preview events and almost doubled the total preview cost.

### Improvement suggestions

1. Throttle preview messages.

   Switch from the current aggressive cadence to one of:

   - time-based emission, e.g. every `100-200 ms`
   - root-count budgets, e.g. every `128` or `256` roots
   - stop after the preview row budget is filled

2. Make preview generation incremental.

   Keep preview headers and preview rows inside the session and update them with deltas. Do not rebuild them from all `renderedRows` each time.

3. Coalesce progress and preview messages.

   Prefer one combined status message per throttle window over many granular messages.

4. Stop preview rebuilding after the preview budget is stable.

   If the UI already has enough preview rows and headers, continue counting and parsing, but stop regenerating preview rows unless schema visibility actually changes.

### Expected benefit

This is the highest-priority optimization because it directly targets the real app path, not just the pure library path.

## 2. Flat row amplification and eager flat materialization

### Evidence

The largest standalone compute stage is flat conversion, especially on nested payloads using `parallel` flattening.

Measured flat conversion:

- flat records, `parallel`: `38.41 ms`
- nested groups, `parallel`: `127.23 ms`
- nested groups, `stringify`: `18.43 ms`
- nested groups, `strict_leaf`: `19.51 ms`

On the nested payload, `parallel` produced:

- `1,704` selected roots
- `8,520` flat rows

The same payload under `stringify` or `strict_leaf` stayed at `1,704` flat rows.

Relevant code:

- `src/lib/mapping-engine.ts:265-317`
- `src/lib/mapping-engine.ts:320-355`
- `src/lib/mapping-engine.ts:398-429`
- `src/lib/mapping-engine.ts:651-860`
- `src/lib/mapping-engine.ts:1103-1267`

### Why it happens

The flat pipeline eagerly:

- expands arrays into row groups
- clones `data`, `lineage`, and `owners` on every append
- keeps both `projectedRows` and `renderedRows`
- renders all records
- builds a full CSV string
- builds schema/type reports
- builds row provenance

The expensive array-expansion path is here:

- `src/lib/mapping-engine.ts:734-799`
- `src/lib/mapping-engine.ts:839-860`

### Why complex structure hurts more than raw bytes

This stage scales with **derived flat rows**, not just input size. The same bytes become much more expensive when arrays multiply rows.

That is why the nested `parallel` case is dramatically slower than both:

- the flat `parallel` case
- the same nested payload in `stringify`/`strict_leaf`

### Improvement suggestions

1. Separate preview mode from export mode.

   Preview does not need the full final dataset artifacts. It only needs:

   - row count
   - first `N` rows
   - header sample
   - sampled schema information

2. Stop materializing full rows after the preview budget is satisfied.

   Keep counts and samples, not all row objects.

3. Replace object-spread row cloning with mutable builders inside the worker.

   The current row model is allocation-heavy and likely GC-heavy.

4. Defer full CSV generation until export.

   The preview tab only needs truncated preview text.

5. Add an adaptive flatten policy for large nested inputs.

   For preview, automatically shift nested arrays toward `stringify` or `strict_leaf` above a row-amplification threshold, with an explicit override for power users.

### Expected benefit

This is the main way to make structurally complicated JSON feel affordable.

## 3. Relational split is always computed eagerly and fully materialized, even when the user only needs flat preview

### Evidence

Measured relational split:

- flat records: `32.63 ms`
- nested groups, `parallel`: `79.97 ms`
- nested groups, `stringify`: `77.79 ms`
- nested groups, `strict_leaf`: `77.56 ms`

On the nested payload, relational rows built were:

- `root`: `1,704`
- `flags`: `5,112`
- `lineItems`: `3,408`
- `lineItems_discounts`: `6,816`
- `metrics`: `5,112`
- `notes_tags`: `3,408`

Total relational rows materialized: `25,560`

Relevant code:

- `src/lib/projection.ts:185-193`
- `src/lib/projection.ts:309-319`
- `src/lib/relational-split.ts:68-129`
- `src/lib/relational-split.ts:148-208`
- `src/lib/relational-split.ts:226-304`

### Why it happens

The relational pass is always run after flat preview, and it eagerly builds every table into:

- `rawRows`
- `records`
- full CSV text

That cost barely changes when the flat mode changes, because relational normalization is its own separate full traversal and materialization step.

### Why this matters

This stage is the reason nested `stringify` and `strict_leaf` still cost around `120 ms` in `computeProjectionPayload()`. Flat projection becomes cheap, but relational work still remains.

### Improvement suggestions

1. Make relational preview lazy.

   Do not compute relational tables during the initial preview cycle.

2. Build relational data only when needed.

   Trigger it when:

   - the relational tab is opened
   - export starts
   - the user explicitly asks for normalization

3. Add relational preview mode.

   For preview, compute only:

   - table names
   - row counts
   - relationships
   - first `N` rows for the selected table

4. Defer per-table CSV generation until export.

   Full table CSV strings are unnecessary for initial preview.

### Expected benefit

This is the largest remaining fixed cost once flat projection has been optimized.

## Secondary Findings

These are real costs, but they are not the top 3 in the benchmark matrix.

### Custom JSON always takes the streaming-parser branch

Relevant code:

- `src/lib/projection.ts:137-151`
- `src/lib/json-root-stream.ts:24-37`

`resolveStreamableJsonPath()` returns a value for any non-empty root path, so custom JSON always goes through the custom streaming parser path.

Measured parser costs:

- flat payload:
  - native parse: `1.74 ms`
  - streaming parser: `10.53 ms`
- nested payload:
  - native parse: `3.49-3.55 ms`
  - streaming parser: `12.15-12.64 ms`

This is real overhead, but not the dominant one.

### Main-thread reparsing still exists in `App.tsx`

Relevant code:

- `src/App.tsx:1085-1096`
- `src/App.tsx:1228-1233`
- `src/App.tsx:1333-1341`
- `src/App.tsx:1405-1421`
- `src/App.tsx:1470-1473`

These reparses are smaller than the worker pipeline costs, but they still increase the chance of visible hitches during apply, format, import, and smart-detect actions.

### Worker messaging copies large payloads

Relevant code:

- `src/hooks/use-projection-preview.ts:81-87`
- `src/hooks/use-projection-preview.ts:166-167`

The full JSON string is posted into the worker, and preview/result payloads are posted back to the main thread. That is acceptable architecture-wise, but it still increases memory traffic.

## Recommended Improvement Plan

## Phase 1: Fix preview churn first

1. Throttle/coalesce preview messages.
2. Make preview chunk building incremental.
3. Stop preview regeneration after preview budget is filled.

This has the best chance of cutting the real worker-style path immediately.

## Phase 2: Introduce preview-only flat projection

1. Keep only sampled rows and sampled schema for preview.
2. Defer full CSV, provenance, and detailed schema work.
3. Add adaptive flatten fallback for large nested inputs.

This directly attacks structure-driven slowness.

## Phase 3: Make relational preview lazy

1. Do not build relational tables during initial flat preview.
2. Build relational preview only on demand.
3. Generate relational CSV only during export.

This removes the largest remaining fixed cost after flat optimization.

## Phase 4: Simplify parse/traversal architecture

1. Use native `JSON.parse` as the default fast path.
2. Use the custom streaming parser only when selective streaming actually helps.
3. Longer term, collapse independent passes into a shared aggregator.

## Final Conclusion

The application’s limit is better described as:

> “How many derived rows/tables do we build, and how many times do we rebuild preview state while doing it?”

The evidence does **not** support the idea that raw 1 MB parsing is the main limit. The evidence **does** support these conclusions:

- large but flat JSON is materially cheaper than similarly sized nested JSON
- the real worker path is much slower than the pure compute path because preview updates are rebuilt too often
- nested `parallel` flattening is expensive because it multiplies rows
- relational normalization is a large fixed cost even after flattening is simplified

If you optimize the three areas above in order, this app should become much more tolerant of both larger files and more complicated structures.

## Post-Implementation Spot Check

I executed the first improvement pass after writing the study and reran the same `~1.25 MB` benchmark shapes. The changes implemented were:

- lighter stream-preview chunk building that only reprocesses preview-sized rows
- much less frequent stream preview emission once the preview budget is filled
- deferred relational preview on a separate async path instead of blocking the first flat result

### Before vs after

| Scenario | Before worker-style preview | After flat/discovery pass | Separate relational pass | Combined async total | Preview events before | Preview events after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| flat records, `parallel` | `164.32 ms` | `45.64 ms` | `32.18 ms` | `77.82 ms` | `511` | `47` |
| nested groups, `parallel` | `427.15 ms` | `143.72 ms` | `84.16 ms` | `227.88 ms` | `217` | `19` |
| nested groups, `stringify` | `157.59 ms` | `44.19 ms` | `79.22 ms` | `123.41 ms` | `217` | `29` |
| nested groups, `strict_leaf` | `150.48 ms` | `43.19 ms` | `88.35 ms` | `131.54 ms` | `217` | `29` |

### What changed materially

- The first usable flat result now lands much sooner because relational work no longer blocks it.
- Preview churn dropped sharply. The worst flat case went from `511` preview events to `47`, and the worst nested `parallel` case went from `217` to `19`.
- Even when you add the deferred relational pass back in, the total combined cost is still materially lower than the previous eager worker path.

### Remaining bottleneck ranking after the first pass

1. Flat row amplification under nested `parallel` flattening still dominates the flat pipeline.
2. Relational normalization is still expensive; it just no longer blocks the first flat preview.
3. Full final flat materialization still does more work than a pure preview path ideally needs.

This rerun supports the original diagnosis. The initial slowdown was mostly preview-path churn plus eager derived work, not raw JSON parsing.
