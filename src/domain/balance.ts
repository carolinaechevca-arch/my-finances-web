import { listDeudas, listTodosLosEventos, type Deuda, type EventoAbono } from "./deudas";
import { todayISO } from "./format";
import { listGastosFijosVigentes, sumGastosFijosPagado, type GastoFijo } from "./gastos";
import { listGastosDelPeriodo, sumGastos, type GastoYCompra } from "./gastos-y-compras";
import { listIngresosVigentes, sumIngresosActivos, type IngresoFijo } from "./ingresos";
import { listTodosLosMovimientos, type MovimientoMeta } from "./metas";

export interface DisponibleDetalle {
  ingresos: number;
  /** Solo lo realmente marcado como Pagado este periodo (no el total comprometido). */
  gastosFijosPagados: number;
  gastosVariables: number;
  /** Solo lo realmente abonado este periodo a deudas propias (no la cuota programada) — aplica igual a "Con cuotas" y "Deuda simple". */
  abonosDeudas: number;
  /** Solo lo realmente cobrado este periodo de deudas "Me Deben". */
  cobrosMeDeben: number;
  aportesAhorros: number;
  retirosAhorros: number;
  disponible: number;
}

export interface DisponibleInputs {
  ingresos: IngresoFijo[];
  /** Gastos fijos ya filtrados al periodo actual (`listGastosFijosVigentes(...).delPeriodo`). */
  gastosFijosDelPeriodo: GastoFijo[];
  /** Gastos y compras ya filtrados al periodo actual (`listGastosDelPeriodo`), no al mes calendario. */
  gastosVariablesDelPeriodo: GastoYCompra[];
  deudasYoDebo: Deuda[];
  deudasMeDeben: Deuda[];
  eventosDeudas: EventoAbono[];
  movimientosMetas: MovimientoMeta[];
}

/**
 * Cálculo puro (sin I/O) de dinero disponible — para páginas como Inicio que
 * ya tienen todo esto cargado y no necesitan volver a pedírselo a Sheets.
 * `calcularDisponible` (más abajo) es el atajo que sí hace los fetches, para
 * páginas livianas como Ingresos que no cargan estos datos por su cuenta.
 *
 * Todo cuenta solo el movimiento de dinero *real* ya ocurrido: un gasto fijo
 * pendiente NO resta hasta que se marca como Pagado (igual que Gastos y
 * Compras), un abono a una deuda resta solo cuando se registra (no la cuota
 * programada), un aporte a ahorros resta al aportarlo, etc.
 */
export function calcularDisponibleDesde(inputs: DisponibleInputs, periodoInicio: string): DisponibleDetalle {
  const hoy = todayISO();
  const idsYoDebo = new Set(inputs.deudasYoDebo.map((d) => d.id));
  const idsMeDeben = new Set(inputs.deudasMeDeben.map((d) => d.id));
  const enPeriodo = (fecha: string) => fecha >= periodoInicio && fecha <= hoy;

  const abonosDeudas = inputs.eventosDeudas
    .filter((e) => e.tipo === "Abono" && idsYoDebo.has(e.idDeuda) && enPeriodo(e.fecha))
    .reduce((s, e) => s + e.monto, 0);
  const cobrosMeDeben = inputs.eventosDeudas
    .filter((e) => e.tipo === "Abono" && idsMeDeben.has(e.idDeuda) && enPeriodo(e.fecha))
    .reduce((s, e) => s + e.monto, 0);

  const aportesAhorros = inputs.movimientosMetas
    .filter((m) => m.tipo !== "Retiro" && enPeriodo(m.fecha))
    .reduce((s, m) => s + m.monto, 0);
  const retirosAhorros = inputs.movimientosMetas
    .filter((m) => m.tipo === "Retiro" && enPeriodo(m.fecha))
    .reduce((s, m) => s + m.monto, 0);

  const ingresosTotal = sumIngresosActivos(inputs.ingresos);
  const gastosFijosPagadosTotal = sumGastosFijosPagado(inputs.gastosFijosDelPeriodo);
  const gastosVariablesTotal = sumGastos(inputs.gastosVariablesDelPeriodo);

  const disponible =
    ingresosTotal -
    gastosFijosPagadosTotal -
    gastosVariablesTotal -
    abonosDeudas +
    cobrosMeDeben -
    aportesAhorros +
    retirosAhorros;

  return {
    ingresos: ingresosTotal,
    gastosFijosPagados: gastosFijosPagadosTotal,
    gastosVariables: gastosVariablesTotal,
    abonosDeudas,
    cobrosMeDeben,
    aportesAhorros,
    retirosAhorros,
    disponible,
  };
}

/**
 * Dinero disponible del periodo que arrancó en `periodoInicio` y sigue
 * corriendo hasta hoy — pide todo lo que necesita a Sheets desde cero. Si ya
 * tienes estos datos cargados (ej. Inicio, que carga todo esto igual para
 * sus propias tarjetas), usa `calcularDisponibleDesde` en su lugar para no
 * duplicar llamadas a la API.
 */
export async function calcularDisponible(spreadsheetId: string, periodoInicio: string): Promise<DisponibleDetalle> {
  const [ingresos, gastosFijosVigentes, gastosVariablesDelPeriodo, deudasYoDebo, deudasMeDeben, eventosDeudas, movimientosMetas] =
    await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listGastosFijosVigentes(spreadsheetId, periodoInicio),
      listGastosDelPeriodo(spreadsheetId, periodoInicio),
      listDeudas(spreadsheetId, "YoDebo"),
      listDeudas(spreadsheetId, "MeDeben"),
      listTodosLosEventos(spreadsheetId),
      listTodosLosMovimientos(spreadsheetId),
    ]);

  return calcularDisponibleDesde(
    {
      ingresos,
      gastosFijosDelPeriodo: gastosFijosVigentes.delPeriodo,
      gastosVariablesDelPeriodo,
      deudasYoDebo,
      deudasMeDeben,
      eventosDeudas,
      movimientosMetas,
    },
    periodoInicio,
  );
}
