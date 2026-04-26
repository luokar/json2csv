import { Clipboard, Download, FileJson } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SelectionActionsBarProps {
  selectedCount: number;
  selectedRows: Array<Record<string, string>>;
  onViewDetails: () => void;
  onExportSelected?: (rows: Array<Record<string, string>>) => void;
  onExportSelectedJson?: (rows: Array<Record<string, string>>) => void;
  onCopySelectedToClipboard?: (rows: Array<Record<string, string>>) => void;
  onClearSelection: () => void;
}

/**
 * Actions bar shown above the grid when one or more rows are selected.
 * Renders the selected count plus View details / Export CSV / Export JSON /
 * Copy / Clear selection buttons. Rows passed in should already have any cell
 * edits applied by the caller.
 */
export function SelectionActionsBar({
  selectedCount,
  selectedRows,
  onViewDetails,
  onExportSelected,
  onExportSelectedJson,
  onCopySelectedToClipboard,
  onClearSelection,
}: SelectionActionsBarProps) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border-l-2 border-l-primary bg-accent px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-foreground">
        <Badge>{selectedCount} selected</Badge>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="outline" onClick={onViewDetails}>
          View details
        </Button>
        {onExportSelected ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onExportSelected(selectedRows)}
          >
            <Download className="size-4" />
            Export CSV
          </Button>
        ) : null}
        {onExportSelectedJson ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onExportSelectedJson(selectedRows)}
          >
            <FileJson className="size-4" />
            Export JSON
          </Button>
        ) : null}
        {onCopySelectedToClipboard ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onCopySelectedToClipboard(selectedRows)}
          >
            <Clipboard className="size-4" />
            Copy
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={onClearSelection}>
          Clear selection
        </Button>
      </div>
    </div>
  );
}
