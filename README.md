# json2csv

`json2csv` is a React workspace for turning nested JSON into a flat CSV with a live preview.

## Current scope

- sample or custom JSON input
- root-path selection
- flat mapping controls
- bounded flat-row preview
- bounded CSV preview and full CSV download
- memory-safe live preview that caps very large inputs to a fixed root budget
- schema sidecar for column and type inspection
- worker-backed projection with streaming flat preview updates

## Removed on purpose

These features were cut to keep the product easier to maintain:

- saved presets and browser persistence
- command palette and extra shell navigation state
- path planner and header-mapping editors
- relational split preview and export
- mobile slide-over rails and inspector drawers

## Commands

- `vp dev`
- `vp test`
- `vp check`
- `vp build`
- `vp run preview`
- `vp run deploy`

## Project structure

- `src/App.tsx`: main UI and form flow
- `src/components/workbench/dense-data-grid.tsx`: flat-row table
- `src/hooks/use-projection-preview.ts`: worker bridge for live preview
- `src/hooks/use-output-export.ts`: export workflow state
- `src/lib/mapping-engine.ts`: JSON-to-row conversion engine
- `src/lib/projection.ts`: preview payload shaping and streaming contracts
- `src/lib/output-export.ts`: export artifact generation

## Maintenance rules

- Keep state local unless it is reused across files.
- Prefer deleting optional UI over adding another mode or abstraction.
- Keep the product flat: one workspace, one export path, one mental model.
- Update docs when features are removed so the repo stays trustworthy.
- Use `vp` for installs, tests, builds, and custom scripts.
