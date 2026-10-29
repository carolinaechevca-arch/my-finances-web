import { deleteFileIfExists, findFileByName } from "./drive";
import { appendRecords, deleteRecord, listRecords, updateRecord } from "./records";
import { addSheets, createSpreadsheet, getSheetNames, getValues, updateValues, type SheetDefinition } from "./sheets";

export const SPREADSHEET_TITLE = "MisFinanzas";

const SPREADSHEET_MIME = "application/vnd.google-apps.spreadsheet";

export const TIPOS_INGRESO_SHEET = "TiposIngreso";
export const INGRESOS_FIJOS_SHEET = "IngresosFijos";
/** Log de cambios de monto/activo de un ingreso "Fijo", para reconstruir cuánto aplicaba en meses pasados. */
export const HISTORIAL_INGRESOS_FIJOS_SHEET = "HistorialIngresosFijos";
/** Pagos de ingresos realmente recibidos, separados de su fuente/configuración. */
export const MOVIMIENTOS_INGRESOS_SHEET = "MovimientosIngresos";
export const GASTOS_FIJOS_SHEET = "GastosFijos";
export const GASTOS_Y_COMPRAS_SHEET = "GastosYCompras";
/** Categorías de Gastos Fijos. Independiente de CATEGORIAS_GASTOS_Y_COMPRAS_SHEET a propósito. */
export const CATEGORIAS_SHEET = "Categorias";
/** Categorías de Gastos y Compras. Misma mecánica que CATEGORIAS_SHEET pero una lista aparte. */
export const CATEGORIAS_GASTOS_Y_COMPRAS_SHEET = "CategoriasGastosYCompras";
/** Deudas propias (YoDebo) y de terceros (MeDeben) unificadas, distinguidas por la columna Direccion. */
export const DEUDAS_SHEET = "Deudas";
export const ABONOS_DEUDAS_SHEET = "AbonosDeudas";
/** Tipos de deuda (tarjeta, préstamo, etc.) — una lista independiente por Direccion (YoDebo/MeDeben). */
export const TIPOS_DEUDA_SHEET = "TiposDeuda";
/** Contrapartes (acreedores/deudores) conocidas — una lista independiente por Direccion (YoDebo/MeDeben). */
export const CONTRAPARTES_SHEET = "Contrapartes";
export const METAS_SHEET = "Metas";
export const MOVIMIENTOS_METAS_SHEET = "MovimientosMetas";
/** Tipos de meta de ahorro (viaje, tecnología, etc.), manejables igual que las categorías de gastos. */
export const TIPOS_METAS_SHEET = "TiposMetas";
/** Visibilidad/color/orden de las tarjetas del dashboard, editable desde Configuración → "Personalizar dashboard". */
export const CONFIG_DASHBOARD_SHEET = "ConfigDashboard";
/** Configuración del periodo manual y fecha del último reinicio. Una sola fila de datos. */
export const CONFIG_PERIODO_SHEET = "ConfigPeriodo";
/** Plantillas de compras recurrentes (Fijo/Personalizado) de Gastos y Compras — nunca obligatorias, ver spec-gastos-compras.md. */
export const COMPRAS_RECURRENTES_SHEET = "ComprasRecurrentes";
/** Un registro por cada reinicio manual ocurrido; permite a Histórico navegar periodos pasados con sus fechas reales. */
export const HISTORIAL_PERIODOS_SHEET = "HistorialPeriodos";

/**
 * Ids estables de las tarjetas del dashboard, en su orden por defecto.
 * No cambiar estos valores aunque cambien las etiquetas visibles: quedan
 * guardados como texto en ConfigDashboard y se usan para volver a mapear
 * cada fila a su tarjeta.
 */
export const DEFAULT_DASHBOARD_CARD_ORDER = [
  "balance",
  "alertas",
  "resumenGastosFijos",
  "resumenDeudas",
  "resumenMeDeben",
  "resumenAhorros",
  "gastosPorCategoria",
  "comparativoMesAnterior",
  "ultimosMovimientos",
  "cta",
  "hojaDrive",
] as const;

