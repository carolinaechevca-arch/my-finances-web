import { CATEGORIAS_SHEET, GASTOS_FIJOS_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { monthKey } from "./format";

export type RecurrenciaGastoFijo = "Fijo" | "Personalizado" | "Adicional";

export interface GastoFijo {
  row: number;
  id: string;
  /** Comparte el mismo valor entre todas las instancias (una por periodo) de "la misma" serie de gasto recurrente. */
  serieId: string;
  nombre: string;
  monto: number;
  diaPago: string;
  categoria: string;
  mes: string;
  estado: string;
  /** Lo que realmente se pagó (puede diferir de `monto`); null si aún no se ha pagado. */
  montoPagado: number | null;
  recurrencia: RecurrenciaGastoFijo;
  /** Solo aplica a "Personalizado": cada cuántos periodos se reaplica. 0 si no aplica. */
  repiteCadaN: number;
  /** Solo aplica a "Personalizado": periodos transcurridos desde la última reaplicación. */
  contadorPeriodos: number;
  /** Si está en TRUE, "Fijo"/"Personalizado" no se reaplican en el próximo reinicio de periodo, pero conservan su definición. */
  pausado: boolean;
  /** fechaUltimoReinicio (ver domain/periodo.ts) del periodo al que pertenece esta instancia. */
  periodoId: string;
}

function parseGastoFijo(r: SheetRow): GastoFijo {
  const [
    nombre = "",
    monto = "0",
    diaPago = "",
    categoria = "",
    mes = "",
    estado = "",
    montoPagado = "",
    id = "",
    serieId = "",
    recurrencia = "",
    repiteCadaN = "",
    contadorPeriodos = "",
    pausado = "",
    periodoId = "",
  ] = r.values;
  return {
    row: r.row,
    id,
    serieId: serieId || id,
    nombre,
    monto: Number(monto) || 0,
    diaPago,
    categoria,
    mes,
    estado,
    montoPagado: montoPagado === "" ? null : Number(montoPagado) || 0,
    recurrencia: recurrencia === "Personalizado" || recurrencia === "Adicional" ? recurrencia : "Fijo",
    repiteCadaN: Number(repiteCadaN) || 0,
    contadorPeriodos: Number(contadorPeriodos) || 0,
    pausado: pausado.toUpperCase() === "TRUE",
    periodoId,
  };
}

function serializeGastoFijo(g: GastoFijo): unknown[] {
  return [
    g.nombre,
    g.monto,
    g.diaPago,
    g.categoria,
    g.mes,
    g.estado,
    g.montoPagado === null ? "" : g.montoPagado,
    g.id,
    g.serieId,
    g.recurrencia,
    g.repiteCadaN || "",
    g.contadorPeriodos,
    g.pausado ? "TRUE" : "FALSE",
    g.periodoId,
  ];
}

/** Todos los gastos fijos registrados alguna vez, de cualquier mes/periodo — para el Histórico. */
export async function listTodosLosGastosFijos(spreadsheetId: string): Promise<GastoFijo[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 14);
  return rows.map(parseGastoFijo);
}

/** Gastos fijos de un mes calendario específico — usado solo para comparativos históricos (ej. "vs. mes anterior" en Inicio), no para la vigencia actual. */
export async function listGastosFijosDelMes(spreadsheetId: string, date: Date = new Date()): Promise<GastoFijo[]> {
  const todos = await listTodosLosGastosFijos(spreadsheetId);
  const mes = monthKey(date);
  return todos.filter((g) => g.mes === mes);
}

export interface GastosFijosVigentes {
  /** Instancias generadas para el periodo actual: cuentan para totales, alertas, balance, etc. */
  delPeriodo: GastoFijo[];
  /**
   * Series que no tienen instancia en el periodo actual pero igual deben
   * seguir siendo visibles en la tabla (sin sumar a ningún total): las
   * "Personalizado" que todavía no les toca reaplicarse, y cualquier serie
   * pausada — si no se listara, el usuario no tendría forma de encontrarla
   * para reactivarla.
   */
  enEspera: GastoFijo[];
}

/**
 * Vigencia de Gastos Fijos según el periodo global (ver domain/periodo.ts),
 * no el mes calendario. Toma solo la última instancia de cada serie (mayor
 * número de fila) y la clasifica: si ya se generó para el periodo actual,
 * va en `delPeriodo`; si está pausada, o es "Personalizado" que todavía no
 * le toca, va en `enEspera`. Un "Adicional" de un periodo anterior no cae
 * en ninguna de las dos: deja de ser vigente de forma natural, sin borrar
 * su fila (Histórico sigue reconstruyéndolo).
 */
