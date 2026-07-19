import { INGRESOS_FIJOS_SHEET, TIPOS_INGRESO_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, listRecords, updateRecord, type SheetRow } from "../api/records";

export interface IngresoFijo {
  row: number;
  tipo: string;
  monto: number;
  notas: string;
  activo: boolean;
  fechaCreacion: string;
}

function parseIngresoFijo(r: SheetRow): IngresoFijo {
  const [tipo = "", monto = "0", notas = "", activo = "TRUE", fechaCreacion = ""] = r.values;
  return {
    row: r.row,
    tipo,
    monto: Number(monto) || 0,
    notas,
    activo: activo.toUpperCase() !== "FALSE",
    fechaCreacion,
  };
}

export async function listTiposIngreso(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  return rows.map((r) => r.values[0]).filter((nombre): nombre is string => Boolean(nombre));
}

export async function crearTipoIngreso(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, TIPOS_INGRESO_SHEET, [nombre]);
}

export async function listIngresosFijos(spreadsheetId: string): Promise<IngresoFijo[]> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 5);
  return rows.map(parseIngresoFijo);
}

export async function crearIngresoFijo(
  spreadsheetId: string,
  tipo: string,
  monto: number,
  notas: string,
): Promise<void> {
  await appendRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, [
    tipo,
    monto,
    notas,
    "TRUE",
    new Date().toISOString().slice(0, 10),
  ]);
}

/** Los ingresos fijos no tienen fecha de fin: quedan activos mes a mes hasta que se pausan. */
export async function setIngresoFijoActivo(
  spreadsheetId: string,
  ingreso: IngresoFijo,
  activo: boolean,
): Promise<void> {
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, [
    ingreso.tipo,
    ingreso.monto,
    ingreso.notas,
    activo ? "TRUE" : "FALSE",
    ingreso.fechaCreacion,
  ]);
}

export function sumIngresosFijosActivos(ingresos: IngresoFijo[]): number {
  return ingresos.filter((i) => i.activo).reduce((sum, i) => sum + i.monto, 0);
}
