# Progress

## Current status

- The Vite / React / TypeScript project setup is complete and verified.
- A first-pass smart JSON-to-CSV mapping engine is implemented in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts).
- The app is now an interactive converter playground in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Converter presets are persisted with Dexie in [src/lib/db.ts](/Users/mac/work/json2csv/src/lib/db.ts).
- Engine coverage lives in [src/lib/mapping-engine.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.test.ts).
- Real JSON input is supported through paste and `.json` upload, with helper logic in [src/lib/json-input.ts](/Users/mac/work/json2csv/src/lib/json-input.ts).
- The roadmap milestone for a structured per-path planner is now implemented with UI in [src/components/path-planner.tsx](/Users/mac/work/json2csv/src/components/path-planner.tsx) and helper logic in [src/lib/path-planner.ts](/Users/mac/work/json2csv/src/lib/path-planner.ts).
- A first workflow-tree milestone is now implemented in [src/components/path-planner.tsx](/Users/mac/work/json2csv/src/components/path-planner.tsx) and [src/lib/path-planner.ts](/Users/mac/work/json2csv/src/lib/path-planner.ts), with nested branch browsing, exact-path drop/stringify/mode actions, and split-candidate recommendations for repeating arrays.
- Workflow-tree phase 2 now adds persisted subtree whitelisting through `includePaths` in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts), [src/lib/relational-split.ts](/Users/mac/work/json2csv/src/lib/relational-split.ts), and [src/lib/path-planner.ts](/Users/mac/work/json2csv/src/lib/path-planner.ts), so branch-level include actions can actively narrow both flat and relational previews.
- Structural provenance is now tracked during projection in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts), and regroup keys are surfaced in the sidecar UI in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Indexed pivot columns for non-row-expanding arrays are now implemented in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts) and exposed through the config form in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- A deeper engine regression matrix now covers nested arrays, `strict_leaf`, and override precedence in [src/lib/mapping-engine.matrix.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.matrix.test.ts).
- Batch schema snapshots, strict/lax drift handling, and master-header evolution are now implemented in [src/lib/schema-batch.ts](/Users/mac/work/json2csv/src/lib/schema-batch.ts).
- Type drift summaries are now derived in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts) and surfaced in the sidecar UI in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Worker-backed live projection is now implemented through [src/hooks/use-projection-preview.ts](/Users/mac/work/json2csv/src/hooks/use-projection-preview.ts), [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts), and [src/workers/projection-worker.ts](/Users/mac/work/json2csv/src/workers/projection-worker.ts).
- Large live previews are now bounded in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) with row and text preview limits so the playground stays responsive under heavier inputs.
- Custom JSON editing in the main app now uses an app-owned staged draft in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) with explicit apply/format/load actions, while [src/components/buffered-json-editor.tsx](/Users/mac/work/json2csv/src/components/buffered-json-editor.tsx) remains available for isolated input diagnostics in [src/components/input-diagnostics.tsx](/Users/mac/work/json2csv/src/components/input-diagnostics.tsx).
- The confirmed custom-editor freeze root cause was not the textarea itself. The browser stalled when the app restored or kept the full projection workbench mounted while committed custom payload changes were rebuilding, especially on `Apply JSON` and other explicit custom-input actions.
- The remaining `Custom JSON -> Sample catalog` hang was another transition gap in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx): source-mode swaps could still re-enter the heavy workbench before the next projection lifecycle had actually started and settled. The fix now treats source switches as first-class suspended workbench transitions and preserves dirty custom drafts instead of auto-committing them on exit.
- The later `Custom JSON -> Reset defaults` and `Load active sample` hangs were the same workbench-transition bug expressed through different buttons. Those actions were still allowed to synchronously swap large projection state while the previous preview surface was live. [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) now routes reset, sample-load, preset-load, import, source-switch, and committed-custom rebuilds through the same guarded transition model.
- Hang diagnosis is now fail-fast instead of post-mortem only. [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) publishes lightweight transition diagnostics through the visible card in `?debug=hangs`, `window.__json2csvWorkbenchTransition`, and the `json2csv:workbench-transition` browser event so `queued`, `applying`, `projecting`, `settled`, and `timed-out` phases are inspectable before a browser stall turns opaque.
- The hang audit is now persistent and more actionable. [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) now `flushSync`s the suspended-workbench guard before risky state swaps, waits an extra paint before applying them, and records recovered transitions, long tasks, and paint gaps through [src/lib/hang-audit.ts](/Users/mac/work/json2csv/src/lib/hang-audit.ts) so `?debug=hangs` can explain the last risky action even after a reload.
- The hang audit now also records an `Intent armed` breadcrumb before heavy guarded actions begin. [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) and [src/lib/hang-audit.ts](/Users/mac/work/json2csv/src/lib/hang-audit.ts) persist that pre-transition intent immediately, then clear it once `queued` transition diagnostics take over. This closes the gap where a browser could freeze before the transition phase itself had been written anywhere recoverable.
- The row-preview filter path is now isolated from the rest of the app shell. [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) moved the filter input, deferred query, and TanStack Table sorting into a dedicated row-preview component, and [src/store/use-workbench-store.ts](/Users/mac/work/json2csv/src/store/use-workbench-store.ts) no longer stores global search text. Typing into `Filter visible CSV rows` now updates only the preview card instead of rerendering the entire workbench.
- Chrome trace-driven flicker cleanup is now in place. [src/index.css](/Users/mac/work/json2csv/src/index.css) dropped the network font import in favor of local font stacks, and [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx) now animates the projection progress bar with `transform: scaleX(...)` instead of `width`. A follow-up Chrome trace no longer reported the font downloads or width animation as CLS culprits.
- Chrome MCP verification now confirms the guarded transition model is holding for the previously frozen paths. In `?debug=hangs`, both `Custom JSON -> Load active sample` and `Custom JSON -> Reset defaults` settle without a browser stall and immediately publish transition plus long-task evidence into `window.__json2csvHangAudit`.
- Explicit header mapping and renaming are now implemented through [src/components/header-mapper.tsx](/Users/mac/work/json2csv/src/components/header-mapper.tsx) and [src/lib/header-mapper.ts](/Users/mac/work/json2csv/src/lib/header-mapper.ts), with preset round-tripping wired through [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Relational split preview is now implemented through [src/lib/relational-split.ts](/Users/mac/work/json2csv/src/lib/relational-split.ts), worker-backed projection in [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts), and linked-table UI in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Full output export is now implemented through [src/lib/output-export.ts](/Users/mac/work/json2csv/src/lib/output-export.ts), [src/hooks/use-output-export.ts](/Users/mac/work/json2csv/src/hooks/use-output-export.ts), and [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx), with worker-backed flat CSV download, selected relational-table CSV download, and bundled ZIP export for all relational tables.
- Chunked worker progress is now implemented through root-node progress hooks in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts) and [src/lib/relational-split.ts](/Users/mac/work/json2csv/src/lib/relational-split.ts), staged progress aggregation in [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts), and live progress UI in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Incremental flat-preview streaming is now implemented through [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts), [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts), [src/workers/projection-worker.ts](/Users/mac/work/json2csv/src/workers/projection-worker.ts), [src/hooks/use-projection-preview.ts](/Users/mac/work/json2csv/src/hooks/use-projection-preview.ts), and [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx), so partial flat rows, row counts, and CSV previews render before the full worker payload finishes.
- Incremental custom selector parsing is now implemented in [src/lib/json-root-stream.ts](/Users/mac/work/json2csv/src/lib/json-root-stream.ts) and wired through [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts) and [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx), so the app's current JSONPath subset including nested `[*]` and `[index]` steps can start feeding the flat preview without first materializing the full parsed object graph.
- Smart keyed-map detection is now implemented through [src/lib/smart-config.ts](/Users/mac/work/json2csv/src/lib/smart-config.ts), [src/lib/json-root-stream.ts](/Users/mac/work/json2csv/src/lib/json-root-stream.ts), and [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx), so NOAA-style object maps such as `$.data.*` can be detected, streamed, and turned into rows with a synthetic `__entryKey` alias.
- Keyed-map detection is now automatic on import and custom apply when the current custom root is still too broad or stale. NOAA-style files such as `/Users/mac/Downloads/110-tavg-ytd-12-1895-2016.json` now land directly on `$.data.*` with `period`, `value`, and `anomaly` instead of exploding into hundreds of mostly unhelpful sibling columns.