export async function listGastosFijosVigentes(spreadsheetId: string, periodoActualId: string): Promise<GastosFijosVigentes> {
  const todos = await listTodosLosGastosFijos(spreadsheetId);
  const ultimaPorSerie = new Map<string, GastoFijo>();
  for (const g of todos) {
    const actual = ultimaPorSerie.get(g.serieId);
    if (!actual || g.row > actual.row) ultimaPorSerie.set(g.serieId, g);
  }

  const delPeriodo: GastoFijo[] = [];
  const enEspera: GastoFijo[] = [];
  for (const g of ultimaPorSerie.values()) {
    if (g.periodoId === periodoActualId) {
      delPeriodo.push(g);
    } else if (g.pausado || g.recurrencia === "Personalizado") {
      // Pausada (cualquier tipo, para poder reactivarla) o "Personalizado" que todavía no le toca reaplicarse.
      enEspera.push(g);
    }
  }
  return { delPeriodo, enEspera };
}

export async function crearGastoFijo(
  spreadsheetId: string,
  nombre: string,
  monto: number,
  categoria: string,
  diaPago: string,
  recurrencia: RecurrenciaGastoFijo,
  repiteCadaN: number,
  periodoActualId: string,
): Promise<void> {
  const id = crypto.randomUUID();
  await appendRecord(
    spreadsheetId,
    GASTOS_FIJOS_SHEET,
    serializeGastoFijo({
      row: 0,
      id,
      serieId: id,
      nombre,
      monto,
      diaPago,
      categoria,
      mes: monthKey(),
      estado: "Pendiente",
      montoPagado: null,
      recurrencia,
      repiteCadaN: recurrencia === "Personalizado" ? repiteCadaN : 0,
      contadorPeriodos: 0,
      pausado: false,
      periodoId: periodoActualId,
    }),
  );
}

/** Marca el gasto como pagado con el monto que realmente se pagó (puede ser distinto al esperado). */
export async function marcarGastoPagado(spreadsheetId: string, gasto: GastoFijo, montoPagado: number): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, serializeGastoFijo({ ...gasto, estado: "Pagado", montoPagado }));
}

/** Revierte el gasto a pendiente y limpia el monto pagado registrado. */
export async function marcarGastoPendiente(spreadsheetId: string, gasto: GastoFijo): Promise<void> {
  await updateRecord(
    spreadsheetId,
    GASTOS_FIJOS_SHEET,
    gasto.row,
    serializeGastoFijo({ ...gasto, estado: "Pendiente", montoPagado: null }),
  );
}

/** Pausa o reactiva la serie: mientras está pausada, "Fijo"/"Personalizado" no generan una instancia nueva en el próximo reinicio de periodo. */
export async function setGastoFijoPausado(spreadsheetId: string, gasto: GastoFijo, pausado: boolean): Promise<void> {
  await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row, serializeGastoFijo({ ...gasto, pausado }));
}

export interface GastoFijoCambios {
  nombre: string;
  monto: number;
  categoria: string;
  diaPago: string;
  recurrencia: RecurrenciaGastoFijo;
  repiteCadaN: number;
}

export async function actualizarGastoFijo(spreadsheetId: string, gasto: GastoFijo, cambios: GastoFijoCambios): Promise<void> {
  await updateRecord(
    spreadsheetId,
    GASTOS_FIJOS_SHEET,
    gasto.row,
    serializeGastoFijo({
      ...gasto,
      nombre: cambios.nombre,
      monto: cambios.monto,
      categoria: cambios.categoria,
      diaPago: cambios.diaPago,
      recurrencia: cambios.recurrencia,
      repiteCadaN: cambios.recurrencia === "Personalizado" ? cambios.repiteCadaN : 0,
      contadorPeriodos: cambios.recurrencia === "Personalizado" ? gasto.contadorPeriodos : 0,
    }),
  );
}

export async function eliminarGastoFijo(spreadsheetId: string, gasto: GastoFijo): Promise<void> {
  await deleteRecord(spreadsheetId, GASTOS_FIJOS_SHEET, gasto.row);
}

/**
 * Efecto del reinicio de periodo sobre Gastos Fijos (ver domain/periodo.ts):
 * para cada serie (última instancia conocida), si está pausada o es
 * "Adicional" no pasa nada — un "Adicional" simplemente deja de ser vigente
 * de forma natural (su `periodoId` ya no coincide con el actual), sin
 * borrar la fila, así Histórico sigue reconstruyéndolo. "Fijo" siempre
 * genera una instancia nueva. "Personalizado" cuenta periodos hasta
 * `repiteCadaN`: mientras no le toque, solo avanza su contador (para poder
 * mostrar "En espera (faltan X)"); cuando le toca, genera una instancia
 * nueva y reinicia el contador.
 */
