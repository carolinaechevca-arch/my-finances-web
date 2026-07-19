import { ABONOS_DEUDAS_SHEET, CONTRAPARTES_SHEET, DEUDAS_SHEET, TIPOS_DEUDA_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { parseDateInput, todayISO } from "./format";

export type Direccion = "YoDebo" | "MeDeben";
export type PeriodicidadInteres = "Anual" | "Mensual";
export type EstadoDeuda = "Activa" | "Pagada";
export type TipoEventoAbono = "Abono" | "MontoAgregado";

export interface Deuda {
  id: string;
  row: number;
  direccion: Direccion;
  contraparte: string;
  tipo: string;
  montoOriginal: number;
  tasaInteres: number;
  periodicidadInteres: PeriodicidadInteres;
  pagoMinimo: number;
  diaPago: string;
  fechaInicio: string;
  notas: string;
  estado: EstadoDeuda;
}

export interface EventoAbono {
  row: number;
  idDeuda: string;
  fecha: string;
  tipo: TipoEventoAbono;
  monto: number;
  montoInteres: number;
  montoCapital: number;
  nota: string;
}

function parseDeuda(r: SheetRow): Deuda {
  const [
    id = "",
    direccion = "",
    contraparte = "",
    tipo = "",
    montoOriginal = "0",
    tasaInteres = "0",
    periodicidadInteres = "",
    pagoMinimo = "0",
    diaPago = "",
    fechaInicio = "",
    notas = "",
    estado = "",
  ] = r.values;
  return {
    id,
    row: r.row,
    direccion: direccion === "MeDeben" ? "MeDeben" : "YoDebo",
    contraparte,
    tipo,
    montoOriginal: Number(montoOriginal) || 0,
    tasaInteres: Number(tasaInteres) || 0,
    periodicidadInteres: periodicidadInteres === "Mensual" ? "Mensual" : "Anual",
    pagoMinimo: Number(pagoMinimo) || 0,
    diaPago,
    fechaInicio,
    notas,
    estado: estado === "Pagada" ? "Pagada" : "Activa",
  };
}

function parseEvento(r: SheetRow): EventoAbono {
  const [idDeuda = "", fecha = "", tipo = "", monto = "0", montoInteres = "0", montoCapital = "0", nota = ""] =
    r.values;
  return {
    row: r.row,
    idDeuda,
    fecha,
    tipo: tipo === "MontoAgregado" ? "MontoAgregado" : "Abono",
    monto: Number(monto) || 0,
    montoInteres: Number(montoInteres) || 0,
    montoCapital: Number(montoCapital) || 0,
    nota,
  };
}

export async function listDeudas(spreadsheetId: string, direccion: Direccion): Promise<Deuda[]> {
  const rows = await listRecords(spreadsheetId, DEUDAS_SHEET, 12);
  return rows.map(parseDeuda).filter((d) => d.direccion === direccion);
}

/** Todos los eventos de una vez, para calcular varias deudas sin hacer N llamadas a la hoja. */
export async function listTodosLosEventos(spreadsheetId: string): Promise<EventoAbono[]> {
  const rows = await listRecords(spreadsheetId, ABONOS_DEUDAS_SHEET, 7);
  return rows.map(parseEvento);
}

export function agruparEventosPorDeuda(eventos: EventoAbono[]): Map<string, EventoAbono[]> {
  const map = new Map<string, EventoAbono[]>();
  for (const e of eventos) {
    const lista = map.get(e.idDeuda) ?? [];
    lista.push(e);
    map.set(e.idDeuda, lista);
  }
  return map;
}

function tasaMensual(deuda: Deuda): number {
  const tasa = deuda.tasaInteres / 100;
  return deuda.periodicidadInteres === "Anual" ? tasa / 12 : tasa;
}

function mesesEntre(desde: string, hasta: string): number {
  const d1 = parseDateInput(desde);
  const d2 = parseDateInput(hasta);
  const dias = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, dias / 30);
}

