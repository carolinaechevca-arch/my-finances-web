import { CATEGORIAS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey } from "./format";

const GASTOS_FIJOS_SHEET = "GastosFijos";
const GASTOS_PERSONALES_SHEET = "GastosPersonales";

export interface GastoFijo {
  row: number;
  nombre: string;
  monto: number;
  diaPago: string;
  categoria: string;
  mes: string;
  estado: string;
}

export interface GastoPersonal {
  row: number;
  fecha: string;
  categoria: string;
  monto: number;
  descripcion: string;
}

function parseGastoFijo(r: SheetRow): GastoFijo {
  const [nombre = "", monto = "0", diaPago = "", categoria = "", mes = "", estado = ""] = r.values;
  return { row: r.row, nombre, monto: Number(monto) || 0, diaPago, categoria, mes, estado };
}

function parseGastoPersonal(r: SheetRow): GastoPersonal {
  const [fecha = "", categoria = "", monto = "0", descripcion = ""] = r.values;
  return { row: r.row, fecha, categoria, monto: Number(monto) || 0, descripcion };
}

export async function listGastosFijosDelMes(spreadsheetId: string, date: Date = new Date()): Promise<GastoFijo[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 6);
  const mes = monthKey(date);
  return rows.map(parseGastoFijo).filter((g) => g.mes === mes);
}

export async function crearGastoFijo(
  spreadsheetId: string,
  nombre: string,
  monto: number,
  categoria: string,
  diaPago: string,
): Promise<void> {
  await appendRecord(spreadsheetId, GASTOS_FIJOS_SHEET, [nombre, monto, diaPago, categoria, monthKey(), "Pendiente"]);
}

export async function setGastoFijoEstado(spreadsheetId: string, gasto: GastoFijo, estado: string): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, [
    gasto.nombre,
    gasto.monto,
    gasto.diaPago,
    gasto.categoria,
    gasto.mes,
    estado,
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

export async function listGastosPersonalesDelMes(
  spreadsheetId: string,
  date: Date = new Date(),
): Promise<GastoPersonal[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_PERSONALES_SHEET, 4);
  const mes = monthKey(date);
  return rows.map(parseGastoPersonal).filter((g) => g.fecha.startsWith(mes));
}

export async function crearGastoPersonal(
  spreadsheetId: string,
  fecha: string,
  categoria: string,
  monto: number,
  descripcion: string,
): Promise<void> {
  await appendRecord(spreadsheetId, GASTOS_PERSONALES_SHEET, [fecha, categoria, monto, descripcion]);
}

export function sumGastos(fijos: GastoFijo[], personales: GastoPersonal[]): number {
  return fijos.reduce((s, g) => s + g.monto, 0) + personales.reduce((s, g) => s + g.monto, 0);
}
