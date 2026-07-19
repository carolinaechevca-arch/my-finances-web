import { CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, GASTOS_Y_COMPRAS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey, parseDateInput } from "./format";

export type EstadoGasto = "Pagado" | "Pendiente";

export interface GastoYCompra {
  row: number;
  fecha: string;
  categoria: string;
  nombre: string;
  monto: number;
  estado: EstadoGasto;
  linkFactura: string;
}

function parseGasto(r: SheetRow): GastoYCompra {
  const [fecha = "", categoria = "", nombre = "", monto = "0", estado = "", linkFactura = ""] = r.values;
  return {
    row: r.row,
    fecha,
    categoria,
    nombre,
    monto: Number(monto) || 0,
    estado: estado === "Pendiente" ? "Pendiente" : "Pagado",
    linkFactura,
  };
}

async function listAll(spreadsheetId: string): Promise<GastoYCompra[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, 6);
  return rows.map(parseGasto);
}

/**
 * Gastos ya realizados/pagados cuya fecha cae en el mes dado — son los que
 * cuentan para el total gastado ese mes. Los "Pendiente" no entran aquí
 * porque todavía no salieron del monto libre (ver listPendientes).
 */
export async function listGastosDelMes(spreadsheetId: string, date: Date = new Date()): Promise<GastoYCompra[]> {
  const all = await listAll(spreadsheetId);
  const mes = monthKey(date);
  return all.filter((g) => g.estado === "Pagado" && g.fecha && monthKey(parseDateInput(g.fecha)) === mes);
}

/**
 * Compras/gastos planeados que aún no se han hecho. No están atados a un
 * mes: se "arrastran" y siguen apareciendo aquí hasta que el usuario los
 * marca como pagados (momento en el que se les fija una fecha real y pasan
 * a contar en el total de ese mes).
 */
export async function listPendientes(spreadsheetId: string): Promise<GastoYCompra[]> {
  const all = await listAll(spreadsheetId);
  return all.filter((g) => g.estado === "Pendiente");
}

export interface NuevoGasto {
  fecha: string;
  categoria: string;
  nombre: string;
  monto: number;
  estado: EstadoGasto;
}

/** Crea el gasto y devuelve el registro completo (con su fila), para poder adjuntarle la factura enseguida. */
export async function crearGasto(spreadsheetId: string, gasto: NuevoGasto): Promise<GastoYCompra> {
  const row = await appendRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, [
    gasto.fecha,
    gasto.categoria,
    gasto.nombre,
    gasto.monto,
    gasto.estado,
    "",
  ]);
  return { row, ...gasto, linkFactura: "" };
}

/** Marca un gasto pendiente (o ya pagado) como realizado, con su monto y fecha reales. */
export async function marcarComoPagado(
  spreadsheetId: string,
  gasto: GastoYCompra,
  cambios: { monto: number; fecha: string },
): Promise<GastoYCompra> {
  await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row, [
    cambios.fecha,
    gasto.categoria,
    gasto.nombre,
    cambios.monto,
    "Pagado",
    gasto.linkFactura,
  ]);
  return { ...gasto, fecha: cambios.fecha, monto: cambios.monto, estado: "Pagado" };
}

export interface GastoCambios {
  fecha: string;
  categoria: string;
  nombre: string;
  monto: number;
  estado: EstadoGasto;
}

export async function actualizarGasto(
  spreadsheetId: string,
  gasto: GastoYCompra,
  cambios: GastoCambios,
): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row, [
    cambios.fecha,
    cambios.categoria,
    cambios.nombre,
    cambios.monto,
    cambios.estado,
    gasto.linkFactura,
  ]);
}

export async function eliminarGasto(spreadsheetId: string, gasto: GastoYCompra): Promise<void> {
  await deleteRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row);
}

export async function adjuntarFactura(spreadsheetId: string, gasto: GastoYCompra, link: string): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row, [
    gasto.fecha,
    gasto.categoria,
    gasto.nombre,
    gasto.monto,
    gasto.estado,
    link,
  ]);
}

export function sumGastos(gastos: GastoYCompra[]): number {
  return gastos.reduce((s, g) => s + g.monto, 0);
}

/** Categorías propias de Gastos y Compras — independientes de las de Gastos Fijos. */
export async function listCategorias(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, 1);
  const seen = new Set<string>();
  const categorias: string[] = [];
  for (const r of rows) {
    const nombre = r.values[0];
    if (nombre && !seen.has(nombre)) {
      seen.add(nombre);
      categorias.push(nombre);
    }
  }
  return categorias;
}

export async function crearCategoria(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, [nombre]);
}

/** Borra todas las filas con ese nombre (por si quedaron duplicadas). */
export async function eliminarCategoria(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, row);
  }
}
