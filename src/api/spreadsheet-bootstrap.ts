import { findFileByName } from "./drive";
import { appendRecords, listRecords } from "./records";
import { addSheets, createSpreadsheet, getSheetNames, type SheetDefinition } from "./sheets";

export const SPREADSHEET_TITLE = "MisFinanzas";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

export const TIPOS_INGRESO_SHEET = "TiposIngreso";
export const INGRESOS_FIJOS_SHEET = "IngresosFijos";

/** Tipos de ingreso fijo con los que arranca toda cuenta nueva; el usuario puede agregar más. */
const DEFAULT_TIPOS_INGRESO = ["Nómina", "Trabajo independiente", "Regalo", "Otro"];

/** Definición de todas las hojas del spreadsheet y sus encabezados. */
export const SHEET_DEFINITIONS: SheetDefinition[] = [
  { name: "Nomina_Ingresos", headers: ["Fecha", "Fuente", "Monto", "Notas"] },
  { name: TIPOS_INGRESO_SHEET, headers: ["Nombre"] },
  { name: INGRESOS_FIJOS_SHEET, headers: ["Tipo", "Monto", "Notas", "Activo", "FechaCreacion"] },
  {
    name: "GastosFijos",
    headers: ["Nombre", "Monto", "DiaPago", "Categoria", "Mes", "Estado"],
  },
  {
    name: "Suscripciones",
    headers: ["Nombre", "Monto", "Ciclo", "ProximaFecha", "Categoria", "Activa"],
  },
  { name: "GastosPersonales", headers: ["Fecha", "Categoria", "Monto", "Descripcion"] },
  { name: "Compras", headers: ["Fecha", "Item", "Monto", "MetodoPago"] },
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
  { name: "Categorias", headers: ["Nombre"] },
];

/**
 * Busca el spreadsheet "MisFinanzas" en el Drive del usuario; si no existe,
 * lo crea con todas las hojas y encabezados. Si ya existe pero le faltan
 * hojas (porque se agregaron después, como Ingresos), las completa sin
 * tocar las que ya tienen datos. Devuelve su ID.
 */
export async function ensureSpreadsheet(): Promise<{ spreadsheetId: string; created: boolean }> {
  const existingId = await findFileByName(SPREADSHEET_TITLE, SPREADSHEET_MIME);
  if (existingId) {
    await ensureSheets(existingId);
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

async function ensureDefaultTipos(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  if (rows.length > 0) return;
  await appendRecords(
    spreadsheetId,
    TIPOS_INGRESO_SHEET,
    DEFAULT_TIPOS_INGRESO.map((nombre) => [nombre]),
  );
}
