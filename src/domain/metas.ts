import { METAS_SHEET, MOVIMIENTOS_METAS_SHEET, TIPOS_METAS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { todayISO } from "./format";

export type EstadoMeta = "Activa" | "Cumplida" | "Pausada";
export type TipoMovimiento = "AporteManual" | "AporteAutomatico" | "Retiro";

export interface Meta {
  id: string;
  row: number;
  nombre: string;
  montoObjetivo: number;
  fechaLimite: string;
  tipo: string;
  estado: EstadoMeta;
  compraVinculadaId: string;
  fechaCreacion: string;
}

export interface MovimientoMeta {
  row: number;
  idMeta: string;
  fecha: string;
  tipo: TipoMovimiento;
  monto: number;
  nota: string;
}

function parseMeta(r: SheetRow): Meta {
  const [id = "", nombre = "", montoObjetivo = "0", fechaLimite = "", tipo = "", estado = "", compraVinculadaId = "", fechaCreacion = ""] =
    r.values;
  return {
    id,
    row: r.row,
    nombre,
    montoObjetivo: Number(montoObjetivo) || 0,
    fechaLimite,
    tipo,
    estado: estado === "Cumplida" || estado === "Pausada" ? estado : "Activa",
    compraVinculadaId,
    fechaCreacion,
  };
}

/** "AporteAutomatico" ya no se genera (se quitó el aporte automático), pero se sigue leyendo por si hay movimientos históricos con ese tipo. */
function parseMovimiento(r: SheetRow): MovimientoMeta {
  const [idMeta = "", fecha = "", tipo = "", monto = "0", nota = ""] = r.values;
  return {
    row: r.row,
    idMeta,
    fecha,
    tipo: tipo === "AporteAutomatico" || tipo === "Retiro" ? tipo : "AporteManual",
    monto: Number(monto) || 0,
    nota,
  };
}

export async function listMetas(spreadsheetId: string): Promise<Meta[]> {
  const rows = await listRecords(spreadsheetId, METAS_SHEET, 8);
  return rows.map(parseMeta);
}

export async function listTodosLosMovimientos(spreadsheetId: string): Promise<MovimientoMeta[]> {
  const rows = await listRecords(spreadsheetId, MOVIMIENTOS_METAS_SHEET, 5);
  return rows.map(parseMovimiento);
}

export function agruparMovimientosPorMeta(movimientos: MovimientoMeta[]): Map<string, MovimientoMeta[]> {
  const map = new Map<string, MovimientoMeta[]>();
  for (const m of movimientos) {
    const lista = map.get(m.idMeta) ?? [];
    lista.push(m);
    map.set(m.idMeta, lista);
  }
  return map;
}

/** Acumulado actual = aportes menos retiros. */
export function calcularAcumulado(movimientos: MovimientoMeta[]): number {
  return movimientos.reduce((s, m) => s + (m.tipo === "Retiro" ? -m.monto : m.monto), 0);
}

export function calcularProgresoPct(meta: Meta, movimientos: MovimientoMeta[]): number {
  if (meta.montoObjetivo <= 0) return 0;
  return Math.max(0, Math.min(100, (calcularAcumulado(movimientos) / meta.montoObjetivo) * 100));
}

export interface NuevaMeta {
  nombre: string;
  montoObjetivo: number;
  fechaLimite: string;
  tipo: string;
  compraVinculadaId: string;
}

export async function crearMeta(spreadsheetId: string, meta: NuevaMeta): Promise<Meta> {
  const id = crypto.randomUUID();
  const fechaCreacion = todayISO();
  const row = await appendRecord(spreadsheetId, METAS_SHEET, [
    id,
    meta.nombre,
    meta.montoObjetivo,
    meta.fechaLimite,
    meta.tipo,
    "Activa",
    meta.compraVinculadaId,
    fechaCreacion,
  ]);
  return { id, row, ...meta, estado: "Activa", fechaCreacion };
}

function serializeMeta(meta: Meta): unknown[] {
  return [
    meta.id,
    meta.nombre,
    meta.montoObjetivo,
    meta.fechaLimite,
    meta.tipo,
    meta.estado,
    meta.compraVinculadaId,
    meta.fechaCreacion,
  ];
}

export interface MetaCambios {
  nombre: string;
  montoObjetivo: number;
  fechaLimite: string;
  tipo: string;
}

export async function actualizarMeta(spreadsheetId: string, meta: Meta, cambios: MetaCambios): Promise<void> {
  await updateRecord(
    spreadsheetId,
    METAS_SHEET,
    meta.row,
    serializeMeta({ ...meta, ...cambios }),
  );
}

export async function setEstadoMeta(spreadsheetId: string, meta: Meta, estado: EstadoMeta): Promise<void> {
  await updateRecord(spreadsheetId, METAS_SHEET, meta.row, serializeMeta({ ...meta, estado }));
}

export async function eliminarMeta(spreadsheetId: string, meta: Meta): Promise<void> {
  await deleteRecord(spreadsheetId, METAS_SHEET, meta.row);
}

export async function registrarAporte(
  spreadsheetId: string,
  meta: Meta,
  fecha: string,
  monto: number,
  nota: string,
): Promise<void> {
  await appendRecord(spreadsheetId, MOVIMIENTOS_METAS_SHEET, [meta.id, fecha, "AporteManual", monto, nota]);
}

export async function registrarRetiro(
  spreadsheetId: string,
  meta: Meta,
  movimientosActuales: MovimientoMeta[],
  fecha: string,
  monto: number,
  motivo: string,
): Promise<void> {
  const acumulado = calcularAcumulado(movimientosActuales);
  if (monto > acumulado) {
    throw new Error(`No puedes retirar más de lo acumulado (${acumulado}).`);
  }
  await appendRecord(spreadsheetId, MOVIMIENTOS_METAS_SHEET, [meta.id, fecha, "Retiro", monto, motivo]);
}

/** Tipos de meta manejables por el usuario, misma mecánica que las categorías de gastos. */
export async function listTiposMeta(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, TIPOS_METAS_SHEET, 1);
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

export async function crearTipoMeta(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, TIPOS_METAS_SHEET, [nombre]);
}

/** Borra todas las filas con ese nombre (por si quedaron duplicadas). */
export async function eliminarTipoMeta(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_METAS_SHEET, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, TIPOS_METAS_SHEET, row);
  }
}