export interface EstadoCalculado {
  saldoCapital: number;
  interesPendiente: number;
  totalHoy: number;
  totalAbonado: number;
  progresoPct: number;
}

/**
 * Recorre los eventos en orden cronológico acumulando interés mes a mes
 * sobre el capital pendiente (aproximación mensual: días/30, no interés
 * bancario diario exacto). Un abono paga primero el interés acumulado y el
 * resto reduce capital; un "monto agregado" (fusión de otra deuda) suma
 * directo al capital. Al final acumula el interés desde el último evento
 * hasta la fecha de corte.
 */
export function calcularEstadoDeuda(deuda: Deuda, eventos: EventoAbono[], hoy: string = todayISO()): EstadoCalculado {
  const ordenados = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tasa = tasaMensual(deuda);

  let capital = deuda.montoOriginal;
  let interesAcumulado = 0;
  let fechaUltimoEvento = deuda.fechaInicio;
  let totalAbonado = 0;

  for (const evento of ordenados) {
    const meses = tasa > 0 ? mesesEntre(fechaUltimoEvento, evento.fecha) : 0;
    interesAcumulado += capital * tasa * meses;
    fechaUltimoEvento = evento.fecha;

    if (evento.tipo === "MontoAgregado") {
      capital += evento.monto;
    } else {
      totalAbonado += evento.monto;
      const aInteres = Math.min(evento.monto, interesAcumulado);
      interesAcumulado -= aInteres;
      capital = Math.max(0, capital - (evento.monto - aInteres));
    }
  }

  const mesesFinales = tasa > 0 ? mesesEntre(fechaUltimoEvento, hoy) : 0;
  interesAcumulado += capital * tasa * mesesFinales;

  const totalHoy = capital + interesAcumulado;
  const totalConLoAbonado = totalAbonado + totalHoy;
  const progresoPct = totalConLoAbonado > 0 ? Math.min(100, (totalAbonado / totalConLoAbonado) * 100) : 0;

  return {
    saldoCapital: Math.max(0, capital),
    interesPendiente: Math.max(0, interesAcumulado),
    totalHoy: Math.max(0, totalHoy),
    totalAbonado,
    progresoPct,
  };
}

/** Cómo se dividiría un abono nuevo (interés vs capital) sin aplicarlo todavía, para guardar el desglose. */
export function previsualizarAbono(
  deuda: Deuda,
  eventos: EventoAbono[],
  fecha: string,
  monto: number,
): { montoInteres: number; montoCapital: number } {
  const estado = calcularEstadoDeuda(deuda, eventos, fecha);
  const aInteres = Math.min(monto, estado.interesPendiente);
  return { montoInteres: aInteres, montoCapital: monto - aInteres };
}

export interface EventoConSaldo {
  evento: EventoAbono;
  saldoCapitalDespues: number;
  interesPendienteDespues: number;
}

/** Historial cronológico con el saldo de capital/interés que queda después de cada evento (para auditar). */
export function historialConSaldos(deuda: Deuda, eventos: EventoAbono[]): EventoConSaldo[] {
  const ordenados = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const tasa = tasaMensual(deuda);
  let capital = deuda.montoOriginal;
  let interesAcumulado = 0;
  let fechaUltimoEvento = deuda.fechaInicio;
  const resultado: EventoConSaldo[] = [];

  for (const evento of ordenados) {
    const meses = tasa > 0 ? mesesEntre(fechaUltimoEvento, evento.fecha) : 0;
    interesAcumulado += capital * tasa * meses;
    fechaUltimoEvento = evento.fecha;

    if (evento.tipo === "MontoAgregado") {
      capital += evento.monto;
    } else {
      const aInteres = Math.min(evento.monto, interesAcumulado);
      interesAcumulado -= aInteres;
      capital = Math.max(0, capital - (evento.monto - aInteres));
    }
    resultado.push({ evento, saldoCapitalDespues: capital, interesPendienteDespues: interesAcumulado });
  }

  return resultado;
}

