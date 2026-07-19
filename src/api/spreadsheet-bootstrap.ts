import { findFileByName } from "./drive";
import { createSpreadsheet, type SheetDefinition } from "./sheets";

export const SPREADSHEET_TITLE = "MisFinanzas";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

/** Definición de todas las hojas del spreadsheet y sus encabezados. */
export const SHEET_DEFINITIONS: SheetDefinition[] = [
  { name: "Nomina_Ingresos", headers: ["Fecha", "Fuente", "Monto", "Notas"] },
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
 * lo crea con todas las hojas y encabezados. Devuelve su ID.
 */
export async function ensureSpreadsheet(): Promise<{ spreadsheetId: string; created: boolean }> {
  const existingId = await findFileByName(SPREADSHEET_TITLE, SPREADSHEET_MIME);
  if (existingId) {
    return { spreadsheetId: existingId, created: false };
  }
  const spreadsheetId = await createSpreadsheet(SPREADSHEET_TITLE, SHEET_DEFINITIONS);
  return { spreadsheetId, created: true };
}
