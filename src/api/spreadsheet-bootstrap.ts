import { findFileByName } from "./drive";
import { appendRecords, listRecords, updateRecord } from "./records";
import { addSheets, createSpreadsheet, getSheetNames, getValues, updateValues, type SheetDefinition } from "./sheets";

export const SPREADSHEET_TITLE = "MisFinanzas";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

export const TIPOS_INGRESO_SHEET = "TiposIngreso";
export const INGRESOS_FIJOS_SHEET = "IngresosFijos";
/** Log de cambios de monto/activo de un ingreso "Fijo", para reconstruir cuánto aplicaba en meses pasados. */
export const HISTORIAL_INGRESOS_FIJOS_SHEET = "HistorialIngresosFijos";
export const GASTOS_FIJOS_SHEET = "GastosFijos";
export const GASTOS_Y_COMPRAS_SHEET = "GastosYCompras";
/** Categorías de Gastos Fijos. Independiente de CATEGORIAS_GASTOS_Y_COMPRAS_SHEET a propósito. */
export const CATEGORIAS_SHEET = "Categorias";
/** Categorías de Gastos y Compras. Misma mecánica que CATEGORIAS_SHEET pero una lista aparte. */
export const CATEGORIAS_GASTOS_Y_COMPRAS_SHEET = "CategoriasGastosYCompras";
/** Deudas propias (YoDebo) y de terceros (MeDeben) unificadas, distinguidas por la columna Direccion. */
export const DEUDAS_SHEET = "Deudas";
export const ABONOS_DEUDAS_SHEET = "AbonosDeudas";
/** Tipos de deuda (tarjeta, préstamo, etc.), compartidos entre Deudas y Me Deben. */
export const TIPOS_DEUDA_SHEET = "TiposDeuda";
/** Contrapartes (acreedores/deudores) conocidas, compartidas entre Deudas y Me Deben. */
export const CONTRAPARTES_SHEET = "Contrapartes";
export const METAS_SHEET = "Metas";
export const MOVIMIENTOS_METAS_SHEET = "MovimientosMetas";

/** Tipos de ingreso fijo con los que arranca toda cuenta nueva; el usuario puede agregar más. */
const DEFAULT_TIPOS_INGRESO = ["Nómina", "Trabajo independiente", "Regalo", "Otro"];
/** Tipos de deuda con los que arranca toda cuenta nueva; el usuario puede agregar/eliminar más. */
const DEFAULT_TIPOS_DEUDA = [
  "Tarjeta de crédito",
  "Préstamo personal",
  "Préstamo bancario",
  "Crédito informal",
  "Hipoteca",
  "Otro",
];

/** Definición de todas las hojas del spreadsheet y sus encabezados. */
export const SHEET_DEFINITIONS: SheetDefinition[] = [
  { name: "Nomina_Ingresos", headers: ["Fecha", "Fuente", "Monto", "Notas"] },
  { name: TIPOS_INGRESO_SHEET, headers: ["Nombre"] },
  {
    name: INGRESOS_FIJOS_SHEET,
    headers: ["Tipo", "Monto", "Notas", "Recurrencia", "Mes", "Activo", "FechaCreacion", "Id"],
  },
  {
    name: HISTORIAL_INGRESOS_FIJOS_SHEET,
    headers: ["IdIngreso", "Fecha", "MontoAnterior", "MontoNuevo", "ActivoAnterior", "ActivoNuevo"],
  },
  {
    name: GASTOS_FIJOS_SHEET,
    headers: ["Nombre", "Monto", "DiaPago", "Categoria", "Mes", "Estado", "MontoPagado"],
  },
  {
    name: "Suscripciones",
    headers: ["Nombre", "Monto", "Ciclo", "ProximaFecha", "Categoria", "Activa"],
  },
  {
    name: GASTOS_Y_COMPRAS_SHEET,
    headers: ["Fecha", "Categoria", "Nombre", "Monto", "Estado", "LinkFactura", "Id"],
  },
  {
    name: "Facturas",
    headers: ["Fecha", "Proveedor", "Monto", "Categoria", "LinkDrive", "DeducibleRenta"],
  },
  {
    name: DEUDAS_SHEET,
    headers: [
      "Id",
      "Direccion",
      "Contraparte",
      "Tipo",
      "MontoDeuda",
      "MontoCuota",
      "NumCuotas",
      "DiaPago",
      "FechaInicio",
      "Notas",
      "Estado",
    ],
  },
  {
    name: ABONOS_DEUDAS_SHEET,
    headers: ["IdDeuda", "Fecha", "Tipo", "Monto", "Nota"],
  },
  {
    name: METAS_SHEET,
    headers: [
      "Id",
      "Nombre",
      "MontoObjetivo",
      "FechaLimite",
      "Icono",
      "Estado",
      "EsFondoEmergencia",
      "AporteAutoActivo",
      "AporteAutoMonto",
      "AporteAutoFrecuencia",
      "AporteAutoUltimaFecha",
      "TasaRendimiento",
      "CompraVinculadaId",
      "FechaCreacion",
    ],
  },
  {
    name: MOVIMIENTOS_METAS_SHEET,
    headers: ["IdMeta", "Fecha", "Tipo", "Monto", "Nota"],
  },
  { name: "PresupuestosCategoria", headers: ["Categoria", "LimiteMensual"] },
  { name: CATEGORIAS_SHEET, headers: ["Nombre"] },
  { name: CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, headers: ["Nombre"] },
  { name: TIPOS_DEUDA_SHEET, headers: ["Nombre"] },
  { name: CONTRAPARTES_SHEET, headers: ["Nombre"] },
];

