import { CATEGORIAS_SHEET, GASTOS_FIJOS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey } from "./format";

export interface GastoFijo {
  row: number;
  nombre: string;
  monto: number;
  diaPago: string;
  categoria: string;
  mes: string;
  estado: string;
  /** Lo que realmente se pagó (puede diferir de `monto`); null si aún no se ha pagado. */
  montoPagado: number | null;
}

function parseGastoFijo(r: SheetRow): GastoFijo {
  const [nombre = "", monto = "0", diaPago = "", categoria = "", mes = "", estado = "", montoPagado = ""] = r.values;
  return {
    row: r.row,
    nombre,
    monto: Number(monto) || 0,
    diaPago,
    categoria,
    mes,
    estado,
    montoPagado: montoPagado === "" ? null : Number(montoPagado) || 0,
  };
}

/** Todos los gastos fijos registrados alguna vez, de cualquier mes — para el Histórico. */
export async function listTodosLosGastosFijos(spreadsheetId: string): Promise<GastoFijo[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 7);
  return rows.map(parseGastoFijo);
}

export async function listGastosFijosDelMes(spreadsheetId: string, date: Date = new Date()): Promise<GastoFijo[]> {
  const todos = await listTodosLosGastosFijos(spreadsheetId);
  const mes = monthKey(date);
  return todos.filter((g) => g.mes === mes);
}

export async function crearGastoFijo(
  spreadsheetId: string,
  nombre: string,
  monto: number,
  categoria: string,
  diaPago: string,
): Promise<void> {
  await appendRecord(spreadsheetId, GASTOS_FIJOS_SHEET, [
    nombre,
    monto,
    diaPago,
    categoria,
    monthKey(),
    "Pendiente",
    "",
  ]);
}

/** Marca el gasto como pagado con el monto que realmente se pagó (puede ser distinto al esperado). */
export async function marcarGastoPagado(spreadsheetId: string, gasto: GastoFijo, montoPagado: number): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, [
    gasto.nombre,
    gasto.monto,
    gasto.diaPago,
    gasto.categoria,
    gasto.mes,
    "Pagado",
    montoPagado,
  ]);
}

/** Revierte el gasto a pendiente y limpia el monto pagado registrado. */
export async function marcarGastoPendiente(spreadsheetId: string, gasto: GastoFijo): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, [
    gasto.nombre,
    gasto.monto,
    gasto.diaPago,
    gasto.categoria,
    gasto.mes,
    "Pendiente",
    "",
  ]);
}

export interface GastoFijoCambios {
  nombre: string;
  monto: number;
  categoria: string;
  diaPago: string;
}

export async function actualizarGastoFijo(
  spreadsheetId: string,
  gasto: GastoFijo,
  cambios: GastoFijoCambios,
): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, [
    cambios.nombre,
    cambios.monto,
    cambios.diaPago,
    cambios.categoria,
    gasto.mes,
    gasto.estado,
    gasto.montoPagado === null ? "" : gasto.montoPagado,
  ]);
}

export async function eliminarGastoFijo(spreadsheetId: string, gasto: GastoFijo): Promise<void> {
  await deleteRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row);
}

export async function listCategorias(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_SHEET, 1);
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
  await appendRecord(spreadsheetId, CATEGORIAS_SHEET, [nombre]);
}

/** Borra todas las filas con ese nombre en Categorias (por si quedaron duplicadas). */
export async function eliminarCategoria(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_SHEET, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, CATEGORIAS_SHEET, row);
  }
}

/** Nombres distintos usados en gastos fijos de cualquier mes, para autocompletar el formulario. */
export async function listGastosFijosNombres(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 7);
  const seen = new Set<string>();
  const nombres: string[] = [];
  for (const r of rows) {
    const nombre = r.values[0];
    if (nombre && !seen.has(nombre)) {
      seen.add(nombre);
      nombres.push(nombre);
    }
  }
  return nombres;
}

export function sumGastosFijosTotal(fijos: GastoFijo[]): number {
  return fijos.reduce((s, g) => s + g.monto, 0);
}

/** Suma solo los gastos fijos que aún no están marcados como "Pagado". */
export function sumGastosFijosPendientes(fijos: GastoFijo[]): number {
  return fijos.filter((g) => g.estado !== "Pagado").reduce((s, g) => s + g.monto, 0);
}

/** Suma lo realmente pagado (usa el monto esperado si un gasto pagado no tiene monto pagado registrado). */
export function sumGastosFijosPagado(fijos: GastoFijo[]): number {
  return fijos
    .filter((g) => g.estado === "Pagado")
    .reduce((s, g) => s + (g.montoPagado ?? g.monto), 0);
}

export interface DiferenciaPago {
  gasto: GastoFijo;
  /** monto pagado - monto esperado: positivo si pagó de más, negativo si pagó de menos. */
  diferencia: number;
}

/** Gastos pagados cuyo monto real fue distinto al esperado, para el detalle de diferencias. */
export function diferenciasPago(fijos: GastoFijo[]): DiferenciaPago[] {
  return fijos
    .filter((g) => g.estado === "Pagado" && g.montoPagado !== null && g.montoPagado !== g.monto)
    .map((g) => ({ gasto: g, diferencia: (g.montoPagado as number) - g.monto }));
}

export function sumDiferenciasPago(fijos: GastoFijo[]): number {
  return diferenciasPago(fijos).reduce((s, d) => s + d.diferencia, 0);
}

/** "vencida" si ya pasó el día de pago sin marcarlo pagado; "proxima" si faltan 5 días o menos. */
export function estadoAlertaGastoFijo(gasto: GastoFijo, hoy: Date = new Date()): "vencida" | "proxima" | null {
  if (gasto.estado === "Pagado") return null;
  const dia = Number(gasto.diaPago);
  if (!dia) return null;
  const hoyDia = hoy.getDate();
  if (hoyDia > dia) return "vencida";
  if (dia - hoyDia <= 5) return "proxima";
  return null;
}