## Important findings

- `DATASET.md` confirms the core ambiguity problem is not simple flattening. Example 9 and Example 10 are the key relational cases:
  - Example 9 expands one repeating child path.
  - Example 10 explicitly produces `m * n` rows when two repeating child paths are selected.
- That means the engine must treat arrays as row-expansion boundaries with explicit policies, not as generic nested values.
- `parallel` cannot be modeled as repeated cross-products. It must zip against shared parent context, otherwise sibling arrays multiply incorrectly.
- A full header scan is required for heterogeneous objects if the output schema must stay stable.
- Key collision repair must be deterministic because separators like `_` collapse flat and nested names into the same header space.
- `pathModes` need exact-path matching. If they cascade to descendant arrays, users lose the ability to control nested arrays independently. Subtree semantics remain appropriate for `stringifyPaths` and `dropPaths`.
- Explicit header mode should follow the user-provided whitelist order literally. Snapshot replay is only stable if header order is not re-derived from per-file discovery order.
- Client-side responsiveness collapses quickly if parsing, path inspection, row projection, table rendering, CSV rendering, and duplicate raw JSON previews all happen on the main render path. The app needs bounded previews plus background computation, not just faster conversion code.
- Even with worker-backed projection, a large JSON editor still freezes if every keystroke is allowed to propagate into projection or restore the heavy workbench. The main app needs a staged draft with explicit apply points, while the buffered editor is only useful as a diagnostic control.
- The deeper freeze path was app-structure, not text input. Remounting or restoring the heavy preview workbench during custom-payload rebuilds created the main-thread stall; keeping the editor mounted while the workbench stays suspended until projection settles is the correct fix shape.
- That same freeze class can recur on source-mode swaps if they are treated as ordinary button clicks. Switching between sample and custom sources needs the same guarded workbench transition model as explicit custom applies.
- Any control that swaps the projection surface is part of the same risk class. `Reset defaults`, `Load active sample`, file import, preset load, and source switching all need to collapse the workbench first or they can reproduce the same synchronous stall through a different entry point.
- Fail-fast browser diagnostics need to be emitted before risky work starts. A queued/applying/projection event stream is materially more useful than relying on a blocked DevTools session after the browser has already hung.
- Keyed object maps are a distinct workflow class, not an edge case. NOAA-style payloads use object keys as row identifiers, so professional-grade root-path detection needs to recognize `$.data.*`-style maps and surface the synthetic key as a first-class header instead of flattening each key into a separate namespace.
- The engine already supported `headerAliases` and `headerWhitelist`, but without an editor the feature was effectively hidden. Professional-grade mapping requires those schema controls to be visible, ordered, and persistent.
- The first relational split milestone has to stay on the worker-backed projection path. If normalization runs as a separate main-thread pass, the UI regresses under the same larger payloads that motivated the buffered editor and bounded previews.
- Worker progress needs throttling at the reporting layer. Emitting one browser message per processed root entity would become its own scalability problem on larger batches.
- Progress alone is not enough for perceived responsiveness. The flat preview needs separately streamed partial rows and counts, otherwise the user still waits on a blank result until the full projection completes.
- The current streaming milestone improves projection and preview materialization over already-parsed root nodes, but JSON parsing is still fully in-memory before any stream chunks can be emitted.
- Replacing `JSON.parse` with token-aware selector streaming is a pragmatic middle step. It materially improves common custom workflows such as `$.records[*]`, `$.groups[*].records[*]`, and `$.groups[0].records[0]` without forcing a full general-purpose streaming parser rewrite up front.
- Sharing the same JSONPath tokenizer between the projection engine and the incremental parser matters. Otherwise streamed custom selectors drift away from the semantics used by the final converter.
- Flat path cards do not scale for mapping workflows. Users need a branch-oriented tree to understand what they are excluding, stringifying, or earmarking for relational export.
- Recommendations alone are not enough for workflow control. Users also need a real whitelist mechanism that can constrain projection to the selected subtrees instead of merely annotating branches.

