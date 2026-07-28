import { CONFIG_DASHBOARD_SHEET, DEFAULT_DASHBOARD_CARD_ORDER } from "../api/spreadsheet-bootstrap";
import { listRecords, updateRecord, type SheetRow } from "../api/records";

export type DashboardCardId = (typeof DEFAULT_DASHBOARD_CARD_ORDER)[number];
export type DashboardCardColor = "Primario" | "Neutro";

export interface DashboardCardConfig {
  row: number;
  cardId: DashboardCardId;
  visible: boolean;
  color: DashboardCardColor;
  orden: number;
}

/** Etiquetas legibles de cada tarjeta, para el panel "Personalizar dashboard" en Configuración. */
export const DASHBOARD_CARD_LABELS: Record<DashboardCardId, string> = {
  balance: "Balance",
  alertas: "Alertas",
  resumenGastosFijos: "Resumen de Gastos Fijos",
  resumenDeudas: "Resumen de Deudas",
  resumenMeDeben: "Resumen de Me Deben",
  resumenAhorros: "Resumen de Ahorros y Metas",
  gastosPorCategoria: "Gastos del mes por categoría",
  comparativoMesAnterior: "Comparativo",
  ultimosMovimientos: "Últimos movimientos",
  cta: "Invitación a agregar ingreso",
  hojaDrive: "Tu Hoja de Cálculo en Drive",
};

function esDashboardCardId(value: string): value is DashboardCardId {
  return (DEFAULT_DASHBOARD_CARD_ORDER as readonly string[]).includes(value);
}

function parseConfig(r: SheetRow): DashboardCardConfig | null {
  const [cardId = "", visible = "TRUE", color = "Neutro", orden = "0"] = r.values;
  if (!esDashboardCardId(cardId)) return null;
  return {
    row: r.row,
    cardId,
    visible: visible.toUpperCase() !== "FALSE",
    color: color === "Primario" ? "Primario" : "Neutro",
    orden: Number(orden) || 0,
  };
}

/** Config de las 11 tarjetas del dashboard, ordenadas según "orden". Asume que ensureSpreadsheet ya sembró los valores por defecto. */
export async function listDashboardConfig(spreadsheetId: string): Promise<DashboardCardConfig[]> {
  const rows = await listRecords(spreadsheetId, CONFIG_DASHBOARD_SHEET, 4);
  const configs = rows.map(parseConfig).filter((c): c is DashboardCardConfig => c !== null);
  return configs.sort((a, b) => a.orden - b.orden);
}

/** Guarda visibilidad y/o color de una tarjeta puntual. */
export async function actualizarDashboardCard(spreadsheetId: string, config: DashboardCardConfig): Promise<void> {
  await updateRecord(spreadsheetId, CONFIG_DASHBOARD_SHEET, config.row, [
    config.cardId,
    config.visible ? "TRUE" : "FALSE",
    config.color,
    config.orden,
  ]);
}

/** Reescribe el campo "orden" de todas las tarjetas según su posición en el arreglo (resultado de un drag & drop). */
export async function guardarOrdenDashboard(spreadsheetId: string, configs: DashboardCardConfig[]): Promise<void> {
  for (let i = 0; i < configs.length; i++) {
    const cfg = configs[i];
    if (cfg.orden === i) continue;
    await updateRecord(spreadsheetId, CONFIG_DASHBOARD_SHEET, cfg.row, [cfg.cardId, cfg.visible ? "TRUE" : "FALSE", cfg.color, i]);
  }
}

/** Vuelve las 11 tarjetas a sus valores por defecto: todas visibles, Balance en Primario, el resto en Neutro, orden original. */
export async function restablecerDashboardConfig(
  spreadsheetId: string,
  configs: DashboardCardConfig[],
): Promise<DashboardCardConfig[]> {
  const restablecidos = configs
    .map((cfg) => ({
      ...cfg,
      visible: true,
      color: (cfg.cardId === "balance" ? "Primario" : "Neutro") as DashboardCardColor,
      orden: DEFAULT_DASHBOARD_CARD_ORDER.indexOf(cfg.cardId),
    }))
    .sort((a, b) => a.orden - b.orden);

  for (const cfg of restablecidos) {
    await updateRecord(spreadsheetId, CONFIG_DASHBOARD_SHEET, cfg.row, [cfg.cardId, "TRUE", cfg.color, cfg.orden]);
  }
  return restablecidos;
}
