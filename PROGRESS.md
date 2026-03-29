# Progress

## Current state

- The app is now a simplified flat JSON-to-CSV workspace.
- The main product flow is: choose input, set root path, tune flat mapping, inspect preview, download CSV.
- Live projection still runs through the worker-backed preview pipeline.
- The UI shell was flattened so the app no longer depends on a command palette, slide-over rails, or a global workbench store.

## What remains in scope

- live sample and custom JSON input
- smart root detection
- streaming flat preview
- flat-row grid
- CSV export
- schema sidecar

## What was intentionally removed

- saved presets and local persistence
- path planner and branch-level mapping UI
- header mapping editor
- relational split preview and export
- command palette
- complex-root gating panel
- shell-only open/close state managed outside the main form

## File ownership snapshot

- `src/App.tsx`: single-page workspace and inspector
- `src/components/workbench/dense-data-grid.tsx`: table interactions and column controls
- `src/hooks/use-projection-preview.ts`: worker orchestration for preview updates
- `src/lib/mapping-engine.ts`: conversion logic
- `src/lib/projection.ts`: preview payload shaping and streaming
- `src/lib/output-export.ts`: export artifacts

## Simplification rules for future changes

- Do not add a new layer unless duplication is worse than the new layer.
- Prefer removing optional behaviors before introducing configuration for them.
- Keep documentation aligned with shipped behavior.
- Keep the product centered on flat CSV export unless a new scope is explicitly approved.