## What is implemented

### Engine capabilities

- Root selection with a minimal JSONPath-style selector:
  - Supported forms: `$`, `$.foo.bar`, `$.items[*]`, `$.items[0]`
- Array flattening modes:
  - `parallel`
  - `cross_product`
  - `stringify`
  - `strict_leaf` currently behaves as "stringify arrays unless explicitly overridden"
- Path-specific overrides:
  - `pathModes` as exact-path flatten overrides
  - `stringifyPaths` as subtree stringify rules
  - `dropPaths` as subtree exclusion rules
- Header policies:
  - `full_scan`
  - `sampled_scan`
  - `explicit`
- Collision handling:
  - deterministic rename via `strictNaming`
- Formatting controls:
  - delimiter
  - quote-all
  - boolean rendering
  - simple ISO date normalization to `YYYY-MM-DD`
- Non-row-expanding arrays:
  - explicit `stringifyPaths` still force JSON-string output
  - `stringify` mode now keeps arrays in the same row
  - `arrayIndexSuffix` pivots those arrays into indexed columns such as `tags[0]` or `items[0].sku`
- Placeholder handling:
  - `repeat`
  - `empty`
  - `custom`
- Structural provenance:
  - per-row lineage metadata
  - exact owner-aware placeholder blanking
  - regroup key emission from observed row lineage
