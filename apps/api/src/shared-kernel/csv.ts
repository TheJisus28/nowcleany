import { ValidationError } from './errors.js';

export interface CsvRow {
  /** 1-based line number in the file, for error messages. */
  readonly line: number;
  readonly values: Readonly<Record<string, string>>;
}

/**
 * Parses a small CSV file as exported by Excel: separator ";" or "," (auto-detected from the header),
 * optional double quotes ("" escapes a quote), UTF-8 with or without BOM. Header names are normalised to
 * lower case without accents, so "Código" and "codigo" are the same column.
 */
export function parseCsv(text: string, requiredColumns: readonly string[]): CsvRow[] {
  const content = text.replace(/^\uFEFF/, '');
  const lines = content.split(/\r?\n/);
  const headerLine = lines[0] ?? '';
  const separator =
    (headerLine.match(/;/g)?.length ?? 0) >= (headerLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const header = splitLine(headerLine, separator).map(normaliseHeader);

  const missing = requiredColumns.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new ValidationError(
      'csv.missing_columns',
      `Al archivo le faltan columnas: ${missing.join(', ')}. La primera fila debe tener los encabezados.`,
      { missing, found: header },
    );
  }

  const rows: CsvRow[] = [];
  lines.slice(1).forEach((raw, index) => {
    if (raw.trim() === '') return;
    const cells = splitLine(raw, separator);
    const values: Record<string, string> = {};
    header.forEach((column, position) => {
      values[column] = (cells[position] ?? '').trim();
    });
    rows.push({ line: index + 2, values });
  });
  return rows;
}

/** In ";" files exported from Spanish Excel, decimals use a comma: "2,5" → "2.5". */
export function normaliseDecimal(value: string): string {
  return value.replace(/\s/g, '').replace(',', '.');
}

function normaliseHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function splitLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line.charAt(i);
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === separator) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