export interface NuevaDeuda {
  direccion: Direccion;
  contraparte: string;
  tipo: string;
  montoOriginal: number;
  tasaInteres: number;
  periodicidadInteres: PeriodicidadInteres;
  pagoMinimo: number;
  diaPago: string;
  fechaInicio: string;
  notas: string;
}

export async function crearDeuda(spreadsheetId: string, deuda: NuevaDeuda): Promise<Deuda> {
  const id = crypto.randomUUID();
  const row = await appendRecord(spreadsheetId, DEUDAS_SHEET, [
    id,
    deuda.direccion,
    deuda.contraparte,
    deuda.tipo,
    deuda.montoOriginal,
    deuda.tasaInteres,
    deuda.periodicidadInteres,
    deuda.pagoMinimo,
    deuda.diaPago,
    deuda.fechaInicio,
    deuda.notas,
    "Activa",
  ]);
  return { id, row, ...deuda, estado: "Activa" };
}

export async function actualizarDeuda(spreadsheetId: string, deuda: Deuda, cambios: NuevaDeuda): Promise<void> {
  await updateRecord(spreadsheetId, DEUDAS_SHEET, deuda.row, [
    deuda.id,
    cambios.direccion,
    cambios.contraparte,
    cambios.tipo,
    cambios.montoOriginal,
    cambios.tasaInteres,
    cambios.periodicidadInteres,
    cambios.pagoMinimo,
    cambios.diaPago,
    cambios.fechaInicio,
    cambios.notas,
    deuda.estado,
  ]);
}

export async function eliminarDeuda(spreadsheetId: string, deuda: Deuda): Promise<void> {
  await deleteRecord(spreadsheetId, DEUDAS_SHEET, deuda.row);
}

async function setEstadoDeuda(spreadsheetId: string, deuda: Deuda, estado: EstadoDeuda): Promise<void> {
  await updateRecord(spreadsheetId, DEUDAS_SHEET, deuda.row, [
    deuda.id,
    deuda.direccion,
    deuda.contraparte,
    deuda.tipo,
    deuda.montoOriginal,
    deuda.tasaInteres,
    deuda.periodicidadInteres,
    deuda.pagoMinimo,
    deuda.diaPago,
    deuda.fechaInicio,
    deuda.notas,
    estado,
  ]);
}

export async function marcarDeudaPagada(spreadsheetId: string, deuda: Deuda): Promise<void> {
  await setEstadoDeuda(spreadsheetId, deuda, "Pagada");
}

export async function reabrirDeuda(spreadsheetId: string, deuda: Deuda): Promise<void> {
  await setEstadoDeuda(spreadsheetId, deuda, "Activa");
}

/** Registra un abono calculando cuánto va a interés y cuánto a capital según el estado actual de la deuda. */
export async function registrarAbono(
  spreadsheetId: string,
  deuda: Deuda,
  eventosActuales: EventoAbono[],
  fecha: string,
  monto: number,
  nota: string,
): Promise<void> {
  const { montoInteres, montoCapital } = previsualizarAbono(deuda, eventosActuales, fecha, monto);
  await appendRecord(spreadsheetId, ABONOS_DEUDAS_SHEET, [
    deuda.id,
    fecha,
    "Abono",
    monto,
    montoInteres,
    montoCapital,
    nota,
  ]);
}

/** Fusiona un monto nuevo dentro de una deuda existente activa (flujo de "sumar a la deuda existente"). */
export async function agregarMontoADeuda(
  spreadsheetId: string,
  deuda: Deuda,
  fecha: string,
  monto: number,
  nota: string,
): Promise<void> {
  await appendRecord(spreadsheetId, ABONOS_DEUDAS_SHEET, [deuda.id, fecha, "MontoAgregado", monto, 0, monto, nota]);
}