- Type mismatch handling:
  - `coerce`
  - `split`
- Type drift reporting:
  - per-column observed type distribution
  - dominant kind detection
  - coercion-to-string summaries when mixed types stay in one CSV column
- Sidecar schema output with:
  - header
  - source path
  - detected kinds
  - nullable flag
- Batch schema evolution:
  - master-header snapshots with deterministic versions
  - strict mode that fails files introducing unseen output headers
  - lax mode that appends new headers in discovery order
  - header reservation to keep collision repair stable across files
- Relational split export model:
  - normalized `root` and child tables derived from repeating array branches
  - deterministic synthetic primary keys such as `root_id` and `topping_id`
  - parent foreign keys such as `parent_root_id` and `parent_lineItems_id`
  - scalar child arrays emitted as `value` tables instead of being forced into bloated flat rows
  - explicit header aliases and explicit-mode inclusion applied per table while preserving link columns

### UI capabilities

- Sample-driven playground using local samples in [src/lib/mapping-samples.ts](/Users/mac/work/json2csv/src/lib/mapping-samples.ts)
- Custom JSON mode with:
  - paste support
  - `.json` upload
  - formatting action
  - local preset persistence for saved custom payloads
- Live config form using React Hook Form + Zod
- Structured path planner for per-path mode, stringify, and drop rules
- Tree-based workflow browser for nested discovered paths with branch-level drop, stringify, and mode actions
- Branch-level include actions that whitelist subtrees across both flat projection and relational preview
- Discovered path suggestions driven by live input inspection under the selected root path
- Split-candidate badges for repeating array branches so one-to-many paths are visible before users commit to a bloated flat export
- Config toggle for indexed pivot columns when arrays should stay in the current row
- Header mapping editor for source-path selection, explicit inclusion, and export-header renaming
- Sortable preview table using TanStack Table
- Relational split preview with selectable linked tables, relationship badges, and bounded per-table CSV previews
- CSV output panel
- Output export actions for full flat CSV download, selected relational-table CSV download, and bundled relational ZIP download
- Bounded CSV preview instead of rendering arbitrarily large text blobs inline
- Sidecar schema panel
- Sidecar regroup keys derived from structural provenance
- Sidecar type drift report for mixed columns
- Compact custom-source summary instead of duplicating the full custom payload in a second textarea
- Staged custom JSON textarea in the main app with explicit apply before rebuilding the projection workbench
- Buffered custom JSON editor retained in diagnostics so input-widget behavior can still be isolated from the main app structure
- Guarded source-mode switching so sample/custom swaps keep the workbench collapsed until the next projection lifecycle settles
- Bounded sample-source preview
- Dexie-backed saved presets
- Background preview refresh indicator while a worker recomputes the projection
- Streamed flat preview state in the flat table and CSV panels while the worker is still projecting
- Root-path guidance in custom mode showing when incremental selector parsing is active for the current JSONPath subset
- Smart-detect action for keyed object maps that can prefill `$.data.*`-style roots and rename the synthetic `__entryKey` header before export
- Auto-smart root correction for keyed object maps when imported JSON or an applied custom draft still points at `$` or another root that no longer matches the payload

