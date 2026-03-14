# Progress

## Current status

- The Vite / React / TypeScript project setup is complete and verified.
- A first-pass smart JSON-to-CSV mapping engine is implemented in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts).
- The app is now an interactive converter playground in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Converter presets are persisted with Dexie in [src/lib/db.ts](/Users/mac/work/json2csv/src/lib/db.ts).
- Engine coverage lives in [src/lib/mapping-engine.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.test.ts).
- Real JSON input is supported through paste and `.json` upload, with helper logic in [src/lib/json-input.ts](/Users/mac/work/json2csv/src/lib/json-input.ts).
- The roadmap milestone for a structured per-path planner is now implemented with UI in [src/components/path-planner.tsx](/Users/mac/work/json2csv/src/components/path-planner.tsx) and helper logic in [src/lib/path-planner.ts](/Users/mac/work/json2csv/src/lib/path-planner.ts).

## Important findings

- `DATASET.md` confirms the core ambiguity problem is not simple flattening. Example 9 and Example 10 are the key relational cases:
  - Example 9 expands one repeating child path.
  - Example 10 explicitly produces `m * n` rows when two repeating child paths are selected.
- That means the engine must treat arrays as row-expansion boundaries with explicit policies, not as generic nested values.
- `parallel` cannot be modeled as repeated cross-products. It must zip against shared parent context, otherwise sibling arrays multiply incorrectly.
- A full header scan is required for heterogeneous objects if the output schema must stay stable.
- Key collision repair must be deterministic because separators like `_` collapse flat and nested names into the same header space.

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
  - `pathModes`
  - `stringifyPaths`
  - `dropPaths`
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
- Placeholder handling:
  - `repeat`
  - `empty`
  - `custom`
- Type mismatch handling:
  - `coerce`
  - `split`
- Sidecar schema output with:
  - header
  - source path
  - detected kinds
  - nullable flag

### UI capabilities

- Sample-driven playground using local samples in [src/lib/mapping-samples.ts](/Users/mac/work/json2csv/src/lib/mapping-samples.ts)
- Custom JSON mode with:
  - paste support
  - `.json` upload
  - formatting action
  - local preset persistence for saved custom payloads
- Live config form using React Hook Form + Zod
- Structured path planner for per-path mode, stringify, and drop rules
- Discovered path suggestions driven by live input inspection under the selected root path
- Sortable preview table using TanStack Table
- CSV output panel
- Sidecar schema panel
- Source JSON panel
- Dexie-backed saved presets

### Planner capabilities

- Saved presets round-trip structured planner rules through the existing mapping config shape
- The engine exposes live path inspection for current input/root-path combinations in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts)
- Planner suggestions distinguish paths that can:
  - override flatten mode
  - be stringified
  - be dropped

### Test coverage

- App integration coverage in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
  - default sample rendering
  - custom upload flow
  - invalid custom JSON state
  - discovered-path planner interaction updates the live projection
- JSON input helper coverage in [src/lib/json-input.test.ts](/Users/mac/work/json2csv/src/lib/json-input.test.ts)
- Planner helper coverage in [src/lib/path-planner.test.ts](/Users/mac/work/json2csv/src/lib/path-planner.test.ts)
- Engine coverage expanded with:
  - explicit header whitelist behavior
  - empty array behavior

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm build`

All passed at the end of this work.

The Vite build still emits the existing chunk-size warning for the main bundle.

## Known gaps

- `arrayIndexSuffix` is exposed in config storage/UI, but it is not yet meaningfully applied during projection.
- The JSONPath support is intentionally narrow. It does not support filters, recursive descent, unions, or advanced selectors.
- Placeholder behavior is practical but not fully provenance-aware. It blanks repeatable context fields after row expansion, but it is not yet a formal parent/child lineage model.
- `strict_leaf` is currently implemented as a conservative array-stringify policy, not a complete leaf-only planner.
- Header `explicit` mode assumes header names or source paths are provided directly. There is still no rich whitelist editor yet.
- There is no streaming parser yet. Large-file support is still an open problem.
- No `primary_key` regrouping metadata is emitted yet for recursive explosions.
- No pivot-to-columns feature exists yet.
- Uploaded and pasted JSON are handled in-memory on the client. There is no worker split, incremental parsing, or file-size guardrail yet.

## Recommended next steps

1. Track structural provenance during projection so placeholder behavior and regrouping metadata become exact instead of heuristic.
2. Implement `arrayIndexSuffix` and pivot-to-columns for non-row-expanding arrays.
3. Add a larger test matrix for deep nested arrays, strict-leaf edge cases, and path-specific override interactions.
4. Decide whether this app should stay browser-only or add a worker/streaming path for large payloads.
5. Consider a dedicated explicit-header editor so whitelist mode is as usable as the new path planner.
