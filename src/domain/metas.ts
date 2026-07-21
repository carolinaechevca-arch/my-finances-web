import { METAS_SHEET, MOVIMIENTOS_METAS_SHEET, TIPOS_METAS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { parseDateInput, todayISO } from "./format";

export type EstadoMeta = "Activa" | "Cumplida" | "Pausada";
export type FrecuenciaAporte = "Mensual" | "Quincenal" | "Semanal";
export type TipoMovimiento = "AporteManual" | "AporteAutomatico" | "Retiro";

export interface Meta {
  id: string;
  row: number;
  nombre: string;
  montoObjetivo: number;
  fechaLimite: string;
  tipo: string;
  estado: EstadoMeta;
  aporteAutoActivo: boolean;
  aporteAutoMonto: number;
  aporteAutoFrecuencia: FrecuenciaAporte;
  aporteAutoUltimaFecha: string;
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
  const [
    id = "",
    nombre = "",
    montoObjetivo = "0",
    fechaLimite = "",
    tipo = "",
    estado = "",
    aporteAutoActivo = "",
    aporteAutoMonto = "0",
    aporteAutoFrecuencia = "",
    aporteAutoUltimaFecha = "",
    compraVinculadaId = "",
    fechaCreacion = "",
  ] = r.values;
  return {
    id,
    row: r.row,
    nombre,
    montoObjetivo: Number(montoObjetivo) || 0,
    fechaLimite,
    tipo,
    estado: estado === "Cumplida" || estado === "Pausada" ? estado : "Activa",
    aporteAutoActivo: aporteAutoActivo.toUpperCase() === "TRUE",
    aporteAutoMonto: Number(aporteAutoMonto) || 0,
    aporteAutoFrecuencia:
      aporteAutoFrecuencia === "Quincenal" || aporteAutoFrecuencia === "Semanal" ? aporteAutoFrecuencia : "Mensual",
    aporteAutoUltimaFecha,
    compraVinculadaId,
    fechaCreacion,
  };
}

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
  const rows = await listRecords(spreadsheetId, METAS_SHEET, 12);
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

/** Acumulado actual = aportes (manuales + automáticos) menos retiros. */
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
  aporteAutoActivo: boolean;
  aporteAutoMonto: number;
  aporteAutoFrecuencia: FrecuenciaAporte;
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
    meta.aporteAutoActivo ? "TRUE" : "FALSE",
    meta.aporteAutoMonto,
    meta.aporteAutoFrecuencia,
    "",
    meta.compraVinculadaId,
    fechaCreacion,
  ]);
  return { id, row, ...meta, estado: "Activa", aporteAutoUltimaFecha: "", fechaCreacion };
}

function serializeMeta(meta: Meta): unknown[] {
  return [
    meta.id,
    meta.nombre,
    meta.montoObjetivo,
    meta.fechaLimite,
    meta.tipo,
    meta.estado,
    meta.aporteAutoActivo ? "TRUE" : "FALSE",
    meta.aporteAutoMonto,
    meta.aporteAutoFrecuencia,
    meta.aporteAutoUltimaFecha,
    meta.compraVinculadaId,
    meta.fechaCreacion,
  ];
}

export interface MetaCambios {
  nombre: string;
  montoObjetivo: number;
  fechaLimite: string;
  tipo: string;
  aporteAutoActivo: boolean;
  aporteAutoMonto: number;
  aporteAutoFrecuencia: FrecuenciaAporte;
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
  tipo: "AporteManual" | "AporteAutomatico" = "AporteManual",
): Promise<void> {
  await appendRecord(spreadsheetId, MOVIMIENTOS_METAS_SHEET, [meta.id, fecha, tipo, monto, nota]);
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

function siguienteFecha(fecha: Date, frecuencia: FrecuenciaAporte): Date {
  const next = new Date(fecha);
  if (frecuencia === "Mensual") next.setMonth(next.getMonth() + 1);
  else if (frecuencia === "Quincenal") next.setDate(next.getDate() + 15);
  else next.setDate(next.getDate() + 7);
  return next;
}

function fechaFmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Como la app no tiene backend, un "aporte automático" no puede dispararse
 * solo en la fecha exacta: se pone al día cada vez que el usuario entra a
 * Ahorros y Metas, registrando de una vez los aportes retroactivos que
 * faltaban desde el último (cada uno con la fecha que le correspondía).
 * Devuelve true si registró algo nuevo (para recargar la lista).
 */
export async function procesarAportesAutomaticos(spreadsheetId: string, metas: Meta[]): Promise<boolean> {
  const hoy = new Date();
  let huboCambios = false;

  for (const meta of metas) {
    if (!meta.aporteAutoActivo || meta.estado !== "Activa" || meta.aporteAutoMonto <= 0) continue;

    const base = meta.aporteAutoUltimaFecha || meta.fechaCreacion;
    if (!base) continue;

    let cursor = parseDateInput(base);
    let ultimaFecha = base;
    let iteraciones = 0;

    while (iteraciones < 60) {
      const siguiente = siguienteFecha(cursor, meta.aporteAutoFrecuencia);
      if (siguiente > hoy) break;
      const fechaStr = fechaFmt(siguiente);
      await appendRecord(spreadsheetId, MOVIMIENTOS_METAS_SHEET, [
        meta.id,
        fechaStr,
        "AporteAutomatico",
        meta.aporteAutoMonto,
        "Aporte automático",
      ]);
      cursor = siguiente;
      ultimaFecha = fechaStr;
      huboCambios = true;
      iteraciones++;
    }

    if (ultimaFecha !== meta.aporteAutoUltimaFecha) {
      await updateRecord(
        spreadsheetId,
        METAS_SHEET,
        meta.row,
        serializeMeta({ ...meta, aporteAutoUltimaFecha: ultimaFecha }),
      );
    }
  }

  return huboCambios;
}

/** Proyección simple y lineal con el aporte automático configurado (sin rendimiento). */
export function proyeccionConAporte(
  acumuladoActual: number,
  aporteMonto: number,
  frecuencia: FrecuenciaAporte,
  meses: number,
): number {
  const aportesPorMes = frecuencia === "Mensual" ? 1 : frecuencia === "Quincenal" ? 2 : 4.33;
  const aporteMensualEquivalente = aporteMonto * aportesPorMes;
  return acumuladoActual + aporteMensualEquivalente * meses;
}

/** Meses entre hoy y una fecha límite (redondeado hacia arriba, mínimo 1). */
export function mesesHasta(fechaLimite: string): number {
  if (!fechaLimite) return 12;
  const hoy = new Date();
  const limite = parseDateInput(fechaLimite);
  const dias = (limite.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(1, Math.round(dias / 30));
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