### Planner capabilities

- Saved presets round-trip structured planner rules through the existing mapping config shape
- The engine exposes live path inspection for current input/root-path combinations in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts)
- Saved presets now round-trip planner-driven `includePaths` alongside mode, stringify, and drop rules
- Planner suggestions distinguish paths that can:
  - override flatten mode
  - be stringified
  - be dropped

### Header capabilities

- Saved presets now round-trip `headerWhitelist` and `headerAliases` through the UI
- Header aliases can be applied without forcing explicit mode
- Explicit mode now uses enabled header-mapper rows as the ordered export whitelist
- Header suggestions merge current schema columns with discovered source paths under the active root

### Provenance capabilities

- Every projected row now carries lineage metadata for the structural branches that produced it
- Placeholder strategies compare per-cell structural owners against the previous row instead of blanking all repeatable fields heuristically
- The sidecar schema now emits regroup keys relative to the selected root path so downstream consumers can reason about row identity

### Pivot capabilities

- Global `stringify` mode no longer row-expands arrays by accident; it keeps them in the current row
- Path-specific `mode: stringify` rules can pivot arrays of scalars or objects into indexed columns
- Explicit `stringifyPaths` rules still win over pivoting and emit raw JSON strings instead

### Performance capabilities

- Background parse / inspect / project pipeline for live previews
- Dedicated worker bundle for browser projection work
- Deterministic main-thread fallback used by tests and non-worker environments
- Chunked progress updates across parse, path inspection, flat projection, and relational normalization phases
- Incremental flat-preview chunks from the worker so row counts, headers, preview rows, and CSV text update before the final result message lands
- Incremental custom selector parsing for the app's current JSONPath subset, allowing the worker to feed flat-preview roots before building the full in-memory document object
- Object-wildcard selector streaming for paths such as `$.data.*`, emitting synthetic keyed row roots without first flattening each object key into separate columns
- Auto-suggested keyed-map root correction on import and apply, so stale or overly broad custom roots do not leave NOAA-style payloads in an unreadable top-level flatten
- App-owned staged custom draft so typed payloads stay local until explicit apply, while the buffered editor still supports pause-based commits for isolated diagnostics
- Source-mode transitions deferred past the click event and held behind a pending-workbench state until the next projection cycle actually starts and finishes
- Guarded workbench transitions for reset, load-sample, import, preset load, source switching, and committed custom rebuilds, staged through `requestAnimationFrame` plus `setTimeout` so the heavy workbench collapses before risky state applies
- Fail-fast transition diagnostics with a watchdog timeout, visible DOM copy, global window state, and browser events for `queued`, `applying`, `projecting`, `settled`, and `timed-out` phases
- Pre-transition `Intent armed` audit entries plus reload recovery when a hang lands before the guarded transition can publish its own phase
- Localized row-preview filter state so filter keystrokes no longer rerender the entire converter shell
- Removed network font loading and width-based progress animation from the startup path to reduce visible flicker and compositing work
- Row preview limits so TanStack Table only renders a bounded slice
- Text preview limits for CSV and source payload cards

