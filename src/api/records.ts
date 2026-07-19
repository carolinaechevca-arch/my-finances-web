import { appendValues, getValues, updateValues } from "./sheets";

export interface SheetRow {
  /** Número de fila en la hoja (1-based, la fila 1 es el encabezado). */
  row: number;
  values: string[];
}

function columnLetter(count: number): string {
  let s = "";
  let n = count;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Lee todas las filas de datos (sin el encabezado) de una hoja. */
export async function listRecords(spreadsheetId: string, sheet: string, columnCount: number): Promise<SheetRow[]> {
  const range = `${sheet}!A2:${columnLetter(columnCount)}`;
  const rows = await getValues(spreadsheetId, range);
  return rows
    .map((values, i) => ({ row: i + 2, values }))
    .filter((r) => r.values.some((v) => v !== "" && v != null));
}

export async function appendRecord(spreadsheetId: string, sheet: string, values: unknown[]): Promise<void> {
  await appendValues(spreadsheetId, `${sheet}!A1`, [values]);
}

export async function appendRecords(spreadsheetId: string, sheet: string, rows: unknown[][]): Promise<void> {
  if (rows.length === 0) return;
  await appendValues(spreadsheetId, `${sheet}!A1`, rows);
}

export async function updateRecord(
  spreadsheetId: string,
  sheet: string,
  row: number,
  values: unknown[],
): Promise<void> {
  const range = `${sheet}!A${row}:${columnLetter(values.length)}${row}`;
  await updateValues(spreadsheetId, range, [values]);
}
