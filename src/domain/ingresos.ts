import {
  HISTORIAL_INGRESOS_FIJOS_SHEET,
  INGRESOS_FIJOS_SHEET,
  TIPOS_INGRESO_SHEET,
} from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey, todayISO } from "./format";

export type Recurrencia = "Fijo" | "UnicoMes";

export interface IngresoFijo {
  id: string;
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
  const [
    tipo = "",
    monto = "0",
    notas = "",
    recurrencia = "Fijo",
    mes = "",
    activo = "TRUE",
    fechaCreacion = "",
    id = "",
  ] = r.values;
  return {
    id,
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

/**
 * Cambio de monto o de estado activo/inactivo de un ingreso "Fijo",
 * registrado para poder reconstruir cuánto aplicaba en un mes pasado (ver
 * domain/historico.ts). Los ingresos "UnicoMes" no lo necesitan: ya están
 * atados a un mes específico.
 */
export interface CambioIngreso {
  row: number;
  idIngreso: string;
  fecha: string;
  montoAnterior: number;
  montoNuevo: number;
  activoAnterior: boolean;
  activoNuevo: boolean;
}

function parseCambioIngreso(r: SheetRow): CambioIngreso {
  const [idIngreso = "", fecha = "", montoAnterior = "0", montoNuevo = "0", activoAnterior = "", activoNuevo = ""] =
    r.values;
  return {
    row: r.row,
    idIngreso,
    fecha,
    montoAnterior: Number(montoAnterior) || 0,
    montoNuevo: Number(montoNuevo) || 0,
    activoAnterior: activoAnterior.toUpperCase() !== "FALSE",
    activoNuevo: activoNuevo.toUpperCase() !== "FALSE",
  };
}

export async function listHistorialIngresos(spreadsheetId: string): Promise<CambioIngreso[]> {
  const rows = await listRecords(spreadsheetId, HISTORIAL_INGRESOS_FIJOS_SHEET, 6);
  return rows.map(parseCambioIngreso);
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
  const todos = await listTodosLosIngresos(spreadsheetId);
  const mes = monthKey(date);
  return todos.filter((i) => i.recurrencia === "Fijo" || i.mes === mes);
}

/** Todos los ingresos registrados alguna vez, sin filtrar por mes vigente — para reconstrucción histórica. */
export async function listTodosLosIngresos(spreadsheetId: string): Promise<IngresoFijo[]> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 8);
  return rows.map(parseIngreso);
}

/**
 * Reconstruye el monto y el estado activo/inactivo de un ingreso "Fijo" tal
 * como aplicaban en una fecha pasada, a partir de su historial de cambios.
 * Si nunca se registró un cambio, se asume que el valor actual siempre
 * aplicó (es la mejor aproximación posible sin historial previo a esta
 * función).
 */
export function estadoIngresoEnFecha(
  ingreso: IngresoFijo,
  cambios: CambioIngreso[],
  fecha: string,
): { monto: number; activo: boolean } {
  const propios = cambios.filter((c) => c.idIngreso === ingreso.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (propios.length === 0) return { monto: ingreso.monto, activo: ingreso.activo };

  const aplicable = [...propios].reverse().find((c) => c.fecha <= fecha);
  if (aplicable) return { monto: aplicable.montoNuevo, activo: aplicable.activoNuevo };

  const primero = propios[0];
  return { monto: primero.montoAnterior, activo: primero.activoAnterior };
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
    crypto.randomUUID(),
  ]);
}

export async function setIngresoActivo(spreadsheetId: string, ingreso: IngresoFijo, activo: boolean): Promise<void> {
  if (ingreso.recurrencia === "Fijo" && activo !== ingreso.activo) {
    await registrarCambioIngreso(spreadsheetId, ingreso, ingreso.monto, activo);
  }
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, [
    ingreso.tipo,
    ingreso.monto,
    ingreso.notas,
    ingreso.recurrencia,
    ingreso.mes,
    activo ? "TRUE" : "FALSE",
    ingreso.fechaCreacion,
    ingreso.id,
  ]);
}

/** Registra en HistorialIngresosFijos un cambio de monto y/o de estado activo, para reconstruir meses pasados. */
async function registrarCambioIngreso(
  spreadsheetId: string,
  ingreso: IngresoFijo,
  montoNuevo: number,
  activoNuevo: boolean,
): Promise<void> {
  await appendRecord(spreadsheetId, HISTORIAL_INGRESOS_FIJOS_SHEET, [
    ingreso.id,
    todayISO(),
    ingreso.monto,
    montoNuevo,
    ingreso.activo ? "TRUE" : "FALSE",
    activoNuevo ? "TRUE" : "FALSE",
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
  if (ingreso.recurrencia === "Fijo" && cambios.recurrencia === "Fijo" && cambios.monto !== ingreso.monto) {
    await registrarCambioIngreso(spreadsheetId, ingreso, cambios.monto, ingreso.activo);
  }
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, [
    cambios.tipo,
    cambios.monto,
    cambios.notas,
    cambios.recurrencia,
    cambios.recurrencia === "UnicoMes" ? ingreso.mes || monthKey() : "",
    ingreso.activo ? "TRUE" : "FALSE",
    ingreso.fechaCreacion,
    ingreso.id,
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