### Test coverage

- App integration coverage in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
  - default sample rendering
  - custom upload flow
  - invalid custom JSON state
  - staged custom JSON apply flow
  - custom typing remains staged even after blur until explicit apply
  - rapid `Custom JSON -> Sample catalog` source switching stays responsive
  - dirty custom drafts survive leaving and re-entering custom mode
  - `Load active sample` and `Reset defaults` keep the workbench collapsed during the guarded transition instead of restoring the heavy preview surface too early
  - `?debug=hangs` publishes transition diagnostics onto `window.__json2csvWorkbenchTransition`
  - `?debug=hangs` now records pre-transition `Intent armed` breadcrumbs and recovers unresolved intent after reload
  - row-preview filtering still narrows the visible table after the filter state was localized out of the top-level app shell
  - importing a keyed-object JSON file auto-applies the smarter `$.data.*` transform instead of leaving the payload at a noisy top-level root
  - smart-detect applies `$.data.*`-style keyed-map suggestions and renames the synthetic entry-key header in the live preview
  - smart-detect also preserves complex multi-collection roots by keeping `$` and switching flatten mode to `stringify`
  - applying a keyed-object custom draft at a broad root auto-corrects the transform and preview headers
  - discovered-path planner interaction updates the live projection
  - explicit header mapping and renaming updates the preview
  - regroup keys are rendered in the sidecar schema card
  - indexed pivot columns can be enabled through the config form
  - flat CSV download, selected relational-table download, and bundled relational ZIP download trigger the correct full-output artifacts
- Output export helper coverage in [src/lib/output-export.test.ts](/Users/mac/work/json2csv/src/lib/output-export.test.ts)
  - flat CSV, relational table CSV, and ZIP bundle artifact generation
  - manifest contents for bundled relational exports
  - invalid custom JSON rejection before export generation
- Smart config helper coverage in [src/lib/smart-config.test.ts](/Users/mac/work/json2csv/src/lib/smart-config.test.ts)
  - keyed object-map detection for NOAA-style payloads
  - rejection of ordinary nested objects that are not row maps
- Buffered editor unit coverage in [src/components/buffered-json-editor.test.tsx](/Users/mac/work/json2csv/src/components/buffered-json-editor.test.tsx)
  - debounced single-character typing
  - optional blur-only staging when pause commits are disabled
  - bulk insert buffering until manual flush
  - single-character flush on blur when using the buffered probe behavior
- Header mapper helper coverage in [src/lib/header-mapper.test.ts](/Users/mac/work/json2csv/src/lib/header-mapper.test.ts)
  - alias and whitelist serialization
  - explicit-order reconstruction from saved config
- Incremental JSON selector streaming coverage in [src/lib/json-root-stream.test.ts](/Users/mac/work/json2csv/src/lib/json-root-stream.test.ts)
  - streamable-selector detection for nested wildcard and index paths
  - per-root extraction for nested wildcard selector paths
  - indexed selector extraction inside nested arrays
  - object-wildcard extraction for keyed maps such as `$.data.*`
  - parser error handling for malformed JSON
- JSON input helper coverage in [src/lib/json-input.test.ts](/Users/mac/work/json2csv/src/lib/json-input.test.ts)
- Relational split library coverage in [src/lib/relational-split.test.ts](/Users/mac/work/json2csv/src/lib/relational-split.test.ts)
  - donut sample normalization into `root`, `batters_batter`, and `topping`
  - scalar child arrays emitted as `value` tables
  - deeper child-of-child arrays linked to their immediate parent table
  - alias and explicit-inclusion handling per relational table
- Projection pipeline coverage in [src/lib/projection.test.ts](/Users/mac/work/json2csv/src/lib/projection.test.ts)
  - relational split payload generation for valid inputs
  - relational split suppression for invalid custom JSON
  - staged projection progress callbacks across parse, inspect, flat, and relational phases
  - streamed flat-preview snapshots emitted before the final projection payload
  - custom selector paths including nested wildcard branches using incremental parsing before final projection materialization