/** Categorías de ingreso con las que arranca toda cuenta nueva; el usuario puede agregar más. */
const DEFAULT_TIPOS_INGRESO = ["Nómina", "Trabajo independiente", "Regalo", "Otro", "Sobrante anterior"];
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
    headers: [
      "Categoria",
      "Monto",
      "Notas",
      "Recurrencia",
      "Mes",
      "Activo",
      "FechaCreacion",
      "Id",
      "Frecuencia",
      "DiaPago",
      "Cerrado",
      "ProximaFecha",
      "CuentaDestino",
      "Modelo",
      "Nombre",
    ],
  },
  {
    name: MOVIMIENTOS_INGRESOS_SHEET,
    headers: [
      "Id",
      "FuenteId",
      "FuenteNombre",
      "Categoria",
      "FechaEsperada",
      "FechaRecibida",
      "MontoEstimado",
      "MontoReal",
      "Estado",
      "Notas",
      "PeriodoId",
    ],
  },
  {
    name: HISTORIAL_INGRESOS_FIJOS_SHEET,
    headers: ["IdIngreso", "Fecha", "MontoAnterior", "MontoNuevo", "ActivoAnterior", "ActivoNuevo"],
  },
  {
    name: GASTOS_FIJOS_SHEET,
    headers: [
      "Nombre",
      "Monto",
      "DiaPago",
      "Categoria",
      "Mes",
      "Estado",
      "MontoPagado",
      "Id",
      "SerieId",
      "Recurrencia",
      "RepiteCadaN",
      "ContadorPeriodos",
      "Pausado",
      "PeriodoId",
      "Notas",
    ],
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
      "MontoOriginal",
      "MontoCuota",
      "NumCuotas",
      "DiaPago",
      "FechaInicio",
      "Notas",
      "Estado",
      "Modo",
    ],
  },
  {
    name: ABONOS_DEUDAS_SHEET,
    headers: ["IdDeuda", "Fecha", "Tipo", "Monto", "Nota"],
  },
  {
    name: METAS_SHEET,
    headers: ["Id", "Nombre", "MontoObjetivo", "FechaLimite", "Tipo", "Estado", "CompraVinculadaId", "FechaCreacion"],
  },
  {
    name: MOVIMIENTOS_METAS_SHEET,
    headers: ["IdMeta", "Fecha", "Tipo", "Monto", "Nota"],
  },
  { name: TIPOS_METAS_SHEET, headers: ["Nombre"] },
  { name: "PresupuestosCategoria", headers: ["Categoria", "LimiteMensual"] },
  { name: CATEGORIAS_SHEET, headers: ["Nombre"] },
  { name: CATEGORIAS_GASTOS_Y_COMPRAS_SHEET, headers: ["Nombre"] },
  { name: TIPOS_DEUDA_SHEET, headers: ["Nombre", "Direccion"] },
  { name: CONTRAPARTES_SHEET, headers: ["Nombre", "Direccion"] },
  { name: CONFIG_DASHBOARD_SHEET, headers: ["CardId", "Visible", "Color", "Orden"] },
  { name: CONFIG_PERIODO_SHEET, headers: ["Frecuencia", "FechaUltimoReinicio", "DiaInicioSemana"] },
  { name: HISTORIAL_PERIODOS_SHEET, headers: ["Fecha"] },
  {
    name: COMPRAS_RECURRENTES_SHEET,
    headers: ["Id", "Nombre", "Categoria", "Monto", "Recurrencia", "RepiteCadaN", "ContadorPeriodos"],
  },
];

let ensurePromise: Promise<{ spreadsheetId: string; created: boolean }> | null = null;

/**
 * Sube esto cada vez que se agregue una hoja/columna nueva a
 * SHEET_DEFINITIONS o un `ensure*` de migración nuevo. Se guarda junto con
 * el spreadsheetId en localStorage (ver `leerCache`/`guardarCache`): mientras
 * no cambie, `ensureSpreadsheet()` confía en que la Hoja ya está al día y se
 * salta las ~20 verificaciones (una llamada a Sheets cada una) que si no
 * corren en serie en cada carga de la app. Al subir la versión, todos los
 * usuarios corren la migración completa una vez más y vuelven a quedar
 * rápidos.
 */
const SCHEMA_VERSION = 7;
const CACHE_KEY = "mf_spreadsheet_cache";

interface SpreadsheetCache {
  spreadsheetId: string;
  schemaVersion: number;
}

function leerCache(): SpreadsheetCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SpreadsheetCache) : null;
  } catch {
    return null;
  }
}

