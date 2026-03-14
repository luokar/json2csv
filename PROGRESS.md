# Progress

## Current status

- The Vite / React / TypeScript project setup is complete and verified.
- A first-pass smart JSON-to-CSV mapping engine is implemented in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts).
- The app is now an interactive converter playground in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Converter presets are persisted with Dexie in [src/lib/db.ts](/Users/mac/work/json2csv/src/lib/db.ts).
- Engine coverage lives in [src/lib/mapping-engine.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.test.ts).
- Real JSON input is supported through paste and `.json` upload, with helper logic in [src/lib/json-input.ts](/Users/mac/work/json2csv/src/lib/json-input.ts).
- The roadmap milestone for a structured per-path planner is now implemented with UI in [src/components/path-planner.tsx](/Users/mac/work/json2csv/src/components/path-planner.tsx) and helper logic in [src/lib/path-planner.ts](/Users/mac/work/json2csv/src/lib/path-planner.ts).
- Structural provenance is now tracked during projection in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts), and regroup keys are surfaced in the sidecar UI in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- Indexed pivot columns for non-row-expanding arrays are now implemented in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts) and exposed through the config form in [src/App.tsx](/Users/mac/work/json2csv/src/App.tsx).
- A deeper engine regression matrix now covers nested arrays, `strict_leaf`, and override precedence in [src/lib/mapping-engine.matrix.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.matrix.test.ts).

## Important findings

- `DATASET.md` confirms the core ambiguity problem is not simple flattening. Example 9 and Example 10 are the key relational cases:
  - Example 9 expands one repeating child path.
  - Example 10 explicitly produces `m * n` rows when two repeating child paths are selected.
- That means the engine must treat arrays as row-expansion boundaries with explicit policies, not as generic nested values.
- `parallel` cannot be modeled as repeated cross-products. It must zip against shared parent context, otherwise sibling arrays multiply incorrectly.
- A full header scan is required for heterogeneous objects if the output schema must stay stable.
- Key collision repair must be deterministic because separators like `_` collapse flat and nested names into the same header space.
- `pathModes` need exact-path matching. If they cascade to descendant arrays, users lose the ability to control nested arrays independently. Subtree semantics remain appropriate for `stringifyPaths` and `dropPaths`.

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
- Config toggle for indexed pivot columns when arrays should stay in the current row
- Sortable preview table using TanStack Table
- CSV output panel
- Sidecar schema panel
- Sidecar regroup keys derived from structural provenance
- Source JSON panel
- Dexie-backed saved presets

### Planner capabilities

- Saved presets round-trip structured planner rules through the existing mapping config shape
- The engine exposes live path inspection for current input/root-path combinations in [src/lib/mapping-engine.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.ts)
- Planner suggestions distinguish paths that can:
  - override flatten mode
  - be stringified
  - be dropped

### Provenance capabilities

- Every projected row now carries lineage metadata for the structural branches that produced it
- Placeholder strategies compare per-cell structural owners against the previous row instead of blanking all repeatable fields heuristically
- The sidecar schema now emits regroup keys relative to the selected root path so downstream consumers can reason about row identity

### Pivot capabilities

- Global `stringify` mode no longer row-expands arrays by accident; it keeps them in the current row
- Path-specific `mode: stringify` rules can pivot arrays of scalars or objects into indexed columns
- Explicit `stringifyPaths` rules still win over pivoting and emit raw JSON strings instead

### Test coverage

- App integration coverage in [src/App.test.tsx](/Users/mac/work/json2csv/src/App.test.tsx)
  - default sample rendering
  - custom upload flow
  - invalid custom JSON state
  - discovered-path planner interaction updates the live projection
  - regroup keys are rendered in the sidecar schema card
  - indexed pivot columns can be enabled through the config form
- JSON input helper coverage in [src/lib/json-input.test.ts](/Users/mac/work/json2csv/src/lib/json-input.test.ts)
- Planner helper coverage in [src/lib/path-planner.test.ts](/Users/mac/work/json2csv/src/lib/path-planner.test.ts)
- Deep engine matrix coverage in [src/lib/mapping-engine.matrix.test.ts](/Users/mac/work/json2csv/src/lib/mapping-engine.matrix.test.ts)
  - deep nested arrays under `strict_leaf`
  - explicit deep-path expansion overrides
  - longest-match path override precedence
  - `stringifyPaths` precedence over row-expanding path modes
- Engine coverage expanded with:
  - explicit header whitelist behavior
  - empty array behavior
  - owner-aware placeholder blanking
  - per-row lineage metadata
  - regroup key emission for repeated branches
  - indexed pivot columns for non-row-expanding arrays
  - distinction between `pathModes.stringify` pivoting and `stringifyPaths` JSON-string output

## Verification

- `pnpm lint`
- `pnpm test`
- `pnpm build`

All passed at the end of this work.

The Vite build still emits the existing chunk-size warning for the main bundle.

## Known gaps

- The JSONPath support is intentionally narrow. It does not support filters, recursive descent, unions, or advanced selectors.
- `strict_leaf` is currently implemented as a conservative array-stringify policy, not a complete leaf-only planner.
- Header `explicit` mode assumes header names or source paths are provided directly. There is still no rich whitelist editor yet.
- There is no streaming parser yet. Large-file support is still an open problem.
- Uploaded and pasted JSON are handled in-memory on the client. There is no worker split, incremental parsing, or file-size guardrail yet.

## Recommended next steps

1. Decide whether this app should stay browser-only or add a worker/streaming path for large payloads.
2. Consider a dedicated explicit-header editor so whitelist mode is as usable as the new path planner.
3. Decide whether regroup metadata should also be exportable as a separate sidecar file instead of only appearing in the in-app schema panel.
4. Decide whether pivoted columns need richer header naming controls beyond the current indexed path format.
5. Start the schema-drift workflow work so batch conversions can produce stable professional-grade outputs.

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

- Interactive header renaming before export
- Tree-based path blacklist and whitelist controls
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
