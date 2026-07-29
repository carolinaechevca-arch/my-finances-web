import { COMPRAS_RECURRENTES_SHEET } from "../api/spreadsheet-bootstrap";
import { appendRecord, deleteRecord, listRecords, updateRecord, type SheetRow } from "../api/records";
import { crearGasto, type EstadoGasto, type GastoYCompra } from "./gastos-y-compras";

/**
 * Plantilla de una compra que se repite (ej. champú, maquillaje): no tiene
 * fecha ni estado propios. Se guarda al marcar "Archivar" en el formulario y,
 * cuando el usuario decide que le toca comprarla de nuevo, se registra desde
 * aquí como un gasto real (pendiente o pagado) sin volver a escribir el
 * formulario — la plantilla se conserva para la próxima vez.
 */
export interface Archivado {
  row: number;
  id: string;
  nombre: string;
  categoria: string;
  monto: number;
}

function parseArchivado(r: SheetRow): Archivado {
  const [id = "", nombre = "", categoria = "", monto = "0"] = r.values;
  return { row: r.row, id, nombre, categoria, monto: Number(monto) || 0 };
}

function serializeArchivado(a: Archivado): unknown[] {
  return [a.id, a.nombre, a.categoria, a.monto, "", "", ""];
}

export async function listArchivados(spreadsheetId: string): Promise<Archivado[]> {
  const rows = await listRecords(spreadsheetId, COMPRAS_RECURRENTES_SHEET, 7);
  return rows.map(parseArchivado);
}

export interface NuevoArchivado {
  nombre: string;
  categoria: string;
  monto: number;
}

export async function crearArchivado(spreadsheetId: string, nuevo: NuevoArchivado): Promise<void> {
  const id = crypto.randomUUID();
  await appendRecord(spreadsheetId, COMPRAS_RECURRENTES_SHEET, serializeArchivado({ row: 0, id, ...nuevo }));
}

export interface ArchivadoCambios {
  nombre: string;
  categoria: string;
  monto: number;
}

export async function actualizarArchivado(spreadsheetId: string, a: Archivado, cambios: ArchivadoCambios): Promise<void> {
  await updateRecord(spreadsheetId, COMPRAS_RECURRENTES_SHEET, a.row, serializeArchivado({ ...a, ...cambios }));
}

export async function eliminarArchivado(spreadsheetId: string, a: Archivado): Promise<void> {
  await deleteRecord(spreadsheetId, COMPRAS_RECURRENTES_SHEET, a.row);
}

/** Registra el archivado como un gasto real (pendiente o pagado), conservando la plantilla para reutilizarla luego. */
export async function registrarArchivado(
  spreadsheetId: string,
  a: Archivado,
  cambios: { monto: number; fecha: string; estado: EstadoGasto },
): Promise<GastoYCompra> {
  return crearGasto(spreadsheetId, {
    fecha: cambios.fecha,
    categoria: a.categoria,
    nombre: a.nombre,
    monto: cambios.monto,
    estado: cambios.estado,
  });
}
