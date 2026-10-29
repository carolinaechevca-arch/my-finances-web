import {
  HISTORIAL_INGRESOS_FIJOS_SHEET,
  INGRESOS_FIJOS_SHEET,
  MOVIMIENTOS_INGRESOS_SHEET,
  TIPOS_INGRESO_SHEET,
} from "../api/spreadsheet-bootstrap";
import { appendRecord, clearRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey, parseDateInput, todayISO } from "./format";

export type Recurrencia = "Fijo" | "UnicoMes";
export type FrecuenciaIngreso = "Mensual" | "Quincenal" | "Semanal" | "PagoUnico";
export type EstadoMovimientoIngreso = "Recibido" | "Omitido";
export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;

export interface IngresoFijo {
  id: string;
  row: number;
  nombre: string;
  tipo: string;
  monto: number;
  notas: string;
  recurrencia: Recurrencia;
  mes: string;
  activo: boolean;
  fechaCreacion: string;
  frecuencia: FrecuenciaIngreso;
  diaPago: string;
  cerrado: boolean;
  proximaFecha: string;
  cuentaDestino: string;
  modeloNuevo: boolean;
}

export interface MovimientoIngreso {
  id: string;
  row: number;
  fuenteId: string;
  fuenteNombre: string;
  tipo: string;
  fechaEsperada: string;
  fechaRecibida: string;
  montoEstimado: number;
  montoReal: number;
  estado: EstadoMovimientoIngreso;
  notas: string;
  /** Fecha de inicio del periodo en el que se confirmó u omitió el movimiento. */
  periodoId: string;
}

function esFrecuencia(value: string): value is FrecuenciaIngreso {
  return ["Mensual", "Quincenal", "Semanal", "PagoUnico"].includes(value);
}

function parseIngreso(r: SheetRow): IngresoFijo {
  const [tipo = "", monto = "0", notas = "", recurrencia = "Fijo", mes = "", activo = "TRUE", fechaCreacion = "", id = "", frecuencia = "", diaPago = "", cerrado = "", proximaFecha = "", cuentaDestino = "", modelo = "", nombre = ""] = r.values;
  const frecuenciaNormalizada: FrecuenciaIngreso = recurrencia === "UnicoMes"
    ? "PagoUnico"
    : esFrecuencia(frecuencia) ? frecuencia : "Mensual";
  return {
    id,
    row: r.row,
    nombre: nombre || tipo,
    tipo,
    monto: Number(monto) || 0,
    notas,
    recurrencia: recurrencia === "UnicoMes" ? "UnicoMes" : "Fijo",
    mes,
    activo: activo.toUpperCase() !== "FALSE",
    fechaCreacion,
    frecuencia: frecuenciaNormalizada,
    diaPago: frecuenciaNormalizada === "Quincenal" ? diasQuincena(diaPago).join(",") : diaPago,
    cerrado: cerrado.toUpperCase() === "TRUE",
    proximaFecha,
    cuentaDestino,
    modeloNuevo: modelo === "Fuente",
  };
}

function serializeIngreso(i: IngresoFijo): unknown[] {
  const diaPago = i.frecuencia === "Quincenal"
    ? diasQuincena(i.diaPago).map((dia) => `D${dia}`).join("-")
    : i.diaPago;
  return [
    i.tipo, i.monto, i.notas, i.frecuencia === "PagoUnico" ? "UnicoMes" : "Fijo",
    i.frecuencia === "PagoUnico" ? i.mes || monthKey() : "", i.activo ? "TRUE" : "FALSE",
    i.fechaCreacion, i.id, i.frecuencia, diaPago, i.cerrado ? "TRUE" : "FALSE",
    i.proximaFecha, i.cuentaDestino, i.modeloNuevo ? "Fuente" : "", i.nombre,
  ];
}

function parseMovimiento(r: SheetRow): MovimientoIngreso {
  const [id = "", fuenteId = "", fuenteNombre = "", tipo = "", fechaEsperada = "", fechaRecibida = "", montoEstimado = "0", montoReal = "0", estado = "Recibido", notas = "", periodoId = ""] = r.values;
  return {
    id, row: r.row, fuenteId, fuenteNombre, tipo, fechaEsperada, fechaRecibida,
    montoEstimado: Number(montoEstimado) || 0,
    montoReal: Number(montoReal) || 0,
    estado: estado === "Omitido" ? "Omitido" : "Recibido",
    notas, periodoId,
  };
}

export async function listMovimientosIngresos(spreadsheetId: string): Promise<MovimientoIngreso[]> {
  return (await listRecords(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, 11)).map(parseMovimiento);
}

