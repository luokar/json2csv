import { zodResolver } from "@hookform/resolvers/zod";
import { Download, Moon, Search as SearchIcon, Sun, Monitor } from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast, Toaster } from "sonner";
import { z } from "zod";
import { CommandPalette, createDefaultActions } from "@/components/command-palette";
import { KeyboardShortcutsDialog } from "@/components/keyboard-shortcuts-dialog";
import { RowDetailDrawer } from "@/components/workbench/row-detail-drawer";
import type { SidebarTab } from "@/components/inspector/inspector-types";
import { CollapsibleSidebar, SidebarToggleButton } from "@/components/layout/sidebar";
import { DataTabPanel } from "@/components/sidebar/data-tab-panel";
import { ExportTabPanel } from "@/components/sidebar/export-tab-panel";
import { InspectTabPanel } from "@/components/sidebar/inspect-tab-panel";
import { ProfileTabPanel } from "@/components/sidebar/profile-tab-panel";
import { SidebarTabs } from "@/components/sidebar/sidebar-tabs";
import { TransformTabPanel } from "@/components/sidebar/transform-tab-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Notice } from "@/components/ui/notice";
import { CsvWorkbenchPanel } from "@/components/workbench/csv-workbench-panel";
import { DenseDataGrid } from "@/components/workbench/dense-data-grid";
import { ColumnStatsPanel } from "@/components/workbench/column-stats-panel";
import { SchemaWorkbenchPanel } from "@/components/workbench/schema-workbench-panel";
import { WorkbenchMetric } from "@/components/workbench/workbench-metric";
import { WorkbenchNavButton } from "@/components/workbench/workbench-nav-button";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useOutputExport } from "@/hooks/use-output-export";
import { buildDatasetKey, loadColumnPreferences, saveColumnPreferences } from "@/hooks/use-column-preferences";
import { loadFormatRules, saveFormatRules } from "@/hooks/use-format-rules-storage";
import { useProjectionPreview } from "@/hooks/use-projection-preview";
import { useTheme } from "@/hooks/use-theme";
import { useUndoStack } from "@/hooks/use-undo-stack";
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
import { computeColumnProfiles } from "@/lib/column-profiling";
import type { FormatRule } from "@/lib/conditional-formatting";
import { mappingSamples } from "@/lib/mapping-samples";
import { buildSelectedRowsExportArtifact, buildSelectedRowsJsonExportArtifact, copyRowsToClipboard, createOutputExportRequest, downloadExportArtifact } from "@/lib/output-export";
import {
  buildPipelineConfig,
  downloadPipelineConfig,
  generateJqSnippet,
  generatePandasSnippet,
  generateSqlSnippet,
  parsePipelineConfig,
} from "@/lib/pipeline-export";
import { createRowPreview, createTextPreview } from "@/lib/preview";
import type { ProjectionFlatStreamPreview, ProjectionProgress } from "@/lib/projection";
import { projectionFlatRowPreviewLimit, projectionSmallInputRootThreshold } from "@/lib/projection";
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

interface ColumnConfig {
  columnOrder: string[];
  headerAliases: Record<string, string>;
  hiddenColumns: Set<string>;
}

