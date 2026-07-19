import { INGRESOS_FIJOS_SHEET, TIPOS_INGRESO_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey } from "./format";

export type Recurrencia = "Fijo" | "UnicoMes";

export interface IngresoFijo {
  row: number;
  tipo: string;
  monto: number;
  notas: string;
  recurrencia: Recurrencia;
  /** Solo aplica a "UnicoMes": el mes (YYYY-MM) al que pertenece. */
  mes: string;
  activo: boolean;
  fechaCreacion: string;
}

function parseIngreso(r: SheetRow): IngresoFijo {
  const [tipo = "", monto = "0", notas = "", recurrencia = "Fijo", mes = "", activo = "TRUE", fechaCreacion = ""] =
    r.values;
  return {
    row: r.row,
    tipo,
    monto: Number(monto) || 0,
    notas,
    recurrencia: recurrencia === "UnicoMes" ? "UnicoMes" : "Fijo",
    mes,
    activo: activo.toUpperCase() !== "FALSE",
    fechaCreacion,
  };
}

export async function listTiposIngreso(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  const seen = new Set<string>();
  const tipos: string[] = [];
  for (const r of rows) {
    const nombre = r.values[0];
    if (nombre && !seen.has(nombre)) {
      seen.add(nombre);
      tipos.push(nombre);
    }
  }
  return tipos;
}

export async function crearTipoIngreso(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, TIPOS_INGRESO_SHEET, [nombre]);
}

/** Borra todas las filas con ese nombre en TiposIngreso (por si quedaron duplicadas). */
export async function eliminarTipoIngreso(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, TIPOS_INGRESO_SHEET, row);
  }
}

/**
 * Ingresos que cuentan para el mes dado: todos los "Fijo" (recurren mes a
 * mes hasta que se pausan o se eliminan) más los "UnicoMes" que fueron
 * creados para ese mes específico. Un "UnicoMes" de un mes anterior deja de
 * aparecer aquí en cuanto cambia el mes: su fila sigue existiendo en la hoja
 * como histórico, pero ya no se lista ni se suma como vigente.
 */
export async function listIngresosVigentes(spreadsheetId: string, date: Date = new Date()): Promise<IngresoFijo[]> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 7);
  const mes = monthKey(date);
  return rows.map(parseIngreso).filter((i) => i.recurrencia === "Fijo" || i.mes === mes);
}

export async function crearIngreso(
  spreadsheetId: string,
  tipo: string,
  monto: number,
  notas: string,
  recurrencia: Recurrencia,
): Promise<void> {
  await appendRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, [
    tipo,
    monto,
    notas,
    recurrencia,
    recurrencia === "UnicoMes" ? monthKey() : "",
    "TRUE",
    new Date().toISOString().slice(0, 10),
  ]);
}

export async function setIngresoActivo(spreadsheetId: string, ingreso: IngresoFijo, activo: boolean): Promise<void> {
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, [
    ingreso.tipo,
    ingreso.monto,
    ingreso.notas,
    ingreso.recurrencia,
    ingreso.mes,
    activo ? "TRUE" : "FALSE",
    ingreso.fechaCreacion,
  ]);
}

export async function eliminarIngreso(spreadsheetId: string, ingreso: IngresoFijo): Promise<void> {
  await deleteRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row);
}

export interface IngresoCambios {
  tipo: string;
  monto: number;
  notas: string;
  recurrencia: Recurrencia;
}

export async function actualizarIngreso(
  spreadsheetId: string,
  ingreso: IngresoFijo,
  cambios: IngresoCambios,
): Promise<void> {
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, [
    cambios.tipo,
    cambios.monto,
    cambios.notas,
    cambios.recurrencia,
    cambios.recurrencia === "UnicoMes" ? ingreso.mes || monthKey() : "",
    ingreso.activo ? "TRUE" : "FALSE",
    ingreso.fechaCreacion,
  ]);
}

export function sumIngresosActivos(ingresos: IngresoFijo[]): number {
  return ingresos.filter((i) => i.activo).reduce((sum, i) => sum + i.monto, 0);
}

/** Solo los ingresos "Fijo" (recurrentes) activos, sin contar los de "solo este mes". */
export function sumIngresosFijosRecurrentes(ingresos: IngresoFijo[]): number {
  return ingresos
    .filter((i) => i.recurrencia === "Fijo" && i.activo)
    .reduce((sum, i) => sum + i.monto, 0);
}