export function movimientosRecibidosEnRango(movimientos: MovimientoIngreso[], inicio: string, fin = todayISO()): MovimientoIngreso[] {
  return movimientos.filter((m) =>
    m.estado === "Recibido" &&
    (m.periodoId ? m.periodoId === inicio : m.fechaRecibida >= inicio && m.fechaRecibida <= fin),
  );
}

export function sumMovimientosRecibidos(movimientos: MovimientoIngreso[], inicio: string, fin = todayISO()): number {
  return movimientosRecibidosEnRango(movimientos, inicio, fin).reduce((s, m) => s + m.montoReal, 0);
}

export async function listTiposIngreso(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  return [...new Set(rows.map((r) => r.values[0]).filter(Boolean))];
}

export async function crearTipoIngreso(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, TIPOS_INGRESO_SHEET, [nombre]);
}

export async function eliminarTipoIngreso(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  const matching = rows.filter((r) => r.values[0] === nombre).map((r) => r.row).sort((a, b) => b - a);
  for (const row of matching) await deleteRecord(spreadsheetId, TIPOS_INGRESO_SHEET, row);
}

export async function listIngresosVigentes(spreadsheetId: string): Promise<IngresoFijo[]> {
  return (await listTodosLosIngresos(spreadsheetId)).filter((i) => i.frecuencia !== "PagoUnico" || !i.cerrado);
}

export async function listTodosLosIngresos(spreadsheetId: string): Promise<IngresoFijo[]> {
  return (await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 15)).map(parseIngreso);
}

export interface NuevaFuenteIngreso {
  nombre: string;
  tipo: string;
  montoEstimado: number;
  modalidad: FrecuenciaIngreso;
  proximaFecha: string;
  diasQuincena?: string;
  cuentaDestino?: string;
  notas?: string;
}

export async function crearFuenteIngreso(spreadsheetId: string, input: NuevaFuenteIngreso): Promise<void> {
  const diasQuincena = input.diasQuincena || "15,30";
  const fechaEsperada = input.modalidad === "Quincenal"
    ? proximaFechaQuincenalDesde(diasQuincena)
    : input.proximaFecha || todayISO();
  const fecha = parseDateInput(fechaEsperada);
  const diaPago = input.modalidad === "Quincenal"
    ? diasQuincena
    : input.modalidad === "Mensual"
      ? String(fecha.getDate())
      : input.modalidad === "Semanal"
        ? DIAS_SEMANA[fecha.getDay()]
        : "";
  const fuente: IngresoFijo = {
    id: crypto.randomUUID(), row: 0, nombre: input.nombre, tipo: input.tipo, monto: input.montoEstimado,
    notas: input.notas ?? "", recurrencia: input.modalidad === "PagoUnico" ? "UnicoMes" : "Fijo",
    mes: input.modalidad === "PagoUnico" ? monthKey() : "", activo: true, fechaCreacion: todayISO(),
    frecuencia: input.modalidad, diaPago,
    cerrado: false, proximaFecha: fechaEsperada, cuentaDestino: input.cuentaDestino ?? "", modeloNuevo: true,
  };
  await appendRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, serializeIngreso(fuente));
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(fecha: string, dias: number): string {
  const d = parseDateInput(fecha || todayISO());
  d.setDate(d.getDate() + dias);
  return isoDate(d);
}

function addMonth(fecha: string, diaAncla: string): string {
  const actual = parseDateInput(fecha || todayISO());
  const dia = Number(diaAncla) || actual.getDate();
  const siguiente = new Date(actual.getFullYear(), actual.getMonth() + 1, 1);
  const ultimoDia = new Date(siguiente.getFullYear(), siguiente.getMonth() + 1, 0).getDate();
  siguiente.setDate(Math.min(dia, ultimoDia));
  return isoDate(siguiente);
}

function diasQuincena(diasTexto: string): [number, number] {
  const texto = diasTexto.trim();
  const decimalConvertido = texto.match(/^(\d{1,2})[,.](\d)$/);
  const numeros = decimalConvertido && Number(decimalConvertido[1]) >= 10
    ? [Number(decimalConvertido[1]), Number(decimalConvertido[2]) * 10]
    : (texto.match(/\d{1,2}/g) ?? []).map(Number);
  const dias = numeros.filter((dia) => dia >= 1 && dia <= 31).slice(0, 2).sort((a, b) => a - b);
  return [dias[0] ?? 15, dias[1] ?? 30];
}

