import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Braces,
  Command,
  Database,
  Download,
  FileJson2,
  Menu,
  Rows3,
  Save,
  Settings2,
  TableProperties,
  Upload,
  Waypoints,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { type UseFormRegisterReturn, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { bufferedJsonEditorServiceProps } from "@/components/buffered-json-editor";
import { HeaderMapper, type HeaderSuggestion } from "@/components/header-mapper";
import { InputDiagnostics } from "@/components/input-diagnostics";
import { PathPlanner } from "@/components/path-planner";
import { CommandPalette, type CommandPaletteAction } from "@/components/workbench/command-palette";
import { DenseDataGrid } from "@/components/workbench/dense-data-grid";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOutputExport } from "@/hooks/use-output-export";
import { useProjectionPreview } from "@/hooks/use-projection-preview";
import { useRelationalPreview } from "@/hooks/use-relational-preview";
import { buildComplexJsonOverview, type ComplexJsonOverview } from "@/lib/complex-json";
import { createPreset, listPresets, type SavedPreset, type SourceMode } from "@/lib/db";
import {
  appendHangAuditEntry,
  createHangAuditEntry,
  formatHangAuditCategory,
  getNextHangAuditEntryId,
  type HangAuditContext,
  type HangAuditEntry,
  type HangAuditSnapshot,
  hangAuditFrameGapThresholdMs,
  hangAuditLongTaskThresholdMs,
  persistHangAuditSnapshot,
  publishHangAuditSnapshot,
  readInitialHangAuditSnapshot,
} from "@/lib/hang-audit";
import {
  createHeaderRule,
  type HeaderRule,
  headerRulesFromConfig,
  headerRulesToConfig,
} from "@/lib/header-mapper";
import { formatJsonInput, parseJsonInput, stringifyJsonInput } from "@/lib/json-input";
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
  headerPolicies,
  type InspectedPath,
  type JsonValue,
  type MappingConfig,
  missingKeyStrategies,
  placeholderStrategies,
  selectRootNodes,
  typeMismatchStrategies,
} from "@/lib/mapping-engine";
import { mappingSamples } from "@/lib/mapping-samples";
import { createOutputExportRequest, downloadExportArtifact } from "@/lib/output-export";
import { type PlannerRule, plannerRulesFromConfig, plannerRulesToConfig } from "@/lib/path-planner";
import { createRowPreview, createTextPreview } from "@/lib/preview";
import type { ProjectionFlatStreamPreview, ProjectionProgress } from "@/lib/projection";
import {
  type ProjectionConversionResult,
  projectionFlatCsvPreviewCharacterLimit,
  projectionFlatRowPreviewLimit,
  projectionRelationalRowPreviewLimit,
} from "@/lib/projection";
import type { RelationalRelationship } from "@/lib/relational-split";
import { detectSmartConfigSuggestion, type SmartConfigSuggestion } from "@/lib/smart-config";
import { cn } from "@/lib/utils";
import {
  type InspectorMode,
  useWorkbenchStore,
  type WorkbenchView,
} from "@/store/use-workbench-store";

const delimiterOptions = [
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
] as const;

const sourceModeOptions: Array<{ label: string; value: SourceMode }> = [
  { value: "sample", label: "Sample catalog" },
  { value: "custom", label: "Custom JSON" },
];

const defaultRootPaths: Record<string, string> = {
  collisions: "$.rows[*]",
  donuts: "$.items.item[*]",
  heterogeneous: "$.records[*]",
};

const sampleSourcePreviewCharacterLimit = 12_000;
const schemaColumnPreviewLimit = 120;
const schemaTypeReportPreviewLimit = 40;
const tableColumnPreviewLimit = 80;
const emptyPreviewHeaders: string[] = [];
const emptyPreviewRecords: Array<Record<string, string>> = [];
const cockpitSelectClassName =
  "flex h-9 w-full rounded-[calc(var(--radius)-2px)] border border-input bg-background/88 px-3 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

