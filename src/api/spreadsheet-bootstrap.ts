import { findFileByName } from "./drive";
import { appendRecords, listRecords } from "./records";
import { addSheets, createSpreadsheet, getSheetNames, getValues, updateValues, type SheetDefinition } from "./sheets";

export const SPREADSHEET_TITLE = "MisFinanzas";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

export const TIPOS_INGRESO_SHEET = "TiposIngreso";
export const INGRESOS_FIJOS_SHEET = "IngresosFijos";
export const GASTOS_FIJOS_SHEET = "GastosFijos";
export const GASTOS_Y_COMPRAS_SHEET = "GastosYCompras";
/** Categorías de Gastos Fijos. Independiente de CATEGORIAS_GASTOS_Y_COMPRAS_SHEET a propósito. */
export const CATEGORIAS_SHEET = "Categorias";
/** Categorías de Gastos y Compras. Misma mecánica que CATEGORIAS_SHEET pero una lista aparte. */
export const CATEGORIAS_GASTOS_Y_COMPRAS_SHEET = "CategoriasGastosYCompras";

/** Tipos de ingreso fijo con los que arranca toda cuenta nueva; el usuario puede agregar más. */
const DEFAULT_TIPOS_INGRESO = ["Nómina", "Trabajo independiente", "Regalo", "Otro"];

/** Definición de todas las hojas del spreadsheet y sus encabezados. */
export const SHEET_DEFINITIONS: SheetDefinition[] = [
  { name: "Nomina_Ingresos", headers: ["Fecha", "Fuente", "Monto", "Notas"] },
  { name: TIPOS_INGRESO_SHEET, headers: ["Nombre"] },
  {
    name: INGRESOS_FIJOS_SHEET,
    headers: ["Tipo", "Monto", "Notas", "Recurrencia", "Mes", "Activo", "FechaCreacion"],
  },
  {
    name: GASTOS_FIJOS_SHEET,
    headers: ["Nombre", "Monto", "DiaPago", "Categoria", "Mes", "Estado", "MontoPagado"],
  },
  {
    name: "Suscripciones",
    headers: ["Nombre", "Monto", "Ciclo", "ProximaFecha", "Categoria", "Activa"],
  },
  {
    name: GASTOS_Y_COMPRAS_SHEET,
    headers: ["Fecha", "Categoria", "Nombre", "Monto", "Estado", "LinkFactura"],
  },
  {
    name: "Facturas",
    headers: ["Fecha", "Proveedor", "Monto", "Categoria", "LinkDrive", "DeducibleRenta"],
  },
  { name: "Deudas", headers: ["Id", "Nombre", "MontoOriginal", "ProximoPago"] },
  { name: "AbonosDeudas", headers: ["IdDeuda", "Fecha", "MontoAbonado"] },
  { name: "MeDeben", headers: ["Id", "Quien", "MontoOriginal", "Fecha"] },
  { name: "AbonosMeDeben", headers: ["IdRegistro", "Fecha", "MontoRecibido"] },
  { name: "Ahorros", headers: ["Fecha", "Monto", "Meta", "Notas"] },
  { name: "MetasAhorro", headers: ["Nombre", "MontoObjetivo", "FechaObjetivo"] },
  { name: "PresupuestosCategoria", headers: ["Categoria", "LimiteMensual"] },
  { name: CATEGORIAS_SHEET, headers: ["Nombre"] },
  { name: CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, headers: ["Nombre"] },
];

let ensurePromise: Promise<{ spreadsheetId: string; created: boolean }> | null = null;

/**
 * Busca el spreadsheet "MisFinanzas" en el Drive del usuario; si no existe,
 * lo crea con todas las hojas y encabezados. Si ya existe pero le faltan
 * hojas (porque se agregaron después, como Ingresos), las completa sin
 * tocar las que ya tienen datos. Devuelve su ID.
 *
 * Cachea la promesa en curso: si dos páginas la llaman casi al mismo tiempo
 * (ej. Inicio y luego Ingresos al navegar rápido), comparten la misma
 * ejecución en vez de correr el seed de tipos por duplicado.
 */
export function ensureSpreadsheet(): Promise<{ spreadsheetId: string; created: boolean }> {
  if (!ensurePromise) {
    ensurePromise = ensureSpreadsheetInternal().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

async function ensureSpreadsheetInternal(): Promise<{ spreadsheetId: string; created: boolean }> {
  const existingId = await findFileByName(SPREADSHEET_TITLE, SPREADSHEET_MIME);
  if (existingId) {
    await ensureSheets(existingId);
    await ensureIngresosFijosHeaders(existingId);
    await ensureGastosFijosHeaders(existingId);
    await ensureGastosYComprasHeaders(existingId);
    await ensureDefaultTipos(existingId);
    return { spreadsheetId: existingId, created: false };
  }
  const spreadsheetId = await createSpreadsheet(SPREADSHEET_TITLE, SHEET_DEFINITIONS);
  await ensureDefaultTipos(spreadsheetId);
  return { spreadsheetId, created: true };
}

async function ensureSheets(spreadsheetId: string): Promise<void> {
  const existingNames = new Set(await getSheetNames(spreadsheetId));
  const missing = SHEET_DEFINITIONS.filter((s) => !existingNames.has(s.name));
  await addSheets(spreadsheetId, missing);
}

/** Si IngresosFijos ya existía con el encabezado viejo (sin Recurrencia/Mes) y aún no tiene datos, lo actualiza. */
async function ensureIngresosFijosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === INGRESOS_FIJOS_SHEET)!;
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 1);
  if (rows.length > 0) return;
  await updateValues(spreadsheetId, `${INGRESOS_FIJOS_SHEET}!A1`, [def.headers]);
}

/**
 * Si GastosFijos ya existía sin la columna MontoPagado, la agrega al
 * encabezado. Solo toca la fila 1 (encabezados), nunca las filas de datos,
 * así que es seguro aunque ya haya gastos registrados.
 */
async function ensureGastosFijosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === GASTOS_FIJOS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${GASTOS_FIJOS_SHEET}!A1:Z1`);
  if (headerRow.length >= def.headers.length) return;
  await updateValues(spreadsheetId, `${GASTOS_FIJOS_SHEET}!A1`, [def.headers]);
}

/**
 * Renombra el encabezado "Descripcion" de GastosYCompras a "Nombre" (mismo
 * significado, solo cambia el texto de la columna). Solo toca la fila 1.
 */
async function ensureGastosYComprasHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === GASTOS_Y_COMPRAS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${GASTOS_Y_COMPRAS_SHEET}!A1:Z1`);
  if (headerRow.join() === def.headers.join()) return;
  await updateValues(spreadsheetId, `${GASTOS_Y_COMPRAS_SHEET}!A1`, [def.headers]);
}

async function ensureDefaultTipos(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  if (rows.length > 0) return;
  await appendRecords(
    spreadsheetId,
    TIPOS_INGRESO_SHEET,
    DEFAULT_TIPOS_INGRESO.map((nombre) => [nombre]),
  );
}
