import { listDeudas, listTodosLosEventos, type Deuda, type Direccion, type EventoAbono } from "./deudas";
import { addMonthsToKey, endOfMonthISO, monthKey, parseDateInput, todayISO } from "./format";
import {
  listTodosLosGastosFijos,
  sumGastosFijosPagado,
  sumGastosFijosPendientes,
  sumGastosFijosTotal,
  type GastoFijo,
} from "./gastos";
import { listTodosLosGastos, sumGastos, type GastoYCompra } from "./gastos-y-compras";
import {
  estadoIngresoEnFecha,
  listHistorialIngresos,
  listTodosLosIngresos,
  ocurrenciasEnMes,
  type CambioIngreso,
  type IngresoFijo,
} from "./ingresos";
import { listMetas, listTodosLosMovimientos, type Meta, type MovimientoMeta } from "./metas";
import { armarPeriodosDisponibles, type PeriodoHistorico } from "./periodo";

/**
 * Todo lo que necesita el módulo Histórico, cargado una sola vez desde
 * Sheets. A partir de aquí, cambiar de mes/rango/categoría es puro cálculo
 * en memoria — nada vuelve a pedirle nada a la hoja.
 */
export interface HistoricoSnapshot {
  ingresos: IngresoFijo[];
  cambiosIngresos: CambioIngreso[];
  gastosFijos: GastoFijo[];
  gastosYCompras: GastoYCompra[];
  deudasYoDebo: Deuda[];
  deudasMeDeben: Deuda[];
  eventosDeudas: EventoAbono[];
  metas: Meta[];
  movimientosMetas: MovimientoMeta[];
}

export async function cargarSnapshotHistorico(spreadsheetId: string): Promise<HistoricoSnapshot> {
  const [
    ingresos,
    cambiosIngresos,
    gastosFijos,
    gastosYCompras,
    deudasYoDebo,
    deudasMeDeben,
    eventosDeudas,
    metas,
    movimientosMetas,
  ] = await Promise.all([
    listTodosLosIngresos(spreadsheetId),
    listHistorialIngresos(spreadsheetId),
    listTodosLosGastosFijos(spreadsheetId),
    listTodosLosGastos(spreadsheetId),
    listDeudas(spreadsheetId, "YoDebo"),
    listDeudas(spreadsheetId, "MeDeben"),
    listTodosLosEventos(spreadsheetId),
    listMetas(spreadsheetId),
    listTodosLosMovimientos(spreadsheetId),
  ]);
  return {
    ingresos,
    cambiosIngresos,
    gastosFijos,
    gastosYCompras,
    deudasYoDebo,
    deudasMeDeben,
    eventosDeudas,
    metas,
    movimientosMetas,
  };
}

function sumIngresosEnMes(snap: HistoricoSnapshot, mes: string): number {
  const finMes = endOfMonthISO(mes);
  const fechaDelMes = parseDateInput(finMes);
  return snap.ingresos.reduce((s, i) => {
    if (i.recurrencia === "UnicoMes") return i.mes === mes && i.activo ? s + i.monto : s;
    if (i.fechaCreacion && i.fechaCreacion > finMes) return s;
    const estado = estadoIngresoEnFecha(i, snap.cambiosIngresos, finMes);
    return estado.activo ? s + estado.monto * ocurrenciasEnMes(i, fechaDelMes) : s;
  }, 0);
}

function gastosFijosDelMes(snap: HistoricoSnapshot, mes: string): GastoFijo[] {
  return snap.gastosFijos.filter((g) => g.mes === mes);
}

function gastosYComprasDelMes(snap: HistoricoSnapshot, mes: string): GastoYCompra[] {
  return snap.gastosYCompras.filter((g) => g.estado === "Pagado" && g.fecha.slice(0, 7) === mes);
}

function idsDeudas(snap: HistoricoSnapshot, direccion: Direccion): Set<string> {
  return new Set((direccion === "YoDebo" ? snap.deudasYoDebo : snap.deudasMeDeben).map((d) => d.id));
}