- Projection hook coverage in [src/hooks/use-projection-preview.test.tsx](/Users/mac/work/json2csv/src/hooks/use-projection-preview.test.tsx)
  - worker progress updates are surfaced before the final result is committed
  - progress state clears once the completed payload is received
  - streamed flat-preview state is exposed before the final payload and cleared once the final result arrives
- Preview helper coverage in [src/lib/preview.test.ts](/Users/mac/work/json2csv/src/lib/preview.test.ts)
- Planner helper coverage in [src/lib/path-planner.test.ts](/Users/mac/work/json2csv/src/lib/path-planner.test.ts)
- Planner helper coverage in [src/lib/path-planner.test.ts](/Users/mac/work/json2csv/src/lib/path-planner.test.ts)
  - include-path serialization and preset reconstruction
  - nested tree construction from discovered paths
  - exact-path rule state reflected on tree nodes
  - split-candidate recommendation heuristics for repeating arrays
- Path planner component coverage in [src/components/path-planner.test.tsx](/Users/mac/work/json2csv/src/components/path-planner.test.tsx)
  - nested workflow-tree rendering
  - branch-level stringify, include, and keep/drop actions
- Engine include-path coverage in [src/lib/mapping-engine.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.test.ts)
  - subtree whitelisting while still traversing ancestors needed to reach included descendants
- Relational include-path coverage in [src/lib/relational-split.test.ts](/Users/mac/work/json2csv/src/lib/relational-split.test.ts)
  - relational table emission narrowed to explicitly included branches
- Deep engine matrix coverage in [src/lib/mapping-engine.matrix.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.matrix.test.ts)
  - deep nested arrays under `strict_leaf`
  - explicit deep-path expansion overrides
  - longest-match path override precedence
  - `stringifyPaths` precedence over row-expanding path modes
- Batch schema workflow coverage in [src/lib/schema-batch.test.ts](/Users/mac/work/json2csv/src/lib/schema-batch.test.ts)
  - lax master-header growth
  - strict schema drift failure
  - stable collision handling across files under a shared snapshot
- Engine coverage expanded with:
  - explicit header whitelist behavior
  - explicit whitelist order preservation
  - empty array behavior
  - owner-aware placeholder blanking
  - per-row lineage metadata
  - regroup key emission for repeated branches
  - indexed pivot columns for non-row-expanding arrays
  - distinction between `pathModes.stringify` pivoting and `stringifyPaths` JSON-string output
  - per-column type statistics and coercion summaries
