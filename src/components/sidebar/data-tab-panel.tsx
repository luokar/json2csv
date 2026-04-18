import type { ChangeEvent } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";

import { Upload } from "lucide-react";

import type { ProjectionProgress } from "@/lib/projection";

import { bufferedJsonEditorServiceProps } from "@/components/buffered-json-editor";
import { InspectorSection } from "@/components/inspector/inspector-section";
import { Button } from "@/components/ui/button";
import { FieldError, controlSelectClassName } from "@/components/ui/form-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import type { MappingSample } from "@/lib/mapping-samples";
import { mappingSamples } from "@/lib/mapping-samples";

interface SmartDetectFeedback {
  detail: string;
  previewHeaders: string[];
  tone: "error" | "info" | "success";
}

export function DataTabPanel({
  discoveredPathCount,
  exportNameError,
  exportNameMaxLength,
  exportNameRegister,
  isBroadRootWarningVisible,
  broadRootColumnCount,
  isProjecting,
  onFileImport,
  onSampleChange,
  onSmartDetect,
  onSourceModeChange,
  parseError,
  previewLimitNotice,
  previewSuspendedReason,
  progress,
  rootPathError,
  rootPathRegister,
  sampleSourcePreview,
  smartDetectFeedback,
  sourceModeOptions,
  streamableCustomSelector,
  values,
  activeSample,
  customJsonOnChange,
  formatProgressDetail,
}: {
  discoveredPathCount: number;
  exportNameError: string | undefined;
  exportNameMaxLength: number;
  exportNameRegister: UseFormRegisterReturn;
  isBroadRootWarningVisible: boolean;
  broadRootColumnCount: number;
  isProjecting: boolean;
  onFileImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onSampleChange: (sampleId: string) => void;
  onSmartDetect: () => void;
  onSourceModeChange: (mode: "sample" | "custom") => void;
  parseError: string | null;
  previewLimitNotice: string | null;
  previewSuspendedReason: string | null;
  progress: ProjectionProgress | null;
  rootPathError: string | undefined;
  rootPathRegister: UseFormRegisterReturn;
  sampleSourcePreview: { text: string; truncated: boolean } | null;
  smartDetectFeedback: SmartDetectFeedback | null;
  sourceModeOptions: ReadonlyArray<{ label: string; value: "sample" | "custom" }>;
  streamableCustomSelector: unknown;
  values: {
    customJson: string;
    rootPath: string;
    sampleId: string;
    sourceMode: "sample" | "custom";
  };
  activeSample: MappingSample;
  customJsonOnChange: (value: string) => void;
  formatProgressDetail: (progress: ProjectionProgress) => string;
}) {
  const sampleSourcePreviewCharacterLimit = 4_000;

  return (
    <>
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
            {...exportNameRegister}
          />
          <FieldError message={exportNameError} />
        </div>

        <div className="space-y-1.5">
          <Label>Input source</Label>
          <div className="flex flex-wrap gap-1.5">
            {sourceModeOptions.map((option) => (
              <Button
                key={option.value}
                type="button"
                size="sm"
                variant={values.sourceMode === option.value ? "default" : "outline"}
                onClick={() => onSourceModeChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {values.sourceMode === "sample" ? (
          <div className="space-y-1.5">
            <Label htmlFor="sample-id">Example dataset</Label>
            <select
              id="sample-id"
              className={controlSelectClassName}
              value={values.sampleId}
              onChange={(event) => onSampleChange(event.target.value)}
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
                className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
              >
                <Upload className="size-4" />
                Upload .json
              </label>
              <input
                id="json-upload"
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={onFileImport}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-json">Your JSON</Label>
              <Textarea
                id="custom-json"
                {...bufferedJsonEditorServiceProps}
                placeholder='{"records": [{"id": "1", "email": "user@example.com"}]}'
                className="min-h-[18rem] font-mono text-[12px] leading-5"
                value={values.customJson}
                onChange={(event) => {
                  customJsonOnChange(event.target.value);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Your data stays local and updates the preview live.
              </p>
              {previewSuspendedReason ? (
                <Notice tone="warning">{previewSuspendedReason}</Notice>
              ) : parseError ? (
                <Notice tone="error">Invalid JSON: {parseError}</Notice>
              ) : isProjecting ? (
                <Notice>
                  Rebuilding the preview in the background.
                  {progress
                    ? ` ${formatProgressDetail(progress)}.`
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
            {...rootPathRegister}
          />
          <FieldError message={rootPathError} />
          {values.sourceMode === "custom" ? (
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
              disabled={isProjecting}
              onClick={onSmartDetect}
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
            Root `$` currently exposes {discoveredPathCount.toLocaleString()}{" "}
            paths and about {broadRootColumnCount.toLocaleString()} preview
            columns. Narrow the data location or use Auto-detect before adjusting other
            settings.
          </Notice>
        ) : (
          <Notice>
            Found {discoveredPathCount.toLocaleString()} data paths under
            the current location.
          </Notice>
        )}

        {previewLimitNotice ? (
          <Notice tone="warning">{previewLimitNotice}</Notice>
        ) : null}
      </InspectorSection>
    </>
  );
}