function eventosAbonoDelMes(snap: HistoricoSnapshot, direccion: Direccion, mes: string): EventoAbono[] {
  const ids = idsDeudas(snap, direccion);
  return snap.eventosDeudas.filter((e) => e.tipo === "Abono" && ids.has(e.idDeuda) && e.fecha.slice(0, 7) === mes);
}

function movimientosMetasDelMes(snap: HistoricoSnapshot, mes: string): MovimientoMeta[] {
  return snap.movimientosMetas.filter((m) => m.fecha.slice(0, 7) === mes);
}

export interface ResumenMes {
  mes: string;
  ingresos: number;
  gastosFijosTotal: number;
  gastosFijosPagado: number;
  gastosFijosPendiente: number;
  gastosVariables: number;
  gastosTotal: number;
  balance: number;
  aportadoAhorros: number;
  retiradoAhorros: number;
  abonadoDeudas: number;
  recibidoMeDeben: number;
}

export function resumenMes(snap: HistoricoSnapshot, mes: string): ResumenMes {
  const ingresos = sumIngresosEnMes(snap, mes);
  const fijosDelMes = gastosFijosDelMes(snap, mes);
  const gastosFijosTotal = sumGastosFijosTotal(fijosDelMes);
  const gastosFijosPagado = sumGastosFijosPagado(fijosDelMes);
  const gastosFijosPendiente = sumGastosFijosPendientes(fijosDelMes);
  const gastosVariables = sumGastos(gastosYComprasDelMes(snap, mes));
  const gastosTotal = gastosFijosTotal + gastosVariables;
  const movimientos = movimientosMetasDelMes(snap, mes);
  const aportadoAhorros = movimientos.filter((m) => m.tipo !== "Retiro").reduce((s, m) => s + m.monto, 0);
  const retiradoAhorros = movimientos.filter((m) => m.tipo === "Retiro").reduce((s, m) => s + m.monto, 0);
  const abonadoDeudas = eventosAbonoDelMes(snap, "YoDebo", mes).reduce((s, e) => s + e.monto, 0);
  const recibidoMeDeben = eventosAbonoDelMes(snap, "MeDeben", mes).reduce((s, e) => s + e.monto, 0);

  return {
    mes,
    ingresos,
    gastosFijosTotal,
    gastosFijosPagado,
    gastosFijosPendiente,
    gastosVariables,
    gastosTotal,
    balance: ingresos - gastosTotal,
    aportadoAhorros,
    retiradoAhorros,
    abonadoDeudas,
    recibidoMeDeben,
  };
}

/** Primer mes ("YYYY-MM") con algún dato registrado, de cualquier módulo; hoy si la cuenta está vacía. */
export function primerMesConDatos(snap: HistoricoSnapshot): string {
  const claves: string[] = [];
  for (const i of snap.ingresos) if (i.fechaCreacion) claves.push(i.fechaCreacion.slice(0, 7));
  for (const g of snap.gastosFijos) if (g.mes) claves.push(g.mes);
  for (const g of snap.gastosYCompras) if (g.fecha) claves.push(g.fecha.slice(0, 7));
  for (const e of snap.eventosDeudas) if (e.fecha) claves.push(e.fecha.slice(0, 7));
  for (const d of [...snap.deudasYoDebo, ...snap.deudasMeDeben]) if (d.fechaInicio) claves.push(d.fechaInicio.slice(0, 7));
  for (const m of snap.movimientosMetas) if (m.fecha) claves.push(m.fecha.slice(0, 7));
  for (const m of snap.metas) if (m.fechaCreacion) claves.push(m.fechaCreacion.slice(0, 7));
  if (claves.length === 0) return monthKey();
  return claves.sort()[0];
}

/** Todos los meses ("YYYY-MM") desde el primero con datos hasta el mes actual, en orden cronológico. */
export function listMesesDisponibles(snap: HistoricoSnapshot): string[] {
  const primero = primerMesConDatos(snap);
  const actual = monthKey();
  const meses: string[] = [];
  let cursor = primero;
  let guard = 0;
  while (cursor <= actual && guard < 1000) {
    meses.push(cursor);
    cursor = addMonthsToKey(cursor, 1);
    guard++;
  }
  return meses.length > 0 ? meses : [actual];
}