- App integration coverage now also checks mixed-column reporting in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage now also checks compact custom-source rendering in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage now also checks relational table switching and linked CSV preview updates in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage now also checks streamed progress copy and partial flat-preview rendering in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage now also checks the incremental-selector hint and nested wildcard custom paths in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage continues to verify planner-driven live projection updates in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx), now against the workflow-tree actions
- App integration coverage now also checks include-based live projection narrowing in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- Live projection payloads are now compacted before they cross from the worker into the UI, so large custom JSON previews no longer clone full flat CSV output, full row sets, and full relational tables back onto the main thread. The preview contract is now explicitly bounded in [src/lib/projection.ts](/Users/mac/work/json2csv/src/lib/projection.ts) and consumed in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx)
- The custom editor no longer mirrors raw JSON into watched React Hook Form state, so switching modes, loading samples into the editor, and saving presets do not drag the full payload through form-level subscriptions in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx)
- The main app custom editor now requires an explicit apply action instead of auto-applying on blur, so clicking around the custom-input workflow no longer forces an immediate large reparse just because focus moved in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx). The buffered editor behavior is now confined to diagnostics in [src/components/buffered-json-editor.tsx](/Users/mac/work/json2csv/src/components/buffered-json-editor.tsx)
- Source-mode transitions now use the same suspended-workbench safety model as custom applies, so switching between `sample` and `custom` no longer reintroduces the heavy remount path in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx)
- Projection coverage now includes empty-string custom input, `null` root payloads, and bounded flat/relational preview payload behavior in [src/lib/projection.test.ts](/Users/mac/work/json2csv/src/lib/projection.test.ts)
- App integration coverage now also checks malformed custom JSON, `Load active sample`, custom-mode saving, and `null` custom input flows in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
- App integration coverage now also checks persistent hang-audit publishing and recovery of an unresolved prior transition in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm build`

All passed at the end of this work.

The Vite build still emits the existing chunk-size warning for the main bundle.

## Known gaps

- The JSONPath support is intentionally narrow. It does not support filters, recursive descent, unions, or advanced selectors.
- `strict_leaf` is currently implemented as a conservative array-stringify policy, not a complete leaf-only planner.
- Header mapping is now list-based, but there is still no drag-to-reorder flow, tree browser, or bulk rename/import workflow.
- The workflow tree currently supports branch-level blacklist actions and split recommendations, but it is still not a full whitelist planner or a persisted relational-split policy editor.
- The workflow tree now supports subtree whitelisting, but the planner still only stores one action per exact path. A path cannot yet be both explicitly included and explicitly stringified or mode-overridden at the same exact node.
- The relational split view is still preview-only. There is no ZIP packaging or download flow for the linked CSV tables yet.
- Incremental parsing now covers the app's current selector subset of property, wildcard, and numeric-index steps, but it still does not support filters, recursive descent, unions, or full JSONPath semantics.
- Custom JSON text is still staged in-memory on the client, and uploaded files still use `file.text()`. There is no browser file-stream ingestion path yet.
- The live preview no longer sends full CSV text or full row sets back across the worker boundary, but the worker still materializes the full flat and relational results in memory before compacting them. There is still no out-of-core CSV writer or streaming relational export.
- The new schema snapshot workflow is library-level only. There is still no batch conversion UI or persisted snapshot management flow in the app.
- Relational split currently normalizes every repeating branch that is not explicitly stringified or dropped. There is no heuristic recommender or tree UI yet for choosing which branches should become secondary tables.

## Recommended next steps

1. Connect the broader selector parser to chunked browser file ingestion, so uploaded large files do not require `file.text()` before preview can begin.
2. Persist explicit relational-split decisions in the workflow tree so split recommendations become actual export policy instead of advisory labels only.
3. Decide whether regroup metadata should also be exportable as a sidecar file instead of only appearing in the in-app schema panel.
4. Add drag-sort and bulk-edit controls on top of the header mapper so explicit schemas are practical at larger column counts.

## Professional-Grade Roadmap

This app is now beyond the “toy converter” stage, but becoming a professional-grade utility requires more workflow and post-conversion tooling around the core projection engine.

### Schema inference and evolution

- Versioned master-header snapshots across batches of files
- Strict schema mode that fails on unseen keys after the initial scan
- Lax schema mode that appends newly discovered columns during batch processing
- Type statistics and coercion summaries per column after conversion

### Advanced relational mapping

- Relational split export that writes multiple linked CSVs instead of one bloated flat table
- Auto-generated parent and foreign keys for nested child tables
- Heuristics that detect one-to-many branches and recommend splitting them into secondary tables

### Visual mapping and interaction

- Tree-based path blacklist and whitelist controls
- Drag-sort column ordering and bulk rename workflows on top of the new header mapper
- Focused preview modes for the first few rows so users can compare `parallel`, `cross_product`, and normalized layouts safely

### Data cleaning and transformation

- Formula columns derived from projected fields
- Lookup-table replacement for IDs and coded values
- Conditional row filtering during export
- De-duplication based on user-specified keys

### Performance and large-data handling

- Chunked streaming for payloads larger than memory
- Direct `.json.gz` input and `.csv.gz` output support
- Cloud-native sources and sinks such as S3 or API streams

### Output specialization

- CSV dialect presets for Excel, Google Sheets, PostgreSQL `COPY`, and Pandas workflows
- UTF-8 BOM control for Excel compatibility
