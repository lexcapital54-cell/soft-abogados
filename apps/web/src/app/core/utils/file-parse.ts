import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedSheet = {
  fileName: string;
  columns: string[];
  rows: Record<string, unknown>[];
};

function rowsFromMatrix(matrix: unknown[][]): Record<string, unknown>[] {
  if (!matrix.length) return [];
  const header = (matrix[0] ?? []).map((h, i) =>
    String(h ?? `col_${i + 1}`).trim() || `col_${i + 1}`,
  );
  const out: Record<string, unknown>[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const line = matrix[r] ?? [];
    if (line.every((c) => c === null || c === undefined || String(c).trim() === '')) {
      continue;
    }
    const row: Record<string, unknown> = {};
    header.forEach((h, i) => {
      row[h] = line[i] ?? '';
    });
    out.push(row);
  }
  return out;
}

export async function parseDataFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    const parsed = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });
    const rows = (parsed.data ?? []).filter((r) =>
      Object.values(r).some((v) => String(v ?? '').trim() !== ''),
    );
    return {
      fileName: file.name,
      columns: parsed.meta.fields ?? Object.keys(rows[0] ?? {}),
      rows,
    };
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      throw new Error('El Excel no tiene hojas');
    }
    const sheet = wb.Sheets[sheetName]!;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    const rows = rowsFromMatrix(matrix);
    return {
      fileName: file.name,
      columns: Object.keys(rows[0] ?? {}),
      rows,
    };
  }

  throw new Error('Formato no soportado. Use CSV o Excel (.xlsx).');
}