function guardarCache(spreadsheetId: string): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ spreadsheetId, schemaVersion: SCHEMA_VERSION }));
  } catch {
    // Si localStorage no está disponible, no pasa nada grave: simplemente se vuelve a verificar cada vez.
  }
}

/** Se llama al cerrar sesión: evita que si luego alguien inicia sesión con otra cuenta de Google en el mismo navegador, herede el spreadsheetId de la cuenta anterior. */
export function limpiarCacheSpreadsheet(): void {
  ensurePromise = null;
  borrarCacheGuardada();
}

function borrarCacheGuardada(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Ignorado a propósito, ver comentario en guardarCache.
  }
}

/**
 * Elimina el spreadsheet asociado y crea uno nuevo desde cero. La creación
 * no busca archivos por nombre: siempre genera un archivo nuevo, incluso si
 * el anterior ya había sido eliminado manualmente desde Drive.
 */
export function recrearSpreadsheet(
  spreadsheetId: string,
  configDashboard: unknown[][] = [],
): Promise<{ spreadsheetId: string; created: true }> {
  const recreacionPromise = recrearSpreadsheetInternal(spreadsheetId, configDashboard).catch((err) => {
    ensurePromise = null;
    throw err;
  });
  ensurePromise = recreacionPromise;
  return recreacionPromise;
}

async function recrearSpreadsheetInternal(
  spreadsheetId: string,
  configDashboard: unknown[][],
): Promise<{ spreadsheetId: string; created: true }> {
  await deleteFileIfExists(spreadsheetId);
  borrarCacheGuardada();

  const nuevoSpreadsheetId = await crearSpreadsheetDesdeCero();
  if (configDashboard.length > 0) {
    await updateValues(nuevoSpreadsheetId, `${CONFIG_DASHBOARD_SHEET}!A2`, configDashboard);
  }
  guardarCache(nuevoSpreadsheetId);
  return { spreadsheetId: nuevoSpreadsheetId, created: true };
}

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
  const cache = leerCache();
  if (cache && cache.schemaVersion === SCHEMA_VERSION) {
    return { spreadsheetId: cache.spreadsheetId, created: false };
  }

  const existingId = await findFileByName(SPREADSHEET_TITLE, SPREADSHEET_MIME);
  if (existingId) {
    await ensureSheets(existingId);
    await ensureIngresosFijosHeaders(existingId);
    await ensureMovimientosIngresosHeaders(existingId);
    await ensureIngresosFijosIds(existingId);
    await ensureIngresosFijosFrecuencia(existingId);
    await ensureIngresosFijosCerrado(existingId);
    await ensureIngresosConCalendario(existingId);
    await ensureMovimientosIngresosMigracion(existingId);
    await ensureHistorialIngresosFijosHeaders(existingId);
    await ensureGastosFijosHeaders(existingId);
    await ensureGastosYComprasHeaders(existingId);
    await ensureGastosYComprasIds(existingId);
    await ensureDeudasHeaders(existingId);
    await ensureDeudasModo(existingId);
    await ensureMetasHeaders(existingId);
    await ensureDireccionEnListasDeuda(existingId);
    await ensureDefaultTipos(existingId);
    await ensureDefaultTiposDeuda(existingId);
    await ensureDefaultConfigDashboard(existingId);
    await ensureDefaultConfigPeriodo(existingId);
    await ensurePeriodoSoloManual(existingId);
    await ensureConfigPeriodoDiaSemana(existingId);
    await ensureDefaultHistorialPeriodos(existingId);
    await ensureMovimientosIngresosPeriodo(existingId);
    await ensureGastosFijosPeriodoColumnas(existingId);
    guardarCache(existingId);
    return { spreadsheetId: existingId, created: false };
  }
  const spreadsheetId = await crearSpreadsheetDesdeCero();
  guardarCache(spreadsheetId);
  return { spreadsheetId, created: true };
}

async function crearSpreadsheetDesdeCero(): Promise<string> {
  const spreadsheetId = await createSpreadsheet(SPREADSHEET_TITLE, SHEET_DEFINITIONS);
  await ensureDefaultTipos(spreadsheetId);
  await ensureDefaultTiposDeuda(spreadsheetId);
  await ensureDefaultConfigDashboard(spreadsheetId);
  await ensureDefaultConfigPeriodo(spreadsheetId);
  await ensureDefaultHistorialPeriodos(spreadsheetId);
  return spreadsheetId;
}