let ensurePromise: Promise<{ spreadsheetId: string; created: boolean }> | null = null;

/**
 * Busca el spreadsheet "MisFinanzas" en el Drive del usuario; si no existe,
 * lo crea con todas las hojas y encabezados. Si ya existe pero le faltan
 * hojas (porque se agregaron después, como Ingresos), las completa sin
 * tocar las que ya tienen datos. Devuelve su ID.
 *
 * Cachea la promesa en curso: si dos páginas la llaman casi al mismo tiempo
 * (ej. Inicio y luego Ingresos al navegar rápido), comparten la misma
 * ejecución en vez de correr el seed de tipos por duplicado.
 */
export function ensureSpreadsheet(): Promise<{ spreadsheetId: string; created: boolean }> {
  if (!ensurePromise) {
    ensurePromise = ensureSpreadsheetInternal().catch((err) => {
      ensurePromise = null;
      throw err;
    });
  }
  return ensurePromise;
}

async function ensureSpreadsheetInternal(): Promise<{ spreadsheetId: string; created: boolean }> {
  const existingId = await findFileByName(SPREADSHEET_TITLE, SPREADSHEET_MIME);
  if (existingId) {
    await ensureSheets(existingId);
    await ensureIngresosFijosHeaders(existingId);
    await ensureIngresosFijosIds(existingId);
    await ensureHistorialIngresosFijosHeaders(existingId);
    await ensureGastosFijosHeaders(existingId);
    await ensureGastosYComprasHeaders(existingId);
    await ensureGastosYComprasIds(existingId);
    await ensureDeudasHeaders(existingId);
    await ensureMetasHeaders(existingId);
    await ensureDefaultTipos(existingId);
    await ensureDefaultTiposDeuda(existingId);
    return { spreadsheetId: existingId, created: false };
  }
  const spreadsheetId = await createSpreadsheet(SPREADSHEET_TITLE, SHEET_DEFINITIONS);
  await ensureDefaultTipos(spreadsheetId);
  await ensureDefaultTiposDeuda(spreadsheetId);
  return { spreadsheetId, created: true };
}

async function ensureSheets(spreadsheetId: string): Promise<void> {
  const existingNames = new Set(await getSheetNames(spreadsheetId));
  const missing = SHEET_DEFINITIONS.filter((s) => !existingNames.has(s.name));
  await addSheets(spreadsheetId, missing);
}

/**
 * Si IngresosFijos ya existía con un encabezado más corto (sin
 * Recurrencia/Mes/Activo/FechaCreacion, o sin el Id agregado después), lo
 * completa. Solo toca la fila 1 (encabezados), nunca las filas de datos.
 */
async function ensureIngresosFijosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === INGRESOS_FIJOS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${INGRESOS_FIJOS_SHEET}!A1:Z1`);
  if (headerRow.length >= def.headers.length) return;
  await updateValues(spreadsheetId, `${INGRESOS_FIJOS_SHEET}!A1`, [def.headers]);
}

/**
 * Agrega la columna "Id" a IngresosFijos (para vincular su historial de
 * cambios de forma confiable) y le rellena un id único a cada fila que ya
 * exista y todavía no tenga uno. Solo toca la columna nueva.
 */
async function ensureIngresosFijosIds(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 8);
  for (const row of rows) {
    const [
      tipo = "",
      monto = "",
      notas = "",
      recurrencia = "",
      mes = "",
      activo = "",
      fechaCreacion = "",
      id = "",
    ] = row.values;
    if (id) continue;
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, [
      tipo,
      monto,
      notas,
      recurrencia,
      mes,
      activo,
      fechaCreacion,
      crypto.randomUUID(),
    ]);
  }
}

/** Deja el encabezado de HistorialIngresosFijos solo si todavía no tiene filas de datos. */
async function ensureHistorialIngresosFijosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === HISTORIAL_INGRESOS_FIJOS_SHEET)!;
  const rows = await listRecords(spreadsheetId, HISTORIAL_INGRESOS_FIJOS_SHEET, 1);
  if (rows.length === 0) {
    await updateValues(spreadsheetId, `${HISTORIAL_INGRESOS_FIJOS_SHEET}!A1`, [def.headers]);
  }
}

/**
 * Si GastosFijos ya existía sin la columna MontoPagado, la agrega al
 * encabezado. Solo toca la fila 1 (encabezados), nunca las filas de datos,
 * así que es seguro aunque ya haya gastos registrados.
 */
async function ensureGastosFijosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === GASTOS_FIJOS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${GASTOS_FIJOS_SHEET}!A1:Z1`);
  if (headerRow.length >= def.headers.length) return;
  await updateValues(spreadsheetId, `${GASTOS_FIJOS_SHEET}!A1`, [def.headers]);
}

