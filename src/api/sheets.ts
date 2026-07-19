import { getAccessToken } from "../auth/google-auth";

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sheets API error ${res.status}: ${body}`);
  }
  return res;
}

export interface SheetDefinition {
  name: string;
  headers: string[];
}

/** Crea un spreadsheet nuevo con una hoja por cada definición, encabezados incluidos. */
export async function createSpreadsheet(title: string, sheets: SheetDefinition[]): Promise<string> {
  const res = await authedFetch(SHEETS_BASE, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: sheets.map((s) => ({ properties: { title: s.name } })),
    }),
  });
  const data = await res.json();
  const spreadsheetId: string = data.spreadsheetId;

  await batchUpdateValues(
    spreadsheetId,
    sheets.map((s) => ({ range: `${s.name}!A1`, values: [s.headers] })),
  );

  return spreadsheetId;
}

/** Agrega hojas nuevas (con encabezados) a un spreadsheet ya existente. */
export async function addSheets(spreadsheetId: string, sheets: SheetDefinition[]): Promise<void> {
  if (sheets.length === 0) return;
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: sheets.map((s) => ({ addSheet: { properties: { title: s.name } } })),
    }),
  });
  await batchUpdateValues(
    spreadsheetId,
    sheets.map((s) => ({ range: `${s.name}!A1`, values: [s.headers] })),
  );
}

export async function getSheetNames(spreadsheetId: string): Promise<string[]> {
  const res = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`);
  const data = await res.json();
  return (data.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
}

/** Mapa nombre de hoja -> id numérico interno (lo pide la API para operaciones estructurales como borrar filas). */
export async function getSheetIds(spreadsheetId: string): Promise<Record<string, number>> {
  const res = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties(sheetId,title)`);
  const data = await res.json();
  const ids: Record<string, number> = {};
  for (const s of data.sheets ?? []) {
    ids[s.properties.title] = s.properties.sheetId;
  }
  return ids;
}

/** Borra una fila (1-based, incluye el encabezado en el conteo) de una hoja. */
export async function deleteRow(spreadsheetId: string, sheetId: number, row: number): Promise<void> {
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({
      requests: [
        { deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: row - 1, endIndex: row } } },
      ],
    }),
  });
}

export async function getValues(spreadsheetId: string, range: string): Promise<string[][]> {
  const res = await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`);
  const data = await res.json();
  return data.values ?? [];
}

export async function appendValues(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
  await authedFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
    { method: "POST", body: JSON.stringify({ values }) },
  );
}

export async function updateValues(spreadsheetId: string, range: string, values: unknown[][]): Promise<void> {
  await authedFetch(
    `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) },
  );
}

async function batchUpdateValues(
  spreadsheetId: string,
  data: { range: string; values: unknown[][] }[],
): Promise<void> {
  await authedFetch(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}