/**
 * Al estrenar el modelo fuente/movimiento, registra como recibido el ingreso
 * vigente que la versión anterior ya estaba contando en el periodo actual.
 * Solo corre cuando la hoja de movimientos todavía está vacía.
 */
async function ensureMovimientosIngresosMigracion(spreadsheetId: string): Promise<void> {
  const movimientos = await listRecords(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, 11);
  if (movimientos.length > 0) return;

  const ingresos = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 15);
  const [configPeriodo] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  const periodoInicio = configPeriodo?.values[1] || new Date().toISOString().slice(0, 10);
  const hoy = new Date().toISOString().slice(0, 10);
  const filas = ingresos
    .filter((r) => {
      const recurrencia = r.values[3] || "Fijo";
      const activo = (r.values[5] || "TRUE").toUpperCase() !== "FALSE";
      const cerrado = (r.values[10] || "").toUpperCase() === "TRUE";
      const esFuenteNueva = r.values[13] === "Fuente";
      return !esFuenteNueva && activo && (recurrencia === "Fijo" || !cerrado);
    })
    .map((r) => {
      const tipo = r.values[0] || "Ingreso";
      const monto = Number(r.values[1]) || 0;
      const fechaCreacion = r.values[6] || hoy;
      const fuenteId = r.values[7] || crypto.randomUUID();
      const nombre = r.values[14] || tipo;
      const fecha = fechaCreacion >= periodoInicio ? fechaCreacion : periodoInicio;
      return [
        crypto.randomUUID(),
        fuenteId,
        nombre,
        tipo,
        fecha,
        fecha,
        monto,
        monto,
        "Recibido",
        "Migrado automáticamente desde el modelo anterior.",
        periodoInicio,
      ];
    });
  if (filas.length > 0) await appendRecords(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, filas);
  for (const row of ingresos.filter(
    (r) => r.values[3] === "UnicoMes" && r.values[13] !== "Fuente" && (r.values[10] || "").toUpperCase() !== "TRUE",
  )) {
    const values = Array.from({ length: 15 }, (_, index) => row.values[index] ?? "");
    values[5] = "FALSE";
    values[10] = "TRUE";
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, values);
  }
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
  if (def.headers.every((header, index) => headerRow[index] === header)) return;
  await updateValues(spreadsheetId, `${INGRESOS_FIJOS_SHEET}!A1`, [def.headers]);
}