const initialColumnConfig: ColumnConfig = {
  columnOrder: [],
  headerAliases: {},
  hiddenColumns: new Set(),
};

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
  const [activeSidebarTab, setActiveSidebarTab] = useState<SidebarTab>("data");
  const [selectedColumn, setSelectedColumn] = useState<SelectedWorkbenchColumn | null>(null);
  const [selectedRow, setSelectedRow] = useState<SelectedWorkbenchRow | null>(null);
  const [entryKeyAlias, setEntryKeyAlias] = useState<string | null>(null);
  const columnConfigStack = useUndoStack<ColumnConfig>(initialColumnConfig);
  const { columnOrder, headerAliases, hiddenColumns } = columnConfigStack.state;
  const setHeaderAliases = useCallback(
    (updater: (prev: Record<string, string>) => Record<string, string>) => {
      columnConfigStack.set({
        ...columnConfigStack.state,
        headerAliases: updater(columnConfigStack.state.headerAliases),
      });
    },
    [columnConfigStack],
  );
  const setColumnOrder = useCallback(
    (next: string[]) => {
      columnConfigStack.set({ ...columnConfigStack.state, columnOrder: next });
    },
    [columnConfigStack],
  );
  const setHiddenColumns = useCallback(
    (next: Set<string>) => {
      columnConfigStack.set({ ...columnConfigStack.state, hiddenColumns: next });
    },
    [columnConfigStack],
  );
  const [smartDetectFeedback, setSmartDetectFeedback] = useState<SmartDetectFeedback | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsDialogOpen, setShortcutsDialogOpen] = useState(false);
  const [columnFiltersVisible, setColumnFiltersVisible] = useState<boolean | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [detailDrawerRow, setDetailDrawerRow] = useState<{
    label: string;
    row: Record<string, string>;
    rowIndex: number;
  } | null>(null);
  const [pinnedColumnIds, setPinnedColumnIds] = useState<string[]>([]);
  const cellEditsStack = useUndoStack<Map<string, Map<string, string>>>(new Map());
  const cellEdits = cellEditsStack.state;
  const [formatRules, setFormatRules] = useState<FormatRule[]>([]);
  const [statsPanelOpen, setStatsPanelOpen] = useState(false);
  const [statsPanelInitialColumn, setStatsPanelInitialColumn] = useState<string | undefined>(undefined);
  const [pendingColumnFilter, setPendingColumnFilter] = useState<{ columnId: string; value: string; key: number } | null>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const isMobile = !useMediaQuery("(min-width: 1024px)");
  const inspectorMode: InspectorMode = selectedRow ? "row" : selectedColumn ? "column" : "mapping";

  const form = useForm<ConverterFormValues>({
    resolver: zodResolver(converterFormSchema),
    defaultValues: defaultFormValues,
  });
  const {
    activeLabel: outputExportLabel,
    error: outputExportError,
    isExporting: isOutputExporting,
    progress: outputExportProgress,
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
    ? toMappingConfig(parsedValues.data, entryKeyAlias, headerAliases)
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
  const orderedFlatHeaders = useMemo(() => {
    if (columnOrder.length === 0) return flatHeaders;
    const orderSet = new Set(columnOrder);
    const ordered = columnOrder.filter((h) => flatHeaders.includes(h));
    const remaining = flatHeaders.filter((h) => !orderSet.has(h));
    return [...ordered, ...remaining];
  }, [flatHeaders, columnOrder]);
  const visibleHeaders = useMemo(() => {
    if (hiddenColumns.size === 0) return orderedFlatHeaders;
    return orderedFlatHeaders.filter((h) => !hiddenColumns.has(h));
  }, [orderedFlatHeaders, hiddenColumns]);
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
  const broadRootColumnCount = conversionResult?.schema.columns.length ?? orderedFlatHeaders.length;
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
    () => visibleHeaders.slice(tableColumnPreviewLimit),
    [visibleHeaders],
  );
  const initialHiddenFlatColumnCount = initialHiddenFlatHeaders.length;
  const flatPreviewRows = useMemo(() => {
    const limit =
      flatRowCount < projectionSmallInputRootThreshold
        ? flatRecords.length
        : projectionFlatRowPreviewLimit;
    return createRowPreview(flatRecords, limit);
  }, [flatRecords, flatRowCount]);
  const flatPreviewRowsTruncated = isStreamingFlatPreview
    ? flatRowCount > flatRecords.length
    : flatPreviewRows.truncated ||
      (!isStreamingFlatPreview &&
        conversionResult !== null &&
        conversionResult.rowCount > conversionResult.records.length);

  // Column preferences persistence
  const datasetKey = useMemo(
    () => buildDatasetKey(sourceMode, sampleId, flatHeaders, flatRowCount),
    [sourceMode, sampleId, flatHeaders, flatRowCount],
  );
  const prevDatasetKeyRef = useRef(datasetKey);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const formatRulesSaveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const formatRulesHydratedKeyRef = useRef<string | null>(null);

  // Save column preferences on change (debounced)
  useEffect(() => {
    if (flatHeaders.length === 0) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveColumnPreferences(datasetKey, {
        columnOrder,
        headerAliases,
        hiddenColumns: [...hiddenColumns],
        pinnedColumnIds,
      });
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [columnOrder, headerAliases, hiddenColumns, pinnedColumnIds, datasetKey, flatHeaders.length]);

  // Restore column preferences on dataset change
  useEffect(() => {
    if (prevDatasetKeyRef.current === datasetKey) return;
    prevDatasetKeyRef.current = datasetKey;
    cellEditsStack.reset(new Map());
    if (flatHeaders.length === 0) return;
    const saved = loadColumnPreferences(datasetKey);
    if (!saved) return;
    columnConfigStack.reset({
      columnOrder: saved.columnOrder,
      headerAliases: saved.headerAliases,
      hiddenColumns: new Set(saved.hiddenColumns),
    });
    setPinnedColumnIds(saved.pinnedColumnIds);
  }, [datasetKey, flatHeaders.length]);

  // Restore format rules on dataset change
  useEffect(() => {
    if (flatHeaders.length === 0) return;
    if (formatRulesHydratedKeyRef.current === datasetKey) return;
    formatRulesHydratedKeyRef.current = datasetKey;
    const saved = loadFormatRules(datasetKey);
    setFormatRules(saved ?? []);
  }, [datasetKey, flatHeaders.length]);

  // Save format rules on change (debounced) — only after hydration completes for this dataset
  useEffect(() => {
    if (flatHeaders.length === 0) return;
    if (formatRulesHydratedKeyRef.current !== datasetKey) return;
    clearTimeout(formatRulesSaveTimerRef.current);
    formatRulesSaveTimerRef.current = setTimeout(() => {
      saveFormatRules(datasetKey, formatRules);
    }, 500);
    return () => clearTimeout(formatRulesSaveTimerRef.current);
  }, [formatRules, datasetKey, flatHeaders.length]);

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
      toast.success("CSV downloaded successfully.");
    } catch {
      toast.error("CSV export failed. Check the error details above.");
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
    columnConfigStack.reset(initialColumnConfig);
    setSmartDetectFeedback(null);
  }

  function handleExportConfig() {
    if (!activeConfig) return;
    const pipeline = buildPipelineConfig({
      columnOrder,
      headerAliases,
      mappingConfig: activeConfig,
      rootPath: liveValues.rootPath,
      sampleId: liveValues.sourceMode === "sample" ? liveValues.sampleId : undefined,
      sourceMode: liveValues.sourceMode,
    });
    downloadPipelineConfig(pipeline, `${liveValues.exportName}-config`);
  }

  async function handleImportConfig(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    event.target.value = "";
    const result = parsePipelineConfig(text);
    if ("error" in result) return;
    form.setValue("rootPath", result.rootPath, { shouldValidate: true });
    if (result.source.mode === "sample" && result.source.sampleId) {
      handleSampleChange(result.source.sampleId);
    }
    if (result.mappingConfig.flattenMode) {
      form.setValue("flattenMode", result.mappingConfig.flattenMode, { shouldValidate: true });
    }
    if (result.mappingConfig.delimiter) {
      form.setValue("delimiter", result.mappingConfig.delimiter as ConverterFormValues["delimiter"], { shouldValidate: true });
    }
    if (result.mappingConfig.pathSeparator) {
      form.setValue("pathSeparator", result.mappingConfig.pathSeparator, { shouldValidate: true });
    }
    if (result.mappingConfig.placeholderStrategy) {
      form.setValue("placeholderStrategy", result.mappingConfig.placeholderStrategy, { shouldValidate: true });
    }
    if (result.mappingConfig.onMissingKey) {
      form.setValue("onMissingKey", result.mappingConfig.onMissingKey, { shouldValidate: true });
    }
    if (result.mappingConfig.onTypeMismatch) {
      form.setValue("onTypeMismatch", result.mappingConfig.onTypeMismatch, { shouldValidate: true });
    }
    if (result.mappingConfig.collisionStrategy) {
      form.setValue("collisionStrategy", result.mappingConfig.collisionStrategy, { shouldValidate: true });
    }
    if (result.mappingConfig.booleanRepresentation) {
      form.setValue("booleanRepresentation", result.mappingConfig.booleanRepresentation, { shouldValidate: true });
    }
    if (result.mappingConfig.dateFormat) {
      form.setValue("dateFormat", result.mappingConfig.dateFormat, { shouldValidate: true });
    }
    if (typeof result.mappingConfig.arrayIndexSuffix === "boolean") {
      form.setValue("arrayIndexSuffix", result.mappingConfig.arrayIndexSuffix, { shouldValidate: true });
    }
    if (typeof result.mappingConfig.strictNaming === "boolean") {
      form.setValue("strictNaming", result.mappingConfig.strictNaming, { shouldValidate: true });
    }
    if (typeof result.mappingConfig.quoteAll === "boolean") {
      form.setValue("quoteAll", result.mappingConfig.quoteAll, { shouldValidate: true });
    }
    if (typeof result.mappingConfig.maxDepth === "number") {
      form.setValue("maxDepth", result.mappingConfig.maxDepth, { shouldValidate: true });
    }
    if (result.headerAliases) setHeaderAliases(() => result.headerAliases!);
    if (result.columnOrder) setColumnOrder(result.columnOrder);
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
  const columnProfiles = useMemo(
    () =>
      conversionResult
        ? computeColumnProfiles(
            conversionResult.records,
            conversionResult.headers,
            conversionResult.schema.typeReports,
          )
        : [],
    [conversionResult],
  );
  const pandasSnippet = useMemo(() => {
    if (!activeConfig) return null;
    const pipeline = buildPipelineConfig({
      columnOrder,
      headerAliases,
      mappingConfig: activeConfig,
      rootPath: liveValues.rootPath,
      sampleId: liveValues.sourceMode === "sample" ? liveValues.sampleId : undefined,
      sourceMode: liveValues.sourceMode,
    });
    return generatePandasSnippet(pipeline);
  }, [activeConfig, columnOrder, headerAliases, liveValues.rootPath, liveValues.sampleId, liveValues.sourceMode]);
  const pipelineConfig = useMemo(() => {
    if (!activeConfig) return null;
    return buildPipelineConfig({
      columnOrder,
      headerAliases,
      mappingConfig: activeConfig,
      rootPath: liveValues.rootPath,
      sampleId: liveValues.sourceMode === "sample" ? liveValues.sampleId : undefined,
      sourceMode: liveValues.sourceMode,
    });
  }, [activeConfig, columnOrder, headerAliases, liveValues.rootPath, liveValues.sampleId, liveValues.sourceMode]);
  const jqSnippet = useMemo(() => {
    if (!pipelineConfig) return null;
    return generateJqSnippet(pipelineConfig);
  }, [pipelineConfig]);
  const sqlSnippet = useMemo(() => {
    if (!pipelineConfig) return null;
    return generateSqlSnippet(pipelineConfig, columnProfiles);
  }, [pipelineConfig, columnProfiles]);

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
      setActiveSidebarTab("inspect");
    },
    [],
  );

  const inspectColumn = useCallback((header: string, view: WorkbenchView) => {
    setSelectedRow(null);
    setSelectedColumn({ header, view });
    setActiveSidebarTab("inspect");
  }, []);

  const handleDetailDrawerNavigate = useCallback(
    (direction: "prev" | "next") => {
      if (!detailDrawerRow) return;
      const rows = flatPreviewRows.rows;
      const nextIndex =
        direction === "prev"
          ? detailDrawerRow.rowIndex - 1
          : detailDrawerRow.rowIndex + 1;
      if (nextIndex < 0 || nextIndex >= rows.length) return;
      const nextRow = rows[nextIndex]!;
      const nextRowId = createGridRowId(nextRow, nextIndex, visibleHeaders);
      setDetailDrawerRow({
        label: createWorkbenchRowLabel(nextRow, nextRowId),
        row: nextRow,
        rowIndex: nextIndex,
      });
    },
    [detailDrawerRow, flatPreviewRows.rows, visibleHeaders],
  );

  const keyboardShortcutHandlers = useMemo(
    () => ({
      onCellRedo: () => cellEditsStack.redo(),
      onCellUndo: () => cellEditsStack.undo(),
      onDownloadCsv: () => {
        void handleFlatCsvExport();
      },
      onFocusSearch: () => {
        searchInputRef.current?.focus();
      },
      onOpenCommandPalette: () => setCommandPaletteOpen(true),
      onRedo: () => columnConfigStack.redo(),
      onShowShortcutsHelp: () => setShortcutsDialogOpen(true),
      onToggleColumnFilters: () => {
        setColumnFiltersVisible((prev) => !prev);
      },
      onToggleSidebar: () => setSidebarOpen((prev) => !prev),
      onUndo: () => columnConfigStack.undo(),
    }),
    [canExportOutputs, columnConfigStack, cellEditsStack],
  );
  useKeyboardShortcuts(keyboardShortcutHandlers);

  const commandActions = useMemo(
    () =>
      createDefaultActions({
        onCopyJqSnippet: () => {
          if (jqSnippet) void navigator.clipboard.writeText(jqSnippet).then(() => toast.success("jq snippet copied to clipboard."));
        },
        onCopySqlSnippet: () => {
          if (sqlSnippet) void navigator.clipboard.writeText(sqlSnippet).then(() => toast.success("SQL snippet copied to clipboard."));
        },
        onDownloadCsv: () => {
          void handleFlatCsvExport();
        },
        onExportConfig: handleExportConfig,
        onRedo: () => columnConfigStack.redo(),
        onResetDefaults: handleResetDefaults,
        onShowShortcutsHelp: () => setShortcutsDialogOpen(true),
        onSmartDetect: handleSmartDetect,
        onSwitchView: setActiveView,
        onToggleSidebar: () => setSidebarOpen((prev) => !prev),
        onUndo: () => columnConfigStack.undo(),
        onViewProfiles: () => setActiveSidebarTab("profile"),
      }),
    [canExportOutputs, columnConfigStack, jqSnippet, sqlSnippet],
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
          columnFiltersVisible={columnFiltersVisible}
          cellEdits={cellEdits}
          columnProfiles={columnProfiles}
          description="Your converted data with filtering, sorting, and column controls."
          emptyMessage={
            isStreamingFlatPreview || conversionResult
              ? "No rows match the current filters."
              : "Adjust the settings to generate a preview."
          }
          filterLabel="Filter rows"
          getRowId={(row, index) => createGridRowId(row, index, visibleHeaders)}
          headers={visibleHeaders}
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
                ? outputExportProgress
                  ? `Preparing... ${Math.round((outputExportProgress.completed / outputExportProgress.total) * 100)}%`
                  : "Preparing..."
                : "Download CSV"}
            </Button>
          }
          onColumnFiltersVisibleChange={setColumnFiltersVisible}
          formatRules={formatRules}
          onFormatRulesChange={setFormatRules}
          onCellEdit={(rowId, columnId, value) => {
            const prev = cellEditsStack.state;
            const next = new Map(prev);
            const rowEdits = new Map(next.get(rowId));
            rowEdits.set(columnId, value);
            next.set(rowId, rowEdits);
            cellEditsStack.set(next);
          }}
          canCellUndo={cellEditsStack.canUndo}
          canCellRedo={cellEditsStack.canRedo}
          onCellUndo={() => cellEditsStack.undo()}
          onCellRedo={() => cellEditsStack.redo()}
          onOpenStatsPanel={
            columnProfiles && columnProfiles.length > 0
              ? () => {
                  setStatsPanelInitialColumn(undefined);
                  setStatsPanelOpen(true);
                }
              : undefined
          }
          onColumnOrderChange={setColumnOrder}
          onInspectColumn={(header) => inspectColumn(header, "flat")}
          onInspectRow={(row, rowId) => inspectRow(row, rowId, "flat")}
          onOpenRowDetail={(row, rowId) => {
            const rowIndex = flatPreviewRows.rows.indexOf(row);
            setDetailDrawerRow({
              label: createWorkbenchRowLabel(row, rowId),
              row,
              rowIndex: rowIndex >= 0 ? rowIndex : 0,
            });
          }}
          onPinnedColumnsChange={setPinnedColumnIds}
          pendingColumnFilter={pendingColumnFilter}
          pinnedColumnIds={pinnedColumnIds}
          searchInputRef={searchInputRef}
          onCopySelectedToClipboard={(rows) => {
            void copyRowsToClipboard(visibleHeaders, rows, "csv", {
              delimiter: liveValues.delimiter,
              quoteAll: liveValues.quoteAll,
            }).then(() => toast.success("Rows copied to clipboard."));
          }}
          onExportSelected={(rows) => {
            const artifact = buildSelectedRowsExportArtifact(visibleHeaders, rows, {
              delimiter: liveValues.delimiter,
              exportName: liveValues.exportName,
              quoteAll: liveValues.quoteAll,
            });
            downloadExportArtifact(artifact);
            toast.success("Selected rows exported as CSV.");
          }}
          onExportSelectedJson={(rows) => {
            const artifact = buildSelectedRowsJsonExportArtifact(rows, {
              exportName: liveValues.exportName,
            });
            downloadExportArtifact(artifact);
            toast.success("Selected rows exported as JSON.");
          }}
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
      <header className="border-b border-border bg-background">
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
            <WorkbenchMetric label="Columns" value={visibleHeaders.length.toLocaleString()} />
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
              <span className="hidden sm:inline">Commands</span>
              <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
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
              <span className="hidden sm:inline">
                {isOutputExporting
                  ? outputExportProgress
                    ? `${Math.round((outputExportProgress.completed / outputExportProgress.total) * 100)}%`
                    : "Preparing..."
                  : "Download CSV"}
              </span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              title={`Theme: ${theme}`}
              onClick={() =>
                setTheme(
                  theme === "system"
                    ? "light"
                    : theme === "light"
                      ? "dark"
                      : "system",
                )
              }
            >
              {theme === "system" ? (
                <Monitor className="size-4" />
              ) : resolvedTheme === "dark" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
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
          <div className="border-b border-border bg-background px-5 py-2">
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
        <CollapsibleSidebar
          isMobile={isMobile}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen((prev) => !prev)}
          tabStrip={
            <SidebarTabs
              activeTab={activeSidebarTab}
              inspectIndicator={inspectorMode !== "mapping"}
              onTabChange={setActiveSidebarTab}
            />
          }
        >
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className={activeSidebarTab === "data" ? "space-y-3" : "hidden"}>
              <DataTabPanel
                activeSample={activeSample}
                broadRootColumnCount={broadRootColumnCount}
                customJsonOnChange={(value) => {
                  form.setValue("customJson", value, { shouldValidate: true });
                }}
                discoveredPathCount={discoveredPaths.length}
                exportNameError={form.formState.errors.exportName?.message}
                exportNameMaxLength={exportNameMaxLength}
                exportNameRegister={form.register("exportName")}
                formatProgressDetail={formatProjectionProgressDetail}
                isBroadRootWarningVisible={isBroadRootWarningVisible}
                isProjecting={projection.isProjecting}
                onFileImport={handleFileImport}
                onSampleChange={handleSampleChange}
                onSmartDetect={handleSmartDetect}
                onSourceModeChange={handleSourceModeChange}
                parseError={projection.parseError}
                previewLimitNotice={previewLimitNotice}
                previewSuspendedReason={previewSuspendedReason}
                progress={projection.progress}
                rootPathError={form.formState.errors.rootPath?.message}
                rootPathRegister={form.register("rootPath")}
                sampleSourcePreview={sampleSourcePreview}
                smartDetectFeedback={smartDetectFeedback}
                sourceModeOptions={sourceModeOptions}
                streamableCustomSelector={streamableCustomSelector}
                values={liveValues}
              />
            </div>
            <div className={activeSidebarTab === "transform" ? undefined : "hidden"}>
              <TransformTabPanel
                arrayIndexSuffixRegister={form.register("arrayIndexSuffix")}
                booleanRepresentationOptions={booleanRepresentations.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                booleanRepresentationRegister={form.register("booleanRepresentation")}
                collisionStrategyOptions={collisionStrategies.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                collisionStrategyRegister={form.register("collisionStrategy")}
                customPlaceholderRegister={form.register("customPlaceholder")}
                dateFormatOptions={dateFormats.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                dateFormatRegister={form.register("dateFormat")}
                delimiterOptions={delimiterOptions.map((option) => ({
                  label: option.label,
                  value: option.value,
                }))}
                delimiterRegister={form.register("delimiter")}
                emptyArrayBehaviorOptions={emptyArrayBehaviors.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                emptyArrayBehaviorRegister={form.register("emptyArrayBehavior")}
                flattenModeOptions={flattenModes.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                flattenModeRegister={form.register("flattenMode")}
                maxDepthRegister={form.register("maxDepth", { valueAsNumber: true })}
                missingKeyOptions={missingKeyStrategies.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                missingKeyRegister={form.register("onMissingKey")}
                pathSeparatorRegister={form.register("pathSeparator")}
                placeholderStrategyOptions={placeholderStrategies.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                placeholderStrategyRegister={form.register("placeholderStrategy")}
                quoteAllRegister={form.register("quoteAll")}
                strictNamingRegister={form.register("strictNaming")}
                typeMismatchOptions={typeMismatchStrategies.map((value) => ({
                  label: toTitleCase(value),
                  value,
                }))}
                typeMismatchRegister={form.register("onTypeMismatch")}
                columnOrder={columnOrder}
                headerAliases={headerAliases}
                headers={orderedFlatHeaders}
                hiddenColumns={hiddenColumns}
                onColumnOrderChange={setColumnOrder}
                onHiddenColumnsChange={setHiddenColumns}
                onHeaderAliasChange={(original, alias) => {
                  setHeaderAliases((prev) => {
                    if (!alias || alias === original) {
                      const next = { ...prev };
                      delete next[original];
                      return next;
                    }
                    return { ...prev, [original]: alias };
                  });
                }}
                onHeaderAliasRemove={(original) => {
                  setHeaderAliases((prev) => {
                    const next = { ...prev };
                    delete next[original];
                    return next;
                  });
                }}
              />
            </div>
            <div className={activeSidebarTab === "profile" ? undefined : "hidden"}>
              <ProfileTabPanel
                columnProfiles={columnProfiles}
                onInspectColumn={(header) => {
                  inspectColumn(header, activeView);
                }}
                sampleRowCount={flatRecords.length}
              />
            </div>
            <div className={activeSidebarTab === "export" ? undefined : "hidden"}>
              <ExportTabPanel
                canExportOutputs={canExportOutputs}
                configErrors={configErrors}
                isOutputExporting={isOutputExporting}
                isProjecting={projection.isProjecting}
                jqSnippet={jqSnippet}
                onExport={() => {
                  void handleFlatCsvExport();
                }}
                onExportConfig={handleExportConfig}
                onImportConfig={handleImportConfig}
                onResetDefaults={handleResetDefaults}
                outputExportBlockedReason={outputExportBlockedReason}
                outputExportLabel={outputExportLabel}
                pandasSnippet={pandasSnippet}
                sqlSnippet={sqlSnippet}
              />
            </div>
            <div className={activeSidebarTab === "inspect" ? undefined : "hidden"}>
              <InspectTabPanel
                columnProfile={
                  selectedColumn
                    ? (columnProfiles.find((p) => p.header === selectedColumn.header) ?? null)
                    : null
                }
                headerAlias={
                  selectedColumn ? headerAliases[selectedColumn.header] : undefined
                }
                inspectorMode={inspectorMode}
                onClearSelection={() => {
                  clearWorkbenchSelection();
                  setActiveSidebarTab("data");
                }}
                onHeaderAliasChange={(original, alias) => {
                  setHeaderAliases((prev) => {
                    if (!alias || alias === original) {
                      const next = { ...prev };
                      delete next[original];
                      return next;
                    }
                    return { ...prev, [original]: alias };
                  });
                }}
                selectedColumn={selectedColumn}
                selectedColumnSchema={selectedColumnSchema}
                selectedColumnTypeReport={selectedColumnTypeReport}
                selectedRow={selectedRow}
              />
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

      {/* Keyboard shortcuts help */}
      <KeyboardShortcutsDialog
        isOpen={shortcutsDialogOpen}
        onOpenChange={setShortcutsDialogOpen}
      />

      {/* Row detail drawer */}
      <RowDetailDrawer
        hasNext={(detailDrawerRow?.rowIndex ?? 0) < flatPreviewRows.rows.length - 1}
        hasPrev={(detailDrawerRow?.rowIndex ?? 0) > 0}
        headers={visibleHeaders}
        isOpen={detailDrawerRow !== null}
        onNavigate={handleDetailDrawerNavigate}
        onOpenChange={(open) => {
          if (!open) setDetailDrawerRow(null);
        }}
        row={detailDrawerRow?.row ?? null}
        rowLabel={detailDrawerRow?.label ?? "Row detail"}
      />

      <Toaster position="bottom-right" richColors closeButton theme={resolvedTheme as "light" | "dark"} />

      {statsPanelOpen ? (
        <ColumnStatsPanel
          profiles={columnProfiles ?? []}
          initialColumnId={statsPanelInitialColumn}
          onApplyColumnFilter={(columnId, value) => {
            setPendingColumnFilter({ columnId, value, key: Date.now() });
          }}
          onClose={() => setStatsPanelOpen(false)}
        />
      ) : null}
    </div>
  );
}

function toMappingConfig(
  values: ConverterFormValues,
  entryKeyAlias: string | null,
  userHeaderAliases: Record<string, string>,
): MappingConfig {
  const mergedAliases: Record<string, string> = {
    ...userHeaderAliases,
    ...(entryKeyAlias ? { [objectMapEntryKeyField]: entryKeyAlias } : {}),
  };

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
    headerAliases: Object.keys(mergedAliases).length > 0 ? mergedAliases : undefined,
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
