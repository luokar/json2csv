import { zodResolver } from "@hookform/resolvers/zod";
import { Database, Download, Settings2, Upload } from "lucide-react";
import { type ChangeEvent, type ReactNode, useCallback, useMemo, useState } from "react";
import { type UseFormRegisterReturn, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { bufferedJsonEditorServiceProps } from "@/components/buffered-json-editor";
import { DenseDataGrid } from "@/components/workbench/dense-data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOutputExport } from "@/hooks/use-output-export";
import { useProjectionPreview } from "@/hooks/use-projection-preview";
import { parseJsonInput, stringifyJsonInput } from "@/lib/json-input";
import { resolveStreamableJsonPath } from "@/lib/json-root-stream";
import {
  booleanRepresentations,
  type ColumnSchema,
  type ColumnTypeReport,
  collisionStrategies,
  createMappingConfig,
  dateFormats,
  defaultMappingConfig,
  emptyArrayBehaviors,
  flattenModes,
  type MappingConfig,
  missingKeyStrategies,
  objectMapEntryKeyField,
  placeholderStrategies,
  typeMismatchStrategies,
} from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import { createOutputExportRequest, downloadExportArtifact } from "@/lib/output-export";
import { createRowPreview, createTextPreview } from "@/lib/preview";
import type { ProjectionFlatStreamPreview, ProjectionProgress } from "@/lib/projection";
import {
  type ProjectionConversionResult,
  projectionFlatCsvPreviewCharacterLimit,
  projectionFlatRowPreviewLimit,
} from "@/lib/projection";
import { detectSmartConfigSuggestion, type SmartConfigSuggestion } from "@/lib/smart-config";
import { cn } from "@/lib/utils";

const delimiterOptions = [
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
] as const;

type SourceMode = "sample" | "custom";
type InspectorMode = "column" | "mapping" | "row";
type WorkbenchView = "csv" | "flat" | "schema";

interface SelectedWorkbenchColumn {
  header: string;
  view: WorkbenchView;
}

interface SelectedWorkbenchRow {
  id: string;
  label: string;
  row: Record<string, string>;
  view: WorkbenchView;
}

const sourceModeOptions: Array<{ label: string; value: SourceMode }> = [
  { value: "sample", label: "Sample catalog" },
  { value: "custom", label: "Custom JSON" },
];

const defaultRootPaths: Record<string, string> = {
  collisions: "$.rows[*]",
  donuts: "$.items.item[*]",
  heterogeneous: "$.records[*]",
};

const exportNameMinLength = 3;
const exportNameMaxLength = 80;
const complexRootPathThreshold = 2_500;
const complexRootColumnThreshold = 400;
const largeObjectRootPreviewSuspendCharacterThreshold = 500_000;
const sampleSourcePreviewCharacterLimit = 12_000;
const schemaColumnPreviewLimit = 120;
const schemaTypeReportPreviewLimit = 40;
const tableColumnPreviewLimit = 80;
const emptyPreviewHeaders: string[] = [];
const emptyPreviewRecords: Array<Record<string, string>> = [];
const controlSelectClassName =
  "flex h-9 w-full rounded-[calc(var(--radius)-2px)] border border-input bg-background/88 px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

const converterFormSchema = z.object({
  exportName: z
    .string()
    .trim()
    .min(exportNameMinLength, "Export name must be at least 3 characters.")
    .max(exportNameMaxLength, `Export name must stay under ${exportNameMaxLength} characters.`),
  sourceMode: z.enum(["sample", "custom"]),
  sampleId: z.string().trim().min(1),
  customJson: z.string(),
  rootPath: z.string().trim().min(1, "Root path is required."),
  flattenMode: z.enum(flattenModes),
  pathSeparator: z
    .string()
    .trim()
    .min(1, "Path separator is required.")
    .max(3, "Path separator is too long."),
  arrayIndexSuffix: z.boolean(),
  placeholderStrategy: z.enum(placeholderStrategies),
  customPlaceholder: z.string().trim(),
  onMissingKey: z.enum(missingKeyStrategies),
  onTypeMismatch: z.enum(typeMismatchStrategies),
  collisionStrategy: z.enum(collisionStrategies),
  strictNaming: z.boolean(),
  booleanRepresentation: z.enum(booleanRepresentations),
  dateFormat: z.enum(dateFormats),
  delimiter: z.enum([",", ";", "\t"]),
  quoteAll: z.boolean(),
  emptyArrayBehavior: z.enum(emptyArrayBehaviors),
  maxDepth: z.number().int().min(1).max(32),
});

type ConverterFormValues = z.infer<typeof converterFormSchema>;

interface SmartDetectFeedback {
  detail: string;
  previewHeaders: string[];
  tone: "error" | "info" | "success";
}

const defaultFormValues: ConverterFormValues = {
  exportName: "Donut CSV export",
  sourceMode: "sample",
  sampleId: "donuts",
  customJson: "",
  rootPath: defaultRootPaths.donuts,
  flattenMode: defaultMappingConfig.flattenMode,
  pathSeparator: defaultMappingConfig.pathSeparator,
  arrayIndexSuffix: defaultMappingConfig.arrayIndexSuffix,
  placeholderStrategy: defaultMappingConfig.placeholderStrategy,
  customPlaceholder: defaultMappingConfig.customPlaceholder ?? "NULL",
  onMissingKey: defaultMappingConfig.onMissingKey,
  onTypeMismatch: defaultMappingConfig.onTypeMismatch,
  collisionStrategy: defaultMappingConfig.collisionStrategy,
  strictNaming: defaultMappingConfig.strictNaming,
  booleanRepresentation: defaultMappingConfig.booleanRepresentation,
  dateFormat: defaultMappingConfig.dateFormat,
  delimiter: defaultMappingConfig.delimiter as ConverterFormValues["delimiter"],
  quoteAll: defaultMappingConfig.quoteAll,
  emptyArrayBehavior: defaultMappingConfig.emptyArrayBehavior,
  maxDepth: defaultMappingConfig.maxDepth,
};

const watchedFieldNames = [
  "exportName",
  "sourceMode",
  "sampleId",
  "customJson",
  "rootPath",
  "flattenMode",
  "pathSeparator",
  "arrayIndexSuffix",
  "placeholderStrategy",
  "customPlaceholder",
  "onMissingKey",
  "onTypeMismatch",
  "collisionStrategy",
  "strictNaming",
  "booleanRepresentation",
  "dateFormat",
  "delimiter",
  "quoteAll",
  "emptyArrayBehavior",
  "maxDepth",
] as const satisfies ReadonlyArray<keyof ConverterFormValues>;

function App() {
  const [activeView, setActiveView] = useState<WorkbenchView>("flat");
  const [selectedColumn, setSelectedColumn] = useState<SelectedWorkbenchColumn | null>(null);
  const [selectedRow, setSelectedRow] = useState<SelectedWorkbenchRow | null>(null);
  const [entryKeyAlias, setEntryKeyAlias] = useState<string | null>(null);
  const [smartDetectFeedback, setSmartDetectFeedback] = useState<SmartDetectFeedback | null>(null);
  const inspectorMode: InspectorMode = selectedRow ? "row" : selectedColumn ? "column" : "mapping";

  const form = useForm<ConverterFormValues>({
    resolver: zodResolver(converterFormSchema),
    defaultValues: defaultFormValues,
  });
  const {
    activeLabel: outputExportLabel,
    error: outputExportError,
    isExporting: isOutputExporting,
    runExport,
  } = useOutputExport();

  const watchedValues = useWatch({
    control: form.control,
    name: watchedFieldNames,
  });
  const [
    exportName = defaultFormValues.exportName,
    sourceMode = defaultFormValues.sourceMode,
    sampleId = defaultFormValues.sampleId,
    customJson = defaultFormValues.customJson,
    rootPath = defaultFormValues.rootPath,
    flattenMode = defaultFormValues.flattenMode,
    pathSeparator = defaultFormValues.pathSeparator,
    arrayIndexSuffix = defaultFormValues.arrayIndexSuffix,
    placeholderStrategy = defaultFormValues.placeholderStrategy,
    customPlaceholder = defaultFormValues.customPlaceholder,
    onMissingKey = defaultFormValues.onMissingKey,
    onTypeMismatch = defaultFormValues.onTypeMismatch,
    collisionStrategy = defaultFormValues.collisionStrategy,
    strictNaming = defaultFormValues.strictNaming,
    booleanRepresentation = defaultFormValues.booleanRepresentation,
    dateFormat = defaultFormValues.dateFormat,
    delimiter = defaultFormValues.delimiter,
    quoteAll = defaultFormValues.quoteAll,
    emptyArrayBehavior = defaultFormValues.emptyArrayBehavior,
    maxDepth = defaultFormValues.maxDepth,
  ] = watchedValues;
  const liveValues: ConverterFormValues = {
    arrayIndexSuffix,
    booleanRepresentation,
    collisionStrategy,
    customJson,
    customPlaceholder,
    dateFormat,
    delimiter,
    emptyArrayBehavior,
    flattenMode,
    exportName,
    maxDepth,
    onMissingKey,
    onTypeMismatch,
    pathSeparator,
    placeholderStrategy,
    quoteAll,
    rootPath,
    sampleId,
    sourceMode,
    strictNaming,
  };
  const activeSample = getSampleById(liveValues.sampleId);
  const streamableCustomSelector =
    liveValues.sourceMode === "custom" ? resolveStreamableJsonPath(liveValues.rootPath) : null;
  const parsedValues = converterFormSchema.safeParse(liveValues);
  const activeConfig = parsedValues.success
    ? toMappingConfig(parsedValues.data, entryKeyAlias)
    : undefined;
  const previewSuspendedReason = useMemo(
    () =>
      describeLargeObjectRootPreviewSuspension(
        liveValues.sourceMode,
        liveValues.rootPath,
        liveValues.customJson,
      ),
    [liveValues.customJson, liveValues.rootPath, liveValues.sourceMode],
  );
  const projection = useProjectionPreview(
    {
      config: activeConfig,
      customJson: liveValues.customJson,
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : "invalid-config",
    {
      enabled: previewSuspendedReason === null,
    },
  );
  const discoveredPaths = projection.discoveredPaths;
  const conversionResult = projection.conversionResult;
  const streamingFlatPreview = projection.streamingFlatPreview;
  const isStreamingFlatPreview = projection.isProjecting && streamingFlatPreview !== null;

  const flatHeaders =
    streamingFlatPreview?.headers ?? conversionResult?.headers ?? emptyPreviewHeaders;
  const flatRecords =
    streamingFlatPreview?.previewRecords ?? conversionResult?.records ?? emptyPreviewRecords;
  const flatRowCount = streamingFlatPreview?.rowCount ?? conversionResult?.rowCount ?? 0;
  const csvPreview = isStreamingFlatPreview
    ? (streamingFlatPreview?.csvPreview ?? {
        omittedCharacters: 0,
        text: "No CSV generated.",
        truncated: false,
      })
    : (conversionResult?.csvPreview ?? {
        omittedCharacters: 0,
        text: "No CSV generated.",
        truncated: false,
      });
  const sampleSourcePreview = useMemo(
    () =>
      liveValues.sourceMode === "sample"
        ? createTextPreview(
            stringifyJsonInput(activeSample.json),
            sampleSourcePreviewCharacterLimit,
          )
        : null,
    [activeSample.json, liveValues.sourceMode],
  );
  const outputExportBlockedReason = previewSuspendedReason
    ? previewSuspendedReason
    : activeConfig === undefined
      ? "Fix the current mapping config before exporting."
      : projection.parseError
        ? "Resolve the current JSON parse error before exporting."
        : projection.isProjecting
          ? "Wait for the current preview rebuild to finish before exporting."
          : null;
  const canExportOutputs = outputExportBlockedReason === null;
  const broadRootColumnCount = conversionResult?.schema.columns.length ?? flatHeaders.length;
  const isBroadRootWarningVisible =
    liveValues.rootPath.trim() === "$" &&
    (discoveredPaths.length >= complexRootPathThreshold ||
      broadRootColumnCount >= complexRootColumnThreshold);
  const previewLimitNotice =
    projection.previewCapped && projection.previewRootLimit
      ? describePreviewLimitNotice(projection.previewRootLimit)
      : null;
  const activeConfigDescription = activeConfig
    ? describeConfig(activeConfig)
    : "Invalid configuration";
  const initialHiddenFlatHeaders = useMemo(
    () => flatHeaders.slice(tableColumnPreviewLimit),
    [flatHeaders],
  );
  const initialHiddenFlatColumnCount = initialHiddenFlatHeaders.length;
  const flatPreviewRows = useMemo(
    () => createRowPreview(flatRecords, projectionFlatRowPreviewLimit),
    [flatRecords],
  );
  const flatPreviewRowsTruncated = isStreamingFlatPreview
    ? flatRowCount > flatRecords.length
    : flatPreviewRows.truncated ||
      (!isStreamingFlatPreview &&
        conversionResult !== null &&
        conversionResult.rowCount > conversionResult.records.length);

  function clearWorkbenchSelection() {
    setSelectedColumn(null);
    setSelectedRow(null);
  }

  async function handleFlatCsvExport() {
    if (!canExportOutputs) {
      return;
    }

    try {
      const artifact = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.exportName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        "Preparing full flat CSV export",
      );

      downloadExportArtifact(artifact);
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  function handleSampleChange(sampleId: string) {
    const sample = getSampleById(sampleId);

    clearWorkbenchSelection();
    form.setValue("sampleId", sampleId, { shouldValidate: true });
    form.setValue("rootPath", defaultRootPaths[sampleId] ?? "$", {
      shouldValidate: true,
    });
    form.setValue("exportName", normalizeExportName(`${sample?.title ?? "Sample"} export`), {
      shouldValidate: true,
    });
    setEntryKeyAlias(null);
    setSmartDetectFeedback(null);
  }

  function handleSourceModeChange(sourceMode: SourceMode) {
    if (sourceMode === liveValues.sourceMode) {
      return;
    }

    const nextRootPath =
      sourceMode === "sample" ? (defaultRootPaths[liveValues.sampleId] ?? "$") : "$";

    clearWorkbenchSelection();
    form.setValue("sourceMode", sourceMode, { shouldValidate: true });
    form.setValue("rootPath", nextRootPath, { shouldValidate: true });
    setEntryKeyAlias(null);
    setSmartDetectFeedback(null);
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const text = await file.text();
    const importedPreviewSuspendedReason = describeLargeObjectRootPreviewSuspension(
      "custom",
      "$",
      text,
    );
    const importedInput = importedPreviewSuspendedReason
      ? { error: null, value: undefined }
      : parseJsonInput(text);
    const importedSmartSuggestion =
      importedInput.value === undefined ? null : detectSmartConfigSuggestion(importedInput.value);
    event.target.value = "";

    clearWorkbenchSelection();
    form.setValue("sourceMode", "custom", { shouldValidate: true });
    form.setValue("customJson", text, { shouldValidate: true });

    if (importedSmartSuggestion) {
      applySmartSuggestion(importedSmartSuggestion, { auto: true });
    } else {
      form.setValue("rootPath", "$", { shouldValidate: true });
      setEntryKeyAlias(null);
      setSmartDetectFeedback(null);
    }

    form.setValue("exportName", normalizeExportName(`${stripFileExtension(file.name)} export`), {
      shouldValidate: true,
    });
  }

  function handleResetDefaults() {
    clearWorkbenchSelection();
    form.reset(defaultFormValues);
    setEntryKeyAlias(null);
    setSmartDetectFeedback(null);
  }

  function applySmartSuggestion(
    suggestion: SmartConfigSuggestion,
    options: {
      auto?: boolean;
    } = {},
  ) {
    form.setValue("rootPath", suggestion.rootPath, { shouldValidate: true });

    if (suggestion.flattenMode) {
      form.setValue("flattenMode", suggestion.flattenMode, {
        shouldValidate: true,
      });
    }

    setEntryKeyAlias(suggestion.kind === "keyed-map" ? suggestion.keyAlias : null);

    setSmartDetectFeedback({
      detail: options.auto
        ? `Auto-applied smart row detection. ${suggestion.summary}`
        : suggestion.summary,
      previewHeaders: suggestion.previewHeaders,
      tone: "success",
    });
  }

  function handleSmartDetect() {
    if (previewSuspendedReason) {
      setEntryKeyAlias(null);
      setSmartDetectFeedback({
        detail:
          "Smart detect is suspended for very large object-root JSON. Set a narrower row root first, then run detection again if you still need it.",
        previewHeaders: [],
        tone: "info",
      });
      return;
    }

    const resolvedInput =
      liveValues.sourceMode === "custom"
        ? parseJsonInput(liveValues.customJson)
        : { error: null, value: activeSample.json };

    if (resolvedInput.value === undefined) {
      setSmartDetectFeedback({
        detail: `Smart detect needs valid JSON before it can analyze the current payload.${resolvedInput.error ? ` ${resolvedInput.error}` : ""}`,
        previewHeaders: [],
        tone: "error",
      });
      return;
    }

    const suggestion = detectSmartConfigSuggestion(resolvedInput.value);

    if (!suggestion) {
      setEntryKeyAlias(null);
      setSmartDetectFeedback({
        detail:
          "Smart detect did not find a better row-root or preserve-completeness strategy for the current payload.",
        previewHeaders: [],
        tone: "info",
      });
      return;
    }

    applySmartSuggestion(suggestion);
  }

  const configErrors = parsedValues.success
    ? []
    : parsedValues.error.issues.map((issue) => issue.message);
  const mixedTypeReports = useMemo(
    () =>
      conversionResult?.schema.typeReports.filter((report) => report.typeBreakdown.length > 1) ??
      [],
    [conversionResult?.schema.typeReports],
  );
  const visibleMixedTypeReports = useMemo(
    () => mixedTypeReports.slice(0, schemaTypeReportPreviewLimit),
    [mixedTypeReports],
  );
  const hiddenMixedTypeReportCount = Math.max(
    0,
    mixedTypeReports.length - visibleMixedTypeReports.length,
  );
  const visibleSchemaColumns = useMemo(
    () => (conversionResult?.schema.columns ?? []).slice(0, schemaColumnPreviewLimit),
    [conversionResult?.schema.columns],
  );
  const hiddenSchemaColumnCount = Math.max(
    0,
    (conversionResult?.schema.columns.length ?? 0) - visibleSchemaColumns.length,
  );
  const selectedColumnSchema = useMemo(
    () =>
      selectedColumn
        ? (conversionResult?.schema.columns.find(
            (column) => column.header === selectedColumn.header,
          ) ?? null)
        : null,
    [conversionResult?.schema.columns, selectedColumn],
  );
  const selectedColumnTypeReport = useMemo(
    () =>
      selectedColumn
        ? (conversionResult?.schema.typeReports.find(
            (report) => report.header === selectedColumn.header,
          ) ?? null)
        : null,
    [conversionResult?.schema.typeReports, selectedColumn],
  );

  const inspectRow = useCallback(
    (row: Record<string, string>, rowId: string, view: WorkbenchView) => {
      const label = createWorkbenchRowLabel(row, rowId);

      setSelectedColumn(null);
      setSelectedRow({
        id: rowId,
        label,
        row,
        view,
      });
    },
    [],
  );

  const inspectColumn = useCallback((header: string, view: WorkbenchView) => {
    setSelectedRow(null);
    setSelectedColumn({ header, view });
  }, []);

  function renderWorkbenchCenterPanel() {
    if (activeView === "flat") {
      return (
        <DenseDataGrid
          caption={
            conversionResult
              ? `Root path ${conversionResult.config.rootPath || "$"} with ${conversionResult.config.flattenMode} mode. ${flatPreviewRowsTruncated ? "Preview is row-bounded for responsiveness." : "All visible preview rows are loaded."}`
              : "Fix the current form errors to generate a preview."
          }
          description="Full-width operational grid for projected flat rows. Header filters and selection stay available without leaving the table."
          emptyMessage={
            isStreamingFlatPreview || conversionResult
              ? "No rows match the current filter state."
              : "No projection is available for the current form values."
          }
          filterLabel="Filter visible CSV rows"
          getRowId={(row, index) => createGridRowId(row, index, flatHeaders)}
          headers={flatHeaders}
          initialHiddenHeaders={initialHiddenFlatHeaders}
          notices={
            <>
              {outputExportError ? <Notice tone="error">{outputExportError}</Notice> : null}
              {previewSuspendedReason ? (
                <Notice tone="warning">{previewSuspendedReason}</Notice>
              ) : null}
              {previewLimitNotice ? <Notice tone="warning">{previewLimitNotice}</Notice> : null}
              {isStreamingFlatPreview && streamingFlatPreview ? (
                <Notice>{describeStreamingPreviewCaption(streamingFlatPreview)}</Notice>
              ) : null}
              {flatPreviewRowsTruncated ? (
                <Notice>
                  Showing the first {projectionFlatRowPreviewLimit.toLocaleString()} rows of the
                  live preview.
                </Notice>
              ) : null}
              {initialHiddenFlatColumnCount > 0 ? (
                <Notice>
                  Large flat previews start in a bounded column set. Use Columns or Show all columns
                  to reveal the remaining {initialHiddenFlatColumnCount.toLocaleString()} fields.
                </Notice>
              ) : null}
            </>
          }
          rowCount={flatRowCount}
          rowLabel="flat row"
          rows={flatPreviewRows.rows}
          summaryBadges={
            <>
              <Badge variant="outline">
                {describeActiveSource(liveValues.sourceMode, activeSample.title)}
              </Badge>
              <Badge variant="secondary">{activeConfigDescription}</Badge>
              {isStreamingFlatPreview ? <Badge variant="secondary">Streaming</Badge> : null}
            </>
          }
          title="Flat row grid"
          toolbarActions={
            <Button
              type="button"
              variant="outline"
              title={outputExportBlockedReason ?? "Download the full flat CSV output."}
              disabled={!canExportOutputs || isOutputExporting}
              onClick={() => {
                void handleFlatCsvExport();
              }}
            >
              <Download className="size-4" />
              {isOutputExporting && outputExportLabel?.includes("flat CSV")
                ? "Preparing full CSV"
                : "Download full CSV"}
            </Button>
          }
          onInspectColumn={(header) => inspectColumn(header, "flat")}
          onInspectRow={(row, rowId) => inspectRow(row, rowId, "flat")}
        />
      );
    }

    if (activeView === "csv") {
      return (
        <CsvWorkbenchPanel
          csvPreview={csvPreview}
          isOutputExporting={isOutputExporting}
          isStreamingFlatPreview={isStreamingFlatPreview}
          onExport={() => {
            void handleFlatCsvExport();
          }}
          outputExportBlockedReason={outputExportBlockedReason}
          outputExportError={outputExportError}
          outputExportLabel={outputExportLabel}
          streamingFlatPreview={streamingFlatPreview}
        />
      );
    }

    return (
      <SchemaWorkbenchPanel
        conversionResult={conversionResult}
        hiddenMixedTypeReportCount={hiddenMixedTypeReportCount}
        hiddenSchemaColumnCount={hiddenSchemaColumnCount}
        onInspectColumn={(header) => {
          inspectColumn(header, "schema");
          setActiveView("schema");
        }}
        visibleMixedTypeReports={visibleMixedTypeReports}
        visibleSchemaColumns={visibleSchemaColumns}
      />
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <main className="mx-auto flex min-h-screen max-w-[1920px] flex-col gap-3 px-3 py-3 lg:px-4">
        <header className="sticky top-3 z-20 rounded-[var(--radius)] border border-border/90 bg-card/92 px-4 py-3 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.34)] backdrop-blur-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-primary/20 bg-primary/6 text-primary">
                    High-density JSON workspace
                  </Badge>
                  {isStreamingFlatPreview ? (
                    <Badge variant="secondary">Streaming preview</Badge>
                  ) : null}
                </div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                  JSON-to-CSV workspace for dense nested data.
                </h1>
                <p className="max-w-4xl text-sm text-muted-foreground sm:text-base">
                  Live root-path selection, flat projection tuning, and export-safe CSV shaping
                  without extra workflow layers.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  title={outputExportBlockedReason ?? "Download the full flat CSV output."}
                  disabled={!canExportOutputs || isOutputExporting}
                  onClick={() => {
                    void handleFlatCsvExport();
                  }}
                >
                  <Download className="size-4" />
                  Download full CSV
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={inspectorMode === "mapping"}
                  onClick={clearWorkbenchSelection}
                >
                  <Settings2 className="size-4" />
                  Mapping controls
                </Button>
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div className="flex flex-wrap items-center gap-2">
                <WorkbenchMetric
                  label="Source"
                  value={describeActiveSource(liveValues.sourceMode, activeSample.title)}
                />
                <WorkbenchMetric
                  label="Export"
                  value={liveValues.exportName.trim() || "Untitled"}
                />
                <WorkbenchMetric label="Root" value={liveValues.rootPath || "$"} mono />
                <WorkbenchMetric label="Rows" value={flatRowCount.toLocaleString()} />
                <WorkbenchMetric label="Columns" value={flatHeaders.length.toLocaleString()} />
                <WorkbenchMetric
                  label="Projection"
                  value={
                    projection.isProjecting && projection.progress
                      ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}`
                      : projection.isProjecting
                        ? "Updating preview"
                        : projection.previewCapped && projection.previewRootLimit
                          ? `Limited to ${projection.previewRootLimit.toLocaleString()} roots`
                          : "Ready"
                  }
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <WorkbenchNavButton
                  active={activeView === "flat"}
                  label="Flat rows"
                  meta={`${flatRowCount.toLocaleString()} rows`}
                  onClick={() => setActiveView("flat")}
                />
                <WorkbenchNavButton
                  active={activeView === "csv"}
                  label="CSV"
                  meta="Output"
                  onClick={() => setActiveView("csv")}
                />
                <WorkbenchNavButton
                  active={activeView === "schema"}
                  label="Schema sidecar"
                  meta={`${conversionResult?.schema.columns.length ?? 0} cols`}
                  onClick={() => setActiveView("schema")}
                />
              </div>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <section className="order-2 min-w-0 xl:order-none">
            {renderWorkbenchCenterPanel()}
          </section>

          <aside className="order-1 min-h-0 xl:order-none">
            <div className="flex h-full min-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-[var(--radius)] border border-border/80 bg-background/78">
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Inspector</p>
                  <p className="text-xs text-muted-foreground">
                    Contextual detail and mapping controls stay visible beside the workspace.
                  </p>
                </div>
                {inspectorMode !== "mapping" ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearWorkbenchSelection}>
                    Mapping controls
                  </Button>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <InspectorContextCard
                  inspectorMode={inspectorMode}
                  selectedColumn={selectedColumn}
                  selectedColumnSchema={selectedColumnSchema}
                  selectedColumnTypeReport={selectedColumnTypeReport}
                  selectedRow={selectedRow}
                />

                <div className="mt-3 space-y-3">
                  <InspectorSection
                    description="Session identity, source mode, and staged input management."
                    title="Session"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="export-name">Export name</Label>
                      <Input
                        id="export-name"
                        maxLength={exportNameMaxLength}
                        placeholder="Donut CSV export"
                        {...form.register("exportName")}
                      />
                      <FieldError message={form.formState.errors.exportName?.message} />
                    </div>

                    <div className="space-y-2">
                      <Label>Input source</Label>
                      <div className="flex flex-wrap gap-2">
                        {sourceModeOptions.map((option) => (
                          <Button
                            key={option.value}
                            type="button"
                            variant={liveValues.sourceMode === option.value ? "default" : "outline"}
                            onClick={() => handleSourceModeChange(option.value)}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {liveValues.sourceMode === "sample" ? (
                      <div className="space-y-2">
                        <Label htmlFor="sample-id">Sample dataset</Label>
                        <select
                          id="sample-id"
                          className={controlSelectClassName}
                          value={liveValues.sampleId}
                          onChange={(event) => handleSampleChange(event.target.value)}
                        >
                          {mappingSamples.map((sample) => (
                            <option key={sample.id} value={sample.id}>
                              {sample.title}
                            </option>
                          ))}
                        </select>
                        <p className="text-sm text-muted-foreground">{activeSample.description}</p>
                        {sampleSourcePreview?.truncated ? (
                          <Notice>
                            Showing the first {sampleSourcePreviewCharacterLimit.toLocaleString()}{" "}
                            characters of the sample source preview.
                          </Notice>
                        ) : null}
                        <Textarea
                          readOnly
                          value={sampleSourcePreview?.text ?? ""}
                          className="min-h-36 font-mono text-[12px] leading-5"
                        />
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-[calc(var(--radius)-2px)] border border-border/80 bg-card/80 p-3">
                        <div className="flex flex-wrap gap-2">
                          <label
                            htmlFor="json-upload"
                            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[calc(var(--radius)-2px)] border border-border bg-background/88 px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary/85"
                          >
                            <Upload className="size-4" />
                            Upload .json
                          </label>
                          <input
                            id="json-upload"
                            type="file"
                            accept=".json,application/json"
                            className="sr-only"
                            onChange={handleFileImport}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="custom-json">Custom JSON</Label>
                          <Textarea
                            id="custom-json"
                            {...bufferedJsonEditorServiceProps}
                            placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                            className="min-h-[18rem] font-mono text-[12px] leading-5"
                            value={liveValues.customJson}
                            onChange={(event) => {
                              form.setValue("customJson", event.target.value, {
                                shouldValidate: true,
                              });
                            }}
                          />
                          <p className="text-sm text-muted-foreground">
                            Custom input stays local to this browser for the current session and
                            updates the preview live.
                          </p>
                          {previewSuspendedReason ? (
                            <Notice tone="warning">{previewSuspendedReason}</Notice>
                          ) : projection.parseError ? (
                            <Notice tone="error">Invalid JSON: {projection.parseError}</Notice>
                          ) : projection.isProjecting ? (
                            <Notice>
                              Parsing and rebuilding the preview in the background as you edit.
                              {projection.progress
                                ? ` ${formatProjectionProgressDetail(projection.progress)}.`
                                : ""}
                            </Notice>
                          ) : (
                            <Notice>
                              Parsed successfully. Point the root path at the branch that should
                              become rows.
                            </Notice>
                          )}
                        </div>
                      </div>
                    )}
                  </InspectorSection>

                  <InspectorSection
                    description="Root-path control and smart detection for the current payload."
                    title="Scope"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="root-path">Root path</Label>
                      <Input
                        id="root-path"
                        placeholder="$.items.item[*]"
                        {...form.register("rootPath")}
                      />
                      <FieldError message={form.formState.errors.rootPath?.message} />
                      {liveValues.sourceMode === "custom" ? (
                        <p className="text-sm text-muted-foreground">
                          {streamableCustomSelector
                            ? "Incremental selector parsing is active for this path."
                            : "This custom path currently falls back to full-document parsing."}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2 rounded-[calc(var(--radius)-2px)] border border-border/80 bg-card/80 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={projection.isProjecting}
                          onClick={handleSmartDetect}
                        >
                          Smart detect
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          Analyze the current payload for a better row root and safer defaults.
                        </span>
                      </div>

                      {smartDetectFeedback ? (
                        <Notice
                          tone={
                            smartDetectFeedback.tone === "error"
                              ? "error"
                              : smartDetectFeedback.tone === "success"
                                ? "success"
                                : "info"
                          }
                        >
                          {smartDetectFeedback.detail}
                          {smartDetectFeedback.previewHeaders.length > 0 ? (
                            <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                              Preview columns: {smartDetectFeedback.previewHeaders.join(", ")}
                            </span>
                          ) : null}
                        </Notice>
                      ) : null}
                    </div>

                    {isBroadRootWarningVisible ? (
                      <Notice tone="warning">
                        Root `$` currently exposes {discoveredPaths.length.toLocaleString()}{" "}
                        structural paths and about {broadRootColumnCount.toLocaleString()} preview
                        columns. Narrow the root path or use Smart detect before tuning the rest of
                        the mapping.
                      </Notice>
                    ) : (
                      <Notice>
                        Discovered {discoveredPaths.length.toLocaleString()} structural paths under
                        the current root. Smart detect remains available for automatic row-root
                        selection, but manual path rule editing has been removed to keep the
                        workspace lean.
                      </Notice>
                    )}

                    {previewLimitNotice ? (
                      <Notice tone="warning">{previewLimitNotice}</Notice>
                    ) : null}
                  </InspectorSection>

                  <InspectorSection
                    description="Core row shaping and CSV behavior controls."
                    title="Mapping"
                  >
                    <div className="grid gap-3 md:grid-cols-2">
                      <SelectField
                        id="flatten-mode"
                        label="Flatten mode"
                        registration={form.register("flattenMode")}
                        options={flattenModes.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="placeholder-strategy"
                        label="Parent fill"
                        registration={form.register("placeholderStrategy")}
                        options={placeholderStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="missing-keys"
                        label="Missing keys"
                        registration={form.register("onMissingKey")}
                        options={missingKeyStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="type-mismatch"
                        label="Type mismatch"
                        registration={form.register("onTypeMismatch")}
                        options={typeMismatchStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="empty-array-behavior"
                        label="Empty arrays"
                        registration={form.register("emptyArrayBehavior")}
                        options={emptyArrayBehaviors.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="max-depth">Max depth</Label>
                        <Input
                          id="max-depth"
                          type="number"
                          min={1}
                          max={32}
                          {...form.register("maxDepth", {
                            valueAsNumber: true,
                          })}
                        />
                      </div>
                      <SelectField
                        id="collision-strategy"
                        label="Collision strategy"
                        registration={form.register("collisionStrategy")}
                        options={collisionStrategies.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="boolean-representation"
                        label="Boolean output"
                        registration={form.register("booleanRepresentation")}
                        options={booleanRepresentations.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="date-format"
                        label="Date output"
                        registration={form.register("dateFormat")}
                        options={dateFormats.map((value) => ({
                          label: toTitleCase(value),
                          value,
                        }))}
                      />
                      <SelectField
                        id="delimiter"
                        label="CSV delimiter"
                        registration={form.register("delimiter")}
                        options={delimiterOptions.map((option) => ({
                          label: option.label,
                          value: option.value,
                        }))}
                      />
                      <div className="space-y-2">
                        <Label htmlFor="path-separator">Path separator</Label>
                        <Input
                          id="path-separator"
                          placeholder="."
                          {...form.register("pathSeparator")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="custom-placeholder">Custom placeholder</Label>
                        <Input
                          id="custom-placeholder"
                          placeholder="NULL"
                          {...form.register("customPlaceholder")}
                        />
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <ToggleField
                        label="Quote all cells"
                        registration={form.register("quoteAll")}
                      />
                      <ToggleField
                        label="Strict naming"
                        registration={form.register("strictNaming")}
                      />
                      <ToggleField
                        label="Indexed pivot columns"
                        registration={form.register("arrayIndexSuffix")}
                      />
                    </div>
                  </InspectorSection>

                  <InspectorSection
                    description="Download the current CSV or clear the workspace back to the baseline sample."
                    title="Actions"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        title={outputExportBlockedReason ?? "Download the full flat CSV output."}
                        disabled={!canExportOutputs || isOutputExporting}
                        onClick={() => {
                          void handleFlatCsvExport();
                        }}
                      >
                        <Download className="size-4" />
                        {isOutputExporting && outputExportLabel?.includes("flat CSV")
                          ? "Preparing full CSV"
                          : "Download full CSV"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={projection.isProjecting}
                        onClick={handleResetDefaults}
                      >
                        Reset defaults
                      </Button>
                    </div>

                    {configErrors.length > 0 ? (
                      <Notice tone="error">
                        {configErrors.slice(0, 3).map((error) => (
                          <span key={error} className="block">
                            {error}
                          </span>
                        ))}
                      </Notice>
                    ) : null}
                  </InspectorSection>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function toMappingConfig(values: ConverterFormValues, entryKeyAlias: string | null): MappingConfig {
  return createMappingConfig({
    rootPath: values.rootPath,
    flattenMode: values.flattenMode,
    pathSeparator: values.pathSeparator,
    arrayIndexSuffix: values.arrayIndexSuffix,
    placeholderStrategy: values.placeholderStrategy,
    customPlaceholder: values.customPlaceholder,
    onMissingKey: values.onMissingKey,
    onTypeMismatch: values.onTypeMismatch,
    headerPolicy: defaultMappingConfig.headerPolicy,
    headerSampleSize: defaultMappingConfig.headerSampleSize,
    headerAliases: entryKeyAlias ? { [objectMapEntryKeyField]: entryKeyAlias } : undefined,
    strictNaming: values.strictNaming,
    collisionStrategy: values.collisionStrategy,
    booleanRepresentation: values.booleanRepresentation,
    dateFormat: values.dateFormat,
    delimiter: values.delimiter,
    quoteAll: values.quoteAll,
    emptyArrayBehavior: values.emptyArrayBehavior,
    maxDepth: values.maxDepth,
  });
}

function getSampleById(sampleId: string) {
  return mappingSamples.find((sample) => sample.id === sampleId) ?? mappingSamples[0];
}

function describeActiveSource(sourceMode: SourceMode, sampleTitle: string) {
  return sourceMode === "custom" ? "Custom JSON" : sampleTitle;
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "Imported JSON";
}

function normalizeExportName(value: string) {
  return value.trim().slice(0, exportNameMaxLength);
}

function describeConfig(config: MappingConfig) {
  return `${toTitleCase(config.flattenMode)} / ${config.headerPolicy.replaceAll("_", " ")} / ${config.delimiter === "\t" ? "tab" : config.delimiter}`;
}

function formatTypeReport(report: ColumnTypeReport) {
  return report.typeBreakdown
    .map((entry) => `${formatPercent(entry.percentage)} ${entry.kind}`)
    .join(" / ");
}

function describeStreamingPreviewCaption(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Streaming preview from ${preview.processedRoots} parsed roots. Final schema and flat CSV preview are still building in the worker.`
    : `Streaming preview from ${preview.processedRoots}/${preview.totalRoots} roots. Final schema and flat CSV preview are still building in the worker.`;
}

function describePreviewLimitNotice(rootLimit: number) {
  return `Large-input safety mode is active. Live preview and schema are limited to the first ${rootLimit.toLocaleString()} roots to control memory. Full CSV export still uses the full input.`;
}

function describeLargeObjectRootPreviewSuspension(
  sourceMode: SourceMode,
  rootPath: string,
  customJson: string,
) {
  if (sourceMode !== "custom" || rootPath.trim() !== "$") {
    return null;
  }

  if (customJson.length < largeObjectRootPreviewSuspendCharacterThreshold) {
    return null;
  }

  if (!customJson.trimStart().startsWith("{")) {
    return null;
  }

  return `Live preview is suspended for large object-root JSON above ${largeObjectRootPreviewSuspendCharacterThreshold.toLocaleString()} characters. Choose a narrower row root before rebuilding the preview.`;
}

function describeStreamingCsvProgress(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Processed ${preview.processedRoots} roots so far. The final CSV continues materializing in the worker.`
    : `Processed ${preview.processedRoots} of ${preview.totalRoots} roots. The final CSV continues materializing in the worker.`;
}

function formatProjectionProgressDetail(progress: ProjectionProgress) {
  if (progress.phase === "parse" && progress.phaseTotal > 1) {
    return `${progress.phaseCompleted.toLocaleString()}/${progress.phaseTotal.toLocaleString()} chars · ${progress.percent}%`;
  }

  if (progress.phaseTotal > 1) {
    return `${progress.phaseCompleted}/${progress.phaseTotal} roots · ${progress.percent}%`;
  }

  return `${progress.percent}%`;
}

function formatPercent(value: number) {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function toTitleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join(" ");
}

function createGridRowId(
  row: Record<string, string>,
  index: number,
  headers: string[],
  preferredHeader?: string,
) {
  const candidates = [preferredHeader, ...headers].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const value = row[candidate];

    if (value) {
      return `${candidate}:${value}:${index}`;
    }
  }

  return `row:${index}`;
}

function createWorkbenchRowLabel(row: Record<string, string>, fallback: string) {
  const candidateHeaders = ["root_id", "id", "name", "type", ...Object.keys(row)];

  for (const header of candidateHeaders) {
    const value = row[header];

    if (value) {
      return value;
    }
  }

  return fallback;
}

function WorkbenchMetric({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-[999px] border border-border/80 bg-background/86 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="uppercase tracking-[0.12em]">{label}</span>
      <span className={cn("text-foreground", mono && "font-mono text-[11px]")}>{value}</span>
    </div>
  );
}

function WorkbenchNavButton({
  active,
  disabled = false,
  label,
  meta,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-2 rounded-[calc(var(--radius)-2px)] border px-3 py-2 text-sm transition-colors disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-primary/25 bg-primary/7 text-foreground"
          : "border-border/80 bg-background/86 text-muted-foreground hover:bg-secondary/85",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">{meta}</span>
    </button>
  );
}

type NoticeTone = "error" | "info" | "success" | "warning";

function Notice({ children, tone = "info" }: { children: ReactNode; tone?: NoticeTone }) {
  return (
    <div
      className={cn(
        "rounded-[calc(var(--radius)-2px)] border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/25 bg-destructive/6 text-destructive",
        tone === "warning" && "border-amber-300/70 bg-amber-50 text-amber-900",
        tone === "success" && "border-primary/20 bg-primary/6 text-foreground",
        tone === "info" && "border-border/80 bg-background/80 text-muted-foreground",
      )}
    >
      {children}
    </div>
  );
}

function InspectorSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border/80 bg-card/82">
      <div className="px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="space-y-3 border-t border-border/80 p-4">{children}</div>
    </section>
  );
}

function CsvWorkbenchPanel({
  csvPreview,
  isOutputExporting,
  isStreamingFlatPreview,
  onExport,
  outputExportBlockedReason,
  outputExportError,
  outputExportLabel,
  streamingFlatPreview,
}: {
  csvPreview: {
    omittedCharacters: number;
    omittedCharactersKnown?: boolean;
    text: string;
    truncated: boolean;
  };
  isOutputExporting: boolean;
  isStreamingFlatPreview: boolean;
  onExport: () => void;
  outputExportBlockedReason: string | null;
  outputExportError: string | null;
  outputExportLabel: string | null;
  streamingFlatPreview: ProjectionFlatStreamPreview | null;
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-5 text-primary" />
              CSV output
            </CardTitle>
            <CardDescription>
              Operational CSV preview with export controls kept in the workspace.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            title={outputExportBlockedReason ?? "Download the full flat CSV output."}
            disabled={outputExportBlockedReason !== null || isOutputExporting}
            onClick={onExport}
          >
            <Download className="size-4" />
            {isOutputExporting && outputExportLabel?.includes("flat CSV")
              ? "Preparing full CSV"
              : "Download full CSV"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {outputExportError ? <Notice tone="error">{outputExportError}</Notice> : null}
        {isStreamingFlatPreview && streamingFlatPreview ? (
          <Notice>{describeStreamingCsvProgress(streamingFlatPreview)}</Notice>
        ) : null}
        {csvPreview.truncated ? (
          <Notice>
            Showing the first {projectionFlatCsvPreviewCharacterLimit.toLocaleString()} characters.
            {csvPreview.omittedCharactersKnown === false
              ? " Additional rows are hidden from the live preview."
              : ` ${csvPreview.omittedCharacters.toLocaleString()} more characters are hidden from the live preview.`}
          </Notice>
        ) : null}
        <Textarea
          readOnly
          value={csvPreview.text}
          className="min-h-[34rem] font-mono text-[12px] leading-5"
        />
      </CardContent>
    </Card>
  );
}

function SchemaWorkbenchPanel({
  conversionResult,
  hiddenMixedTypeReportCount,
  hiddenSchemaColumnCount,
  onInspectColumn,
  visibleMixedTypeReports,
  visibleSchemaColumns,
}: {
  conversionResult: ProjectionConversionResult | null;
  hiddenMixedTypeReportCount: number;
  hiddenSchemaColumnCount: number;
  onInspectColumn: (header: string) => void;
  visibleMixedTypeReports: ColumnTypeReport[];
  visibleSchemaColumns: ColumnSchema[];
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="size-5 text-primary" />
          Schema sidecar
        </CardTitle>
        <CardDescription>
          Headers, source paths, value kinds, and regroup keys derived from structural provenance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-[var(--radius)] border border-border/80 bg-background/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Regroup keys
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {conversionResult?.schema.primaryKeys.map((key) => (
              <Badge key={key} variant="outline">
                {key}
              </Badge>
            ))}
            {(conversionResult?.schema.primaryKeys.length ?? 0) === 0 ? (
              <span className="text-sm text-muted-foreground">No regroup keys detected.</span>
            ) : null}
          </div>
        </div>

        <div className="rounded-[var(--radius)] border border-border/80 bg-background/80 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Type drift report
          </p>
          {hiddenMixedTypeReportCount > 0 ? (
            <Notice>
              Showing the first {schemaTypeReportPreviewLimit.toLocaleString()} mixed-type columns.
              {` ${hiddenMixedTypeReportCount} more reports are hidden from the live sidecar.`}
            </Notice>
          ) : null}
          {visibleMixedTypeReports.length > 0 ? (
            <div className="mt-3 space-y-3">
              {visibleMixedTypeReports.map((report) => (
                <button
                  key={report.header}
                  type="button"
                  className="block w-full rounded-[calc(var(--radius)-2px)] border border-border/70 bg-card px-3 py-3 text-left transition-colors hover:bg-secondary/75"
                  onClick={() => onInspectColumn(report.header)}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="font-medium text-foreground">{report.header}</span>
                    {report.coercedTo ? (
                      <Badge variant="secondary">Coerced to {report.coercedTo}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{formatTypeReport(report)}</p>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              No mixed-type columns detected in the current projection.
            </p>
          )}
        </div>

        {hiddenSchemaColumnCount > 0 ? (
          <Notice>
            Showing the first {schemaColumnPreviewLimit.toLocaleString()} columns in the live
            sidecar.
            {` ${hiddenSchemaColumnCount} additional columns remain available in the full export.`}
          </Notice>
        ) : null}

        <div className="grid gap-3">
          {visibleSchemaColumns.map((column) => (
            <button
              key={column.header}
              type="button"
              className="rounded-[var(--radius)] border border-border/80 bg-background/80 p-4 text-left transition-colors hover:bg-secondary/70"
              onClick={() => onInspectColumn(column.header)}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-semibold text-foreground">{column.header}</p>
                <div className="flex flex-wrap gap-2">
                  {column.kinds.map((kind) => (
                    <Badge key={`${column.header}-${kind}`} variant="secondary">
                      {kind}
                    </Badge>
                  ))}
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{column.sourcePath}</p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {column.nullable ? "Nullable" : "Required"}
              </p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InspectorContextCard({
  inspectorMode,
  selectedColumn,
  selectedColumnSchema,
  selectedColumnTypeReport,
  selectedRow,
}: {
  inspectorMode: InspectorMode;
  selectedColumn: { header: string; view: WorkbenchView } | null;
  selectedColumnSchema: ColumnSchema | null;
  selectedColumnTypeReport: ColumnTypeReport | null;
  selectedRow: { label: string; row: Record<string, string>; view: WorkbenchView } | null;
}) {
  if (inspectorMode === "row" && selectedRow) {
    return (
      <Card className="bg-card/88">
        <CardHeader>
          <CardTitle>Row inspector</CardTitle>
          <CardDescription>
            {selectedRow.label} from the {selectedRow.view} workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(selectedRow.row)
            .slice(0, 12)
            .map(([key, value]) => (
              <div
                key={key}
                className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] gap-3 rounded-[calc(var(--radius)-2px)] border border-border/70 bg-background/80 px-3 py-2"
              >
                <span className="truncate font-mono text-[11px] text-muted-foreground">{key}</span>
                <span className="truncate text-sm text-foreground">{value || " "}</span>
              </div>
            ))}
        </CardContent>
      </Card>
    );
  }

  if (inspectorMode === "column" && selectedColumn) {
    return (
      <Card className="bg-card/88">
        <CardHeader>
          <CardTitle>Column inspector</CardTitle>
          <CardDescription>
            {selectedColumn.header} from the {selectedColumn.view} workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {selectedColumnSchema ? (
            <>
              <div className="rounded-[calc(var(--radius)-2px)] border border-border/70 bg-background/80 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Source path</p>
                <p className="mt-1 font-mono text-[12px] text-foreground">
                  {selectedColumnSchema.sourcePath}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedColumnSchema.kinds.map((kind) => (
                  <Badge key={`${selectedColumn.header}-${kind}`} variant="secondary">
                    {kind}
                  </Badge>
                ))}
                <Badge variant="outline">
                  {selectedColumnSchema.nullable ? "Nullable" : "Required"}
                </Badge>
              </div>
            </>
          ) : (
            <Notice>No schema metadata is available for the selected column.</Notice>
          )}
          {selectedColumnTypeReport ? (
            <Notice>{formatTypeReport(selectedColumnTypeReport)}</Notice>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/88">
      <CardHeader>
        <CardTitle>Mapping inspector</CardTitle>
        <CardDescription>
          Use the sections below to steer the current projection without leaving the workspace.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

function SelectField({
  id,
  label,
  options,
  registration,
}: {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={controlSelectClassName} {...registration}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleField({
  label,
  registration,
}: {
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <label className="flex items-center gap-3 rounded-[calc(var(--radius)-2px)] border border-border/80 bg-background/86 px-3 py-2 text-sm font-medium text-foreground">
      <input type="checkbox" className="size-3.5 rounded border-border" {...registration} />
      {label}
    </label>
  );
}

export default App;
