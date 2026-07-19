import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { agruparEventosPorDeuda, estadoAlerta, listDeudas, listTodosLosEventos } from "../../domain/deudas";
import { formatMonthLabel, formatMoney } from "../../domain/format";
import { listGastosFijosDelMes, sumGastosFijosTotal } from "../../domain/gastos";
import { listGastosDelMes, sumGastos as sumGastosYCompras } from "../../domain/gastos-y-compras";
import { listIngresosVigentes, sumIngresosActivos } from "../../domain/ingresos";

export async function renderDashboard(container: HTMLElement, onNavigate: (sectionId: string) => void): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">🏆 Resumen del Mes</h1>
      <span class="month-badge">${formatMonthLabel()}</span>
    </div>
    <div class="card-grid" id="stats-grid">
      <div class="card stat-card"><div class="stat-card__value" id="stat-ingresos">—</div><div class="stat-card__label">Ingresos fijos</div></div>
      <div class="card stat-card"><div class="stat-card__value" id="stat-gastos">—</div><div class="stat-card__label">Gastos del mes</div></div>
      <div class="card stat-card"><div class="stat-card__value" id="stat-balance">—</div><div class="stat-card__label">Me queda libre</div></div>
      <div class="card stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Ahorrado</div></div>
    </div>
    <div class="card" id="ingresos-cta-card" hidden style="margin-bottom:20px">
      <p class="empty-state" style="margin:0 0 12px">Aún no registras ningún ingreso fijo mensual.</p>
      <button type="button" class="btn" id="ingresos-cta-btn">➕ Agregar ingreso fijo</button>
    </div>
    <div class="card" id="deudas-alerta-card" hidden style="margin-bottom:20px; border-left: 4px solid var(--color-danger)">
      <p style="margin:0 0 12px" id="deudas-alerta-texto"></p>
      <button type="button" class="btn-secondary" id="deudas-alerta-btn">Ver deudas</button>
    </div>
    <div class="card" id="sheet-link-card">
      <h2 style="margin-top:0">🔗 Tu Hoja de Cálculo en Drive</h2>
      <p class="empty-state" id="sheet-status">Conectando con Google Sheets…</p>
    </div>
  `;

  const status = container.querySelector<HTMLParagraphElement>("#sheet-status")!;
  const card = container.querySelector<HTMLDivElement>("#sheet-link-card")!;
  const statIngresos = container.querySelector<HTMLDivElement>("#stat-ingresos")!;
  const statGastos = container.querySelector<HTMLDivElement>("#stat-gastos")!;
  const statBalance = container.querySelector<HTMLDivElement>("#stat-balance")!;
  const ctaCard = container.querySelector<HTMLDivElement>("#ingresos-cta-card")!;
  const ctaBtn = container.querySelector<HTMLButtonElement>("#ingresos-cta-btn")!;
  ctaBtn.addEventListener("click", () => onNavigate("ingresos"));

  const deudasAlertaCard = container.querySelector<HTMLDivElement>("#deudas-alerta-card")!;
  const deudasAlertaTexto = container.querySelector<HTMLParagraphElement>("#deudas-alerta-texto")!;
  const deudasAlertaBtn = container.querySelector<HTMLButtonElement>("#deudas-alerta-btn")!;
  let deudasAlertaDestino = "deudas";
  deudasAlertaBtn.addEventListener("click", () => onNavigate(deudasAlertaDestino));

  try {
    const { spreadsheetId, created } = await ensureSpreadsheet();
    status.remove();
    const link = document.createElement("a");
    link.className = "btn";
    link.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `📊 Abrir en Google Sheets`;
    card.appendChild(link);

    if (created) {
      const note = document.createElement("p");
      note.className = "empty-state";
      note.style.marginTop = "12px";
      note.textContent = "Se creó tu hoja de cálculo 'MisFinanzas' con todas las secciones.";
      card.appendChild(note);
    }

    const [ingresos, gastosFijos, gastosYCompras, deudasYoDebo, deudasMeDeben, eventosDeudas] = await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listGastosFijosDelMes(spreadsheetId),
      listGastosDelMes(spreadsheetId),
      listDeudas(spreadsheetId, "YoDebo"),
      listDeudas(spreadsheetId, "MeDeben"),
      listTodosLosEventos(spreadsheetId),
    ]);

    const totalIngresos = sumIngresosActivos(ingresos);
    const totalGastos = sumGastosFijosTotal(gastosFijos) + sumGastosYCompras(gastosYCompras);

    statIngresos.textContent = formatMoney(totalIngresos);
    statGastos.textContent = formatMoney(totalGastos);
    statBalance.textContent = formatMoney(totalIngresos - totalGastos);

    const eventosPorDeuda = agruparEventosPorDeuda(eventosDeudas);
    const vencidas = deudasYoDebo.filter((d) => estadoAlerta(d, eventosPorDeuda.get(d.id) ?? []) === "vencida").length;
    const proximas = deudasYoDebo.filter((d) => estadoAlerta(d, eventosPorDeuda.get(d.id) ?? []) === "proxima").length;
    const vencidasMeDeben = deudasMeDeben.filter(
      (d) => estadoAlerta(d, eventosPorDeuda.get(d.id) ?? []) === "vencida",
    ).length;

    if (vencidas > 0 || proximas > 0 || vencidasMeDeben > 0) {
      deudasAlertaCard.hidden = false;
      const partes: string[] = [];
      if (vencidas > 0) partes.push(`${vencidas} deuda${vencidas === 1 ? "" : "s"} tuya${vencidas === 1 ? "" : "s"} con pago vencido`);
      if (proximas > 0) partes.push(`${proximas} con pago próximo a vencer`);
      if (vencidasMeDeben > 0)
        partes.push(`${vencidasMeDeben} persona${vencidasMeDeben === 1 ? "" : "s"} que te debe con pago vencido`);
      deudasAlertaTexto.innerHTML = `⚠️ ${partes.join(" · ")}.`;
      deudasAlertaDestino = vencidas > 0 || proximas > 0 ? "deudas" : "me-deben";
    }

    if (ingresos.length === 0) {
      ctaCard.hidden = false;
    }
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "No se pudo conectar con Google Sheets.";
  }
}
