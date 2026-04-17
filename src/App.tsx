import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Search as SearchIcon, Settings2, Upload } from "lucide-react";
import { type ChangeEvent, useCallback, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { bufferedJsonEditorServiceProps } from "@/components/buffered-json-editor";
import { CommandPalette, createDefaultActions } from "@/components/command-palette";
import { InspectorContextCard } from "@/components/inspector/inspector-context-card";
import { InspectorSection } from "@/components/inspector/inspector-section";
import { CollapsibleSidebar, SidebarToggleButton } from "@/components/layout/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldError, SelectField, ToggleField, controlSelectClassName } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { CsvWorkbenchPanel } from "@/components/workbench/csv-workbench-panel";
import { DenseDataGrid } from "@/components/workbench/dense-data-grid";
import { SchemaWorkbenchPanel } from "@/components/workbench/schema-workbench-panel";
import { WorkbenchMetric } from "@/components/workbench/workbench-metric";
import { WorkbenchNavButton } from "@/components/workbench/workbench-nav-button";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useOutputExport } from "@/hooks/use-output-export";
import { useProjectionPreview } from "@/hooks/use-projection-preview";
import { parseJsonInput, stringifyJsonInput } from "@/lib/json-input";
import { resolveStreamableJsonPath } from "@/lib/json-root-stream";
import {
  booleanRepresentations,
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
import { projectionFlatRowPreviewLimit } from "@/lib/projection";
import { detectSmartConfigSuggestion, type SmartConfigSuggestion } from "@/lib/smart-config";

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
  { value: "sample", label: "Example data" },
  { value: "custom", label: "Your own JSON" },
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

const converterFormSchema = z.object({
  exportName: z
    .string()
    .trim()
    .min(exportNameMinLength, "File name must be at least 3 characters.")
    .max(exportNameMaxLength, `File name must stay under ${exportNameMaxLength} characters.`),
  sourceMode: z.enum(["sample", "custom"]),
  sampleId: z.string().trim().min(1),
  customJson: z.string(),
  rootPath: z.string().trim().min(1, "Data location is required."),
  flattenMode: z.enum(flattenModes),
  pathSeparator: z
    .string()
    .trim()
    .min(1, "Name separator is required.")
    .max(3, "Name separator is too long."),
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
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
      ? "Fix the settings errors before exporting."
      : projection.parseError
        ? "Resolve the JSON error before exporting."
        : projection.isProjecting
          ? "Wait for the preview to finish before exporting."
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
        "Preparing your CSV download",
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
        ? `Auto-applied row detection. ${suggestion.summary}`
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
          "Auto-detect is not available for very large object-root JSON. Set a narrower data location first, then try again.",
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
        detail: `Auto-detect needs valid JSON before it can analyze your data.${resolvedInput.error ? ` ${resolvedInput.error}` : ""}`,
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
          "Auto-detect did not find a better row layout for your data.",
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

  const keyboardShortcutHandlers = useMemo(
    () => ({
      onDownloadCsv: () => {
        void handleFlatCsvExport();
      },
      onOpenCommandPalette: () => setCommandPaletteOpen(true),
      onToggleSidebar: () => setSidebarOpen((prev) => !prev),
    }),
    [canExportOutputs],
  );
  useKeyboardShortcuts(keyboardShortcutHandlers);

  const commandActions = useMemo(
    () =>
      createDefaultActions({
        onDownloadCsv: () => {
          void handleFlatCsvExport();
        },
        onResetDefaults: handleResetDefaults,
        onSmartDetect: handleSmartDetect,
        onSwitchView: setActiveView,
        onToggleSidebar: () => setSidebarOpen((prev) => !prev),
      }),
    [canExportOutputs],
  );

  function renderWorkbenchCenterPanel() {
    if (activeView === "flat") {
      return (
        <DenseDataGrid
          caption={
            conversionResult
              ? `Data location ${conversionResult.config.rootPath || "$"} with ${conversionResult.config.flattenMode} nesting style. ${flatPreviewRowsTruncated ? "Preview is limited for performance." : "All preview rows are loaded."}`
              : "Fix the settings errors to generate a preview."
          }
          description="Your converted data with filtering, sorting, and column controls."
          emptyMessage={
            isStreamingFlatPreview || conversionResult
              ? "No rows match the current filters."
              : "Adjust the settings to generate a preview."
          }
          filterLabel="Filter rows"
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
                  Showing the first {projectionFlatRowPreviewLimit.toLocaleString()} rows in the
                  preview.
                </Notice>
              ) : null}
              {initialHiddenFlatColumnCount > 0 ? (
                <Notice>
                  Some columns are hidden by default. Use Columns or Show all columns
                  to reveal the remaining {initialHiddenFlatColumnCount.toLocaleString()} columns.
                </Notice>
              ) : null}
            </>
          }
          rowCount={flatRowCount}
          rowLabel="row"
          rows={flatPreviewRows.rows}
          summaryBadges={
            <>
              <Badge variant="outline">
                {describeActiveSource(liveValues.sourceMode, activeSample.title)}
              </Badge>
              <Badge variant="secondary">{activeConfigDescription}</Badge>
              {isStreamingFlatPreview ? <Badge variant="accent">Loading...</Badge> : null}
            </>
          }
          title="Data table"
          toolbarActions={
            <Button
              type="button"
              variant="outline"
              title={outputExportBlockedReason ?? "Download the CSV file."}
              disabled={!canExportOutputs || isOutputExporting}
              onClick={() => {
                void handleFlatCsvExport();
              }}
            >
              <Download className="size-4" />
              {isOutputExporting && outputExportLabel?.includes("CSV")
                ? "Preparing..."
                : "Download CSV"}
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
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Top bar */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-[1920px] items-center gap-4 px-5 py-3">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-foreground">JSON to Spreadsheet</h1>
            {isStreamingFlatPreview ? (
              <Badge variant="accent">Loading...</Badge>
            ) : null}
          </div>

          <div className="hidden flex-1 items-center justify-center gap-2 lg:flex">
            <WorkbenchMetric
              label="Data"
              value={describeActiveSource(liveValues.sourceMode, activeSample.title)}
            />
            <WorkbenchMetric label="Rows" value={flatRowCount.toLocaleString()} />
            <WorkbenchMetric label="Columns" value={flatHeaders.length.toLocaleString()} />
            <WorkbenchMetric
              label="Status"
              value={
                projection.isProjecting && projection.progress
                  ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}`
                  : projection.isProjecting
                    ? "Working..."
                    : "Ready"
              }
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <SearchIcon className="size-4" />
              Commands
              <Kbd>⌘K</Kbd>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              title={outputExportBlockedReason ?? "Download the CSV file."}
              disabled={!canExportOutputs || isOutputExporting}
              onClick={() => {
                void handleFlatCsvExport();
              }}
            >
              <Download className="size-4" />
              Download CSV
            </Button>

            <SidebarToggleButton
              isOpen={sidebarOpen}
              onToggle={() => setSidebarOpen((prev) => !prev)}
            />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {/* Main workspace */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* View tabs */}
          <div className="border-b border-border bg-white px-5 py-2">
            <div className="flex items-center gap-1">
              <WorkbenchNavButton
                active={activeView === "flat"}
                label="Table"
                meta={`${flatRowCount.toLocaleString()} rows`}
                onClick={() => setActiveView("flat")}
              />
              <WorkbenchNavButton
                active={activeView === "csv"}
                label="CSV"
                meta="Preview"
                onClick={() => setActiveView("csv")}
              />
              <WorkbenchNavButton
                active={activeView === "schema"}
                label="Column details"
                meta={`${conversionResult?.schema.columns.length ?? 0} cols`}
                onClick={() => setActiveView("schema")}
              />
            </div>
          </div>

          {/* Workbench content */}
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {renderWorkbenchCenterPanel()}
          </div>
        </main>

        {/* Collapsible sidebar */}
        <CollapsibleSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen((prev) => !prev)}>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Settings</p>
              <p className="text-xs text-muted-foreground">Adjust how your data is converted</p>
            </div>
            {inspectorMode !== "mapping" ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearWorkbenchSelection}>
                <Settings2 className="size-3.5" />
                Settings
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
                description="Choose a file name and pick your data source."
                title="File & data source"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="export-name">File name</Label>
                  <Input
                    id="export-name"
                    maxLength={exportNameMaxLength}
                    placeholder="Donut CSV export"
                    {...form.register("exportName")}
                  />
                  <FieldError message={form.formState.errors.exportName?.message} />
                </div>

                <div className="space-y-1.5">
                  <Label>Input source</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {sourceModeOptions.map((option) => (
                      <Button
                        key={option.value}
                        type="button"
                        size="sm"
                        variant={liveValues.sourceMode === option.value ? "default" : "outline"}
                        onClick={() => handleSourceModeChange(option.value)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </div>

                {liveValues.sourceMode === "sample" ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="sample-id">Example dataset</Label>
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
                    <p className="text-xs text-muted-foreground">{activeSample.description}</p>
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
                  <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <label
                        htmlFor="json-upload"
                        className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
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

                    <div className="space-y-1.5">
                      <Label htmlFor="custom-json">Your JSON</Label>
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
                      <p className="text-xs text-muted-foreground">
                        Your data stays local and updates the preview live.
                      </p>
                      {previewSuspendedReason ? (
                        <Notice tone="warning">{previewSuspendedReason}</Notice>
                      ) : projection.parseError ? (
                        <Notice tone="error">Invalid JSON: {projection.parseError}</Notice>
                      ) : projection.isProjecting ? (
                        <Notice>
                          Rebuilding the preview in the background.
                          {projection.progress
                            ? ` ${formatProjectionProgressDetail(projection.progress)}.`
                            : ""}
                        </Notice>
                      ) : (
                        <Notice>
                          Parsed successfully. Set the data location to choose which part becomes
                          rows.
                        </Notice>
                      )}
                    </div>
                  </div>
                )}
              </InspectorSection>

              <InspectorSection
                description="Tell the tool where your rows live inside the JSON."
                title="Data location"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="root-path">Data location</Label>
                  <Input
                    id="root-path"
                    placeholder="$.items.item[*]"
                    {...form.register("rootPath")}
                  />
                  <FieldError message={form.formState.errors.rootPath?.message} />
                  {liveValues.sourceMode === "custom" ? (
                    <p className="text-xs text-muted-foreground">
                      {streamableCustomSelector
                        ? "Incremental parsing is active for this location."
                        : "This location currently uses full-document parsing."}
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={projection.isProjecting}
                      onClick={handleSmartDetect}
                    >
                      Auto-detect
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Analyze your data for a better row layout.
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
                    paths and about {broadRootColumnCount.toLocaleString()} preview
                    columns. Narrow the data location or use Auto-detect before adjusting other
                    settings.
                  </Notice>
                ) : (
                  <Notice>
                    Found {discoveredPaths.length.toLocaleString()} data paths under
                    the current location.
                  </Notice>
                )}

                {previewLimitNotice ? (
                  <Notice tone="warning">{previewLimitNotice}</Notice>
                ) : null}
              </InspectorSection>

              <InspectorSection
                description="Control how nested data becomes columns and how values appear in the CSV."
                title="Conversion options"
              >
                <div className="grid gap-2.5 md:grid-cols-2">
                  <SelectField
                    id="flatten-mode"
                    label="Nesting style"
                    hint="How nested objects inside each row are turned into columns."
                    registration={form.register("flattenMode")}
                    options={flattenModes.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="placeholder-strategy"
                    label="Fill empty cells"
                    hint="What to put in cells when a parent row is repeated for nested items."
                    registration={form.register("placeholderStrategy")}
                    options={placeholderStrategies.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="missing-keys"
                    label="Missing values"
                    hint="What to show when a field exists in some rows but not others."
                    registration={form.register("onMissingKey")}
                    options={missingKeyStrategies.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="type-mismatch"
                    label="Mixed types"
                    hint="What to do when the same field contains different kinds of data."
                    registration={form.register("onTypeMismatch")}
                    options={typeMismatchStrategies.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="empty-array-behavior"
                    label="Empty lists"
                    registration={form.register("emptyArrayBehavior")}
                    options={emptyArrayBehaviors.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="max-depth">Max nesting level</Label>
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
                    label="Duplicate column names"
                    hint="What to do when different parts of the data produce columns with the same name."
                    registration={form.register("collisionStrategy")}
                    options={collisionStrategies.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="boolean-representation"
                    label="True/false format"
                    registration={form.register("booleanRepresentation")}
                    options={booleanRepresentations.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="date-format"
                    label="Date format"
                    registration={form.register("dateFormat")}
                    options={dateFormats.map((value) => ({
                      label: toTitleCase(value),
                      value,
                    }))}
                  />
                  <SelectField
                    id="delimiter"
                    label="Column separator"
                    registration={form.register("delimiter")}
                    options={delimiterOptions.map((option) => ({
                      label: option.label,
                      value: option.value,
                    }))}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor="path-separator">Name separator</Label>
                    <Input
                      id="path-separator"
                      placeholder="."
                      {...form.register("pathSeparator")}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="custom-placeholder">Custom placeholder</Label>
                    <Input
                      id="custom-placeholder"
                      placeholder="NULL"
                      {...form.register("customPlaceholder")}
                    />
                  </div>
                </div>

                <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                  <ToggleField
                    label="Quote every cell"
                    registration={form.register("quoteAll")}
                  />
                  <ToggleField
                    label="Clean column names"
                    hint="Remove special characters from column headers."
                    registration={form.register("strictNaming")}
                  />
                  <ToggleField
                    label="Number list items"
                    hint="Add a number to each column created from a list."
                    registration={form.register("arrayIndexSuffix")}
                  />
                </div>
              </InspectorSection>

              <InspectorSection
                description="Save your CSV file or start over."
                title="Download & reset"
              >
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    title={outputExportBlockedReason ?? "Download the CSV file."}
                    disabled={!canExportOutputs || isOutputExporting}
                    onClick={() => {
                      void handleFlatCsvExport();
                    }}
                  >
                    <Download className="size-4" />
                    {isOutputExporting && outputExportLabel?.includes("CSV")
                      ? "Preparing..."
                      : "Download CSV"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={projection.isProjecting}
                    onClick={handleResetDefaults}
                  >
                    Start over
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
        </CollapsibleSidebar>
      </div>

      {/* Command palette */}
      <CommandPalette
        actions={commandActions}
        isOpen={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />
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
  return sourceMode === "custom" ? "Your JSON" : sampleTitle;
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

function describeStreamingPreviewCaption(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Loading preview from ${preview.processedRoots} items. Still building the final result in the background.`
    : `Loading preview from ${preview.processedRoots}/${preview.totalRoots} items. Still building the final result in the background.`;
}

function describePreviewLimitNotice(rootLimit: number) {
  return `Large-input safety mode is active. The preview is limited to the first ${rootLimit.toLocaleString()} items to save memory. The full CSV download still uses all your data.`;
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

  return `Preview is paused for large object-root JSON above ${largeObjectRootPreviewSuspendCharacterThreshold.toLocaleString()} characters. Choose a narrower data location to resume the preview.`;
}

function formatProjectionProgressDetail(progress: ProjectionProgress) {
  if (progress.phase === "parse" && progress.phaseTotal > 1) {
    return `${progress.phaseCompleted.toLocaleString()}/${progress.phaseTotal.toLocaleString()} chars · ${progress.percent}%`;
  }

  if (progress.phaseTotal > 1) {
    return `${progress.phaseCompleted}/${progress.phaseTotal} items · ${progress.percent}%`;
  }

  return `${progress.percent}%`;
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

export default App;
