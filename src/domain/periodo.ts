import { appendRecord, listRecords, updateRecord } from "../api/records";
import { CONFIG_PERIODO_SHEET, HISTORIAL_PERIODOS_SHEET } from "../api/spreadsheet-bootstrap";
import { formatMonthLabel, parseDateInput, todayISO } from "./format";
import { reaplicarGastosFijos } from "./gastos";
import { crearIngreso, eliminarPagosUnicosDelPeriodo } from "./ingresos";

export type FrecuenciaPeriodo = "Manual";

export interface ConfigPeriodo {
  frecuencia: FrecuenciaPeriodo;
  /** "YYYY-MM-DD" del último reinicio manual. */
  fechaUltimoReinicio: string;
  /** Columna legada conservada para mantener compatible la hoja existente. */
  diaInicioSemana: number;
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
  const [, fechaUltimoReinicio = "", diaInicioSemana = ""] = row?.values ?? [];
  return {
    frecuencia: "Manual",
    fechaUltimoReinicio: fechaUltimoReinicio || todayISO(),
    diaInicioSemana: diaInicioSemana !== "" ? Number(diaInicioSemana) : 1,
  };
}

/**
 * Efecto del reinicio manual: borra las fuentes de pago único del periodo
 * que termina (sus movimientos permanecen en el historial), reaplica Gastos
 * Fijos, mueve la fecha de reinicio y registra como pago único el sobrante
 * real confirmado por el usuario. Un sobrante de cero no genera movimiento
 * y los valores negativos se rechazan.
 *
 * Orden importante: mover la fecha de reinicio va primero, antes de borrar
 * pagos únicos y reaplicar Gastos Fijos (que pueden ser muchas escrituras
 * seguidas). Así, si
 * la API de Sheets corta a mitad de camino (límite de peticiones por
 * minuto), el periodo ya quedó movido correctamente y no se queda contando
 * "este periodo" desde una fecha vieja — lo que sí puede quedar a medias son
 * los efectos secundarios, visibles y corregibles a mano si hace falta.
 */
export async function ejecutarReinicioPeriodo(
  spreadsheetId: string,
  nuevaFecha: string,
  sobranteReal: number,
): Promise<void> {
  if (!Number.isFinite(sobranteReal) || sobranteReal < 0) {
    throw new Error("El sobrante real debe ser un valor igual o mayor que cero.");
  }
  const config = await obtenerConfigPeriodo(spreadsheetId);

  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, 2, [config.frecuencia, nuevaFecha, String(config.diaInicioSemana)]);
  await appendRecord(spreadsheetId, HISTORIAL_PERIODOS_SHEET, [nuevaFecha]);
  await eliminarPagosUnicosDelPeriodo(spreadsheetId);

  if (sobranteReal > 0) {
    await crearIngreso(
      spreadsheetId,
      "Sobrante anterior",
      sobranteReal,
      "Monto real confirmado al cerrar el periodo anterior.",
      "UnicoMes",
      "PagoUnico",
      "",
      "Lo que sobró del periodo anterior",
      nuevaFecha,
    );
  }

  await reaplicarGastosFijos(spreadsheetId, nuevaFecha);
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
