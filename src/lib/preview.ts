export interface TextPreview {
  omittedCharacters: number;
  omittedCharactersKnown?: boolean;
  text: string;
  truncated: boolean;
}

export interface RowPreview<T> {
  omittedRows: number;
  rows: T[];
  truncated: boolean;
}

export function createTextPreview(text: string, maxCharacters: number) {
  if (text.length <= maxCharacters) {
    return {
      omittedCharacters: 0,
      omittedCharactersKnown: true,
      text,
      truncated: false,
    } satisfies TextPreview;
  }

  return {
    omittedCharacters: text.length - maxCharacters,
    omittedCharactersKnown: true,
    text: `${text.slice(0, maxCharacters).trimEnd()}\n\n[Preview truncated]`,
    truncated: true,
  } satisfies TextPreview;
}

export function createRowPreview<T>(rows: T[], maxRows: number) {
  if (rows.length <= maxRows) {
    return {
      omittedRows: 0,
      rows,
      truncated: false,
    } satisfies RowPreview<T>;
  }

  return {
    omittedRows: rows.length - maxRows,
    rows: rows.slice(0, maxRows),
    truncated: true,
  } satisfies RowPreview<T>;
}
