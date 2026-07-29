import chevronDownIcon from "../../icon/chevron-down.svg?raw";
import fileTimeIcon from "../../icon/file-time.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney } from "../../domain/format";
import {
  cargarSnapshotHistorico,
  descargarResumenAnualCSV,
  detallePeriodo,
  listAniosDisponibles,
  listPeriodosDisponibles,
  resumenAnual,
  resumenPeriodo,
  type DetalleItem,
  type HistoricoSnapshot,
} from "../../domain/historico";
import { formatPeriodoLabel, listHistorialPeriodos, type PeriodoHistorico } from "../../domain/periodo";

type CardKey = "ingresos" | "gastosFijos" | "gastosCompras" | "balance" | "ahorros" | "deudas" | "meDeben";

export async function renderHistorico(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${fileTimeIcon} Histórico</h1>
    </div>

    <div class="card" id="periodo-nav-card" style="margin-bottom:20px">
      <div class="mes-nav">
        <button type="button" class="btn-secondary" id="periodo-prev" aria-label="Periodo anterior">←</button>
        <span id="periodo-label" style="font-weight:700"></span>
        <button type="button" class="btn-secondary" id="periodo-next" aria-label="Periodo siguiente">→</button>
      </div>
    </div>

    <div id="resumen-periodo-grid" class="card-grid" style="margin-bottom:20px"></div>
    <div id="detalle-panel" style="margin-bottom:20px"></div>
    <p class="empty-state" id="resumen-periodo-nota" style="margin-top:0;margin-bottom:20px"></p>

    <div class="card">
      <div class="table-toolbar">
        <h2 style="margin:0">Resumen anual</h2>
        <div class="field field--inline">
          <label for="anio-select">Año</label>
          <select id="anio-select"></select>
        </div>
      </div>
      <div id="resumen-anual-grid" class="card-grid" style="margin-top:14px"></div>
      <div style="margin-top:16px">
        <h3 style="margin-bottom:8px">Facturas registradas</h3>
        <div id="facturas-list"></div>
      </div>
      <button type="button" class="btn" id="descargar-btn" style="margin-top:16px">⬇️ Descargar resumen anual (CSV)</button>
    </div>
  `;

  const periodoPrevBtn = container.querySelector<HTMLButtonElement>("#periodo-prev")!;
  const periodoNextBtn = container.querySelector<HTMLButtonElement>("#periodo-next")!;
  const periodoLabelEl = container.querySelector<HTMLSpanElement>("#periodo-label")!;
  const resumenPeriodoGrid = container.querySelector<HTMLDivElement>("#resumen-periodo-grid")!;
  const detallePanel = container.querySelector<HTMLDivElement>("#detalle-panel")!;
  const resumenPeriodoNota = container.querySelector<HTMLParagraphElement>("#resumen-periodo-nota")!;

  const anioSelect = container.querySelector<HTMLSelectElement>("#anio-select")!;
  const resumenAnualGrid = container.querySelector<HTMLDivElement>("#resumen-anual-grid")!;
  const facturasList = container.querySelector<HTMLDivElement>("#facturas-list")!;
  const descargarBtn = container.querySelector<HTMLButtonElement>("#descargar-btn")!;

  let spreadsheetId = "";
  let snapshot: HistoricoSnapshot | null = null;
  let periodosDisponibles: PeriodoHistorico[] = [];
  let periodoSeleccionado: PeriodoHistorico | null = null;
  let anioSeleccionado = "";
  let cardAbierta: CardKey | null = null;

  function renderResumenPeriodo(): void {
    if (!snapshot || !periodoSeleccionado) return;
    const r = resumenPeriodo(snapshot, periodoSeleccionado);
    const detalle = detallePeriodo(snapshot, periodoSeleccionado);

    const tarjetas: { key: CardKey; label: string; value: number; primary?: boolean; items: DetalleItem[] }[] = [
      { key: "ingresos", label: "Ingresos", value: r.ingresos, items: detalle.ingresos },
      { key: "gastosFijos", label: "Gastos fijos", value: r.gastosFijosTotal, items: detalle.gastosFijos },
      { key: "gastosCompras", label: "Gastos y compras", value: r.gastosVariables, items: detalle.gastosCompras },
      { key: "balance", label: "Balance del periodo", value: r.balance, primary: true, items: [] },
      { key: "ahorros", label: "Aportado a ahorros", value: r.aportadoAhorros, items: detalle.ahorros },
      { key: "deudas", label: "Abonado a deudas", value: r.abonadoDeudas, items: detalle.deudas },
      { key: "meDeben", label: "Recibido de Me Deben", value: r.recibidoMeDeben, items: detalle.meDeben },
    ];

    resumenPeriodoGrid.innerHTML = tarjetas
      .map(
        (t) => `
          <button type="button" class="card stat-card${t.primary ? " stat-card--primary" : ""}" data-card="${t.key}" style="cursor:${t.primary ? "default" : "pointer"};border:none;width:100%">
            <div class="stat-card__value">${formatMoney(t.value)}</div>
            <div class="stat-card__label">${t.label}</div>
            ${
              t.primary
                ? ""
                : `<span class="accordion-toggle${cardAbierta === t.key ? " is-open" : ""}" style="justify-content:center;margin-top:6px">${chevronDownIcon}</span>`
            }
          </button>
        `,
      )
      .join("");

    resumenPeriodoGrid.querySelectorAll<HTMLButtonElement>("[data-card]").forEach((btn) => {
      const key = btn.dataset.card as CardKey;
      if (key === "balance") return;
      btn.addEventListener("click", () => {
        cardAbierta = cardAbierta === key ? null : key;
        renderResumenPeriodo();
      });
    });

    const abierta = tarjetas.find((t) => t.key === cardAbierta);
    if (!abierta) {
      detallePanel.innerHTML = "";
    } else {
      detallePanel.innerHTML = `
        <div class="card">
          <h2 style="margin-top:0">Detalle de ${abierta.label}</h2>
          ${
            abierta.items.length === 0
              ? `<p class="empty-state">Sin movimientos en este periodo.</p>`
              : abierta.items
                  .map(
                    (it) => `
                      <div class="record-row">
                        <div class="record-row__main">
                          <span class="record-row__title">${it.nombre}</span>
                          ${it.nota ? `<span class="record-row__subtitle">${it.nota}</span>` : ""}
                        </div>
                        <div class="record-row__amount">${formatMoney(it.monto)}</div>
                      </div>
                    `,
                  )
                  .join("")
          }
        </div>
      `;
    }

    resumenPeriodoNota.textContent =
      r.gastosFijosTotal > 0
        ? `Gastos fijos: ${formatMoney(r.gastosFijosPagado)} pagados · ${formatMoney(r.gastosFijosPendiente)} pendientes en este periodo.`
        : "";
  }

  function renderResumenAnual(): void {
    if (!snapshot || !anioSeleccionado) return;
    const r = resumenAnual(snapshot, anioSeleccionado);
    resumenAnualGrid.innerHTML = `
      <div class="card stat-card"><div class="stat-card__value">${formatMoney(r.totalIngresos)}</div><div class="stat-card__label">Total ingresos</div></div>
      <div class="card stat-card"><div class="stat-card__value">${formatMoney(r.totalGastos)}</div><div class="stat-card__label">Total gastos</div></div>
      <div class="card stat-card"><div class="stat-card__value">${formatMoney(r.totalAhorrado)}</div><div class="stat-card__label">Total ahorrado</div></div>
      <div class="card stat-card"><div class="stat-card__value">${formatMoney(r.totalPagadoDeudas)}</div><div class="stat-card__label">Total pagado en deudas</div></div>
    `;

    if (r.facturas.length === 0) {
      facturasList.innerHTML = `<p class="empty-state">No hay facturas registradas en ${r.anio}.</p>`;
    } else {
      facturasList.innerHTML = `
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>Fecha</th><th>Nombre</th><th class="text-right">Monto</th><th>Factura</th></tr></thead>
            <tbody>
              ${r.facturas
                .map(
                  (f) => `
                    <tr>
                      <td data-label="Fecha">${f.fecha}</td>
                      <td data-label="Nombre">${f.nombre}</td>
                      <td data-label="Monto" class="text-right amount-cell">${formatMoney(f.monto)}</td>
                      <td data-label="Factura"><a href="${f.link}" target="_blank" rel="noopener">Ver</a></td>
                    </tr>
                  `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    descargarBtn.onclick = () => descargarResumenAnualCSV(r);
  }

  function renderAll(): void {
    renderResumenPeriodo();
    renderResumenAnual();
  }

  function actualizarNav(): void {
    if (!periodoSeleccionado) return;
    periodoLabelEl.textContent = formatPeriodoLabel(periodoSeleccionado);
    const idx = periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio);
    periodoPrevBtn.disabled = idx <= 0;
    periodoNextBtn.disabled = idx < 0 || idx >= periodosDisponibles.length - 1;
  }

  periodoPrevBtn.addEventListener("click", () => {
    if (!periodoSeleccionado) return;
    const idx = periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio);
    if (idx > 0) {
      periodoSeleccionado = periodosDisponibles[idx - 1];
      cardAbierta = null;
      actualizarNav();
      renderResumenPeriodo();
    }
  });
  periodoNextBtn.addEventListener("click", () => {
    if (!periodoSeleccionado) return;
    const idx = periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio);
    if (idx >= 0 && idx < periodosDisponibles.length - 1) {
      periodoSeleccionado = periodosDisponibles[idx + 1];
      cardAbierta = null;
      actualizarNav();
      renderResumenPeriodo();
    }
  });

  anioSelect.addEventListener("change", () => {
    anioSeleccionado = anioSelect.value;
    renderResumenAnual();
  });

  try {
    const ensured = await ensureSpreadsheet();
    spreadsheetId = ensured.spreadsheetId;
    const [snap, historialPeriodos] = await Promise.all([
      cargarSnapshotHistorico(spreadsheetId),
      listHistorialPeriodos(spreadsheetId),
    ]);
    snapshot = snap;
    periodosDisponibles = listPeriodosDisponibles(snap, historialPeriodos);
    periodoSeleccionado = periodosDisponibles[periodosDisponibles.length - 1];
    actualizarNav();

    const anios = listAniosDisponibles(snap);
    anioSelect.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join("");
    anioSeleccionado = anios[anios.length - 1] ?? "";

    renderAll();
  } catch (err) {
    resumenPeriodoGrid.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
