import { memo, useMemo } from "react";

interface HighlightTextProps {
  highlight: string;
  text: string;
}

export const HighlightText = memo(function HighlightText({ highlight, text }: HighlightTextProps) {
  const segments = useMemo(() => {
    if (!highlight) return null;

    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "gi");
    return text.split(regex);
  }, [highlight, text]);

  if (!segments || segments.length <= 1) {
    return <>{text}</>;
  }

  return (
    <span>
      {segments.map((segment, index) =>
        segment.toLowerCase() === highlight.toLowerCase() ? (
          <mark
            key={index}
            className="rounded-sm bg-yellow-200 text-inherit dark:bg-yellow-800/60"
          >
            {segment}
          </mark>
        ) : (
          segment
        ),
      )}
    </span>
  );
});
