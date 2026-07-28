import { listDeudas, listTodosLosEventos } from "./deudas";
import { todayISO } from "./format";
import { listGastosFijosVigentes, sumGastosFijosTotal } from "./gastos";
import { listGastosDelPeriodo, sumGastos } from "./gastos-y-compras";
import { listIngresosVigentes, sumIngresosActivos } from "./ingresos";
import { listTodosLosMovimientos } from "./metas";

export interface DisponibleDetalle {
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  /** Solo lo realmente abonado este periodo a deudas propias (no la cuota programada) — aplica igual a "Con cuotas" y "Deuda simple". */
  abonosDeudas: number;
  /** Solo lo realmente cobrado este periodo de deudas "Me Deben". */
  cobrosMeDeben: number;
  aportesAhorros: number;
  retirosAhorros: number;
  disponible: number;
}

/**
 * Dinero disponible del periodo que arrancó en `periodoInicio` y sigue
 * corriendo hasta hoy. Único cálculo compartido por Inicio, Ingresos, y el
 * traspaso automático al reiniciar periodo (ver domain/periodo.ts) — antes
 * cada pantalla tenía su propia fórmula, ligeramente distintas entre sí.
 *
 * Gastos Fijos sigue siendo el total *comprometido* del periodo (aunque no
 * se haya pagado aún — reserva presupuesto a propósito). Todo lo demás
 * (deudas, ahorros) cuenta solo el movimiento de dinero *real* ya ocurrido.
 */
export async function calcularDisponible(spreadsheetId: string, periodoInicio: string): Promise<DisponibleDetalle> {
  const hoy = todayISO();
  const [ingresos, gastosFijosVigentes, gastosVariables, deudasYoDebo, deudasMeDeben, eventosDeudas, movimientosMetas] =
    await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listGastosFijosVigentes(spreadsheetId, periodoInicio),
      listGastosDelPeriodo(spreadsheetId, periodoInicio),
      listDeudas(spreadsheetId, "YoDebo"),
      listDeudas(spreadsheetId, "MeDeben"),
      listTodosLosEventos(spreadsheetId),
      listTodosLosMovimientos(spreadsheetId),
    ]);

  const idsYoDebo = new Set(deudasYoDebo.map((d) => d.id));
  const idsMeDeben = new Set(deudasMeDeben.map((d) => d.id));
  const enPeriodo = (fecha: string) => fecha >= periodoInicio && fecha <= hoy;

  const abonosDeudas = eventosDeudas
    .filter((e) => e.tipo === "Abono" && idsYoDebo.has(e.idDeuda) && enPeriodo(e.fecha))
    .reduce((s, e) => s + e.monto, 0);
  const cobrosMeDeben = eventosDeudas
    .filter((e) => e.tipo === "Abono" && idsMeDeben.has(e.idDeuda) && enPeriodo(e.fecha))
    .reduce((s, e) => s + e.monto, 0);

  const aportesAhorros = movimientosMetas
    .filter((m) => m.tipo !== "Retiro" && enPeriodo(m.fecha))
    .reduce((s, m) => s + m.monto, 0);
  const retirosAhorros = movimientosMetas
    .filter((m) => m.tipo === "Retiro" && enPeriodo(m.fecha))
    .reduce((s, m) => s + m.monto, 0);

  const ingresosTotal = sumIngresosActivos(ingresos);
  const gastosFijosTotal = sumGastosFijosTotal(gastosFijosVigentes.delPeriodo);
  const gastosVariablesTotal = sumGastos(gastosVariables);

  const disponible =
    ingresosTotal - gastosFijosTotal - gastosVariablesTotal - abonosDeudas + cobrosMeDeben - aportesAhorros + retirosAhorros;

  return {
    ingresos: ingresosTotal,
    gastosFijos: gastosFijosTotal,
    gastosVariables: gastosVariablesTotal,
    abonosDeudas,
    cobrosMeDeben,
    aportesAhorros,
    retirosAhorros,
    disponible,
  };
}