/** Primera fecha quincenal igual o posterior a la referencia. */
export function proximaFechaQuincenalDesde(diasTexto: string, desde = todayISO()): string {
  const actual = parseDateInput(desde);
  const [primero, segundo] = diasQuincena(diasTexto);
  const ultimoActual = new Date(actual.getFullYear(), actual.getMonth() + 1, 0).getDate();
  const fechasActuales = [Math.min(primero, ultimoActual), Math.min(segundo, ultimoActual)].sort((a, b) => a - b);
  const siguienteDelMes = fechasActuales.find((dia) => dia >= actual.getDate());
  if (siguienteDelMes !== undefined) return isoDate(new Date(actual.getFullYear(), actual.getMonth(), siguienteDelMes));
  const siguienteMes = new Date(actual.getFullYear(), actual.getMonth() + 1, 1);
  const ultimoSiguiente = new Date(siguienteMes.getFullYear(), siguienteMes.getMonth() + 1, 0).getDate();
  return isoDate(new Date(siguienteMes.getFullYear(), siguienteMes.getMonth(), Math.min(primero, ultimoSiguiente)));
}

function siguienteQuincena(fecha: string, diasTexto: string, ocurrenciasProcesadas = 1): string {
  const actual = parseDateInput(fecha || todayISO());
  const [primero, segundo] = diasQuincena(diasTexto);
  const ultimoActual = new Date(actual.getFullYear(), actual.getMonth() + 1, 0).getDate();
  const fechasActuales = [Math.min(primero, ultimoActual), Math.min(segundo, ultimoActual)].sort((a, b) => a - b);
  const repeticionesEnFecha = fechasActuales.filter((dia) => dia === actual.getDate()).length;
  if (repeticionesEnFecha > 0 && ocurrenciasProcesadas < repeticionesEnFecha) return isoDate(actual);
  const siguienteDelMes = fechasActuales.find((dia) => dia > actual.getDate());
  if (siguienteDelMes !== undefined) return isoDate(new Date(actual.getFullYear(), actual.getMonth(), siguienteDelMes));
  const siguiente = new Date(actual.getFullYear(), actual.getMonth() + 1, 1);
  const ultimoSiguiente = new Date(siguiente.getFullYear(), siguiente.getMonth() + 1, 0).getDate();
  return isoDate(new Date(siguiente.getFullYear(), siguiente.getMonth(), Math.min(primero, ultimoSiguiente)));
}

export function siguienteFechaIngreso(fuente: IngresoFijo, desde: string, ocurrenciasProcesadas = 1): string {
  switch (fuente.frecuencia) {
    case "Mensual": return addMonth(desde, fuente.diaPago);
    case "Quincenal": return siguienteQuincena(desde, fuente.diaPago, ocurrenciasProcesadas);
    case "Semanal": return addDays(desde, 7);
    default: return "";
  }
}

export interface RegistrarIngresoInput { fechaRecibida: string; montoReal: number; notas?: string; periodoId: string; }

async function contarOcurrenciasProcesadas(spreadsheetId: string, fuente: IngresoFijo, fechaEsperada: string): Promise<number> {
  if (fuente.frecuencia !== "Quincenal") return 1;
  const anteriores = await listMovimientosIngresos(spreadsheetId);
  return anteriores.filter((movimiento) => movimiento.fuenteId === fuente.id && movimiento.fechaEsperada === fechaEsperada).length + 1;
}

export async function registrarIngresoRecibido(spreadsheetId: string, fuente: IngresoFijo, input: RegistrarIngresoInput): Promise<void> {
  const fechaEsperada = fuente.proximaFecha || input.fechaRecibida;
  const ocurrenciasProcesadas = await contarOcurrenciasProcesadas(spreadsheetId, fuente, fechaEsperada);
  await appendRecord(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, [
    crypto.randomUUID(), fuente.id, fuente.nombre, fuente.tipo, fechaEsperada,
    input.fechaRecibida, fuente.monto, input.montoReal, "Recibido", input.notas ?? "", input.periodoId,
  ]);
  const pagoUnico = fuente.frecuencia === "PagoUnico";
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, fuente.row, serializeIngreso({
    ...fuente,
    activo: pagoUnico ? false : fuente.activo,
    cerrado: pagoUnico,
    proximaFecha: siguienteFechaIngreso(fuente, fechaEsperada, ocurrenciasProcesadas),
  }));
}

