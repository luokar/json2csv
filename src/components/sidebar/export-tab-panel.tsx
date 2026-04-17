import type { ChangeEvent, ReactNode } from "react";
import { useState } from "react";

import { Clipboard, Download, FileDown, FileUp } from "lucide-react";

import { InspectorSection } from "@/components/inspector/inspector-section";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";

type SnippetTab = "pandas" | "jq" | "sql";

const PY_KEYWORDS = /\b(import|from|as|with|def|return|if|else|for|in|not|and|or|True|False|None|print|open)\b/g;
const PY_STRINGS = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|f"(?:[^"\\]|\\.)*")/g;
const PY_COMMENTS = /(#.*$)/gm;

function highlightPython(line: string): ReactNode {
  if (!line.trim()) return "\n";

  const commentMatch = line.match(PY_COMMENTS);
  if (commentMatch) {
    const commentStart = line.indexOf("#");
    const before = line.slice(0, commentStart);
    const comment = line.slice(commentStart);
    return (
      <>
        {highlightPythonInner(before)}
        <span className="text-muted-foreground/70 italic">{comment}</span>
        {"\n"}
      </>
    );
  }

  return <>{highlightPythonInner(line)}{"\n"}</>;
}

function highlightPythonInner(text: string): ReactNode {
  if (!text) return null;

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const combined = new RegExp(`${PY_STRINGS.source}|${PY_KEYWORDS.source}`, "g");
  let match: RegExpExecArray | null;

  while ((match = combined.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      parts.push(
        <span key={match.index} className="text-emerald-600">
          {match[0]}
        </span>,
      );
    } else {
      parts.push(
        <span key={match.index} className="text-blue-600 font-medium">
          {match[0]}
        </span>,
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

const SQL_KEYWORDS = /\b(CREATE|TABLE|NOT|NULL|BOOLEAN|NUMERIC|TEXT|COPY|FROM|WITH|FORMAT|HEADER|DELIMITER)\b/gi;

function highlightSql(line: string): ReactNode {
  if (!line.trim()) return "\n";

  if (line.startsWith("\\")) {
    return <>{line}{"\n"}</>;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(SQL_KEYWORDS.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-blue-600 font-medium">
        {match[0]}
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return <>{parts}{"\n"}</>;
}

export function ExportTabPanel({
  canExportOutputs,
  configErrors,
  isOutputExporting,
  isProjecting,
  jqSnippet,
  onExport,
  onExportConfig,
  onImportConfig,
  onResetDefaults,
  outputExportBlockedReason,
  outputExportLabel,
  pandasSnippet,
  sqlSnippet,
}: {
  canExportOutputs: boolean;
  configErrors: string[];
  isOutputExporting: boolean;
  isProjecting: boolean;
  jqSnippet: string | null;
  onExport: () => void;
  onExportConfig: () => void;
  onImportConfig: (event: ChangeEvent<HTMLInputElement>) => void;
  onResetDefaults: () => void;
  outputExportBlockedReason: string | null;
  outputExportLabel: string | null;
  pandasSnippet: string | null;
  sqlSnippet: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [snippetTab, setSnippetTab] = useState<SnippetTab>("pandas");

  const activeSnippet =
    snippetTab === "pandas" ? pandasSnippet : snippetTab === "jq" ? jqSnippet : sqlSnippet;

  function handleCopy() {
    if (!activeSnippet) return;
    void navigator.clipboard.writeText(activeSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function highlightSnippet(snippet: string): ReactNode[] {
    if (snippetTab === "pandas") {
      return snippet.split("\n").map((line, i) => (
        <span key={i} className="block">
          {highlightPython(line)}
        </span>
      ));
    }
    if (snippetTab === "sql") {
      return snippet.split("\n").map((line, i) => (
        <span key={i} className="block">
          {highlightSql(line)}
        </span>
      ));
    }
    // jq — no highlighting, just display
    return snippet.split("\n").map((line, i) => (
      <span key={i} className="block">
        {line}{"\n"}
      </span>
    ));
  }

  const hasAnySnippet = pandasSnippet || jqSnippet || sqlSnippet;

  return (
    <>
      <InspectorSection
        description="Save your CSV file or start over."
        title="Download & reset"
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            title={outputExportBlockedReason ?? "Download the CSV file."}
            disabled={!canExportOutputs || isOutputExporting}
            onClick={onExport}
          >
            <Download className="size-4" />
            {isOutputExporting && outputExportLabel?.includes("CSV")
              ? "Preparing..."
              : "Download CSV"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isProjecting}
            onClick={onResetDefaults}
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

      <InspectorSection
        description="Save or load your conversion settings."
        title="Save & load config"
      >
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExportConfig}
          >
            <FileDown className="size-4" />
            Save config
          </Button>
          <label
            htmlFor="config-upload"
            className="inline-flex h-8 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-white px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <FileUp className="size-4" />
            Load config
          </label>
          <input
            id="config-upload"
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={onImportConfig}
          />
        </div>
      </InspectorSection>

      {hasAnySnippet ? (
        <InspectorSection
          description="Reproduce this pipeline in code."
          title="Pipeline snippets"
        >
          <div className="flex gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5">
            {(["pandas", "jq", "sql"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  snippetTab === tab
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setSnippetTab(tab);
                  setCopied(false);
                }}
              >
                {tab === "pandas" ? "Python" : tab === "jq" ? "jq" : "SQL"}
              </button>
            ))}
          </div>

          {activeSnippet ? (
            <div className="relative">
              <pre className="max-h-60 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                {highlightSnippet(activeSnippet)}
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={handleCopy}
              >
                <Clipboard className="size-3.5" />
                {copied ? "Copied!" : "Copy"}
              </Button>
            </div>
          ) : (
            <Notice>
              {snippetTab === "pandas"
                ? "Load data to generate a Python snippet."
                : snippetTab === "jq"
                  ? "Load data to generate a jq command."
                  : "Load data to generate a SQL schema."}
            </Notice>
          )}
        </InspectorSection>
      ) : null}
    </>
  );
}
