import { appendRecord, listRecords, updateRecord } from "../api/records";
import { CONFIG_PERIODO_SHEET, HISTORIAL_PERIODOS_SHEET } from "../api/spreadsheet-bootstrap";
import { avanzarComprasRecurrentes } from "./compras-recurrentes";
import { formatMonthLabel, parseDateInput, todayISO } from "./format";
import { reaplicarGastosFijos } from "./gastos";
import { archivarIngresosAdicionalesAbiertos } from "./ingresos";

export type FrecuenciaPeriodo = "Semanal" | "Quincenal" | "Mensual" | "Manual";

export interface ConfigPeriodo {
  frecuencia: FrecuenciaPeriodo;
  /** "YYYY-MM-DD" del último reinicio (automático o manual). */
  fechaUltimoReinicio: string;
  /** Solo aplica en modo Semanal: 0=domingo..6=sábado. Elegible por el usuario en Configuración. */
  diaInicioSemana: number;
}

function esFrecuenciaPeriodo(value: string): value is FrecuenciaPeriodo {
  return value === "Semanal" || value === "Quincenal" || value === "Mensual" || value === "Manual";
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function diaAnterior(fechaIso: string): string {
  const d = parseDateInput(fechaIso);
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

/** Config global de periodo (única fila en ConfigPeriodo). Asume que ensureSpreadsheet ya sembró el valor por defecto. */
export async function obtenerConfigPeriodo(spreadsheetId: string): Promise<ConfigPeriodo> {
  const [row] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  const [frecuencia = "", fechaUltimoReinicio = "", diaInicioSemana = ""] = row?.values ?? [];
  return {
    frecuencia: esFrecuenciaPeriodo(frecuencia) ? frecuencia : "Mensual",
    fechaUltimoReinicio: fechaUltimoReinicio || todayISO(),
    diaInicioSemana: diaInicioSemana !== "" ? Number(diaInicioSemana) : 1,
  };
}

export async function guardarFrecuenciaPeriodo(spreadsheetId: string, frecuencia: FrecuenciaPeriodo): Promise<void> {
  const config = await obtenerConfigPeriodo(spreadsheetId);
  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, 2, [frecuencia, config.fechaUltimoReinicio, String(config.diaInicioSemana)]);
}

/** Día en que empieza la semana en modo Semanal (0=domingo..6=sábado) — elegible por el usuario. */
export async function guardarDiaInicioSemana(spreadsheetId: string, dia: number): Promise<void> {
  const config = await obtenerConfigPeriodo(spreadsheetId);
  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, 2, [config.frecuencia, config.fechaUltimoReinicio, String(dia)]);
}

/**
 * Corte más reciente (<= hoy) que le corresponde al modo automático; null en
 * modo Manual (no hay corte automático). Quincenal corta los días 1 y 16,
 * Mensual corta siempre el día 1, Semanal usa el día que el usuario eligió
 * como inicio de semana (`config.diaInicioSemana`).
 */
function corteMasReciente(config: ConfigPeriodo, hoy: Date): string | null {
  if (config.frecuencia === "Manual") return null;
  if (config.frecuencia === "Mensual") return isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  if (config.frecuencia === "Quincenal") {
    const dia = hoy.getDate() >= 16 ? 16 : 1;
    return isoDate(new Date(hoy.getFullYear(), hoy.getMonth(), dia));
  }
  const diaSemana = hoy.getDay(); // 0=domingo..6=sábado
  const offset = (diaSemana - config.diaInicioSemana + 7) % 7;
  const inicio = new Date(hoy);
  inicio.setDate(hoy.getDate() - offset);
  return isoDate(inicio);
}

/** Si ya toca reiniciar (modo automático que cruzó su próximo corte), la nueva fecha de reinicio; si no, null. */
export function debeReiniciar(config: ConfigPeriodo, hoy: Date = new Date()): string | null {
  const corte = corteMasReciente(config, hoy);
  if (!corte) return null;
  return corte > config.fechaUltimoReinicio ? corte : null;
}

/**
 * Efecto de reiniciar el periodo (automático o por el botón manual): archiva
 * los ingresos "Adicional" que seguían vigentes, reaplica Gastos Fijos,
 * avanza el contador de compras recurrentes, y mueve la fecha de reinicio.
 * También registra la fecha en HistorialPeriodos, para que Histórico pueda
 * navegar este periodo más adelante con su fecha real.
 */
export async function ejecutarReinicioPeriodo(spreadsheetId: string, nuevaFecha: string): Promise<void> {
  await archivarIngresosAdicionalesAbiertos(spreadsheetId);
  await reaplicarGastosFijos(spreadsheetId, nuevaFecha);
  await avanzarComprasRecurrentes(spreadsheetId);
  const config = await obtenerConfigPeriodo(spreadsheetId);
  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, 2, [config.frecuencia, nuevaFecha, String(config.diaInicioSemana)]);
  await appendRecord(spreadsheetId, HISTORIAL_PERIODOS_SHEET, [nuevaFecha]);
}