export async function omitirProximoIngreso(spreadsheetId: string, fuente: IngresoFijo, periodoId: string): Promise<void> {
  const fecha = fuente.proximaFecha || todayISO();
  const ocurrenciasProcesadas = await contarOcurrenciasProcesadas(spreadsheetId, fuente, fecha);
  await appendRecord(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, [
    crypto.randomUUID(), fuente.id, fuente.nombre, fuente.tipo, fecha, "", fuente.monto, 0, "Omitido", "Pago esperado omitido.", periodoId,
  ]);
  const pagoUnico = fuente.frecuencia === "PagoUnico";
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, fuente.row, serializeIngreso({
    ...fuente,
    activo: pagoUnico ? false : fuente.activo,
    cerrado: pagoUnico,
    proximaFecha: siguienteFechaIngreso(fuente, fecha, ocurrenciasProcesadas),
  }));
}

export async function setIngresoActivo(spreadsheetId: string, ingreso: IngresoFijo, activo: boolean): Promise<void> {
  if (ingreso.recurrencia === "Fijo" && activo !== ingreso.activo) await registrarCambioIngreso(spreadsheetId, ingreso, ingreso.monto, activo);
  if (!activo) {
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, serializeIngreso({ ...ingreso, activo: false }));
    return;
  }

  const hoy = todayISO();
  const fecha = parseDateInput(hoy);
  const proximaFecha = ingreso.frecuencia === "Quincenal"
    ? proximaFechaQuincenalDesde(ingreso.diaPago, hoy)
    : hoy;
  const diaPago = ingreso.frecuencia === "Mensual"
    ? String(fecha.getDate())
    : ingreso.frecuencia === "Semanal"
      ? DIAS_SEMANA[fecha.getDay()]
      : ingreso.diaPago;
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, serializeIngreso({
    ...ingreso,
    activo: true,
    proximaFecha,
    diaPago,
  }));
}

export async function eliminarIngreso(spreadsheetId: string, ingreso: IngresoFijo): Promise<void> {
  await clearRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, 15);
}

/** Elimina las fuentes de pago único al cerrar el periodo; sus movimientos recibidos permanecen en el historial. */
export async function eliminarPagosUnicosDelPeriodo(spreadsheetId: string): Promise<void> {
  const pagosUnicos = (await listTodosLosIngresos(spreadsheetId))
    .filter((i) => i.frecuencia === "PagoUnico")
    .sort((a, b) => b.row - a.row);
  for (const ingreso of pagosUnicos) await deleteRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row);
}

export interface CambioIngreso {
  row: number; idIngreso: string; fecha: string; montoAnterior: number; montoNuevo: number; activoAnterior: boolean; activoNuevo: boolean;
}

function parseCambioIngreso(r: SheetRow): CambioIngreso {
  const [idIngreso = "", fecha = "", montoAnterior = "0", montoNuevo = "0", activoAnterior = "", activoNuevo = ""] = r.values;
  return { row: r.row, idIngreso, fecha, montoAnterior: Number(montoAnterior) || 0, montoNuevo: Number(montoNuevo) || 0, activoAnterior: activoAnterior.toUpperCase() !== "FALSE", activoNuevo: activoNuevo.toUpperCase() !== "FALSE" };
}

export async function listHistorialIngresos(spreadsheetId: string): Promise<CambioIngreso[]> {
  return (await listRecords(spreadsheetId, HISTORIAL_INGRESOS_FIJOS_SHEET, 6)).map(parseCambioIngreso);
}

async function registrarCambioIngreso(spreadsheetId: string, ingreso: IngresoFijo, montoNuevo: number, activoNuevo: boolean): Promise<void> {
  await appendRecord(spreadsheetId, HISTORIAL_INGRESOS_FIJOS_SHEET, [ingreso.id, todayISO(), ingreso.monto, montoNuevo, ingreso.activo ? "TRUE" : "FALSE", activoNuevo ? "TRUE" : "FALSE"]);
}

export function estadoIngresoEnFecha(ingreso: IngresoFijo, cambios: CambioIngreso[], fecha: string): { monto: number; activo: boolean } {
  const propios = cambios.filter((c) => c.idIngreso === ingreso.id).sort((a, b) => a.fecha.localeCompare(b.fecha));
  if (propios.length === 0) return { monto: ingreso.monto, activo: ingreso.activo };
  const aplicable = [...propios].reverse().find((c) => c.fecha <= fecha);
  if (aplicable) return { monto: aplicable.montoNuevo, activo: aplicable.activoNuevo };
  return { monto: propios[0].montoAnterior, activo: propios[0].activoAnterior };
}