export function listAniosDisponibles(snap: HistoricoSnapshot): string[] {
  const anios = new Set(listMesesDisponibles(snap).map((m) => m.slice(0, 4)));
  return [...anios].sort();
}

export interface FacturaAnual {
  fecha: string;
  nombre: string;
  monto: number;
  link: string;
}

export interface ResumenAnual {
  anio: string;
  totalIngresos: number;
  totalGastos: number;
  totalAhorrado: number;
  totalPagadoDeudas: number;
  facturas: FacturaAnual[];
}

export function resumenAnual(snap: HistoricoSnapshot, anio: string): ResumenAnual {
  const actual = monthKey();
  const mesesDelAnio = Array.from({ length: 12 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}`).filter(
    (m) => m <= actual,
  );

  let totalIngresos = 0;
  let totalGastos = 0;
  let totalAhorrado = 0;
  let totalPagadoDeudas = 0;
  for (const mes of mesesDelAnio) {
    const r = resumenMes(snap, mes);
    totalIngresos += r.ingresos;
    totalGastos += r.gastosTotal;
    totalAhorrado += r.aportadoAhorros - r.retiradoAhorros;
    totalPagadoDeudas += r.abonadoDeudas;
  }

  const facturas = snap.gastosYCompras
    .filter((g) => g.linkFactura && g.fecha.slice(0, 4) === anio)
    .map((g) => ({ fecha: g.fecha, nombre: g.nombre, monto: g.monto, link: g.linkFactura }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { anio, totalIngresos, totalGastos, totalAhorrado, totalPagadoDeudas, facturas };
}

/** Arma y dispara la descarga de un CSV simple del resumen anual (para declaración de renta u otro uso). */
export function descargarResumenAnualCSV(resumen: ResumenAnual): void {
  const lineas = [
    ["Resumen anual", resumen.anio],
    [],
    ["Total ingresos", String(resumen.totalIngresos)],
    ["Total gastos", String(resumen.totalGastos)],
    ["Total ahorrado", String(resumen.totalAhorrado)],
    ["Total pagado en deudas", String(resumen.totalPagadoDeudas)],
    [],
    ["Facturas registradas"],
    ["Fecha", "Nombre", "Monto", "Link"],
    ...resumen.facturas.map((f) => [f.fecha, f.nombre, String(f.monto), f.link]),
  ];
  const csv = lineas.map((fila) => fila.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen-anual-${resumen.anio}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- A partir de acá: versiones por PERIODO (Semanal/Quincenal/Mensual/Manual) de lo de arriba,     ---
// --- usadas por el navegador y los gráficos de Histórico. "Resumen anual" sigue usando lo de arriba, ---
// --- por mes/año calendario real — confirmado que no cambia con el sistema de periodo.               ---

/** Fecha real (o mejor aproximación posible) de cada gasto fijo, a partir de "Mes" + "DiaPago" (clamp al último día válido del mes). */
function fechaAproxGastoFijo(g: GastoFijo): string | null {
  if (!g.mes) return null;
  const [anioStr, mesStr] = g.mes.split("-");
  const anio = Number(anioStr);
  const mesNum = Number(mesStr);
  if (!anio || !mesNum) return null;
  const ultimoDia = new Date(anio, mesNum, 0).getDate();
  const dia = Math.min(Math.max(Number(g.diaPago) || 1, 1), ultimoDia);
  return `${g.mes}-${String(dia).padStart(2, "0")}`;
}

function sumIngresosEnPeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): number {
  const finPeriodo = periodo.fin ?? todayISO();
  return snap.ingresos.reduce((s, i) => {
    if (i.recurrencia === "UnicoMes") {
      const fecha = i.fechaCreacion;
      return fecha && fecha >= periodo.inicio && fecha <= finPeriodo && i.activo ? s + i.monto : s;
    }
    if (i.fechaCreacion && i.fechaCreacion > finPeriodo) return s;
    const estado = estadoIngresoEnFecha(i, snap.cambiosIngresos, finPeriodo);
    // A diferencia de sumIngresosEnMes, acá no se multiplica por ocurrenciasEnMes: bajo el sistema de
    // periodo, un ingreso "Fijo" aplica una sola vez por periodo (el periodo ya es la unidad recurrente).
    return estado.activo ? s + estado.monto : s;
  }, 0);
}

function gastosFijosDelPeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): GastoFijo[] {
  const finPeriodo = periodo.fin ?? todayISO();
  return snap.gastosFijos.filter((g) => {
    const fecha = fechaAproxGastoFijo(g);
    return fecha !== null && fecha >= periodo.inicio && fecha <= finPeriodo;
  });
}

function gastosYComprasDelPeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): GastoYCompra[] {
  const finPeriodo = periodo.fin ?? todayISO();
  return snap.gastosYCompras.filter((g) => g.estado === "Pagado" && g.fecha >= periodo.inicio && g.fecha <= finPeriodo);
}

function eventosAbonoDelPeriodo(snap: HistoricoSnapshot, direccion: Direccion, periodo: PeriodoHistorico): EventoAbono[] {
  const finPeriodo = periodo.fin ?? todayISO();
  const ids = idsDeudas(snap, direccion);
  return snap.eventosDeudas.filter(
    (e) => e.tipo === "Abono" && ids.has(e.idDeuda) && e.fecha >= periodo.inicio && e.fecha <= finPeriodo,
  );
}

function movimientosMetasDelPeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): MovimientoMeta[] {
  const finPeriodo = periodo.fin ?? todayISO();
  return snap.movimientosMetas.filter((m) => m.fecha >= periodo.inicio && m.fecha <= finPeriodo);
}

export interface ResumenPeriodo {
  periodo: PeriodoHistorico;
  ingresos: number;
  gastosFijosTotal: number;
  gastosFijosPagado: number;
  gastosFijosPendiente: number;
  gastosVariables: number;
  gastosTotal: number;
  balance: number;
  aportadoAhorros: number;
  retiradoAhorros: number;
  abonadoDeudas: number;
  recibidoMeDeben: number;
}

export function resumenPeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): ResumenPeriodo {
  const ingresos = sumIngresosEnPeriodo(snap, periodo);
  const fijosDelPeriodo = gastosFijosDelPeriodo(snap, periodo);
  const gastosFijosTotal = sumGastosFijosTotal(fijosDelPeriodo);
  const gastosFijosPagado = sumGastosFijosPagado(fijosDelPeriodo);
  const gastosFijosPendiente = sumGastosFijosPendientes(fijosDelPeriodo);
  const gastosVariables = sumGastos(gastosYComprasDelPeriodo(snap, periodo));
  const gastosTotal = gastosFijosTotal + gastosVariables;
  const movimientos = movimientosMetasDelPeriodo(snap, periodo);
  const aportadoAhorros = movimientos.filter((m) => m.tipo !== "Retiro").reduce((s, m) => s + m.monto, 0);
  const retiradoAhorros = movimientos.filter((m) => m.tipo === "Retiro").reduce((s, m) => s + m.monto, 0);
  const abonadoDeudas = eventosAbonoDelPeriodo(snap, "YoDebo", periodo).reduce((s, e) => s + e.monto, 0);
  const recibidoMeDeben = eventosAbonoDelPeriodo(snap, "MeDeben", periodo).reduce((s, e) => s + e.monto, 0);

  return {
    periodo,
    ingresos,
    gastosFijosTotal,
    gastosFijosPagado,
    gastosFijosPendiente,
    gastosVariables,
    gastosTotal,
    balance: ingresos - gastosTotal,
    aportadoAhorros,
    retiradoAhorros,
    abonadoDeudas,
    recibidoMeDeben,
  };
}

/** Fecha ("YYYY-MM-DD") más antigua con algún dato registrado, de cualquier módulo; hoy si la cuenta está vacía. */
export function primeraFechaConDatos(snap: HistoricoSnapshot): string {
  const fechas: string[] = [];
  for (const i of snap.ingresos) if (i.fechaCreacion) fechas.push(i.fechaCreacion);
  for (const g of snap.gastosFijos) {
    const f = fechaAproxGastoFijo(g);
    if (f) fechas.push(f);
  }
  for (const g of snap.gastosYCompras) if (g.fecha) fechas.push(g.fecha);
  for (const e of snap.eventosDeudas) if (e.fecha) fechas.push(e.fecha);
  for (const d of [...snap.deudasYoDebo, ...snap.deudasMeDeben]) if (d.fechaInicio) fechas.push(d.fechaInicio);
  for (const m of snap.movimientosMetas) if (m.fecha) fechas.push(m.fecha);
  for (const m of snap.metas) if (m.fechaCreacion) fechas.push(m.fechaCreacion);
  if (fechas.length === 0) return todayISO();
  return fechas.sort()[0];
}

/** Todos los periodos con datos, del más antiguo al actual (en curso), a partir del log real de reinicios. */
export function listPeriodosDisponibles(snap: HistoricoSnapshot, historialPeriodos: string[]): PeriodoHistorico[] {
  return armarPeriodosDisponibles(historialPeriodos, primeraFechaConDatos(snap));
}

export interface DetalleItem {
  nombre: string;
  nota?: string;
  monto: number;
}

export interface DetallePeriodoItems {
  ingresos: DetalleItem[];
  gastosFijos: DetalleItem[];
  gastosCompras: DetalleItem[];
  ahorros: DetalleItem[];
  deudas: DetalleItem[];
  meDeben: DetalleItem[];
}

/** Desglose ítem por ítem de un periodo (para las tarjetas expandibles de Histórico) — misma ventana de fechas que `resumenPeriodo`. */
export function detallePeriodo(snap: HistoricoSnapshot, periodo: PeriodoHistorico): DetallePeriodoItems {
  const finPeriodo = periodo.fin ?? todayISO();

  const ingresos: DetalleItem[] = [];
  for (const i of snap.ingresos) {
    if (i.recurrencia === "UnicoMes") {
      if (i.fechaCreacion && i.fechaCreacion >= periodo.inicio && i.fechaCreacion <= finPeriodo && i.activo) {
        ingresos.push({ nombre: i.tipo, nota: i.notas || undefined, monto: i.monto });
      }
      continue;
    }
    if (i.fechaCreacion && i.fechaCreacion > finPeriodo) continue;
    const estado = estadoIngresoEnFecha(i, snap.cambiosIngresos, finPeriodo);
    if (estado.activo) ingresos.push({ nombre: i.tipo, nota: i.notas || undefined, monto: estado.monto });
  }

  const gastosFijos = gastosFijosDelPeriodo(snap, periodo).map((g) => ({
    nombre: g.nombre,
    nota: g.categoria || undefined,
    monto: g.montoPagado ?? g.monto,
  }));

  const gastosCompras = gastosYComprasDelPeriodo(snap, periodo).map((g) => ({
    nombre: g.nombre,
    nota: g.categoria || undefined,
    monto: g.monto,
  }));

  const nombresMetas = new Map(snap.metas.map((m) => [m.id, m.nombre]));
  const ahorros = movimientosMetasDelPeriodo(snap, periodo)
    .filter((m) => m.tipo !== "Retiro")
    .map((m) => ({ nombre: nombresMetas.get(m.idMeta) ?? "Meta", nota: m.nota || undefined, monto: m.monto }));

  const nombresDeudas = new Map([...snap.deudasYoDebo, ...snap.deudasMeDeben].map((d) => [d.id, d.contraparte]));
  const deudas = eventosAbonoDelPeriodo(snap, "YoDebo", periodo).map((e) => ({
    nombre: nombresDeudas.get(e.idDeuda) ?? "Deuda",
    nota: e.nota || undefined,
    monto: e.monto,
  }));
  const meDeben = eventosAbonoDelPeriodo(snap, "MeDeben", periodo).map((e) => ({
    nombre: nombresDeudas.get(e.idDeuda) ?? "Deuda",
    nota: e.nota || undefined,
    monto: e.monto,
  }));

  return { ingresos, gastosFijos, gastosCompras, ahorros, deudas, meDeben };
}