export async function reaplicarGastosFijos(spreadsheetId: string, periodoNuevoId: string): Promise<void> {
  const todos = await listTodosLosGastosFijos(spreadsheetId);
  const ultimaPorSerie = new Map<string, GastoFijo>();
  for (const g of todos) {
    const actual = ultimaPorSerie.get(g.serieId);
    if (!actual || g.row > actual.row) ultimaPorSerie.set(g.serieId, g);
  }

  for (const g of ultimaPorSerie.values()) {
    if (g.recurrencia === "Adicional" || g.pausado) continue;

    if (g.recurrencia === "Fijo") {
      await crearInstanciaGastoFijo(spreadsheetId, g, periodoNuevoId, 0);
      continue;
    }

    const nuevoContador = g.contadorPeriodos + 1;
    if (nuevoContador >= g.repiteCadaN) {
      await crearInstanciaGastoFijo(spreadsheetId, g, periodoNuevoId, 0);
    } else {
      await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, g.row, serializeGastoFijo({ ...g, contadorPeriodos: nuevoContador }));
    }
  }
}

async function crearInstanciaGastoFijo(spreadsheetId: string, base: GastoFijo, periodoId: string, contadorPeriodos: number): Promise<void> {
  await appendRecord(
    spreadsheetId,
    GASTOS_FIJOS_SHEET,
    serializeGastoFijo({
      ...base,
      id: crypto.randomUUID(),
      mes: monthKey(),
      estado: "Pendiente",
      montoPagado: null,
      contadorPeriodos,
      periodoId,
    }),
  );
}

export async function listCategorias(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_SHEET, 1);
  const seen = new Set<string>();
  const categorias: string[] = [];
  for (const r of rows) {
    const nombre = r.values[0];
    if (nombre && !seen.has(nombre)) {
      seen.add(nombre);
      categorias.push(nombre);
    }
  }
  return categorias;
}

export async function crearCategoria(spreadsheetId: string, nombre: string): Promise<void> {
  await appendRecord(spreadsheetId, CATEGORIAS_SHEET, [nombre]);
}

/** Borra todas las filas con ese nombre en Categorias (por si quedaron duplicadas). */
export async function eliminarCategoria(spreadsheetId: string, nombre: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, CATEGORIAS_SHEET, 1);
  const matching = rows
    .filter((r) => r.values[0] === nombre)
    .map((r) => r.row)
    .sort((a, b) => b - a);
  for (const row of matching) {
    await deleteRecord(spreadsheetId, CATEGORIAS_SHEET, row);
  }
}

/** Nombres distintos usados en gastos fijos de cualquier mes, para autocompletar el formulario. */
export async function listGastosFijosNombres(spreadsheetId: string): Promise<string[]> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 14);
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

export function sumGastosFijosTotal(fijos: GastoFijo[]): number {
  return fijos.reduce((s, g) => s + g.monto, 0);
}

/** Suma solo los gastos fijos que aún no están marcados como "Pagado". */
export function sumGastosFijosPendientes(fijos: GastoFijo[]): number {
  return fijos.filter((g) => g.estado !== "Pagado").reduce((s, g) => s + g.monto, 0);
}

/** Suma lo realmente pagado (usa el monto esperado si un gasto pagado no tiene monto pagado registrado). */
export function sumGastosFijosPagado(fijos: GastoFijo[]): number {
  return fijos
    .filter((g) => g.estado === "Pagado")
    .reduce((s, g) => s + (g.montoPagado ?? g.monto), 0);
}

export interface DiferenciaPago {
  gasto: GastoFijo;
  /** monto pagado - monto esperado: positivo si pagó de más, negativo si pagó de menos. */
  diferencia: number;
}

/** Gastos pagados cuyo monto real fue distinto al esperado, para el detalle de diferencias. */
export function diferenciasPago(fijos: GastoFijo[]): DiferenciaPago[] {
  return fijos
    .filter((g) => g.estado === "Pagado" && g.montoPagado !== null && g.montoPagado !== g.monto)
    .map((g) => ({ gasto: g, diferencia: (g.montoPagado as number) - g.monto }));
}

export function sumDiferenciasPago(fijos: GastoFijo[]): number {
  return diferenciasPago(fijos).reduce((s, d) => s + d.diferencia, 0);
}

/** "vencida" si ya pasó el día de pago sin marcarlo pagado; "proxima" si faltan 5 días o menos. */
export function estadoAlertaGastoFijo(gasto: GastoFijo, hoy: Date = new Date()): "vencida" | "proxima" | null {
  if (gasto.estado === "Pagado") return null;
  const dia = Number(gasto.diaPago);
  if (!dia) return null;
  const hoyDia = hoy.getDate();
  if (hoyDia > dia) return "vencida";
  if (dia - hoyDia <= 5) return "proxima";
  return null;
}