const converterFormSchema = z.object({
  presetName: z
    .string()
    .trim()
    .min(3, "Preset name must be at least 3 characters.")
    .max(40, "Preset name must stay under 40 characters."),
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
  headerPolicy: z.enum(headerPolicies),
  headerSampleSize: z.number().int().min(1).max(500),
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

const workbenchTransitionWatchdogMs = 2_000;

type WorkbenchTransition =
  | "custom-rebuild"
  | "import-json"
  | "load-preset"
  | "load-sample"
  | "reset-defaults"
  | "smart-detect"
  | "source-switch";

interface PendingWorkbenchTransition {
  hasApplied: boolean;
  hasStarted: boolean;
  id: number;
  kind: WorkbenchTransition;
  projectionSignature: string;
  label: string;
}

type WorkbenchTransitionPhase = "queued" | "applying" | "projecting" | "settled" | "timed-out";

interface WorkbenchTransitionDiagnostic {
  detail: string;
  id: number;
  kind: WorkbenchTransition;
  label: string;
  phase: WorkbenchTransitionPhase;
  startedAt: number;
  updatedAt: number;
}

interface SmartDetectFeedback {
  detail: string;
  previewHeaders: string[];
  tone: "error" | "info" | "success";
}

const defaultFormValues: ConverterFormValues = {
  presetName: "Donut relational export",
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
  headerPolicy: defaultMappingConfig.headerPolicy,
  headerSampleSize: defaultMappingConfig.headerSampleSize,
  collisionStrategy: defaultMappingConfig.collisionStrategy,
  strictNaming: defaultMappingConfig.strictNaming,
  booleanRepresentation: defaultMappingConfig.booleanRepresentation,
  dateFormat: defaultMappingConfig.dateFormat,
  delimiter: defaultMappingConfig.delimiter as ConverterFormValues["delimiter"],
  quoteAll: defaultMappingConfig.quoteAll,
  emptyArrayBehavior: defaultMappingConfig.emptyArrayBehavior,
  maxDepth: defaultMappingConfig.maxDepth,
};

function createWorkbenchProjectionSignature(request: {
  config: MappingConfig | undefined;
  customJson: string;
  sampleJson: JsonValue;
  sourceMode: SourceMode;
}) {
  return JSON.stringify({
    config: request.config ?? null,
    customJson: request.sourceMode === "custom" ? request.customJson : null,
    sampleJson: request.sourceMode === "sample" ? request.sampleJson : null,
    sourceMode: request.sourceMode,
  });
}

const watchedFieldNames = [
  "presetName",
  "sourceMode",
  "sampleId",
  "rootPath",
  "flattenMode",
  "pathSeparator",
  "arrayIndexSuffix",
  "placeholderStrategy",
  "customPlaceholder",
  "onMissingKey",
  "onTypeMismatch",
  "headerPolicy",
  "headerSampleSize",
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
  const debugFlags = getAppDebugFlags();
  const isJsdomEnvironment = typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent);
  const queryClient = useQueryClient();
  const activeView = useWorkbenchStore((state) => state.activeView);
  const clearWorkbenchSelection = useWorkbenchStore((state) => state.clearWorkbenchSelection);
  const inspectorMode = useWorkbenchStore((state) => state.inspectorMode);
  const isCommandPaletteOpen = useWorkbenchStore((state) => state.isCommandPaletteOpen);
  const isInspectorOpen = useWorkbenchStore((state) => state.isInspectorOpen);
  const isLeftRailOpen = useWorkbenchStore((state) => state.isLeftRailOpen);
  const selectedColumn = useWorkbenchStore((state) => state.selectedColumn);
  const selectedPresetId = useWorkbenchStore((state) => state.selectedPresetId);
  const selectedRow = useWorkbenchStore((state) => state.selectedRow);
  const selectColumn = useWorkbenchStore((state) => state.selectColumn);
  const selectPreset = useWorkbenchStore((state) => state.selectPreset);
  const selectRow = useWorkbenchStore((state) => state.selectRow);
  const setActiveView = useWorkbenchStore((state) => state.setActiveView);
  const setCommandPaletteOpen = useWorkbenchStore((state) => state.setCommandPaletteOpen);
  const setInspectorMode = useWorkbenchStore((state) => state.setInspectorMode);
  const setInspectorOpen = useWorkbenchStore((state) => state.setInspectorOpen);
  const setLeftRailOpen = useWorkbenchStore((state) => state.setLeftRailOpen);
  const [headerRules, setHeaderRules] = useState<HeaderRule[]>([]);
  const [plannerRules, setPlannerRules] = useState<PlannerRule[]>([]);
  const [smartDetectFeedback, setSmartDetectFeedback] = useState<SmartDetectFeedback | null>(null);
  const [selectedRelationalTableName, setSelectedRelationalTableName] = useState("root");
  const [dismissedComplexJsonOverviewKey, setDismissedComplexJsonOverviewKey] = useState<
    string | null
  >(null);
  const [committedCustomJson, setCommittedCustomJson] = useState(defaultFormValues.customJson);
  const [customJsonDraft, setCustomJsonDraft] = useState(defaultFormValues.customJson);
  const [pendingWorkbenchTransition, setPendingWorkbenchTransition] =
    useState<PendingWorkbenchTransition | null>(null);
  const [workbenchTransitionDiagnostic, setWorkbenchTransitionDiagnostic] =
    useState<WorkbenchTransitionDiagnostic | null>(null);
  const [hangAuditSnapshot, setHangAuditSnapshot] = useState<HangAuditSnapshot>(() =>
    readInitialHangAuditSnapshot(),
  );
  const [isProjectionDebugDisabled, setProjectionDebugDisabled] = useState(
    debugFlags.projectionOffByDefault,
  );
  const transitionApplyFrameRef = useRef<number | null>(null);
  const transitionApplyTimeoutRef = useRef<number | null>(null);
  const transitionSequenceRef = useRef(0);
  const transitionWatchdogTimeoutRef = useRef<number | null>(null);
  const workbenchTransitionDiagnosticRef = useRef<WorkbenchTransitionDiagnostic | null>(null);
  const hangAuditContextRef = useRef<HangAuditContext>({
    columnCount: 0,
    customJsonChars: 0,
    isProjecting: false,
    isWorkbenchSuspended: false,
    projectionLabel: null,
    rootPath: "$",
    rowCount: 0,
    sourceMode: "sample",
    transitionLabel: null,
    transitionPhase: null,
  });
  const hangAuditSnapshotRef = useRef(hangAuditSnapshot);
  const nextHangAuditEntryIdRef = useRef(getNextHangAuditEntryId(hangAuditSnapshot));

  const commitHangAuditSnapshot = useCallback(
    (
      updater: (previous: HangAuditSnapshot) => HangAuditSnapshot,
      options: {
        persistImmediately?: boolean;
      } = {},
    ) => {
      const nextSnapshot = updater(hangAuditSnapshotRef.current);

      hangAuditSnapshotRef.current = nextSnapshot;

      if (options.persistImmediately) {
        persistHangAuditSnapshot(nextSnapshot);
        publishHangAuditSnapshot(nextSnapshot);
      }

      setHangAuditSnapshot(nextSnapshot);
    },
    [],
  );

  const appendHangAuditEvent = useCallback(
    (options: {
      category: HangAuditEntry["category"];
      detail: string;
      durationMs?: number | null;
      label: string;
    }) => {
      const entry = createHangAuditEntry({
        category: options.category,
        context: hangAuditContextRef.current,
        detail: options.detail,
        durationMs: options.durationMs,
        id: nextHangAuditEntryIdRef.current,
        label: options.label,
      });

      nextHangAuditEntryIdRef.current += 1;

      commitHangAuditSnapshot((previous) => appendHangAuditEntry(previous, entry));
    },
    [commitHangAuditSnapshot],
  );

  const armHangAuditIntent = useCallback(
    (intent: Pick<PendingWorkbenchTransition, "kind" | "label">) => {
      const now = Date.now();
      const detail = `${intent.label}. Intent recorded before the guarded action begins so a full browser hang still leaves the last risky click recoverable on reload.`;
      const entryId = nextHangAuditEntryIdRef.current;
      const entry = createHangAuditEntry({
        category: "intent",
        context: hangAuditContextRef.current,
        detail,
        id: entryId,
        label: `${intent.label} (Intent armed)`,
        now,
      });

      nextHangAuditEntryIdRef.current += 1;

      commitHangAuditSnapshot(
        (previous) => {
          const nextSnapshot = appendHangAuditEntry(
            {
              ...previous,
              activeIntent: {
                detail,
                id: entryId,
                kind: intent.kind,
                label: intent.label,
                startedAt: now,
                updatedAt: now,
              },
            },
            entry,
          );

          return {
            ...nextSnapshot,
            activeIntent: {
              detail,
              id: entryId,
              kind: intent.kind,
              label: intent.label,
              startedAt: now,
              updatedAt: now,
            },
          };
        },
        { persistImmediately: true },
      );
    },
    [commitHangAuditSnapshot],
  );

  const clearHangAuditIntent = useCallback(() => {
    commitHangAuditSnapshot(
      (previous) =>
        previous.activeIntent === null
          ? previous
          : {
              ...previous,
              activeIntent: null,
              updatedAt: Date.now(),
            },
      { persistImmediately: true },
    );
  }, [commitHangAuditSnapshot]);

  const persistCurrentHangAuditSnapshot = useCallback((tabClosedGracefully: boolean) => {
    const nextSnapshot = {
      ...hangAuditSnapshotRef.current,
      tabClosedGracefully,
      updatedAt: Date.now(),
    };

    hangAuditSnapshotRef.current = nextSnapshot;
    persistHangAuditSnapshot(nextSnapshot);
    publishHangAuditSnapshot(nextSnapshot);
  }, []);

  const updateWorkbenchTransitionDiagnostic = useCallback(
    (
      transition: Pick<PendingWorkbenchTransition, "id" | "kind" | "label">,
      phase: WorkbenchTransitionPhase,
    ) => {
      const nextDiagnostic = createWorkbenchTransitionDiagnostic(
        workbenchTransitionDiagnosticRef.current,
        transition,
        phase,
      );

      workbenchTransitionDiagnosticRef.current = nextDiagnostic;
      publishWorkbenchTransitionDiagnostic(nextDiagnostic);
      setWorkbenchTransitionDiagnostic(nextDiagnostic);

      const entry = createHangAuditEntry({
        category: "transition",
        context: hangAuditContextRef.current,
        detail: nextDiagnostic.detail,
        id: nextHangAuditEntryIdRef.current,
        label: `${nextDiagnostic.label} (${formatWorkbenchTransitionPhase(nextDiagnostic.phase)})`,
        now: nextDiagnostic.updatedAt,
      });

      nextHangAuditEntryIdRef.current += 1;

      commitHangAuditSnapshot(
        (previous) => {
          const nextSnapshot = appendHangAuditEntry(
            {
              ...previous,
              activeIntent: null,
              activeTransition: { ...nextDiagnostic },
            },
            entry,
          );

          return {
            ...nextSnapshot,
            activeIntent: null,
            activeTransition: { ...nextDiagnostic },
          };
        },
        { persistImmediately: true },
      );
    },
    [commitHangAuditSnapshot],
  );

  const { data: presets = [], isLoading: isPresetsLoading } = useQuery({
    queryKey: ["presets"],
    queryFn: listPresets,
  });

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
    presetName = defaultFormValues.presetName,
    sourceMode = defaultFormValues.sourceMode,
    sampleId = defaultFormValues.sampleId,
    rootPath = defaultFormValues.rootPath,
    flattenMode = defaultFormValues.flattenMode,
    pathSeparator = defaultFormValues.pathSeparator,
    arrayIndexSuffix = defaultFormValues.arrayIndexSuffix,
    placeholderStrategy = defaultFormValues.placeholderStrategy,
    customPlaceholder = defaultFormValues.customPlaceholder,
    onMissingKey = defaultFormValues.onMissingKey,
    onTypeMismatch = defaultFormValues.onTypeMismatch,
    headerPolicy = defaultFormValues.headerPolicy,
    headerSampleSize = defaultFormValues.headerSampleSize,
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
    customJson: committedCustomJson,
    customPlaceholder,
    dateFormat,
    delimiter,
    emptyArrayBehavior,
    flattenMode,
    headerPolicy,
    headerSampleSize,
    maxDepth,
    onMissingKey,
    onTypeMismatch,
    pathSeparator,
    placeholderStrategy,
    presetName,
    quoteAll,
    rootPath,
    sampleId,
    sourceMode,
    strictNaming,
  };
  const activeSample = getSampleById(liveValues.sampleId);
  const isCustomJsonDirty = customJsonDraft !== committedCustomJson;
  const streamableCustomSelector =
    liveValues.sourceMode === "custom" ? resolveStreamableJsonPath(liveValues.rootPath) : null;
  const parsedValues = converterFormSchema.safeParse(liveValues);
  const activeConfig = parsedValues.success
    ? toMappingConfig(parsedValues.data, plannerRules, headerRules)
    : undefined;
  const currentWorkbenchProjectionSignature = useMemo(
    () =>
      createWorkbenchProjectionSignature({
        config: activeConfig,
        customJson: liveValues.customJson,
        sampleJson: activeSample.json,
        sourceMode: liveValues.sourceMode,
      }),
    [activeConfig, activeSample.json, liveValues.customJson, liveValues.sourceMode],
  );
  const projection = useProjectionPreview(
    {
      config: activeConfig,
      customJson: liveValues.customJson,
      includeRelational: false,
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : "invalid-config",
    {
      enabled: !isProjectionDebugDisabled,
    },
  );
  const relationalPreview = useRelationalPreview(
    {
      config: activeConfig,
      customJson: liveValues.customJson,
      rootPath: liveValues.rootPath,
      sampleJson: activeSample.json,
      sourceMode: liveValues.sourceMode,
    },
    activeConfig ? JSON.stringify(activeConfig) : "invalid-config",
    {
      enabled:
        !isProjectionDebugDisabled &&
        activeConfig !== undefined &&
        !projection.isProjecting &&
        projection.parseError === null,
    },
  );
  const discoveredPaths = projection.discoveredPaths;
  const conversionResult = projection.conversionResult;
  const relationalSplitResult = relationalPreview.relationalSplitResult;
  const streamingFlatPreview = projection.streamingFlatPreview;
  const isStreamingFlatPreview = projection.isProjecting && streamingFlatPreview !== null;
  const isRelationalPreviewProjecting = relationalPreview.isProjecting;
  const headerSuggestions = useMemo(
    () => buildHeaderSuggestions(conversionResult?.schema.columns ?? [], discoveredPaths),
    [conversionResult?.schema.columns, discoveredPaths],
  );

  const flatHeaders =
    streamingFlatPreview?.headers ?? conversionResult?.headers ?? emptyPreviewHeaders;
  const flatRecords =
    streamingFlatPreview?.previewRecords ?? conversionResult?.records ?? emptyPreviewRecords;
  const flatRowCount = streamingFlatPreview?.rowCount ?? conversionResult?.rowCount ?? 0;
  const flatCsvLineCount =
    isStreamingFlatPreview || conversionResult
      ? flatRowCount + (flatHeaders.length > 0 ? 1 : 0)
      : 0;
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
  const selectedRelationalTable =
    relationalSplitResult?.tables.find(
      (table) => table.tableName === selectedRelationalTableName,
    ) ??
    relationalSplitResult?.tables[0] ??
    null;
  const relationalPreviewRows = createRowPreview(
    selectedRelationalTable?.records ?? [],
    projectionRelationalRowPreviewLimit,
  );
  const relationalPreviewRowsTruncated =
    relationalPreviewRows.truncated ||
    (selectedRelationalTable?.rowCount ?? 0) > (selectedRelationalTable?.records.length ?? 0);
  const relationalPreviewStatusMessage = isProjectionDebugDisabled
    ? "Relational split preview is paused while projection debugging is disabled."
    : activeConfig === undefined
      ? "Relational split preview is unavailable while the current mapping config is invalid."
      : projection.parseError
        ? "Relational split preview starts after the current JSON parses successfully."
        : projection.isProjecting
          ? "Relational split preview starts after the flat preview finishes rebuilding."
          : isRelationalPreviewProjecting
            ? relationalPreview.progress
              ? `${relationalPreview.progress.label} ${formatProjectionProgressDetail(relationalPreview.progress)}.`
              : "Building relational tables in the background."
            : "No relational tables were generated for the current form values.";
  const outputExportBlockedReason =
    activeConfig === undefined
      ? "Fix the current mapping config before exporting."
      : projection.parseError
        ? "Resolve the current JSON parse error before exporting."
        : pendingWorkbenchTransition
          ? "Wait for the current projection transition to settle before exporting."
          : projection.isProjecting
            ? "Wait for the current preview rebuild to finish before exporting."
            : liveValues.sourceMode === "custom" && isCustomJsonDirty
              ? "Apply the current custom JSON draft before exporting."
              : null;
  const canExportOutputs = outputExportBlockedReason === null;
  const complexJsonOverview = useMemo(
    () =>
      buildComplexJsonOverview(
        discoveredPaths,
        conversionResult?.schema.columns.length ?? flatHeaders.length,
        liveValues.rootPath,
      ),
    [
      conversionResult?.schema.columns.length,
      discoveredPaths,
      flatHeaders.length,
      liveValues.rootPath,
    ],
  );
  const complexJsonOverviewKey = complexJsonOverview
    ? [
        liveValues.sourceMode,
        liveValues.rootPath,
        complexJsonOverview.totalPathCount,
        complexJsonOverview.columnCount,
      ].join(":")
    : null;
  const isComplexJsonGuidanceVisible =
    complexJsonOverview !== null && complexJsonOverviewKey !== dismissedComplexJsonOverviewKey;
  const activeConfigDescription = activeConfig
    ? describeConfig(activeConfig)
    : "Invalid configuration";
  const visibleFlatHeaders = useMemo(
    () => flatHeaders.slice(0, tableColumnPreviewLimit),
    [flatHeaders],
  );
  const hiddenFlatColumnCount = Math.max(0, flatHeaders.length - visibleFlatHeaders.length);
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
  const commandPaletteActions = useMemo<CommandPaletteAction[]>(
    () => [
      {
        description: "Jump to the flat row cockpit.",
        icon: <Rows3 className="size-4" />,
        id: "view-flat",
        keywords: ["rows", "grid", "table"],
        label: "Open Flat Rows",
        onSelect: () => setActiveView("flat"),
      },
      {
        description: "Inspect linked relational tables in the shared grid.",
        disabled: !relationalSplitResult,
        icon: <Archive className="size-4" />,
        id: "view-relational",
        keywords: ["relationships", "linked", "tables"],
        label: "Open Relational Tables",
        onSelect: () => setActiveView("relational"),
      },
      {
        description: "Open the raw CSV preview panel.",
        icon: <Download className="size-4" />,
        id: "view-csv",
        keywords: ["export", "preview"],
        label: "Open CSV Preview",
        onSelect: () => setActiveView("csv"),
      },
      {
        description: "Open schema sidecar and type drift diagnostics.",
        icon: <Database className="size-4" />,
        id: "view-schema",
        keywords: ["columns", "types", "schema"],
        label: "Open Schema Sidecar",
        onSelect: () => setActiveView("schema"),
      },
      {
        description: "Switch to the bundled sample catalog.",
        icon: <FileJson2 className="size-4" />,
        id: "source-sample",
        label: "Use Sample Catalog",
        onSelect: () => handleSourceModeChange("sample"),
      },
      {
        description: "Switch to the staged custom JSON editor.",
        icon: <Braces className="size-4" />,
        id: "source-custom",
        label: "Use Custom JSON",
        onSelect: () => handleSourceModeChange("custom"),
      },
      {
        description: "Run smart root-path detection on the current payload.",
        icon: <Waypoints className="size-4" />,
        id: "smart-detect",
        label: "Run Smart Detect",
        onSelect: handleSmartDetect,
      },
      {
        description: "Download the full flat CSV output.",
        disabled: !canExportOutputs,
        icon: <Download className="size-4" />,
        id: "export-flat",
        label: "Export Full CSV",
        onSelect: () => {
          void handleFlatCsvExport();
        },
      },
      {
        description: "Download the currently selected relational table.",
        disabled: !canExportOutputs || !selectedRelationalTable,
        icon: <Archive className="size-4" />,
        id: "export-relational-table",
        label: "Export Selected Relational Table",
        onSelect: () => {
          void handleSelectedRelationalExport();
        },
      },
      {
        description: "Return the inspector to mapping controls.",
        icon: <Settings2 className="size-4" />,
        id: "inspector-mapping",
        label: "Open Mapping Inspector",
        onSelect: () => {
          clearWorkbenchSelection();
          setInspectorMode("mapping");
          setInspectorOpen(true);
        },
      },
      {
        description: "Reset the workbench to its default sample configuration.",
        icon: <Save className="size-4" />,
        id: "reset-defaults",
        label: "Reset Workbench Defaults",
        onSelect: handleResetDefaults,
      },
    ],
    [
      canExportOutputs,
      clearWorkbenchSelection,
      handleResetDefaults,
      handleSmartDetect,
      relationalSplitResult,
      selectedRelationalTable,
      setActiveView,
      setInspectorMode,
      setInspectorOpen,
    ],
  );

  useEffect(() => {
    const tableNames = relationalSplitResult?.tables.map((table) => table.tableName) ?? ["root"];

    if (tableNames.includes(selectedRelationalTableName)) {
      return;
    }

    setSelectedRelationalTableName(tableNames[0] ?? "root");
  }, [relationalSplitResult, selectedRelationalTableName]);

  useEffect(() => {
    if (complexJsonOverviewKey !== null) {
      return;
    }

    setDismissedComplexJsonOverviewKey(null);
  }, [complexJsonOverviewKey]);

  useEffect(() => {
    workbenchTransitionDiagnosticRef.current = workbenchTransitionDiagnostic;
  }, [workbenchTransitionDiagnostic]);

  useEffect(() => {
    if (activeView !== "relational") {
      return;
    }

    if (relationalSplitResult?.tables.length) {
      return;
    }

    setActiveView("flat");
  }, [activeView, relationalSplitResult?.tables.length, setActiveView]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }

      if (event.key !== "Escape") {
        return;
      }

      if (isLeftRailOpen) {
        setLeftRailOpen(false);
      }

      if (isInspectorOpen) {
        setInspectorOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isCommandPaletteOpen,
    isInspectorOpen,
    isLeftRailOpen,
    setCommandPaletteOpen,
    setInspectorOpen,
    setLeftRailOpen,
  ]);

  useEffect(() => {
    hangAuditSnapshotRef.current = hangAuditSnapshot;
    persistHangAuditSnapshot(hangAuditSnapshot);
    publishHangAuditSnapshot(hangAuditSnapshot);
  }, [hangAuditSnapshot]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePageHide = () => {
      persistCurrentHangAuditSnapshot(true);
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistCurrentHangAuditSnapshot]);

  useEffect(() => {
    if (typeof PerformanceObserver === "undefined" || isJsdomEnvironment) {
      return;
    }

    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? [];

    if (!supportedEntryTypes.includes("longtask")) {
      return;
    }

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < hangAuditLongTaskThresholdMs) {
          continue;
        }

        const roundedDuration = Math.round(entry.duration);
        const context = hangAuditContextRef.current;

        appendHangAuditEvent({
          category: "longtask",
          detail: `Main thread blocked for ${roundedDuration} ms while ${describeHangAuditContext(context)}.`,
          durationMs: roundedDuration,
          label: context.transitionLabel ?? context.projectionLabel ?? "Main-thread long task",
        });
      }
    });

    observer.observe({ entryTypes: ["longtask"] });

    return () => {
      observer.disconnect();
    };
  }, [appendHangAuditEvent, isJsdomEnvironment]);

  useEffect(() => {
    if (
      isJsdomEnvironment ||
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    let frameId = 0;
    let lastFrameAt: number | null = null;

    const tick = (now: number) => {
      if (document.visibilityState !== "visible") {
        lastFrameAt = now;
        frameId = window.requestAnimationFrame(tick);
        return;
      }

      if (lastFrameAt !== null) {
        const gapMs = now - lastFrameAt;

        if (gapMs >= hangAuditFrameGapThresholdMs) {
          const roundedGapMs = Math.round(gapMs);
          const context = hangAuditContextRef.current;

          appendHangAuditEvent({
            category: "frame-gap",
            detail: `No paint completed for ${roundedGapMs} ms while ${describeHangAuditContext(context)}.`,
            durationMs: roundedGapMs,
            label: context.transitionLabel ?? context.projectionLabel ?? "Main-thread paint gap",
          });
        }
      }

      lastFrameAt = now;
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [appendHangAuditEvent, isJsdomEnvironment]);

  useEffect(() => {
    if (pendingWorkbenchTransition === null) {
      return;
    }

    if (!pendingWorkbenchTransition.hasApplied) {
      return;
    }

    if (projection.isProjecting) {
      if (pendingWorkbenchTransition.hasStarted) {
        return;
      }

      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current);
        transitionWatchdogTimeoutRef.current = null;
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, "projecting");
      setPendingWorkbenchTransition((previous) =>
        previous === null || previous.hasStarted ? previous : { ...previous, hasStarted: true },
      );
      return;
    }

    if (pendingWorkbenchTransition.projectionSignature === currentWorkbenchProjectionSignature) {
      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current);
        transitionWatchdogTimeoutRef.current = null;
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, "settled");
      setPendingWorkbenchTransition(null);
      return;
    }

    if (pendingWorkbenchTransition.hasStarted) {
      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current);
        transitionWatchdogTimeoutRef.current = null;
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, "settled");
      setPendingWorkbenchTransition(null);
      return;
    }

    if (isProjectionDebugDisabled || typeof Worker === "undefined") {
      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current);
        transitionWatchdogTimeoutRef.current = null;
      }

      updateWorkbenchTransitionDiagnostic(pendingWorkbenchTransition, "settled");
      setPendingWorkbenchTransition(null);
      return;
    }
  }, [
    isProjectionDebugDisabled,
    currentWorkbenchProjectionSignature,
    pendingWorkbenchTransition,
    projection.isProjecting,
    updateWorkbenchTransitionDiagnostic,
  ]);

  useEffect(
    () => () => {
      if (transitionApplyFrameRef.current !== null) {
        window.cancelAnimationFrame(transitionApplyFrameRef.current);
        transitionApplyFrameRef.current = null;
      }

      if (transitionApplyTimeoutRef.current !== null) {
        window.clearTimeout(transitionApplyTimeoutRef.current);
        transitionApplyTimeoutRef.current = null;
      }

      if (transitionWatchdogTimeoutRef.current !== null) {
        window.clearTimeout(transitionWatchdogTimeoutRef.current);
        transitionWatchdogTimeoutRef.current = null;
      }
    },
    [],
  );

  const savePresetMutation = useMutation({
    mutationFn: async (values: ConverterFormValues) => {
      const parsed = converterFormSchema.parse(values);
      const customInput = parsed.sourceMode === "custom" ? parseJsonInput(parsed.customJson) : null;

      if (parsed.sourceMode === "custom" && customInput?.value === undefined) {
        throw new Error(customInput?.error ?? "Invalid JSON input.");
      }

      return createPreset({
        name: parsed.presetName.trim(),
        sourceMode: parsed.sourceMode,
        sampleId: parsed.sampleId,
        customJson: parsed.sourceMode === "custom" ? parsed.customJson : undefined,
        config: toMappingConfig(parsed, plannerRules, headerRules),
      });
    },
    onSuccess: async (savedPreset) => {
      await queryClient.invalidateQueries({ queryKey: ["presets"] });
      startTransition(() => {
        selectPreset(savedPreset.id ?? null);
      });
    },
  });

  function clearWorkbenchTransitionWatchdog() {
    if (transitionWatchdogTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(transitionWatchdogTimeoutRef.current);
    transitionWatchdogTimeoutRef.current = null;
  }

  async function handleFlatCsvExport() {
    if (!canExportOutputs) {
      return;
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        "Preparing full flat CSV export",
      );

      downloadExportArtifact(bundle.flatCsv);
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  async function handleSelectedRelationalExport() {
    if (!canExportOutputs || !selectedRelationalTable) {
      return;
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        `Preparing ${selectedRelationalTable.tableName} relational CSV export`,
      );
      const tableArtifact = bundle.relationalTables.find(
        (table) => table.tableName === selectedRelationalTable.tableName,
      );

      if (!tableArtifact) {
        return;
      }

      downloadExportArtifact(tableArtifact);
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  async function handleRelationalArchiveExport() {
    if (!canExportOutputs) {
      return;
    }

    try {
      const bundle = await runExport(
        createOutputExportRequest({
          config: activeConfig,
          customJson: liveValues.customJson,
          exportName: liveValues.presetName,
          rootPath: liveValues.rootPath,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
        "Preparing bundled relational export",
      );

      if (!bundle.relationalArchive) {
        return;
      }

      downloadExportArtifact(bundle.relationalArchive);
    } catch {
      // Export errors are surfaced through the shared hook state.
    }
  }

  function cancelScheduledWorkbenchTransition() {
    if (transitionApplyFrameRef.current !== null) {
      window.cancelAnimationFrame(transitionApplyFrameRef.current);
      transitionApplyFrameRef.current = null;
    }

    if (transitionApplyTimeoutRef.current !== null) {
      window.clearTimeout(transitionApplyTimeoutRef.current);
      transitionApplyTimeoutRef.current = null;
    }

    clearWorkbenchTransitionWatchdog();
  }

  function scheduleWorkbenchTransition(
    transition: Omit<PendingWorkbenchTransition, "hasApplied" | "hasStarted" | "id">,
    apply: () => void,
  ) {
    cancelScheduledWorkbenchTransition();

    const nextTransition: PendingWorkbenchTransition = {
      ...transition,
      hasApplied: false,
      hasStarted: false,
      id: transitionSequenceRef.current + 1,
    };

    transitionSequenceRef.current = nextTransition.id;
    flushSync(() => {
      setPendingWorkbenchTransition(nextTransition);
      updateWorkbenchTransitionDiagnostic(nextTransition, "queued");
    });

    transitionApplyFrameRef.current = window.requestAnimationFrame(() => {
      transitionApplyFrameRef.current = window.requestAnimationFrame(() => {
        transitionApplyFrameRef.current = null;

        transitionApplyTimeoutRef.current = window.setTimeout(() => {
          transitionApplyTimeoutRef.current = null;

          flushSync(() => {
            setPendingWorkbenchTransition((previous) =>
              previous?.id === nextTransition.id ? { ...previous, hasApplied: true } : previous,
            );
            updateWorkbenchTransitionDiagnostic(nextTransition, "applying");
          });

          apply();

          transitionWatchdogTimeoutRef.current = window.setTimeout(() => {
            updateWorkbenchTransitionDiagnostic(nextTransition, "timed-out");
          }, workbenchTransitionWatchdogMs);
        }, 0);
      });
    });
  }

  function applyCustomJson(
    nextText: string = customJsonDraft,
    options: {
      suspendWorkbench?: boolean;
    } = {},
  ) {
    const shouldRebuildProjection = nextText !== committedCustomJson;

    if (options.suspendWorkbench && shouldRebuildProjection) {
      armHangAuditIntent({
        kind: "custom-rebuild",
        label: "Rebuilding preview for committed custom JSON",
      });
    }

    const parsedNextInput = parseJsonInput(nextText);
    const nextSmartSuggestion =
      parsedNextInput.value === undefined
        ? null
        : detectSmartConfigSuggestion(parsedNextInput.value);
    const autoSmartSuggestion = shouldAutoApplySmartSuggestion(
      nextSmartSuggestion,
      parsedNextInput.value,
      liveValues.rootPath,
    )
      ? nextSmartSuggestion
      : null;

    const finalizeApply = () => {
      setCustomJsonDraft(nextText);
      setCommittedCustomJson(nextText);

      if (autoSmartSuggestion) {
        applySmartSuggestion(autoSmartSuggestion, { auto: true });
        return;
      }

      setSmartDetectFeedback(null);
    };

    if (options.suspendWorkbench && shouldRebuildProjection) {
      const nextFlattenMode = autoSmartSuggestion?.flattenMode ?? liveValues.flattenMode;
      const nextHeaderRules =
        autoSmartSuggestion?.kind === "keyed-map"
          ? upsertHeaderAliasRule(
              headerRules,
              autoSmartSuggestion.keySourcePath,
              autoSmartSuggestion.keyAlias,
              {
                overwriteExisting: false,
              },
            )
          : headerRules;
      const nextConfig = toMappingConfig(
        {
          ...liveValues,
          customJson: nextText,
          flattenMode: nextFlattenMode,
          rootPath: autoSmartSuggestion?.rootPath ?? liveValues.rootPath,
        },
        plannerRules,
        nextHeaderRules,
      );

      scheduleWorkbenchTransition(
        {
          kind: "custom-rebuild",
          label: "Rebuilding preview for committed custom JSON",
          projectionSignature: createWorkbenchProjectionSignature({
            config: nextConfig,
            customJson: nextText,
            sampleJson: activeSample.json,
            sourceMode: liveValues.sourceMode,
          }),
        },
        finalizeApply,
      );

      return nextText;
    }

    cancelScheduledWorkbenchTransition();
    finalizeApply();
    setPendingWorkbenchTransition(null);

    return nextText;
  }

  function loadPreset(preset: SavedPreset) {
    armHangAuditIntent({
      kind: "load-preset",
      label: "Loading saved preset",
    });

    const nextValues = toFormValues(preset);
    const nextCustomJson = nextValues.sourceMode === "custom" ? nextValues.customJson : "";
    const nextSample = getSampleById(nextValues.sampleId);

    scheduleWorkbenchTransition(
      {
        kind: "load-preset",
        label: "Loading saved preset",
        projectionSignature: createWorkbenchProjectionSignature({
          config: preset.config,
          customJson: nextCustomJson,
          sampleJson: nextSample.json,
          sourceMode: nextValues.sourceMode,
        }),
      },
      () => {
        form.reset({
          ...nextValues,
          customJson: defaultFormValues.customJson,
        });
        setHeaderRules(headerRulesFromConfig(preset.config));
        setSmartDetectFeedback(null);
        setCustomJsonDraft(nextCustomJson);
        setCommittedCustomJson(nextCustomJson);
        setPlannerRules(plannerRulesFromConfig(preset.config));
        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(preset.id ?? null);
        });
      },
    );
  }

  function handleSampleChange(sampleId: string) {
    const sample = getSampleById(sampleId);

    form.setValue("sampleId", sampleId, { shouldValidate: true });
    form.setValue("rootPath", defaultRootPaths[sampleId] ?? "$", {
      shouldValidate: true,
    });
    form.setValue("presetName", `${sample?.title ?? "Sample"} export`, {
      shouldValidate: true,
    });
    setSmartDetectFeedback(null);
    savePresetMutation.reset();

    startTransition(() => {
      selectPreset(null);
    });
  }

  function handleSourceModeChange(sourceMode: SourceMode) {
    if (sourceMode === liveValues.sourceMode) {
      return;
    }

    armHangAuditIntent({
      kind: "source-switch",
      label: sourceMode === "sample" ? "Switching to sample catalog" : "Switching to custom JSON",
    });

    scheduleWorkbenchTransition(
      {
        kind: "source-switch",
        label: sourceMode === "sample" ? "Switching to sample catalog" : "Switching to custom JSON",
        projectionSignature: createWorkbenchProjectionSignature({
          config: toMappingConfig(
            {
              ...liveValues,
              rootPath:
                sourceMode === "sample" ? (defaultRootPaths[liveValues.sampleId] ?? "$") : "$",
              sourceMode,
            },
            plannerRules,
            headerRules,
          ),
          customJson: committedCustomJson,
          sampleJson: activeSample.json,
          sourceMode,
        }),
      },
      () => {
        const nextRootPath =
          sourceMode === "sample" ? (defaultRootPaths[liveValues.sampleId] ?? "$") : "$";

        form.setValue("sourceMode", sourceMode, { shouldValidate: true });
        form.setValue("rootPath", nextRootPath, { shouldValidate: true });
        setSmartDetectFeedback(null);
        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(null);
        });
      },
    );
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    armHangAuditIntent({
      kind: "import-json",
      label: "Importing JSON file",
    });

    const text = await file.text();
    const importedInput = parseJsonInput(text);
    const importedSmartSuggestion =
      importedInput.value === undefined ? null : detectSmartConfigSuggestion(importedInput.value);
    const nextRootPath = importedSmartSuggestion ? importedSmartSuggestion.rootPath : "$";
    const nextFlattenMode = importedSmartSuggestion?.flattenMode ?? liveValues.flattenMode;
    const nextHeaderRules =
      importedSmartSuggestion?.kind === "keyed-map"
        ? upsertHeaderAliasRule(
            headerRules,
            importedSmartSuggestion.keySourcePath,
            importedSmartSuggestion.keyAlias,
            {
              overwriteExisting: false,
            },
          )
        : headerRules;
    const nextConfig = toMappingConfig(
      {
        ...liveValues,
        customJson: text,
        flattenMode: nextFlattenMode,
        rootPath: nextRootPath,
        sourceMode: "custom",
      },
      plannerRules,
      nextHeaderRules,
    );

    event.target.value = "";

    scheduleWorkbenchTransition(
      {
        kind: "import-json",
        label: "Importing JSON file",
        projectionSignature: createWorkbenchProjectionSignature({
          config: nextConfig,
          customJson: text,
          sampleJson: activeSample.json,
          sourceMode: "custom",
        }),
      },
      () => {
        form.setValue("sourceMode", "custom", { shouldValidate: true });
        setCustomJsonDraft(text);
        setCommittedCustomJson(text);

        if (importedSmartSuggestion) {
          applySmartSuggestion(importedSmartSuggestion, { auto: true });
        } else {
          form.setValue("rootPath", "$", { shouldValidate: true });
          setSmartDetectFeedback(null);
        }

        form.setValue("presetName", `${stripFileExtension(file.name)} export`, {
          shouldValidate: true,
        });
        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(null);
        });
      },
    );
  }

  function handleLoadSampleIntoEditor() {
    armHangAuditIntent({
      kind: "load-sample",
      label: "Loading active sample",
    });

    const activeSampleSmartSuggestion = detectSmartConfigSuggestion(activeSample.json);
    const nextCustomJson = stringifyJsonInput(activeSample.json);
    const nextRootPath = activeSampleSmartSuggestion
      ? activeSampleSmartSuggestion.rootPath
      : (defaultRootPaths[activeSample.id] ?? "$");
    const nextFlattenMode = activeSampleSmartSuggestion?.flattenMode ?? liveValues.flattenMode;
    const nextHeaderRules =
      activeSampleSmartSuggestion?.kind === "keyed-map"
        ? upsertHeaderAliasRule(
            headerRules,
            activeSampleSmartSuggestion.keySourcePath,
            activeSampleSmartSuggestion.keyAlias,
            {
              overwriteExisting: false,
            },
          )
        : headerRules;
    const nextConfig = toMappingConfig(
      {
        ...liveValues,
        customJson: nextCustomJson,
        flattenMode: nextFlattenMode,
        rootPath: nextRootPath,
        sourceMode: "custom",
      },
      plannerRules,
      nextHeaderRules,
    );

    scheduleWorkbenchTransition(
      {
        kind: "load-sample",
        label: "Loading active sample",
        projectionSignature: createWorkbenchProjectionSignature({
          config: nextConfig,
          customJson: nextCustomJson,
          sampleJson: activeSample.json,
          sourceMode: "custom",
        }),
      },
      () => {
        form.setValue("sourceMode", "custom", { shouldValidate: true });
        setCustomJsonDraft(nextCustomJson);
        setCommittedCustomJson(nextCustomJson);

        if (activeSampleSmartSuggestion) {
          applySmartSuggestion(activeSampleSmartSuggestion, { auto: true });
        } else {
          form.setValue("rootPath", defaultRootPaths[activeSample.id] ?? "$", {
            shouldValidate: true,
          });
          setSmartDetectFeedback(null);
        }

        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(null);
        });
      },
    );
  }

  function handleResetDefaults() {
    armHangAuditIntent({
      kind: "reset-defaults",
      label: "Resetting to defaults",
    });

    const nextDefaultConfig = toMappingConfig(defaultFormValues, [], []);

    scheduleWorkbenchTransition(
      {
        kind: "reset-defaults",
        label: "Resetting to defaults",
        projectionSignature: createWorkbenchProjectionSignature({
          config: nextDefaultConfig,
          customJson: defaultFormValues.customJson,
          sampleJson: getSampleById(defaultFormValues.sampleId).json,
          sourceMode: defaultFormValues.sourceMode,
        }),
      },
      () => {
        form.reset(defaultFormValues);
        setHeaderRules([]);
        setCustomJsonDraft(defaultFormValues.customJson);
        setCommittedCustomJson(defaultFormValues.customJson);
        setPlannerRules([]);
        setSmartDetectFeedback(null);
        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(null);
        });
      },
    );
  }

  function handleFormatCustomJson() {
    const formatted = formatJsonInput(customJsonDraft);

    if (!formatted.formattedText) {
      return;
    }

    applyCustomJson(formatted.formattedText, {
      suspendWorkbench: true,
    });
  }

  function shouldAutoApplySmartSuggestion(
    suggestion: SmartConfigSuggestion | null,
    input: JsonValue | undefined,
    currentRootPath: string,
  ) {
    if (suggestion === null || input === undefined) {
      return false;
    }

    const normalizedRootPath = currentRootPath.trim() || "$";

    if (normalizedRootPath === "$") {
      return true;
    }

    return selectRootNodes(input, normalizedRootPath).length === 0;
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

    if (suggestion.kind === "keyed-map") {
      setHeaderRules((previous) =>
        upsertHeaderAliasRule(previous, suggestion.keySourcePath, suggestion.keyAlias, {
          overwriteExisting: !options.auto,
        }),
      );
    }

    setSmartDetectFeedback({
      detail: options.auto
        ? `Auto-applied smart row detection. ${suggestion.summary}`
        : suggestion.summary,
      previewHeaders: suggestion.previewHeaders,
      tone: "success",
    });
  }

  function handleSmartDetect() {
    armHangAuditIntent({
      kind: "smart-detect",
      label: "Applying smart row detection",
    });

    const resolvedInput =
      liveValues.sourceMode === "custom"
        ? parseJsonInput(customJsonDraft)
        : { error: null, value: activeSample.json };

    if (resolvedInput.value === undefined) {
      clearHangAuditIntent();
      setSmartDetectFeedback({
        detail: `Smart detect needs valid JSON before it can analyze the current payload.${resolvedInput.error ? ` ${resolvedInput.error}` : ""}`,
        previewHeaders: [],
        tone: "error",
      });
      return;
    }

    const suggestion = detectSmartConfigSuggestion(resolvedInput.value);

    if (!suggestion) {
      clearHangAuditIntent();
      setSmartDetectFeedback({
        detail:
          "Smart detect did not find a better row-root or preserve-completeness strategy for the current payload.",
        previewHeaders: [],
        tone: "info",
      });
      return;
    }

    const nextFlattenMode = suggestion.flattenMode ?? liveValues.flattenMode;
    const nextHeaderRules =
      suggestion.kind === "keyed-map"
        ? upsertHeaderAliasRule(headerRules, suggestion.keySourcePath, suggestion.keyAlias)
        : headerRules;
    const nextConfig = toMappingConfig(
      {
        ...liveValues,
        flattenMode: nextFlattenMode,
        rootPath: suggestion.rootPath,
      },
      plannerRules,
      nextHeaderRules,
    );

    scheduleWorkbenchTransition(
      {
        kind: "smart-detect",
        label: "Applying smart row detection",
        projectionSignature: createWorkbenchProjectionSignature({
          config: nextConfig,
          customJson: liveValues.sourceMode === "custom" ? customJsonDraft : liveValues.customJson,
          sampleJson: activeSample.json,
          sourceMode: liveValues.sourceMode,
        }),
      },
      () => {
        if (liveValues.sourceMode === "custom") {
          setCustomJsonDraft(customJsonDraft);
          setCommittedCustomJson(customJsonDraft);
        }

        applySmartSuggestion(suggestion);
        savePresetMutation.reset();

        startTransition(() => {
          selectPreset(null);
        });
      },
    );
  }

  function handleComplexJsonRootSelection(nextRootPath: string) {
    form.setValue("rootPath", nextRootPath, { shouldValidate: true });
    setDismissedComplexJsonOverviewKey(null);
  }

  function handleContinueComplexJsonWorkbench() {
    if (complexJsonOverviewKey === null) {
      return;
    }

    setDismissedComplexJsonOverviewKey(complexJsonOverviewKey);
  }

  const configErrors = parsedValues.success
    ? []
    : parsedValues.error.issues.map((issue) => issue.message);
  const activePreset = presets.find((preset) => preset.id === selectedPresetId) ?? null;
  const canSavePreset =
    !isProjectionDebugDisabled &&
    parsedValues.success &&
    (liveValues.sourceMode === "sample" ||
      (!projection.isProjecting && projection.parseError === null));
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
  const committedCustomJsonParseResult =
    liveValues.sourceMode === "custom" && !isCustomJsonDirty
      ? parseJsonInput(committedCustomJson)
      : null;
  const isWorkbenchTransitionPending = pendingWorkbenchTransition !== null;
  const isCustomProjectionPending = pendingWorkbenchTransition?.kind === "custom-rebuild";
  const isCustomProjectionRebuilding =
    liveValues.sourceMode === "custom" && isCustomProjectionPending && !isCustomJsonDirty;
  const isCustomWorkbenchSuspended =
    liveValues.sourceMode === "custom" && (isCustomJsonDirty || isWorkbenchTransitionPending);
  const isWorkbenchSuspended = isWorkbenchTransitionPending || isCustomWorkbenchSuspended;
  const suspendedWorkbenchTitle = pendingWorkbenchTransition
    ? `${pendingWorkbenchTransition.label}.`
    : isCustomJsonDirty
      ? "Preview paused while editing custom JSON."
      : "Rebuilding preview for committed custom JSON.";
  const suspendedWorkbenchDescription = pendingWorkbenchTransition
    ? "The previous workbench stays hidden while this transition replaces the active projection state."
    : isCustomJsonDirty
      ? "The row preview, relational split, CSV output, and schema sidecar are hidden until the current draft is applied."
      : "The row preview, relational split, CSV output, and schema sidecar stay hidden until the next committed custom projection finishes.";
  const suspendedWorkbenchLead = pendingWorkbenchTransition
    ? "The heavy workbench is collapsed first so risky projection updates do not keep the previous preview surface mounted while the next state is being applied."
    : isCustomJsonDirty
      ? "The current editor stays active above, but the projection workbench is temporarily collapsed so large custom payloads do not keep the rest of the UI mounted while you type."
      : "The latest custom payload has been committed. The workbench stays collapsed until the worker finishes rebuilding previews from that payload.";
  const suspendedWorkbenchFollowUp = pendingWorkbenchTransition
    ? projection.progress
      ? `${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}.`
      : "The full workbench returns after the next projection lifecycle settles."
    : isCustomJsonDirty
      ? "Use `Apply JSON` to rebuild the previews and restore the full workbench with the latest committed payload."
      : "This avoids replaying the full row preview, relational preview, CSV output, and schema sidecar on every progress update during apply.";
  const visibleWorkbenchTransitionDiagnostic =
    workbenchTransitionDiagnostic !== null &&
    (debugFlags.showHangDiagnostics || workbenchTransitionDiagnostic.phase !== "settled");
  const activeWorkbenchTransitionDiagnostic = visibleWorkbenchTransitionDiagnostic
    ? workbenchTransitionDiagnostic
    : null;
  const isLightweightInputDebugMode = debugFlags.showInputDiagnostics && isProjectionDebugDisabled;
  const shouldShowHangAuditCard =
    debugFlags.showHangDiagnostics || hangAuditSnapshot.recoveredEntry !== null;
  const visibleHangAuditEntries = hangAuditSnapshot.entries.slice(0, 6);
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
  const selectedTableRelationships = useMemo(
    () =>
      relationalSplitResult?.relationships.filter(
        (relationship) =>
          relationship.childTable === selectedRelationalTable?.tableName ||
          relationship.parentTable === selectedRelationalTable?.tableName,
      ) ?? [],
    [relationalSplitResult?.relationships, selectedRelationalTable?.tableName],
  );

  const inspectRow = useCallback(
    (row: Record<string, string>, rowId: string, view: WorkbenchView) => {
      const label = createWorkbenchRowLabel(
        row,
        rowId,
        view === "relational" ? selectedRelationalTable?.idColumn : undefined,
      );

      selectRow({
        id: rowId,
        label,
        row,
        view,
      });
      setInspectorOpen(true);
    },
    [selectRow, selectedRelationalTable?.idColumn, setInspectorOpen],
  );

  const inspectColumn = useCallback(
    (header: string, view: WorkbenchView) => {
      selectColumn({ header, view });
      setInspectorOpen(true);
    },
    [selectColumn, setInspectorOpen],
  );

  function renderWorkbenchCenterPanel() {
    if (isWorkbenchSuspended) {
      return (
        <WorkbenchSuspendedPanel
          description={suspendedWorkbenchDescription}
          followUp={
            pendingWorkbenchTransition
              ? suspendedWorkbenchFollowUp
              : liveValues.sourceMode === "custom"
                ? "Use the inspector to continue editing staged JSON while the center workbench stays unmounted."
                : suspendedWorkbenchFollowUp
          }
          lead={suspendedWorkbenchLead}
          title={suspendedWorkbenchTitle}
        />
      );
    }

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
          getRowId={(row, index) => createGridRowId(row, index, visibleFlatHeaders)}
          headers={visibleFlatHeaders}
          notices={
            <>
              {outputExportError ? <Notice tone="error">{outputExportError}</Notice> : null}
              {isStreamingFlatPreview && streamingFlatPreview ? (
                <Notice>{describeStreamingPreviewCaption(streamingFlatPreview)}</Notice>
              ) : null}
              {flatPreviewRowsTruncated ? (
                <Notice>
                  Showing the first {projectionFlatRowPreviewLimit.toLocaleString()} rows of the
                  live preview.
                </Notice>
              ) : null}
              {hiddenFlatColumnCount > 0 ? (
                <Notice>
                  Showing the first {visibleFlatHeaders.length} of {flatHeaders.length} columns in
                  the live grid.
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
          title="Flat row cockpit"
          toolbarActions={
            <>
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
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  clearWorkbenchSelection();
                  setInspectorMode("mapping");
                  setInspectorOpen(true);
                }}
              >
                <Settings2 className="size-4" />
                Mapping inspector
              </Button>
            </>
          }
          onInspectColumn={(header) => inspectColumn(header, "flat")}
          onInspectRow={(row, rowId) => inspectRow(row, rowId, "flat")}
        />
      );
    }

    if (activeView === "relational") {
      if (!selectedRelationalTable) {
        return (
          <WorkbenchEmptyPanel
            description={relationalPreviewStatusMessage}
            title="Relational tables are not available"
          />
        );
      }

      return (
        <DenseDataGrid
          caption={
            relationalPreviewRowsTruncated
              ? `Showing the first ${projectionRelationalRowPreviewLimit.toLocaleString()} preview rows of ${selectedRelationalTable.rowCount.toLocaleString()} rows in ${selectedRelationalTable.tableName}.`
              : `${selectedRelationalTable.tableName} is linked to ${selectedTableRelationships.length.toLocaleString()} relationship${selectedTableRelationships.length === 1 ? "" : "s"}.`
          }
          description="Master-detail grid for normalized one-to-many tables. Selection and row inspection stay synchronized with the right-hand inspector."
          emptyMessage="The selected relational table has no visible rows."
          filterLabel="Filter relational rows"
          getRowId={(row, index) =>
            createGridRowId(
              row,
              index,
              selectedRelationalTable.headers,
              selectedRelationalTable.idColumn,
            )
          }
          headers={selectedRelationalTable.headers}
          notices={
            <>
              {outputExportError ? <Notice tone="error">{outputExportError}</Notice> : null}
              {isRelationalPreviewProjecting ? (
                <Notice>{relationalPreviewStatusMessage}</Notice>
              ) : null}
              {relationalPreviewRowsTruncated ? (
                <Notice>
                  Showing a bounded preview of {selectedRelationalTable.tableName}. Export uses the
                  full table.
                </Notice>
              ) : null}
            </>
          }
          rowCount={selectedRelationalTable.rowCount}
          rowLabel={`${selectedRelationalTable.tableName} row`}
          rows={relationalPreviewRows.rows}
          summaryBadges={
            <>
              <Badge variant="outline">{selectedRelationalTable.tableName}</Badge>
              <Badge variant="secondary">{selectedRelationalTable.headers.length} columns</Badge>
              {selectedRelationalTable.parentIdColumn ? (
                <Badge variant="outline">Parent {selectedRelationalTable.parentTable}</Badge>
              ) : (
                <Badge variant="outline">Root table</Badge>
              )}
            </>
          }
          title="Relational table cockpit"
          toolbarActions={
            <>
              <Button
                type="button"
                variant="outline"
                title={
                  outputExportBlockedReason ?? "Download the full selected relational table as CSV."
                }
                disabled={!canExportOutputs || isOutputExporting || !selectedRelationalTable}
                onClick={() => {
                  void handleSelectedRelationalExport();
                }}
              >
                <Download className="size-4" />
                {isOutputExporting && outputExportLabel?.includes("relational CSV")
                  ? "Preparing table CSV"
                  : "Download selected table CSV"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                title={
                  outputExportBlockedReason ?? "Download every relational table as a ZIP archive."
                }
                disabled={!canExportOutputs || isOutputExporting || !relationalSplitResult}
                onClick={() => {
                  void handleRelationalArchiveExport();
                }}
              >
                <Archive className="size-4" />
                {isOutputExporting && outputExportLabel?.includes("bundled relational")
                  ? "Preparing ZIP"
                  : "Download all tables ZIP"}
              </Button>
            </>
          }
          onInspectColumn={(header) => inspectColumn(header, "relational")}
          onInspectRow={(row, rowId) => inspectRow(row, rowId, "relational")}
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

  hangAuditContextRef.current = {
    columnCount: flatHeaders.length,
    customJsonChars: customJsonDraft.length,
    isProjecting: projection.isProjecting,
    isWorkbenchSuspended,
    projectionLabel: projection.progress?.label ?? null,
    rootPath: liveValues.rootPath,
    rowCount: flatRowCount,
    sourceMode: liveValues.sourceMode,
    transitionLabel:
      pendingWorkbenchTransition?.label ?? workbenchTransitionDiagnostic?.label ?? null,
    transitionPhase: workbenchTransitionDiagnostic?.phase ?? null,
  };

  if (isLightweightInputDebugMode) {
    return (
      <div className="relative isolate min-h-screen overflow-hidden">
        <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(circle_at_top_left,rgba(255,203,153,0.9),transparent_38%),radial-gradient(circle_at_top_right,rgba(147,197,253,0.65),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,247,237,0.92))]" />

        <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <section className="space-y-4">
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              Input latency isolation / projection disabled
            </Badge>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Projection disabled for input debugging.
              </h1>
              <p className="max-w-3xl text-base text-muted-foreground sm:text-lg">
                The flat preview, relational preview, and schema workbench are intentionally hidden
                in this mode so the remaining editor path can be tested without the rest of the
                projection UI mounted.
              </p>
            </div>
          </section>

          <InputDiagnostics
            disableProjection={isProjectionDebugDisabled}
            onDisableProjectionChange={setProjectionDebugDisabled}
          />

          <Card className="bg-white/80">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Braces className="size-5 text-primary" />
                    Main custom editor
                  </CardTitle>
                  <CardDescription>
                    This uses the same staged editor and explicit apply flow as the normal custom
                    JSON panel, but without the projection workbench attached.
                  </CardDescription>
                </div>
                <Badge variant="outline">
                  {describeActiveSource(liveValues.sourceMode, activeSample.title)}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <div className="space-y-2">
                  <Label htmlFor="debug-sample">Sample dataset</Label>
                  <select
                    id="debug-sample"
                    className="flex h-11 w-full rounded-2xl border border-input bg-background/80 px-4 py-2 text-sm shadow-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
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
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isWorkbenchTransitionPending}
                    onClick={handleLoadSampleIntoEditor}
                  >
                    Load active sample
                  </Button>
                  <Button
                    type="button"
                    disabled={!isCustomJsonDirty}
                    onClick={() =>
                      applyCustomJson(customJsonDraft, {
                        suspendWorkbench: true,
                      })
                    }
                  >
                    Apply JSON
                  </Button>
                  <Button type="button" variant="outline" onClick={handleFormatCustomJson}>
                    Format JSON
                  </Button>
                  <label
                    htmlFor="json-upload"
                    className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-background/80 px-5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
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
              </div>

              <div className="space-y-2">
                <Label htmlFor="custom-json">Custom JSON</Label>
                <Textarea
                  id="custom-json"
                  {...bufferedJsonEditorServiceProps}
                  placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                  className="min-h-[22rem] font-mono text-xs"
                  value={customJsonDraft}
                  onChange={(event) => {
                    setCustomJsonDraft(event.target.value);
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Projection is paused in this surface by design. Re-enable it from the diagnostics
                  card when you want the full workbench back.
                </p>
                {isCustomJsonDirty ? (
                  <p className="text-sm text-muted-foreground">
                    This draft has unapplied changes. Use Apply JSON or Format JSON to commit them.
                  </p>
                ) : committedCustomJsonParseResult !== null &&
                  committedCustomJsonParseResult.value === undefined ? (
                  <p className="text-sm text-destructive">
                    Invalid JSON: {committedCustomJsonParseResult.error}
                  </p>
                ) : committedCustomJson.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    JSON is committed locally. If typing is still smooth here, the remaining freeze
                    lives in the full workbench path.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    The editor is idle. Load a sample or paste a custom payload to test the exact
                    editor path.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <CommandPalette
        actions={commandPaletteActions}
        open={isCommandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
      />

      {isLeftRailOpen || isInspectorOpen ? (
        <button
          aria-label="Close side panels"
          className="fixed inset-0 z-30 bg-foreground/12 xl:hidden"
          type="button"
          onClick={() => {
            setInspectorOpen(false);
            setLeftRailOpen(false);
          }}
        />
      ) : null}

      <main className="mx-auto flex min-h-screen max-w-[1920px] flex-col gap-3 px-3 py-3 lg:px-4">
        <header className="sticky top-3 z-20 rounded-[var(--radius)] border border-border/90 bg-card/92 px-4 py-3 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.34)] backdrop-blur-sm">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex gap-2 xl:hidden">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Open workbench rail"
                    onClick={() => setLeftRailOpen(true)}
                  >
                    <Menu className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Open inspector"
                    onClick={() => setInspectorOpen(true)}
                  >
                    <Settings2 className="size-4" />
                  </Button>
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-primary/20 bg-primary/6 text-primary"
                    >
                      Complex data management cockpit
                    </Badge>
                    <Badge variant="secondary">Cmd/Ctrl+K</Badge>
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    Relational JSON-to-CSV cockpit for ambiguous nested data.
                  </h1>
                  <p className="max-w-4xl text-sm text-muted-foreground sm:text-base">
                    Dense analyst workspace for root-path selection, relational normalization, and
                    export-safe CSV shaping.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" onClick={() => setCommandPaletteOpen(true)}>
                  <Command className="size-4" />
                  Command palette
                </Button>
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
                  onClick={() => {
                    clearWorkbenchSelection();
                    setInspectorMode("mapping");
                    setInspectorOpen(true);
                  }}
                >
                  <Settings2 className="size-4" />
                  Inspector
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
                  label="Preset"
                  value={activePreset?.name ?? "Unsaved configuration"}
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
                  active={activeView === "relational"}
                  disabled={!relationalSplitResult}
                  label="Relational"
                  meta={`${relationalSplitResult?.tables.length ?? 0} tables`}
                  onClick={() => setActiveView("relational")}
                />
                <WorkbenchNavButton
                  active={activeView === "csv"}
                  label="CSV"
                  meta="Output"
                  onClick={() => setActiveView("csv")}
                />
                <WorkbenchNavButton
                  active={activeView === "schema"}
                  label="Schema"
                  meta={`${conversionResult?.schema.columns.length ?? 0} cols`}
                  onClick={() => setActiveView("schema")}
                />
              </div>
            </div>
          </div>
        </header>

        {debugFlags.showInputDiagnostics ? (
          <InputDiagnostics
            disableProjection={isProjectionDebugDisabled}
            onDisableProjectionChange={setProjectionDebugDisabled}
          />
        ) : null}

        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)_420px] 2xl:grid-cols-[300px_minmax(0,1fr)_460px]">
          <aside
            className={cn(
              "fixed inset-y-0 left-0 z-40 w-[min(88vw,300px)] border-r border-border/90 bg-card/96 p-3 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.34)] transition-transform xl:static xl:w-auto xl:translate-x-0 xl:border xl:border-border/90 xl:shadow-none",
              isLeftRailOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <div className="flex h-full min-h-[calc(100vh-6.5rem)] flex-col gap-3 overflow-y-auto">
              <div className="flex items-center justify-between xl:hidden">
                <p className="text-sm font-semibold text-foreground">Workbench rail</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close workbench rail"
                  onClick={() => setLeftRailOpen(false)}
                >
                  <Menu className="size-4" />
                </Button>
              </div>

              <div className="rounded-[var(--radius)] border border-border/80 bg-background/78 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Workbench summary
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <StatCard
                    icon={<Rows3 className="size-4" />}
                    label="Rows"
                    value={flatRowCount.toLocaleString()}
                  />
                  <StatCard
                    icon={<TableProperties className="size-4" />}
                    label="Columns"
                    value={flatHeaders.length.toLocaleString()}
                  />
                  <StatCard
                    icon={<Archive className="size-4" />}
                    label="Tables"
                    value={String(relationalSplitResult?.tables.length ?? 0)}
                  />
                  <StatCard
                    icon={<FileJson2 className="size-4" />}
                    label="CSV lines"
                    value={flatCsvLineCount.toLocaleString()}
                  />
                </div>
              </div>

              <div className="rounded-[var(--radius)] border border-border/80 bg-background/78 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Views
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Master-detail navigation for the current projection.
                    </p>
                  </div>
                  <Badge variant="secondary">{activeView}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <WorkbenchRailButton
                    active={activeView === "flat"}
                    label="Flat rows"
                    meta={`${flatRowCount.toLocaleString()} rows / ${flatHeaders.length.toLocaleString()} cols`}
                    onClick={() => {
                      setActiveView("flat");
                      setLeftRailOpen(false);
                    }}
                  />
                  <WorkbenchRailButton
                    active={activeView === "relational"}
                    disabled={!relationalSplitResult}
                    label="Relational tables"
                    meta={`${relationalSplitResult?.tables.length ?? 0} tables / ${relationalSplitResult?.relationships.length ?? 0} links`}
                    onClick={() => {
                      setActiveView("relational");
                      clearWorkbenchSelection();
                      setInspectorMode("table");
                      setLeftRailOpen(false);
                    }}
                  />
                  <WorkbenchRailButton
                    active={activeView === "csv"}
                    label="CSV output"
                    meta="Raw export preview"
                    onClick={() => {
                      setActiveView("csv");
                      setLeftRailOpen(false);
                    }}
                  />
                  <WorkbenchRailButton
                    active={activeView === "schema"}
                    label="Schema sidecar"
                    meta={`${conversionResult?.schema.columns.length ?? 0} exported columns`}
                    onClick={() => {
                      setActiveView("schema");
                      setLeftRailOpen(false);
                    }}
                  />
                </div>
              </div>

              {relationalSplitResult ? (
                <div className="rounded-[var(--radius)] border border-border/80 bg-background/78 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Relational tables
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Select a normalized table to drive the detail grid.
                      </p>
                    </div>
                    <Badge variant="secondary">{relationalSplitResult.tables.length}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    {relationalSplitResult.tables.map((table) => (
                      <WorkbenchRailButton
                        key={table.tableName}
                        active={
                          table.tableName === selectedRelationalTableName &&
                          activeView === "relational"
                        }
                        label={table.tableName}
                        meta={`${table.rowCount.toLocaleString()} rows / ${table.headers.length.toLocaleString()} cols`}
                        onClick={() => {
                          setSelectedRelationalTableName(table.tableName);
                          setActiveView("relational");
                          clearWorkbenchSelection();
                          setInspectorMode("table");
                          setInspectorOpen(true);
                          setLeftRailOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-[var(--radius)] border border-border/80 bg-background/78 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Saved presets
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Dexie stores the entire mapping config for later replay.
                    </p>
                  </div>
                  <Badge variant="secondary">{presets.length}</Badge>
                </div>
                <div className="mt-3 space-y-2">
                  {isPresetsLoading ? (
                    <p className="text-sm text-muted-foreground">Loading presets...</p>
                  ) : null}

                  {!isPresetsLoading && presets.length === 0 ? (
                    <p className="rounded-[calc(var(--radius)-2px)] border border-dashed border-border/80 bg-background/70 px-3 py-4 text-sm text-muted-foreground">
                      Save a configuration to compare different mapping strategies over time.
                    </p>
                  ) : null}

                  {presets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={cn(
                        "flex w-full flex-col gap-1 rounded-[calc(var(--radius)-2px)] border px-3 py-2 text-left transition-colors",
                        preset.id === selectedPresetId
                          ? "border-primary/25 bg-primary/7"
                          : "border-border/70 bg-card hover:bg-secondary/75",
                      )}
                      onClick={() => {
                        loadPreset(preset);
                        setLeftRailOpen(false);
                      }}
                    >
                      <span className="truncate text-sm font-medium text-foreground">
                        {preset.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {preset.config.rootPath} · {toTitleCase(preset.config.flattenMode)} ·{" "}
                        {describePresetSource(preset)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </aside>

          <section className="min-w-0 space-y-3">
            {activeWorkbenchTransitionDiagnostic ? (
              <NoticeCard
                detail={activeWorkbenchTransitionDiagnostic.detail}
                meta={
                  debugFlags.showHangDiagnostics
                    ? `Transition #${activeWorkbenchTransitionDiagnostic.id} · ${formatDurationMs(
                        activeWorkbenchTransitionDiagnostic.updatedAt -
                          activeWorkbenchTransitionDiagnostic.startedAt,
                      )}`
                    : undefined
                }
                phase={formatWorkbenchTransitionPhase(activeWorkbenchTransitionDiagnostic.phase)}
                title={activeWorkbenchTransitionDiagnostic.label}
                tone={
                  activeWorkbenchTransitionDiagnostic.phase === "timed-out" ? "warning" : "info"
                }
              />
            ) : null}

            {shouldShowHangAuditCard ? (
              <Card className="bg-card/90">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle>Hang audit</CardTitle>
                      <CardDescription>
                        Transition, long-task, and paint-gap events survive reloads for postmortem
                        review.
                      </CardDescription>
                    </div>
                    <Badge variant="outline">{visibleHangAuditEntries.length} events</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {hangAuditSnapshot.recoveredEntry ? (
                    <Notice tone="warning">{hangAuditSnapshot.recoveredEntry.detail}</Notice>
                  ) : null}
                  {visibleHangAuditEntries.slice(0, 4).map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-[calc(var(--radius)-2px)] border border-border/70 bg-background/80 px-3 py-2 text-sm"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{formatHangAuditCategory(entry.category)}</Badge>
                        {entry.durationMs !== null ? (
                          <Badge variant="outline">{formatDurationMs(entry.durationMs)}</Badge>
                        ) : null}
                        <span className="font-medium text-foreground">{entry.label}</span>
                      </div>
                      <p className="mt-2 text-muted-foreground">{entry.detail}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {renderWorkbenchCenterPanel()}
          </section>

          <aside
            className={cn(
              "fixed inset-y-0 right-0 z-40 w-[min(94vw,460px)] border-l border-border/90 bg-card/96 p-3 shadow-[0_18px_44px_-36px_rgba(15,23,42,0.34)] transition-transform xl:static xl:w-auto xl:translate-x-0 xl:border xl:border-border/90 xl:shadow-none",
              isInspectorOpen ? "translate-x-0" : "translate-x-full",
            )}
          >
            <div className="flex h-full min-h-[calc(100vh-6.5rem)] flex-col overflow-hidden rounded-[var(--radius)] border border-border/80 bg-background/78">
              <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">Inspector</p>
                  <p className="text-xs text-muted-foreground">
                    Contextual detail and mapping controls stay one click away.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close inspector"
                  onClick={() => setInspectorOpen(false)}
                >
                  <Settings2 className="size-4" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                <InspectorContextCard
                  inspectorMode={inspectorMode}
                  selectedColumn={selectedColumn}
                  selectedColumnSchema={selectedColumnSchema}
                  selectedColumnTypeReport={selectedColumnTypeReport}
                  selectedRow={selectedRow}
                  selectedTable={selectedRelationalTable}
                  selectedTableRelationships={selectedTableRelationships}
                />

                <form
                  className="mt-3 space-y-3"
                  onSubmit={form.handleSubmit((values) => {
                    const latestCustomJson =
                      liveValues.sourceMode === "custom"
                        ? committedCustomJson
                        : defaultFormValues.customJson;

                    savePresetMutation.mutate({
                      ...values,
                      customJson: latestCustomJson,
                    });
                  })}
                >
                  <InspectorSection
                    defaultOpen
                    description="Session identity, source mode, and staged input management."
                    title="Session"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="preset-name">Preset name</Label>
                      <Input
                        id="preset-name"
                        placeholder="Donut relational export"
                        {...form.register("presetName")}
                      />
                      <FieldError message={form.formState.errors.presetName?.message} />
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
                          className={cockpitSelectClassName}
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
                          <Button
                            type="button"
                            variant="outline"
                            disabled={isWorkbenchTransitionPending}
                            onClick={handleLoadSampleIntoEditor}
                          >
                            Load active sample
                          </Button>
                          <Button
                            type="button"
                            disabled={!isCustomJsonDirty}
                            onClick={() =>
                              applyCustomJson(customJsonDraft, {
                                suspendWorkbench: true,
                              })
                            }
                          >
                            Apply JSON
                          </Button>
                          <Button type="button" variant="outline" onClick={handleFormatCustomJson}>
                            Format JSON
                          </Button>
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
                            value={customJsonDraft}
                            onChange={(event) => {
                              setCustomJsonDraft(event.target.value);
                            }}
                          />
                          <p className="text-sm text-muted-foreground">
                            Custom input stays local to this browser. Saved custom presets persist
                            the raw JSON in IndexedDB.
                          </p>
                          {isCustomJsonDirty ? (
                            <Notice>
                              Preview is paused while this draft has unapplied changes.
                            </Notice>
                          ) : isCustomProjectionRebuilding ? (
                            <Notice>
                              Rebuilding the preview for the latest committed JSON.
                              {projection.progress
                                ? ` ${projection.progress.label} ${formatProjectionProgressDetail(projection.progress)}.`
                                : ""}
                            </Notice>
                          ) : projection.parseError ? (
                            <Notice tone="error">Invalid JSON: {projection.parseError}</Notice>
                          ) : projection.isProjecting ? (
                            <Notice>
                              Parsing and rebuilding the preview in the background.
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
                    defaultOpen
                    description="Root-path control, smart detection, and path-level planner rules."
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
                          disabled={isWorkbenchTransitionPending}
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

                    {isComplexJsonGuidanceVisible && complexJsonOverview ? (
                      <ComplexJsonOverviewPanel
                        overview={complexJsonOverview}
                        onContinue={handleContinueComplexJsonWorkbench}
                        onSelectRootPath={handleComplexJsonRootSelection}
                      />
                    ) : (
                      <PathPlanner
                        defaultMode={liveValues.flattenMode}
                        rules={plannerRules}
                        suggestions={discoveredPaths}
                        onChange={setPlannerRules}
                      />
                    )}
                  </InspectorSection>

                  {isComplexJsonGuidanceVisible ? null : (
                    <>
                      <InspectorSection
                        defaultOpen
                        description="High-frequency row shaping and CSV behavior controls."
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
                            id="header-policy"
                            label="Header policy"
                            registration={form.register("headerPolicy")}
                            options={headerPolicies.map((value) => ({
                              label: toTitleCase(value),
                              value,
                            }))}
                          />
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
                            <Label htmlFor="header-sample-size">Header sample size</Label>
                            <Input
                              id="header-sample-size"
                              type="number"
                              min={1}
                              max={500}
                              {...form.register("headerSampleSize", {
                                valueAsNumber: true,
                              })}
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
                        description="Explicit column aliasing and whitelist control."
                        title="Header mapping"
                      >
                        <HeaderMapper
                          headerPolicy={liveValues.headerPolicy}
                          rules={headerRules}
                          suggestions={headerSuggestions}
                          onChange={setHeaderRules}
                        />
                      </InspectorSection>
                    </>
                  )}

                  <InspectorSection
                    defaultOpen
                    description="Persist the current cockpit or clear it back to the baseline sample."
                    title="Actions"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="submit"
                        disabled={savePresetMutation.isPending || !canSavePreset}
                      >
                        <Save className="size-4" />
                        {savePresetMutation.isPending ? "Saving preset..." : "Save preset"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isWorkbenchTransitionPending}
                        onClick={handleResetDefaults}
                      >
                        Reset defaults
                      </Button>
                    </div>

                    {savePresetMutation.isSuccess ? (
                      <Notice>
                        Saved "{savePresetMutation.data.name}" for{" "}
                        {describePresetSource(savePresetMutation.data)}.
                      </Notice>
                    ) : null}

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
                </form>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function ComplexJsonOverviewPanel({
  overview,
  onContinue,
  onSelectRootPath,
}: {
  overview: ComplexJsonOverview;
  onContinue: () => void;
  onSelectRootPath: (nextRootPath: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-border/70 bg-background/55 p-4">
      <div className="rounded-[20px] border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
        Root `$` currently exposes {overview.totalPathCount.toLocaleString()} discovered paths and
        about {overview.columnCount.toLocaleString()} preview columns. Pick a narrower branch first,
        or continue into the full workbench anyway.
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Suggested roots</p>
          <p className="text-sm text-muted-foreground">
            These branches are ranked by structural usefulness, not by domain.
          </p>
        </div>

        <div className="grid gap-3">
          {overview.candidateRoots.map((branch) => (
            <div
              key={branch.path}
              className="rounded-[20px] border border-border/70 bg-background/80 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                    {branch.rootPath}
                  </code>
                  <Badge variant="outline">{describeComplexJsonBranch(branch)}</Badge>
                  <Badge variant="secondary">
                    {branch.descendantPathCount.toLocaleString()} paths
                  </Badge>
                </div>

                <Button type="button" size="sm" onClick={() => onSelectRootPath(branch.rootPath)}>
                  Use this root
                </Button>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                Max depth {branch.maxDepth}. Example paths: {branch.examplePaths.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Top-level branches</p>
          <p className="text-sm text-muted-foreground">
            Use this as a structural overview when the root is too broad.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {overview.topLevelBranches.map((branch) => (
            <div
              key={branch.path}
              className="rounded-[20px] border border-border/70 bg-background/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-foreground">
                  {branch.rootPath}
                </code>
                <Badge variant="outline">{describeComplexJsonBranch(branch)}</Badge>
                <Badge variant="secondary">
                  {branch.descendantPathCount.toLocaleString()} paths
                </Badge>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                Example paths: {branch.examplePaths.join(", ")}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-border/70 pt-4">
        <Button type="button" variant="outline" onClick={onContinue}>
          Continue with full workbench
        </Button>
      </div>
    </div>
  );
}

function describeComplexJsonBranch(branch: ComplexJsonOverview["candidateRoots"][number]) {
  if (branch.hasArray) {
    return "Array-heavy";
  }

  if (branch.hasObject) {
    return "Object-heavy";
  }

  return "Mixed branch";
}
function buildHeaderSuggestions(
  columns: ColumnSchema[],
  discoveredPaths: InspectedPath[],
): HeaderSuggestion[] {
  const suggestionsByPath = new Map<string, HeaderSuggestion>();

  for (const column of columns) {
    suggestionsByPath.set(column.sourcePath, {
      currentHeader: column.header,
      kinds: column.kinds,
      sourcePath: column.sourcePath,
    });
  }

  for (const path of discoveredPaths) {
    if (!path.path || suggestionsByPath.has(path.path)) {
      continue;
    }

    suggestionsByPath.set(path.path, {
      kinds: path.kinds,
      sourcePath: path.path,
    });
  }

  return [...suggestionsByPath.values()].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  );
}

function toMappingConfig(
  values: ConverterFormValues,
  plannerRules: PlannerRule[],
  headerRules: HeaderRule[],
): MappingConfig {
  const plannerConfig = plannerRulesToConfig(plannerRules);
  const headerConfig = headerRulesToConfig(headerRules);

  return createMappingConfig({
    rootPath: values.rootPath,
    flattenMode: values.flattenMode,
    pathModes: plannerConfig.pathModes,
    pathSeparator: values.pathSeparator,
    arrayIndexSuffix: values.arrayIndexSuffix,
    placeholderStrategy: values.placeholderStrategy,
    customPlaceholder: values.customPlaceholder,
    onMissingKey: values.onMissingKey,
    onTypeMismatch: values.onTypeMismatch,
    headerPolicy: values.headerPolicy,
    headerSampleSize: values.headerSampleSize,
    headerAliases: headerConfig.headerAliases,
    headerWhitelist: headerConfig.headerWhitelist,
    strictNaming: values.strictNaming,
    collisionStrategy: values.collisionStrategy,
    booleanRepresentation: values.booleanRepresentation,
    dateFormat: values.dateFormat,
    delimiter: values.delimiter,
    quoteAll: values.quoteAll,
    emptyArrayBehavior: values.emptyArrayBehavior,
    maxDepth: values.maxDepth,
    includePaths: plannerConfig.includePaths,
    stringifyPaths: plannerConfig.stringifyPaths,
    dropPaths: plannerConfig.dropPaths,
  });
}

function toFormValues(preset: SavedPreset): ConverterFormValues {
  return {
    presetName: preset.name,
    sourceMode: preset.sourceMode ?? "sample",
    sampleId: preset.sampleId,
    customJson: preset.customJson ?? "",
    rootPath: preset.config.rootPath ?? "$",
    flattenMode: preset.config.flattenMode,
    pathSeparator: preset.config.pathSeparator,
    arrayIndexSuffix: preset.config.arrayIndexSuffix,
    placeholderStrategy: preset.config.placeholderStrategy,
    customPlaceholder: preset.config.customPlaceholder ?? "",
    onMissingKey: preset.config.onMissingKey,
    onTypeMismatch: preset.config.onTypeMismatch,
    headerPolicy: preset.config.headerPolicy,
    headerSampleSize: preset.config.headerSampleSize,
    collisionStrategy: preset.config.collisionStrategy,
    strictNaming: preset.config.strictNaming,
    booleanRepresentation: preset.config.booleanRepresentation,
    dateFormat: preset.config.dateFormat,
    delimiter: preset.config.delimiter as ConverterFormValues["delimiter"],
    quoteAll: preset.config.quoteAll,
    emptyArrayBehavior: preset.config.emptyArrayBehavior,
    maxDepth: preset.config.maxDepth,
  };
}

function getSampleById(sampleId: string) {
  return mappingSamples.find((sample) => sample.id === sampleId) ?? mappingSamples[0];
}

function getAppDebugFlags() {
  if (typeof window === "undefined") {
    return {
      projectionOffByDefault: false,
      showHangDiagnostics: false,
      showInputDiagnostics: false,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const debugModes = new Set(
    params
      .getAll("debug")
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );

  return {
    projectionOffByDefault: params.get("projection") === "off",
    showHangDiagnostics: debugModes.has("hangs"),
    showInputDiagnostics: debugModes.has("input"),
  };
}

function publishWorkbenchTransitionDiagnostic(diagnostic: WorkbenchTransitionDiagnostic | null) {
  if (typeof window === "undefined") {
    return;
  }

  const debugWindow = window as Window & {
    __json2csvWorkbenchTransition?: WorkbenchTransitionDiagnostic | null;
  };

  debugWindow.__json2csvWorkbenchTransition = diagnostic;
  window.dispatchEvent(
    new CustomEvent("json2csv:workbench-transition", {
      detail: diagnostic,
    }),
  );
}

function createWorkbenchTransitionDiagnostic(
  previous: WorkbenchTransitionDiagnostic | null,
  transition: Pick<PendingWorkbenchTransition, "id" | "kind" | "label">,
  phase: WorkbenchTransitionPhase,
): WorkbenchTransitionDiagnostic {
  const now = Date.now();

  return {
    detail: describeWorkbenchTransitionDiagnosticDetail(transition.label, phase),
    id: transition.id,
    kind: transition.kind,
    label: transition.label,
    phase,
    startedAt: previous?.id === transition.id ? previous.startedAt : now,
    updatedAt: now,
  };
}

function describeWorkbenchTransitionDiagnosticDetail(
  label: string,
  phase: WorkbenchTransitionPhase,
) {
  switch (phase) {
    case "queued":
      return `${label}. The heavy workbench is collapsed first so this transition can fail fast instead of blocking inside the click handler.`;
    case "applying":
      return `${label}. The state update has been applied; waiting for the next projection lifecycle to start.`;
    case "projecting":
      return `${label}. Projection is running in the background and the workbench will return after it settles.`;
    case "settled":
      return `${label}. Projection settled and the workbench has been restored.`;
    case "timed-out":
      return `${label}. No projection lifecycle settled within ${formatDurationMs(workbenchTransitionWatchdogMs)}.`;
  }
}

function formatWorkbenchTransitionPhase(phase: WorkbenchTransitionPhase) {
  switch (phase) {
    case "queued":
      return "Queued";
    case "applying":
      return "Applying";
    case "projecting":
      return "Projecting";
    case "settled":
      return "Settled";
    case "timed-out":
      return "Timed out";
  }
}

function formatDurationMs(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString()} ms`;
}

function describeHangAuditContext(context: HangAuditContext) {
  const sourceLabel = context.sourceMode === "custom" ? "custom JSON" : "sample data";
  const activeLabel =
    context.transitionLabel ?? context.projectionLabel ?? "the current workbench state";

  return `${sourceLabel} at ${context.rootPath} with ${context.customJsonChars.toLocaleString()} chars, ${context.rowCount.toLocaleString()} rows, and ${context.columnCount.toLocaleString()} columns under ${activeLabel}`;
}

function describeActiveSource(sourceMode: SourceMode, sampleTitle: string) {
  return sourceMode === "custom" ? "Custom JSON" : sampleTitle;
}

function describePresetSource(preset: Pick<SavedPreset, "sampleId" | "sourceMode">) {
  return preset.sourceMode === "custom" ? "Custom JSON" : getSampleById(preset.sampleId).title;
}

function upsertHeaderAliasRule(
  rules: HeaderRule[],
  sourcePath: string,
  header: string,
  options: {
    overwriteExisting?: boolean;
  } = {},
) {
  const normalizedSourcePath = sourcePath.trim();
  const normalizedHeader = header.trim();
  const overwriteExisting = options.overwriteExisting ?? true;

  if (!normalizedSourcePath || !normalizedHeader) {
    return rules;
  }

  const existingIndex = rules.findIndex((rule) => rule.sourcePath.trim() === normalizedSourcePath);

  if (existingIndex === -1) {
    return [
      createHeaderRule({
        enabled: false,
        header: normalizedHeader,
        sourcePath: normalizedSourcePath,
      }),
      ...rules,
    ];
  }

  if (!overwriteExisting) {
    return rules;
  }

  return rules.map((rule, index) =>
    index === existingIndex
      ? { ...rule, header: normalizedHeader, sourcePath: normalizedSourcePath }
      : rule,
  );
}

function stripFileExtension(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "Imported JSON";
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
    ? `Streaming preview from ${preview.processedRoots} parsed roots. Final schema and relational tables are still building in the worker.`
    : `Streaming preview from ${preview.processedRoots}/${preview.totalRoots} roots. Final schema and relational tables are still building in the worker.`;
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

function formatRelationalRelationship(relationship: RelationalRelationship) {
  return `${relationship.parentTable} -> ${relationship.childTable} via ${relationship.foreignKeyColumn}`;
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

function createWorkbenchRowLabel(
  row: Record<string, string>,
  fallback: string,
  preferredHeader?: string,
) {
  const candidateHeaders = [
    preferredHeader,
    "root_id",
    "id",
    "name",
    "type",
    ...Object.keys(row),
  ].filter(Boolean) as string[];

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

function WorkbenchRailButton({
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
        "flex w-full flex-col gap-1 rounded-[calc(var(--radius)-2px)] border px-3 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        active
          ? "border-primary/25 bg-primary/7"
          : "border-border/70 bg-card hover:bg-secondary/75",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
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

function NoticeCard({
  detail,
  meta,
  phase,
  title,
  tone,
}: {
  detail: string;
  meta?: string;
  phase: string;
  title: string;
  tone: NoticeTone;
}) {
  return (
    <Card aria-live="polite" className="bg-card/90">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{detail}</CardDescription>
          </div>
          <Badge
            variant="outline"
            className={cn(
              tone === "warning"
                ? "border-amber-300 bg-amber-50 text-amber-900"
                : "border-primary/20 bg-primary/6 text-primary",
            )}
          >
            {phase}
          </Badge>
        </div>
      </CardHeader>
      {meta ? (
        <CardContent className="pt-0 text-xs text-muted-foreground">{meta}</CardContent>
      ) : null}
    </Card>
  );
}

function InspectorSection({
  children,
  defaultOpen = false,
  description,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  description: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[var(--radius)] border border-border/80 bg-card/82">
      <button
        type="button"
        aria-expanded={isOpen}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline">{isOpen ? "Open" : "Closed"}</Badge>
      </button>
      {isOpen ? <div className="space-y-3 border-t border-border/80 p-4">{children}</div> : null}
    </section>
  );
}

function WorkbenchSuspendedPanel({
  description,
  followUp,
  lead,
  title,
}: {
  description: string;
  followUp: string;
  lead: string;
  title: string;
}) {
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Braces className="size-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <Notice>{lead}</Notice>
        <p>{followUp}</p>
      </CardContent>
    </Card>
  );
}

function WorkbenchEmptyPanel({ description, title }: { description: string; title: string }) {
  return (
    <Card className="bg-card/90">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
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
              Operational CSV preview with export controls kept in the cockpit workspace.
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
  selectedTable,
  selectedTableRelationships,
}: {
  inspectorMode: InspectorMode;
  selectedColumn: { header: string; view: WorkbenchView } | null;
  selectedColumnSchema: ColumnSchema | null;
  selectedColumnTypeReport: ColumnTypeReport | null;
  selectedRow: { label: string; row: Record<string, string>; view: WorkbenchView } | null;
  selectedTable: {
    headers: string[];
    parentIdColumn: string | null;
    parentTable: string | null;
    rowCount: number;
    sourcePath: string;
    tableName: string;
  } | null;
  selectedTableRelationships: RelationalRelationship[];
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

  if (inspectorMode === "table" && selectedTable) {
    return (
      <Card className="bg-card/88">
        <CardHeader>
          <CardTitle>Table inspector</CardTitle>
          <CardDescription>
            {selectedTable.tableName} sourced from {selectedTable.sourcePath}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{selectedTable.rowCount.toLocaleString()} rows</Badge>
            <Badge variant="secondary">
              {selectedTable.headers.length.toLocaleString()} columns
            </Badge>
            {selectedTable.parentTable ? (
              <Badge variant="outline">Parent {selectedTable.parentTable}</Badge>
            ) : (
              <Badge variant="outline">Root table</Badge>
            )}
          </div>
          {selectedTable.parentIdColumn ? (
            <Notice>
              {selectedTable.tableName} inherits {selectedTable.parentIdColumn} from{" "}
              {selectedTable.parentTable}.
            </Notice>
          ) : null}
          {selectedTableRelationships.length > 0 ? (
            <div className="space-y-2">
              {selectedTableRelationships.map((relationship) => (
                <Badge
                  key={`${relationship.parentTable}-${relationship.childTable}`}
                  variant="secondary"
                >
                  {formatRelationalRelationship(relationship)}
                </Badge>
              ))}
            </div>
          ) : (
            <Notice>No linked table relationships are attached to the current selection.</Notice>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card/88">
      <CardHeader>
        <CardTitle>Mapping inspector</CardTitle>
        <CardDescription>
          Use the sections below to steer the current projection without leaving the cockpit.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-[calc(var(--radius)-2px)] border border-border/80 bg-card px-3 py-3">
      <div className="mb-2 flex size-8 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
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
      <select id={id} className={cockpitSelectClassName} {...registration}>
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