async function ensureMovimientosIngresosHeaders(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === MOVIMIENTOS_INGRESOS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${MOVIMIENTOS_INGRESOS_SHEET}!A1:Z1`);
  if (def.headers.every((header, index) => headerRow[index] === header)) return;
  await updateValues(spreadsheetId, `${MOVIMIENTOS_INGRESOS_SHEET}!A1`, [def.headers]);
}

/**
 * Vincula movimientos antiguos con el periodo que les corresponde. Desde
 * esta versión el identificador evita que un ingreso confirmado antes de un
 * reinicio el mismo día aparezca en el periodo nuevo.
 */
async function ensureMovimientosIngresosPeriodo(spreadsheetId: string): Promise<void> {
  const movimientos = await listRecords(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, 11);
  const pendientes = movimientos.filter((row) => !row.values[10]);
  if (pendientes.length === 0) return;

  const historial = (await listRecords(spreadsheetId, HISTORIAL_PERIODOS_SHEET, 1))
    .map((row) => row.values[0])
    .filter(Boolean)
    .sort();
  const [config] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  const periodoActual = config?.values[1] || new Date().toISOString().slice(0, 10);
  const inicios = historial.length > 0 ? historial : [periodoActual];

  for (const row of pendientes) {
    const values = Array.from({ length: 11 }, (_, index) => row.values[index] ?? "");
    const fecha = values[5] || values[4] || periodoActual;
    values[10] = [...inicios].reverse().find((inicio) => inicio <= fecha) || inicios[0] || periodoActual;
    await updateRecord(spreadsheetId, MOVIMIENTOS_INGRESOS_SHEET, row.row, values);
  }
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

/**
 * Agrega la columna "Frecuencia" a IngresosFijos (para ingresos quincenales o
 * semanales, no solo mensuales) y le rellena "Mensual" a cada fila que ya
 * exista y todavía no tenga una. Solo toca la columna nueva.
 */
async function ensureIngresosFijosFrecuencia(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 9);
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
      frecuencia = "",
    ] = row.values;
    if (frecuencia) continue;
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, [
      tipo,
      monto,
      notas,
      recurrencia,
      mes,
      activo,
      fechaCreacion,
      id,
      "Mensual",
    ]);
  }
}

/**
 * Agrega la columna "Cerrado" a IngresosFijos (marca un ingreso "Adicional"
 * como archivado al reiniciar el periodo, sin borrar la fila — ver
 * domain/periodo.ts) y le rellena "FALSE" a cada fila que ya exista y
 * todavía no tenga una. Solo toca la columna nueva.
 */
async function ensureIngresosFijosCerrado(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 11);
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
      frecuencia = "",
      diaPago = "",
      cerrado = "",
    ] = row.values;
    if (cerrado) continue;
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, [
      tipo,
      monto,
      notas,
      recurrencia,
      mes,
      activo,
      fechaCreacion,
      id,
      frecuencia,
      diaPago,
      "FALSE",
    ]);
  }
}

/**
 * Retira la modalidad Variable y conserva el ancla matemática de las fuentes
 * recurrentes: día del mes para Mensual y día de la semana para Semanal.
 * Así un mensual del 31 vuelve al 31 después de un mes corto.
 */
async function ensureIngresosConCalendario(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, INGRESOS_FIJOS_SHEET, 15);
  const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  for (const row of rows) {
    const values = Array.from({ length: 15 }, (_, index) => row.values[index] ?? "");
    const frecuencia = values[8];
    const proximaFecha = values[11];
    if (frecuencia === "Quincenal") {
      const texto = values[9].trim();
      const decimalConvertido = texto.match(/^(\d{1,2})[,.](\d)$/);
      const numeros = decimalConvertido && Number(decimalConvertido[1]) >= 10
        ? [Number(decimalConvertido[1]), Number(decimalConvertido[2]) * 10]
        : (texto.match(/\d{1,2}/g) ?? []).map(Number);
      const dias = numeros.filter((dia) => dia >= 1 && dia <= 31).slice(0, 2).sort((a, b) => a - b);
      const primero = dias[0] ?? 15;
      const segundo = dias[1] ?? 30;
      const estabaCorrupto = Boolean(decimalConvertido);
      values[9] = `D${primero}-D${segundo}`;

      if (estabaCorrupto && proximaFecha && Number(proximaFecha.slice(-2)) === Number(decimalConvertido![2])) {
        const hoy = new Date();
        const ultimoActual = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
        const candidatos = [Math.min(primero, ultimoActual), Math.min(segundo, ultimoActual)].sort((a, b) => a - b);
        const siguienteDia = candidatos.find((dia) => dia >= hoy.getDate());
        const siguienteMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
        const ultimoSiguiente = new Date(siguienteMes.getFullYear(), siguienteMes.getMonth() + 1, 0).getDate();
        const fecha = siguienteDia === undefined
          ? new Date(siguienteMes.getFullYear(), siguienteMes.getMonth(), Math.min(primero, ultimoSiguiente))
          : new Date(hoy.getFullYear(), hoy.getMonth(), siguienteDia);
        values[11] = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
      }
      await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, values);
      continue;
    }
    if (!proximaFecha || values[9] || (frecuencia !== "Mensual" && frecuencia !== "Semanal")) continue;
    const [anio, mes, dia] = proximaFecha.split("-").map(Number);
    if (!anio || !mes || !dia) continue;
    values[9] = frecuencia === "Mensual" ? String(dia) : diasSemana[new Date(anio, mes - 1, dia).getDay()];
    await updateRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row, values);
  }

  const variables = rows.filter((row) => row.values[8] === "Variable").sort((a, b) => b.row - a.row);
  for (const row of variables) await deleteRecord(spreadsheetId, INGRESOS_FIJOS_SHEET, row.row);
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
 * Agrega Id/SerieId/Recurrencia/RepiteCadaN/ContadorPeriodos/Pausado/PeriodoId
 * a GastosFijos (sistema de periodo, ver spec-gastos-fijos.md) y le rellena
 * un valor a cada fila que ya exista y todavía no tenga uno. Los gastos
 * fijos de antes de este cambio quedan como su propia serie "Fijo"
 * independiente, asignada al periodo actual (para que sigan apareciendo
 * como vigentes en vez de desaparecer de la vista tras la migración). No
 * hay forma de reconstruir con certeza cuáles eran "la misma serie" mes a
 * mes con el modelo anterior, así que cada fila vieja arranca su propia
 * serie desde cero.
 */
async function ensureGastosFijosPeriodoColumnas(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, GASTOS_FIJOS_SHEET, 14);
  const pendientes = rows.filter((r) => !r.values[7]);
  if (pendientes.length === 0) return;

  const [configRow] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 2);
  const periodoActualId = configRow?.values[1] || "";

  for (const row of pendientes) {
    const [nombre = "", monto = "", diaPago = "", categoria = "", mes = "", estado = "", montoPagado = ""] = row.values;
    const id = crypto.randomUUID();
    await updateRecord(spreadsheetId, GASTOS_FIJOS_SHEET, row.row, [
      nombre,
      monto,
      diaPago,
      categoria,
      mes,
      estado,
      montoPagado,
      id,
      id,
      "Fijo",
      "",
      0,
      "FALSE",
      periodoActualId,
    ]);
  }
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
 * Agrega la columna "Modo" a Deudas (Con cuotas / Deuda simple, ver
 * spec-deudas.md) y le rellena "Cuotas" a cada fila que ya exista y todavía
 * no tenga uno — todas las deudas de antes de este cambio se comportaban
 * como "Con cuotas", así que ese es el valor que preserva su comportamiento
 * exacto. Solo toca la columna nueva.
 */
async function ensureDeudasModo(spreadsheetId: string): Promise<void> {
  const def = SHEET_DEFINITIONS.find((s) => s.name === DEUDAS_SHEET)!;
  const [headerRow = []] = await getValues(spreadsheetId, `${DEUDAS_SHEET}!A1:Z1`);
  if (headerRow.length < def.headers.length) {
    await updateValues(spreadsheetId, `${DEUDAS_SHEET}!A1`, [def.headers]);
  }

  const rows = await listRecords(spreadsheetId, DEUDAS_SHEET, 12);
  for (const row of rows) {
    const [
      id = "",
      direccion = "",
      contraparte = "",
      tipo = "",
      montoOriginal = "",
      montoCuota = "",
      numCuotas = "",
      diaPago = "",
      fechaInicio = "",
      notas = "",
      estado = "",
      modo = "",
    ] = row.values;
    if (modo) continue;
    await updateRecord(spreadsheetId, DEUDAS_SHEET, row.row, [
      id,
      direccion,
      contraparte,
      tipo,
      montoOriginal,
      montoCuota,
      numCuotas,
      diaPago,
      fechaInicio,
      notas,
      estado,
      "Cuotas",
    ]);
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
  const existentes = new Set(rows.map((row) => row.values[0]));
  const faltantes = rows.length === 0
    ? DEFAULT_TIPOS_INGRESO
    : ["Sobrante anterior"].filter((nombre) => !existentes.has(nombre));
  if (faltantes.length === 0) return;
  await appendRecords(
    spreadsheetId,
    TIPOS_INGRESO_SHEET,
    faltantes.map((nombre) => [nombre]),
  );
}

/**
 * TiposDeuda y Contrapartes pasaron de ser compartidas entre Deudas y Me
 * Deben a tener una lista independiente por Direccion. Agrega la columna
 * "Direccion" al encabezado si falta, y a las filas viejas que no la tenían
 * les asigna "YoDebo" (su uso original) sin tocar el nombre.
 */
async function ensureDireccionEnListasDeuda(spreadsheetId: string): Promise<void> {
  for (const sheet of [TIPOS_DEUDA_SHEET, CONTRAPARTES_SHEET]) {
    const def = SHEET_DEFINITIONS.find((s) => s.name === sheet)!;
    const [headerRow = []] = await getValues(spreadsheetId, `${sheet}!A1:Z1`);
    if (headerRow.length < def.headers.length) {
      await updateValues(spreadsheetId, `${sheet}!A1`, [def.headers]);
    }

    const rows = await listRecords(spreadsheetId, sheet, 2);
    for (const row of rows) {
      const [nombre = "", direccion = ""] = row.values;
      if (direccion) continue;
      await updateRecord(spreadsheetId, sheet, row.row, [nombre, "YoDebo"]);
    }
  }
}

/**
 * Balance arranca en Primario (único caso especial), el resto de tarjetas en
 * Neutro. Solo agrega las filas de tarjetas que todavía no existan en la
 * hoja, para no pisar la personalización ya guardada si en el futuro se
 * agrega una tarjeta nueva a DEFAULT_DASHBOARD_CARD_ORDER.
 */
/** Siembra las tarjetas que falten en ConfigDashboard (todas si está vacía, o solo las nuevas). Exportada para que `listDashboardConfig` pueda autosanarse si la hoja quedó vacía por algún motivo (ej. un "Limpiar todo" de una versión anterior que sí la borraba). */
export async function ensureDefaultConfigDashboard(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, CONFIG_DASHBOARD_SHEET, 4);
  const existentes = new Set(rows.map((r) => r.values[0]));
  const faltantes = DEFAULT_DASHBOARD_CARD_ORDER.filter((id) => !existentes.has(id));
  if (faltantes.length === 0) return;
  let orden = rows.length;
  await appendRecords(
    spreadsheetId,
    CONFIG_DASHBOARD_SHEET,
    faltantes.map((cardId) => [cardId, "TRUE", cardId === "balance" ? "Primario" : "Neutro", orden++]),
  );
}

/** Arranca en modo manual y en el día 1 del periodo, usando hoy como fecha inicial. */
async function ensureDefaultConfigPeriodo(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  if (rows.length > 0) return;
  const hoy = new Date();
  const fechaInicial = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  await appendRecords(spreadsheetId, CONFIG_PERIODO_SHEET, [["Manual", fechaInicial, "1"]]);
}

/** Migra configuraciones anteriores: desde esta versión el reinicio es únicamente manual. */
async function ensurePeriodoSoloManual(spreadsheetId: string): Promise<void> {
  const [row] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  if (!row || row.values[0] === "Manual") return;
  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, row.row, ["Manual", row.values[1] ?? "", row.values[2] || "1"]);
}

/** Agrega "DiaInicioSemana" a ConfigPeriodo (día en que empieza la semana en modo Semanal, configurable) con "1" (lunes) por defecto si la fila ya existía sin esa columna. */
async function ensureConfigPeriodoDiaSemana(spreadsheetId: string): Promise<void> {
  const [headerRow = []] = await getValues(spreadsheetId, `${CONFIG_PERIODO_SHEET}!A1:Z1`);
  const def = SHEET_DEFINITIONS.find((s) => s.name === CONFIG_PERIODO_SHEET)!;
  if (headerRow.length < def.headers.length) {
    await updateValues(spreadsheetId, `${CONFIG_PERIODO_SHEET}!A1`, [def.headers]);
  }
  const [row] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  if (!row || row.values[2]) return;
  const [frecuencia = "Manual", fechaUltimoReinicio = ""] = row.values;
  await updateRecord(spreadsheetId, CONFIG_PERIODO_SHEET, row.row, [frecuencia, fechaUltimoReinicio, "1"]);
}

/** Siembra el registro inicial de HistorialPeriodos con la fecha ya guardada en ConfigPeriodo, si el log todavía está vacío (primera vez que corre esta versión). */
async function ensureDefaultHistorialPeriodos(spreadsheetId: string): Promise<void> {
  const rows = await listRecords(spreadsheetId, HISTORIAL_PERIODOS_SHEET, 1);
  if (rows.length > 0) return;
  const [configRow] = await listRecords(spreadsheetId, CONFIG_PERIODO_SHEET, 3);
  const fecha = configRow?.values[1];
  if (fecha) await appendRecords(spreadsheetId, HISTORIAL_PERIODOS_SHEET, [[fecha]]);
}

async function ensureDefaultTiposDeuda(spreadsheetId: string): Promise<void> {
  for (const direccion of ["YoDebo", "MeDeben"]) {
    const rows = await listRecords(spreadsheetId, TIPOS_DEUDA_SHEET, 2);
    if (rows.some((r) => r.values[1] === direccion)) continue;
    await appendRecords(
      spreadsheetId,
      TIPOS_DEUDA_SHEET,
      DEFAULT_TIPOS_DEUDA.map((nombre) => [nombre, direccion]),
    );
  }
}