/**
 * Renombra el encabezado "Descripcion" de GastosYCompras a "Nombre" (mismo
 * significado, solo cambia el texto de la columna). Solo toca la fila 1.
 */
async function ensureGastosYComprasHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === GASTOS_Y_COMPRAS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${GASTOS_Y_COMPRAS_SHEET}!A1:Z1`);
  if (headerRow.join() === def.headers.join()) return;
  await updateValues(spreadsheetId, `${GASTOS_Y_COMPRAS_SHEET}!A1`, [def.headers]);
}

/**
 * Deudas/AbonosDeudas tenían un esquema viejo mucho más chico (sin
 * Direccion, interés, etc.). Reescribe el encabezado solo si la hoja
 * todavía no tiene filas de datos, para no dejar datos reales bajo
 * columnas que ya no significan lo mismo.
 */
async function ensureDeudasHeaders(spreadsheetId: string): Promise<void> {
  const deudasDef = SHEET_DEFINITIONS.find((s) => s.name === DEUDAS_SHEET)!;
  const deudasRows = await listRecords(spreadsheetId, DEUDAS_SHEET, 1);
  if (deudasRows.length === 0) {
    await updateValues(spreadsheetId, `${DEUDAS_SHEET}!A1`, [deudasDef.headers]);
  }

  const abonosDef = SHEET_DEFINITIONS.find((s) => s.name === ABONOS_DEUDAS_SHEET)!;
  const abonosRows = await listRecords(spreadsheetId, ABONOS_DEUDAS_SHEET, 1);
  if (abonosRows.length === 0) {
    await updateValues(spreadsheetId, `${ABONOS_DEUDAS_SHEET}!A1`, [abonosDef.headers]);
  }
}

/**
 * Agrega la columna "Id" a GastosYCompras (para vincular una compra con una
 * meta de ahorro de forma confiable) y le rellena un id único a cada fila
 * que ya exista y todavía no tenga uno. Solo toca la columna nueva; no
 * modifica fecha/categoría/nombre/monto/estado/factura de ninguna fila.
 */
async function ensureGastosYComprasIds(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, 7);
  for (const row of rows) {
    const [fecha = "", categoria = "", nombre = "", monto = "", estado = "", linkFactura = "", id = ""] = row.values;
    if (id) continue;
    await updateRecord(spreadsheetId, GASTOS_Y_COMPRAS_SHEET, row.row, [
      fecha,
      categoria,
      nombre,
      monto,
      estado,
      linkFactura,
      crypto.randomUUID(),
    ]);
  }
}

/** Deja el encabezado de Metas/MovimientosMetas solo si todavía no tienen filas de datos. */
async function ensureMetasHeaders(spreadsheetId: string): Promise<void> {
  const metasDef = SHEET_DEFINITIONS.find((s) => s.name === METAS_SHEET)!;
  const metasRows = await listRecords(spreadsheetId, METAS_SHEET, 1);
  if (metasRows.length === 0) {
    await updateValues(spreadsheetId, `${METAS_SHEET}!A1`, [metasDef.headers]);
  }

  const movDef = SHEET_DEFINITIONS.find((s) => s.name === MOVIMIENTOS_METAS_SHEET)!;
  const movRows = await listRecords(spreadsheetId, MOVIMIENTOS_METAS_SHEET, 1);
  if (movRows.length === 0) {
    await updateValues(spreadsheetId, `${MOVIMIENTOS_METAS_SHEET}!A1`, [movDef.headers]);
  }
}

async function ensureDefaultTipos(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_INGRESO_SHEET, 1);
  if (rows.length > 0) return;
  await appendRecords(
    spreadsheetId,
    TIPOS_INGRESO_SHEET,
    DEFAULT_TIPOS_INGRESO.map((nombre) => [nombre]),
  );
}

async function ensureDefaultTiposDeuda(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, TIPOS_DEUDA_SHEET, 1);
  if (rows.length > 0) return;
  await appendRecords(
    spreadsheetId,
    TIPOS_DEUDA_SHEET,
    DEFAULT_TIPOS_DEUDA.map((nombre) => [nombre]),
  );
}