/** Crea una fuente cerrada y su movimiento ya recibido (usado para traspasar el sobrante confirmado). */
export async function crearIngreso(
  spreadsheetId: string,
  tipo: string,
  monto: number,
  notas: string,
  recurrencia: Recurrencia,
  frecuencia: FrecuenciaIngreso = "Mensual",
  diaPago = "",
  nombre = tipo,
  periodoId = todayISO(),
): Promise<void> {
  const modalidad = recurrencia === "UnicoMes" ? "PagoUnico" : frecuencia;
  const id = crypto.randomUUID();
  const fuente: IngresoFijo = {
    id, row: 0, nombre, tipo, monto, notas, recurrencia, mes: recurrencia === "UnicoMes" ? monthKey() : "",
    activo: recurrencia !== "UnicoMes", fechaCreacion: todayISO(), frecuencia: modalidad, diaPago,
    cerrado: recurrencia === "UnicoMes", proximaFecha: "", cuentaDestino: "", modeloNuevo: true,
  };
  await appendRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, serializeIngreso(fuente));
  await appendRecord(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, [crypto.randomUUID(), id, nombre, tipo, todayISO(), todayISO(), monto, monto, "Recibido", notas, periodoId]);
}

export interface IngresoCambios {
  tipo: string; monto: number; notas: string; recurrencia: Recurrencia; frecuencia: FrecuenciaIngreso; diaPago: string;
  nombre?: string; proximaFecha?: string; cuentaDestino?: string;
}

export async function actualizarIngreso(spreadsheetId: string, ingreso: IngresoFijo, cambios: IngresoCambios): Promise<void> {
  if (cambios.monto !== ingreso.monto) await registrarCambioIngreso(spreadsheetId, ingreso, cambios.monto, ingreso.activo);
  const diasQuincenales = cambios.diaPago || "15,30";
  const cambioProgramacionQuincenal = cambios.frecuencia !== ingreso.frecuencia || diasQuincenales !== ingreso.diaPago;
  const proximaFecha = cambios.frecuencia === "Quincenal"
    ? cambioProgramacionQuincenal || !ingreso.proximaFecha
      ? proximaFechaQuincenalDesde(diasQuincenales)
      : ingreso.proximaFecha
    : cambios.proximaFecha ?? ingreso.proximaFecha;
  const fecha = parseDateInput(proximaFecha || todayISO());
  const conservaAncla = cambios.frecuencia === ingreso.frecuencia
    && proximaFecha === ingreso.proximaFecha
    && Boolean(ingreso.diaPago);
  const diaPago = cambios.frecuencia === "Quincenal"
    ? diasQuincenales
    : cambios.frecuencia === "Mensual"
      ? conservaAncla ? ingreso.diaPago : String(fecha.getDate())
      : cambios.frecuencia === "Semanal"
        ? conservaAncla ? ingreso.diaPago : DIAS_SEMANA[fecha.getDay()]
        : "";
  await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, ingreso.row, serializeIngreso({
    ...ingreso, nombre: cambios.nombre ?? ingreso.nombre, tipo: cambios.tipo, monto: cambios.monto,
    notas: cambios.notas, recurrencia: cambios.recurrencia, frecuencia: cambios.frecuencia, diaPago,
    proximaFecha, cuentaDestino: cambios.cuentaDestino ?? ingreso.cuentaDestino,
  }));
}

export function ocurrenciasDiaSemanaEnMes(diaSemana: number, date: Date): number {
  const diasEnMes = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  let total = 0;
  for (let dia = 1; dia <= diasEnMes; dia++) if (new Date(date.getFullYear(), date.getMonth(), dia).getDay() === diaSemana) total++;
  return total;
}

export function ocurrenciasEnMes(ingreso: IngresoFijo, date: Date): number {
  if (ingreso.frecuencia === "Quincenal") return 2;
  if (ingreso.frecuencia === "Semanal") {
    const dia = DIAS_SEMANA.indexOf(ingreso.diaPago as (typeof DIAS_SEMANA)[number]);
    return dia === -1 ? 4 : ocurrenciasDiaSemanaEnMes(dia, date);
  }
  return 1;
}

export function montoMensualEquivalente(ingreso: IngresoFijo, date: Date = new Date()): number {
  return ingreso.monto * ocurrenciasEnMes(ingreso, date);
}

/** Proyección configurada; no usar para calcular dinero disponible. */
export function sumIngresosActivos(ingresos: IngresoFijo[]): number {
  return ingresos.filter((i) => i.activo).reduce((s, i) => s + i.monto, 0);
}

export function sumIngresosFijosRecurrentes(ingresos: IngresoFijo[]): number {
  return ingresos.filter((i) => i.activo && i.frecuencia !== "PagoUnico").reduce((s, i) => s + i.monto, 0);
}
