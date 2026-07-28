import { COMPRAS_RECURRENTES_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { crearGasto, type GastoYCompra } from "./gastos-y-compras";

export type RecurrenciaCompra = "Fijo" | "Personalizado";

/**
 * Plantilla de una compra recurrente (ej. champú cada 2 periodos) — nunca es
 * una obligación: no genera alertas de vencido, solo un recordatorio suave
 * cuando le toca. No tiene fecha ni estado propios: cada vez que el usuario
 * "la registra", se crea una compra real independiente en GastosYCompras
 * (ver domain/gastos-y-compras.ts) y esta plantilla solo reinicia su
 * contador.
 */
export interface CompraRecurrente {
  row: number;
  id: string;
  nombre: string;
  categoria: string;
  /** Monto de referencia: el registrado la última vez (o el inicial, si nunca se ha registrado). */
  monto: number;
  recurrencia: RecurrenciaCompra;
  /** Solo aplica a "Personalizado": cada cuántos periodos le toca. */
  repiteCadaN: number;
  /** Periodos transcurridos desde la última vez que se registró (o desde que se creó, si nunca). */
  contadorPeriodos: number;
}

function parseCompraRecurrente(r: SheetRow): CompraRecurrente {
  const [id = "", nombre = "", categoria = "", monto = "0", recurrencia = "", repiteCadaN = "", contadorPeriodos = ""] = r.values;
  return {
    row: r.row,
    id,
    nombre,
    categoria,
    monto: Number(monto) || 0,
    recurrencia: recurrencia === "Personalizado" ? "Personalizado" : "Fijo",
    repiteCadaN: Number(repiteCadaN) || 0,
    contadorPeriodos: Number(contadorPeriodos) || 0,
  };
}

function serializeCompraRecurrente(c: CompraRecurrente): unknown[] {
  return [c.id, c.nombre, c.categoria, c.monto, c.recurrencia, c.repiteCadaN || "", c.contadorPeriodos];
}

/** "Le toca" reaplicarse: Fijo en cuanto pasó al menos un periodo, Personalizado al llegar a su N. Sigue "debida" aunque se posponga varias veces. */
export function esCompraDue(c: CompraRecurrente): boolean {
  return c.recurrencia === "Fijo" ? c.contadorPeriodos >= 1 : c.contadorPeriodos >= c.repiteCadaN;
}

export async function listComprasRecurrentes(spreadsheetId: string): Promise<CompraRecurrente[]> {
  const rows = await listRecords(spreadsheetId, COMPRAS_RECURRENTES_SHEET, 7);
  return rows.map(parseCompraRecurrente);
}

export interface NuevaCompraRecurrente {
  nombre: string;
  categoria: string;
  monto: number;
  recurrencia: RecurrenciaCompra;
  repiteCadaN: number;
}

export async function crearCompraRecurrente(spreadsheetId: string, nueva: NuevaCompraRecurrente): Promise<void> {
  const id = crypto.randomUUID();
  await appendRecord(
    spreadsheetId,
    COMPRAS_RECURRENTES_SHEET,
    serializeCompraRecurrente({
      row: 0,
      id,
      nombre: nueva.nombre,
      categoria: nueva.categoria,
      monto: nueva.monto,
      recurrencia: nueva.recurrencia,
      repiteCadaN: nueva.recurrencia === "Personalizado" ? nueva.repiteCadaN : 0,
      contadorPeriodos: 0,
    }),
  );
}

export interface CompraRecurrenteCambios {
  nombre: string;
  categoria: string;
  monto: number;
  recurrencia: RecurrenciaCompra;
  repiteCadaN: number;
}

export async function actualizarCompraRecurrente(
  spreadsheetId: string,
  compra: CompraRecurrente,
  cambios: CompraRecurrenteCambios,
): Promise<void> {
  await updateRecord(
    spreadsheetId,
    COMPRAS_RECURRENTES_SHEET,
    compra.row,
    serializeCompraRecurrente({
      ...compra,
      nombre: cambios.nombre,
      categoria: cambios.categoria,
      monto: cambios.monto,
      recurrencia: cambios.recurrencia,
      repiteCadaN: cambios.recurrencia === "Personalizado" ? cambios.repiteCadaN : 0,
    }),
  );
}

export async function eliminarCompraRecurrente(spreadsheetId: string, compra: CompraRecurrente): Promise<void> {
  await deleteRecord(spreadsheetId, COMPRAS_RECURRENTES_SHEET, compra.row);
}

/**
 * "Registrar ahora": crea la compra real (Pagado, con fecha/monto reales)
 * en GastosYCompras, como cualquier otro gasto ya realizado, y reinicia el
 * contador de la plantilla con el monto real como nueva referencia. Si en
 * cambio el usuario pospone, no se llama esta función — el contador sigue
 * igual y el recordatorio sigue apareciendo.
 */
export async function registrarCompraRecurrente(
  spreadsheetId: string,
  compra: CompraRecurrente,
  cambios: { monto: number; fecha: string },
): Promise<GastoYCompra> {
  const gasto = await crearGasto(spreadsheetId, {
    fecha: cambios.fecha,
    categoria: compra.categoria,
    nombre: compra.nombre,
    monto: cambios.monto,
    estado: "Pagado",
  });
  await updateRecord(
    spreadsheetId,
    COMPRAS_RECURRENTES_SHEET,
    compra.row,
    serializeCompraRecurrente({ ...compra, monto: cambios.monto, contadorPeriodos: 0 }),
  );
  return gasto;
}

/** Efecto del reinicio de periodo sobre Gastos y Compras: avanza el contador de cada plantilla en 1. */
export async function avanzarComprasRecurrentes(spreadsheetId: string): Promise<void> {
  const todas = await listComprasRecurrentes(spreadsheetId);
  for (const c of todas) {
    await updateRecord(spreadsheetId, COMPRAS_RECURRENTES_SHEET, c.row, serializeCompraRecurrente({ ...c, contadorPeriodos: c.contadorPeriodos + 1 }));
  }
}
