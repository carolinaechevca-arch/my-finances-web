import { ABONOS_DEUDAS_SHEET, CONTRAPARTES_SHEET, DEUDAS_SHEET, TIPOS_DEUDA_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";

export type Direccion = "YoDebo" | "MeDeben";
export type EstadoDeuda = "Activa" | "Pagada";
export type TipoEventoAbono = "Abono" | "MontoAgregado";

export interface Deuda {
  id: string;
  row: number;
  direccion: Direccion;
  contraparte: string;
  tipo: string;
  /** Lo que te prestaron o el valor de compra antes de intereses. */
  montoOriginal: number;
  montoCuota: number;
  numCuotas: number;
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
  nota: string;
}

function parseDeuda(r: SheetRow): Deuda {
  const [
    id = "",
    direccion = "",
    contraparte = "",
    tipo = "",
    montoOriginal = "0",
    montoCuota = "0",
    numCuotas = "0",
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
    montoCuota: Number(montoCuota) || 0,
    numCuotas: Number(numCuotas) || 0,
    diaPago,
    fechaInicio,
    notas,
    estado: estado === "Pagada" ? "Pagada" : "Activa",
  };
}

function parseEvento(r: SheetRow): EventoAbono {
  const [idDeuda = "", fecha = "", tipo = "", monto = "0", nota = ""] = r.values;
  return {
    row: r.row,
    idDeuda,
    fecha,
    tipo: tipo === "MontoAgregado" ? "MontoAgregado" : "Abono",
    monto: Number(monto) || 0,
    nota,
  };
}

export async function listDeudas(spreadsheetId: string, direccion: Direccion): Promise<Deuda[]> {
  const rows = await listRecords(spreadsheetId, DEUDAS_SHEET, 11);
  return rows.map(parseDeuda).filter((d) => d.direccion === direccion);
}

/** Todos los eventos de una vez, para calcular varias deudas sin hacer N llamadas a la hoja. */
export async function listTodosLosEventos(spreadsheetId: string): Promise<EventoAbono[]> {
  const rows = await listRecords(spreadsheetId, ABONOS_DEUDAS_SHEET, 5);
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

export interface EstadoCalculado {
  /** número de cuotas × valor de la cuota, más cualquier monto fusionado de otra deuda. */
  totalAPagar: number;
  /** totalAPagar - montoOriginal, nunca negativo (0 si es un préstamo sin interés). */
  interesTotal: number;
  saldoPendiente: number;
  totalAbonado: number;
  /** Redondeado hacia abajo: cuántas cuotas completas cubre lo ya abonado. */
  cuotasPagadas: number;
  /** Redondeado hacia arriba: cuántas cuotas del tamaño actual harían falta para cubrir el saldo. */
  cuotasRestantes: number;
  progresoPct: number;
}

/**
 * Sin interés explícito: el "total a pagar" es número de cuotas × valor de
 * la cuota (más cualquier "monto agregado" por fusión). Cuotas pagadas y
 * restantes se derivan solo del monto abonado — si un abono es mayor o
 * menor que la cuota, el saldo (y por lo tanto las cuotas) se ajusta solo,
 * sin necesitar un contador manual aparte.
 */
export function calcularEstadoDeuda(deuda: Deuda, eventos: EventoAbono[]): EstadoCalculado {
  let totalAPagar = deuda.montoCuota * deuda.numCuotas;
  let totalAbonado = 0;

  for (const evento of eventos) {
    if (evento.tipo === "MontoAgregado") {
      totalAPagar += evento.monto;
    } else {
      totalAbonado += evento.monto;
    }
  }

  const saldoPendiente = Math.max(0, totalAPagar - totalAbonado);
  const cuotasPagadas = deuda.montoCuota > 0 ? Math.floor(totalAbonado / deuda.montoCuota) : 0;
  const cuotasRestantes = deuda.montoCuota > 0 ? Math.ceil(saldoPendiente / deuda.montoCuota) : 0;
  const interesTotal = Math.max(0, totalAPagar - deuda.montoOriginal);
  const progresoPct = totalAPagar > 0 ? Math.min(100, (totalAbonado / totalAPagar) * 100) : 0;

  return { totalAPagar, interesTotal, saldoPendiente, totalAbonado, cuotasPagadas, cuotasRestantes, progresoPct };
}

export interface EventoConSaldo {
  evento: EventoAbono;
  saldoPendienteDespues: number;
  /** Ej. "Cuota 3 de 12", "Cuotas 3-4 de 12", "Abono parcial — cuota 3 de 12", o "Monto agregado". */
  cuotaLabel: string;
}

/** Historial cronológico con el saldo y la(s) cuota(s) que cubrió cada evento (para auditar). */
export function historialConSaldos(deuda: Deuda, eventos: EventoAbono[]): EventoConSaldo[] {
  const ordenados = [...eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let totalAPagar = deuda.montoCuota * deuda.numCuotas;
  let totalAbonado = 0;
  const resultado: EventoConSaldo[] = [];

  for (const evento of ordenados) {
    if (evento.tipo === "MontoAgregado") {
      totalAPagar += evento.monto;
      resultado.push({
        evento,
        saldoPendienteDespues: Math.max(0, totalAPagar - totalAbonado),
        cuotaLabel: "Monto agregado",
      });
      continue;
    }

    const cuotasAntes = deuda.montoCuota > 0 ? Math.floor(totalAbonado / deuda.montoCuota) : 0;
    totalAbonado += evento.monto;
    const cuotasDespues = deuda.montoCuota > 0 ? Math.floor(totalAbonado / deuda.montoCuota) : 0;

    let cuotaLabel: string;
    if (deuda.montoCuota <= 0) {
      cuotaLabel = "Abono";
    } else if (cuotasDespues === cuotasAntes) {
      cuotaLabel = `Abono parcial — cuota ${cuotasAntes + 1} de ${deuda.numCuotas}`;
    } else if (cuotasDespues === cuotasAntes + 1) {
      cuotaLabel = `Cuota ${cuotasDespues} de ${deuda.numCuotas}`;
    } else {
      cuotaLabel = `Cuotas ${cuotasAntes + 1}-${cuotasDespues} de ${deuda.numCuotas}`;
    }

    resultado.push({ evento, saldoPendienteDespues: Math.max(0, totalAPagar - totalAbonado), cuotaLabel });
  }

  return resultado;
}

export interface NuevaDeuda {
  direccion: Direccion;
  contraparte: string;
  tipo: string;
  montoOriginal: number;
  montoCuota: number;
  numCuotas: number;
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
    deuda.montoCuota,
    deuda.numCuotas,
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
    cambios.montoCuota,
    cambios.numCuotas,
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
    deuda.montoCuota,
    deuda.numCuotas,
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

/** Registra un abono (o un pago distinto a la cuota, de más o de menos): se resta directo del saldo. */
export async function registrarAbono(
  spreadsheetId: string,
  deuda: Deuda,
  fecha: string,
  monto: number,
  nota: string,
): Promise<void> {
  await appendRecord(spreadsheetId, ABONOS_DEUDAS_SHEET, [deuda.id, fecha, "Abono", monto, nota]);
}

/** Fusiona un monto nuevo dentro de una deuda existente activa (flujo de "sumar a la deuda existente"). */
export async function agregarMontoADeuda(
  spreadsheetId: string,
  deuda: Deuda,
  fecha: string,
  monto: number,
  nota: string,
): Promise<void> {
  await appendRecord(spreadsheetId, ABONOS_DEUDAS_SHEET, [deuda.id, fecha, "MontoAgregado", monto, nota]);
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

export function sumSaldoPendiente(deudas: Deuda[], eventosPorDeuda: Map<string, EventoAbono[]>): number {
  return deudas
    .filter((d) => d.estado === "Activa")
    .reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).saldoPendiente, 0);
}

/** Suma la cuota mensual de las deudas activas que todavía tienen saldo pendiente — para descontar de "disponible este mes". */
export function sumCuotasMensualesActivas(deudas: Deuda[], eventosPorDeuda: Map<string, EventoAbono[]>): number {
  return deudas
    .filter((d) => d.estado === "Activa" && calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).saldoPendiente > 0)
    .reduce((s, d) => s + d.montoCuota, 0);
}

/** Meses restantes asumiendo una cuota por mes (la cadencia normal de tarjetas/préstamos por cuotas). */
export function estimarMesesRestantes(deuda: Deuda, eventos: EventoAbono[]): number | null {
  if (deuda.montoCuota <= 0) return null;
  return calcularEstadoDeuda(deuda, eventos).cuotasRestantes;
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