/** Revisa si toca reiniciar en modo automático y lo ejecuta. Se llama una sola vez al cargar la app. */
export async function ensurePeriodoActualizado(spreadsheetId: string): Promise<void> {
  const config = await obtenerConfigPeriodo(spreadsheetId);
  const nuevaFecha = debeReiniciar(config);
  if (nuevaFecha) await ejecutarReinicioPeriodo(spreadsheetId, nuevaFecha);
}

/** Insignia reutilizable ("Día N desde el último reinicio") que reemplaza la insignia de mes en toda la app. */
export function formatPeriodoBadge(config: ConfigPeriodo, hoy: Date = new Date()): string {
  const dias =
    Math.round((parseDateInput(isoDate(hoy)).getTime() - parseDateInput(config.fechaUltimoReinicio).getTime()) / 86400000) + 1;
  return `Día ${Math.max(1, dias)} desde el último reinicio`;
}

/** Fecha ("YYYY-MM-DD") de cada reinicio que realmente ocurrió, del más antiguo al más reciente — log real, no recalculado con fórmula. */
export async function listHistorialPeriodos(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, HISTORIAL_PERIODOS_SHEET, 1);
  return rows
    .map((r) => r.values[0])
    .filter((v): v is string => Boolean(v))
    .sort();
}

export interface PeriodoHistorico {
  /** "YYYY-MM-DD", inclusive. */
  inicio: string;
  /** "YYYY-MM-DD", inclusive; null si es el periodo actual, todavía en curso. */
  fin: string | null;
}

/**
 * Todos los periodos con datos, del más antiguo al actual (en curso, `fin:
 * null`), a partir del log real de reinicios (`listHistorialPeriodos`) — no
 * se recalculan con fórmula para no desalinearse si el modo de periodo
 * cambió con el tiempo. Si hay datos de antes del primer reinicio logueado
 * (de cuando la app todavía no tenía el sistema de periodo), se agrupan en
 * un único periodo "legado" al inicio.
 */
export function armarPeriodosDisponibles(historialPeriodos: string[], primeraFechaConDatos: string): PeriodoHistorico[] {
  const inicios = [...historialPeriodos].sort();
  if (inicios.length === 0) return [{ inicio: primeraFechaConDatos, fin: null }];

  const periodos: PeriodoHistorico[] = [];
  if (primeraFechaConDatos < inicios[0]) {
    periodos.push({ inicio: primeraFechaConDatos, fin: diaAnterior(inicios[0]) });
  }
  for (let i = 0; i < inicios.length; i++) {
    const fin = i + 1 < inicios.length ? diaAnterior(inicios[i + 1]) : null;
    periodos.push({ inicio: inicios[i], fin });
  }
  return periodos;
}

const diaMesFormatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
const diaMesAnioFormatter = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });

function formatDiaMes(d: Date): string {
  return diaMesFormatter.format(d).replace(".", "");
}

function formatDiaMesAnio(d: Date): string {
  return diaMesAnioFormatter.format(d).replace(".", "");
}

/**
 * Etiqueta legible de un periodo histórico, a partir de sus fechas reales
 * (no del modo configurado — así no importa si el modo cambió entre
 * periodos). Colapsa a solo el nombre del mes cuando el periodo coincide
 * exactamente con un mes calendario completo (el caso normal en modo
 * Mensual); si no, muestra el rango de fechas real.
 */
export function formatPeriodoLabel(periodo: PeriodoHistorico): string {
  const inicio = parseDateInput(periodo.inicio);
  if (periodo.fin === null) {
    return `Desde el ${formatDiaMesAnio(inicio)} (actual)`;
  }
  const fin = parseDateInput(periodo.fin);
  const ultimoDiaMes = new Date(inicio.getFullYear(), inicio.getMonth() + 1, 0).getDate();
  const esMesCompleto =
    inicio.getDate() === 1 &&
    fin.getDate() === ultimoDiaMes &&
    fin.getMonth() === inicio.getMonth() &&
    fin.getFullYear() === inicio.getFullYear();
  if (esMesCompleto) return formatMonthLabel(inicio);

  const mismoAnio = inicio.getFullYear() === fin.getFullYear();
  return mismoAnio ? `${formatDiaMes(inicio)} - ${formatDiaMesAnio(fin)}` : `${formatDiaMesAnio(inicio)} - ${formatDiaMesAnio(fin)}`;
}

/** Versión corta de la etiqueta (solo día + mes de inicio), para el eje X de los gráficos donde no cabe el rango completo. */
export function formatPeriodoLabelCorto(periodo: PeriodoHistorico): string {
  return formatDiaMes(parseDateInput(periodo.inicio));
}
