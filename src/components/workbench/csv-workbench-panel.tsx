import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import type { ProjectionFlatStreamPreview } from "@/lib/projection";
import { projectionFlatCsvPreviewCharacterLimit } from "@/lib/projection";

export function CsvWorkbenchPanel({
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
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Download className="size-4 text-primary" />
              CSV preview
            </CardTitle>
            <CardDescription>
              See what your CSV file will look like, and download it when ready.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            title={outputExportBlockedReason ?? "Download the CSV file."}
            disabled={outputExportBlockedReason !== null || isOutputExporting}
            onClick={onExport}
          >
            <Download className="size-4" />
            {isOutputExporting && outputExportLabel?.includes("CSV")
              ? "Preparing..."
              : "Download CSV"}
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
              ? " Additional rows are not shown in this preview."
              : ` ${csvPreview.omittedCharacters.toLocaleString()} more characters are not shown in this preview.`}
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

function describeStreamingCsvProgress(preview: ProjectionFlatStreamPreview) {
  return preview.totalRoots === null
    ? `Processed ${preview.processedRoots} items so far. Building CSV in the background.`
    : `Processed ${preview.processedRoots} of ${preview.totalRoots} items. Building CSV in the background.`;
}
