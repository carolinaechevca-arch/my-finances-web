import { CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, GASTOS_Y_COMPRAS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey, parseDateInput } from "./format";

/** "Ahorrando" = se convirtió en meta de ahorro; deja de contar como pendiente hasta completarse. */
export type EstadoGasto = "Pagado" | "Pendiente" | "Ahorrando";

export interface GastoYCompra {
  id: string;
  row: number;
  fecha: string;
  categoria: string;
  nombre: string;
  monto: number;
  estado: EstadoGasto;
  linkFactura: string;
}

function parseGasto(r: SheetRow): GastoYCompra {
  const [fecha = "", categoria = "", nombre = "", monto = "0", estado = "", linkFactura = "", id = ""] = r.values;
  return {
    id,
    row: r.row,
    fecha,
    categoria,
    nombre,
    monto: Number(monto) || 0,
    estado: estado === "Pendiente" || estado === "Ahorrando" ? estado : "Pagado",
    linkFactura,
  };
}

/** Todos los gastos/compras registrados alguna vez, de cualquier mes y estado — para el Histórico. */
export async function listTodosLosGastos(spreadsheetId: string): Promise<GastoYCompra[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, 7);
  return rows.map(parseGasto);
}

async function listAll(spreadsheetId: string): Promise<GastoYCompra[]> {
  return listTodosLosGastos(spreadsheetId);
}

/**
 * Gastos ya realizados/pagados cuya fecha cae en el mes dado — son los que
 * cuentan para el total gastado ese mes. Los "Pendiente"/"Ahorrando" no
 * entran aquí porque todavía no salieron del monto libre.
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
 * a contar en el total de ese mes) o los convierte en meta de ahorro.
 */
export async function listPendientes(spreadsheetId: string): Promise<GastoYCompra[]> {
  const all = await listAll(spreadsheetId);
  return all.filter((g) => g.estado === "Pendiente");
}

/** Compras que se están gestionando como meta de ahorro (ver domain/metas.ts). */
export async function listAhorrando(spreadsheetId: string): Promise<GastoYCompra[]> {
  const all = await listAll(spreadsheetId);
  return all.filter((g) => g.estado === "Ahorrando");
}

export async function buscarGastoPorId(spreadsheetId: string, id: string): Promise<GastoYCompra | undefined> {
  const all = await listAll(spreadsheetId);
  return all.find((g) => g.id === id);
}

export interface NuevoGasto {
  fecha: string;
  categoria: string;
  nombre: string;
  monto: number;
  estado: EstadoGasto;
}

/** Crea el gasto y devuelve el registro completo (con su id/fila), para poder adjuntarle la factura enseguida. */
export async function crearGasto(spreadsheetId: string, gasto: NuevoGasto): Promise<GastoYCompra> {
  const id = crypto.randomUUID();
  const row = await appendRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, [
    gasto.fecha,
    gasto.categoria,
    gasto.nombre,
    gasto.monto,
    gasto.estado,
    "",
    id,
  ]);
  return { id, row, ...gasto, linkFactura: "" };
}

/** Marca un gasto pendiente (o ahorrando) como realizado, con su monto y fecha reales. */
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
    gasto.id,
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
    gasto.id,
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
    gasto.id,
  ]);
}

/** Convierte una compra pendiente en "Ahorrando" (se está juntando el dinero vía una meta). */
export async function marcarComoAhorrando(spreadsheetId: string, gasto: GastoYCompra): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row, [
    gasto.fecha,
    gasto.categoria,
    gasto.nombre,
    gasto.monto,
    "Ahorrando",
    gasto.linkFactura,
    gasto.id,
  ]);
}

/** Deshace la conversión: la compra vuelve a "Pendiente de pago" normal. */
export async function deshacerAhorrando(spreadsheetId: string, gasto: GastoYCompra): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, gasto.row, [
    gasto.fecha,
    gasto.categoria,
    gasto.nombre,
    gasto.monto,
    "Pendiente",
    gasto.linkFactura,
    gasto.id,
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