export function buscarDeudaActivaPorContraparte(
  deudas: Deuda[],
  direccion: Direccion,
  contraparte: string,
): Deuda | undefined {
  const nombre = contraparte.trim().toLowerCase();
  return deudas.find(
    (d) => d.direccion === direccion && d.estado === "Activa" && d.contraparte.trim().toLowerCase() === nombre,
  );
}

export function listContrapartes(deudas: Deuda[]): string[] {
  const seen = new Set<string>();
  const nombres: string[] = [];
  for (const d of deudas) {
    if (!seen.has(d.contraparte)) {
      seen.add(d.contraparte);
      nombres.push(d.contraparte);
    }
  }
  return nombres;
}

export function sumTotalHoy(deudas: Deuda[], eventosPorDeuda: Map<string, EventoAbono[]>): number {
  return deudas
    .filter((d) => d.estado === "Activa")
    .reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).totalHoy, 0);
}

/** Estima en cuántos meses se termina de pagar, con el promedio de abonos o el pago mínimo si no hay historial. */
export function estimarMesesRestantes(deuda: Deuda, eventos: EventoAbono[]): number | null {
  const estado = calcularEstadoDeuda(deuda, eventos);
  if (estado.totalHoy <= 0) return 0;

  const abonos = eventos.filter((e) => e.tipo === "Abono");
  const promedioAbono =
    abonos.length > 0 ? abonos.reduce((s, e) => s + e.monto, 0) / abonos.length : deuda.pagoMinimo;
  if (!promedioAbono || promedioAbono <= 0) return null;

  const tasa = tasaMensual(deuda);
  let saldo = estado.totalHoy;
  let meses = 0;
  const LIMITE = 600;
  while (saldo > 0 && meses < LIMITE) {
    saldo += saldo * tasa;
    saldo -= promedioAbono;
    meses++;
  }
  return saldo > 0 ? null : meses;
}

/** "vencida" si ya pasó el día de pago sin abono este mes; "proxima" si faltan 5 días o menos. */
export function estadoAlerta(
  deuda: Deuda,
  eventos: EventoAbono[],
  hoy: Date = new Date(),
): "vencida" | "proxima" | null {
  const dia = Number(deuda.diaPago);
  if (!dia || deuda.estado !== "Activa") return null;

  const hoyDia = hoy.getDate();
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const pagadoEsteMes = eventos.some((e) => e.tipo === "Abono" && e.fecha.startsWith(mesActual));
  if (pagadoEsteMes) return null;

  if (hoyDia > dia) return "vencida";
  if (dia - hoyDia <= 5) return "proxima";
  return null;
}

async function listNombres(spreadsheetId: string, sheet: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, sheet, 1);
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

async function eliminarNombre(spreadsheetId: string, sheet: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, sheet, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, sheet, row);
  }
}

export const listTiposDeuda = (spreadsheetId: string): Promise<string[]> => listNombres(spreadsheetId, TIPOS_DEUDA_SHEET);
export const crearTipoDeuda = (spreadsheetId: string, nombre: string): Promise<void> =>
  appendRecord(spreadsheetId, TIPOS_DEUDA_SHEET, [nombre]).then(() => undefined);
export const eliminarTipoDeuda = (spreadsheetId: string, nombre: string): Promise<void> =>
  eliminarNombre(spreadsheetId, TIPOS_DEUDA_SHEET, nombre);

export const listContrapartesGuardadas = (spreadsheetId: string): Promise<string[]> =>
  listNombres(spreadsheetId, CONTRAPARTES_SHEET);
export const crearContraparte = (spreadsheetId: string, nombre: string): Promise<void> =>
  appendRecord(spreadsheetId, CONTRAPARTES_SHEET, [nombre]).then(() => undefined);
export const eliminarContraparte = (spreadsheetId: string, nombre: string): Promise<void> =>
  eliminarNombre(spreadsheetId, CONTRAPARTES_SHEET, nombre);
