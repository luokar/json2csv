/**
 * Workbench-wide UI thresholds and limits used by App.tsx.
 *
 * Pipeline-engine limits (preview row caps, root budget, etc.) live in
 * `src/lib/projection.ts`. This file only collects values that gate UI
 * presentation in the App shell.
 */

export const exportNameMinLength = 3;
export const exportNameMaxLength = 80;

/** Beyond this many roots, treat the dataset as "complex" for preview decisions. */
export const complexRootPathThreshold = 2_500;
/** Beyond this many columns, treat the dataset as "complex" for preview decisions. */
export const complexRootColumnThreshold = 400;
/** Suspend live-preview when a single object root exceeds this character count. */
export const largeObjectRootPreviewSuspendCharacterThreshold = 500_000;

/** Maximum characters of source JSON to render in the sidebar source preview. */
export const sampleSourcePreviewCharacterLimit = 12_000;
/** Maximum schema columns rendered in the schema panel preview. */
export const schemaColumnPreviewLimit = 120;
/** Maximum type-report rows rendered in the schema panel preview. */
export const schemaTypeReportPreviewLimit = 40;
/** Maximum data columns rendered in the table preview. */
export const tableColumnPreviewLimit = 80;
