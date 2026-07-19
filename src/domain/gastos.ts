import { appendRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
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
