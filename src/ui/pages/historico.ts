import fileTimeIcon from "../../icon/file-time.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney } from "../../domain/format";
import {
  cargarSnapshotHistorico,
  descargarResumenAnualCSV,
  listAniosDisponibles,
  listCategoriasHistoricas,
  listPeriodosDisponibles,
  patrimonioNetoSeriePeriodos,
  resumenAnual,
  resumenPeriodo,
  seriePeriodoCategoria,
  seriePeriodos,
  ultimosPeriodos,
  type HistoricoSnapshot,
} from "../../domain/historico";
import { formatPeriodoLabel, formatPeriodoLabelCorto, listHistorialPeriodos, type PeriodoHistorico } from "../../domain/periodo";
import { renderBarChart, renderLineChart } from "../components/charts";

type Rango = 3 | 6 | 12 | "todo";

export async function renderHistorico(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${fileTimeIcon} Histórico</h1>
    </div>
    <div class="card" id="periodo-nav-card" style="margin-bottom:20px">
      <div class="mes-nav">
        <button type="button" class="btn-secondary" id="periodo-prev" aria-label="Periodo anterior">←</button>
        <select id="periodo-select"></select>
        <button type="button" class="btn-secondary" id="periodo-next" aria-label="Periodo siguiente">→</button>
      </div>
    </div>

    <div id="resumen-periodo-grid" class="card-grid" style="margin-bottom:8px"></div>
    <p class="empty-state" id="resumen-periodo-nota" style="margin-top:0;margin-bottom:20px"></p>

    <div class="card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">Ingresos vs. Gastos vs. Ahorro</h2>
        <div class="field field--inline">
          <label for="rango-select">Rango</label>
          <select id="rango-select">
            <option value="3">Últimos 3 periodos</option>
            <option value="6" selected>Últimos 6 periodos</option>
            <option value="12">Últimos 12 periodos</option>
            <option value="todo">Todo el historial</option>
          </select>
        </div>
      </div>
      <div id="comparativa-chart"></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Evolución del patrimonio neto</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Total ahorrado en metas menos deudas pendientes, periodo a periodo.</p>
      <div id="patrimonio-chart"></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">Histórico por categoría</h2>
        <div class="field field--inline">
          <label for="categoria-select">Categoría</label>
          <select id="categoria-select"></select>
        </div>
      </div>
      <div id="categoria-chart"></div>
    </div>

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
  const periodoSelect = container.querySelector<HTMLSelectElement>("#periodo-select")!;
  const resumenPeriodoGrid = container.querySelector<HTMLDivElement>("#resumen-periodo-grid")!;
  const resumenPeriodoNota = container.querySelector<HTMLParagraphElement>("#resumen-periodo-nota")!;

  const rangoSelect = container.querySelector<HTMLSelectElement>("#rango-select")!;
  const comparativaChart = container.querySelector<HTMLDivElement>("#comparativa-chart")!;
  const patrimonioChart = container.querySelector<HTMLDivElement>("#patrimonio-chart")!;

  const categoriaSelect = container.querySelector<HTMLSelectElement>("#categoria-select")!;
  const categoriaChart = container.querySelector<HTMLDivElement>("#categoria-chart")!;

  const anioSelect = container.querySelector<HTMLSelectElement>("#anio-select")!;
  const resumenAnualGrid = container.querySelector<HTMLDivElement>("#resumen-anual-grid")!;
  const facturasList = container.querySelector<HTMLDivElement>("#facturas-list")!;
  const descargarBtn = container.querySelector<HTMLButtonElement>("#descargar-btn")!;

  let spreadsheetId = "";
  let snapshot: HistoricoSnapshot | null = null;
  let periodosDisponibles: PeriodoHistorico[] = [];
  let periodoSeleccionado: PeriodoHistorico | null = null;
  let rango: Rango = 6;
  let categoriaSeleccionada = "";
  let anioSeleccionado = "";

  function renderResumenPeriodo(): void {
    if (!snapshot || !periodoSeleccionado) return;
    const r = resumenPeriodo(snapshot, periodoSeleccionado);
    const tarjetas: { label: string; value: string; primary?: boolean }[] = [
      { label: "Ingresos", value: formatMoney(r.ingresos) },
      { label: "Gastos fijos", value: formatMoney(r.gastosFijosTotal) },
      { label: "Gastos y compras", value: formatMoney(r.gastosVariables) },
      { label: "Balance del periodo", value: formatMoney(r.balance), primary: true },
      { label: "Aportado a ahorros", value: formatMoney(r.aportadoAhorros) },
      { label: "Abonado a deudas", value: formatMoney(r.abonadoDeudas) },
      { label: "Recibido de Me Deben", value: formatMoney(r.recibidoMeDeben) },
    ];
    resumenPeriodoGrid.innerHTML = tarjetas
      .map(
        (t) => `
          <div class="card stat-card${t.primary ? " stat-card--primary" : ""}">
            <div class="stat-card__value">${t.value}</div>
            <div class="stat-card__label">${t.label}</div>
          </div>
        `,
      )
      .join("");

    resumenPeriodoNota.textContent =
      r.gastosFijosTotal > 0
        ? `Gastos fijos: ${formatMoney(r.gastosFijosPagado)} pagados · ${formatMoney(r.gastosFijosPendiente)} pendientes en ese momento.`
        : "";
  }

  function renderComparativa(): void {
    if (!snapshot || !periodoSeleccionado) return;
    const periodos = ultimosPeriodos(periodosDisponibles, periodoSeleccionado, rango);
    const serie = seriePeriodos(snapshot, periodos);
    renderBarChart(
      comparativaChart,
      periodos.map((p) => formatPeriodoLabelCorto(p)),
      [
        { nombre: "Ingresos", color: "var(--color-success, #2f9e58)", valores: serie.map((p) => p.ingresos) },
        { nombre: "Gastos", color: "var(--color-danger)", valores: serie.map((p) => p.gastos) },
        { nombre: "Ahorro", color: "var(--color-primary)", valores: serie.map((p) => p.ahorro) },
      ],
    );
  }

  function renderPatrimonio(): void {
    if (!snapshot) return;
    const serie = patrimonioNetoSeriePeriodos(snapshot, periodosDisponibles);
    renderLineChart(
      patrimonioChart,
      periodosDisponibles.map((p) => formatPeriodoLabelCorto(p)),
      serie.map((p) => p.patrimonio),
      "var(--color-primary)",
    );
  }

  function renderCategoria(): void {
    if (!snapshot || !categoriaSeleccionada || !periodoSeleccionado) {
      categoriaChart.innerHTML = `<p class="empty-state">Aún no tienes gastos categorizados.</p>`;
      return;
    }
    const periodos = ultimosPeriodos(periodosDisponibles, periodoSeleccionado, rango);
    const serie = seriePeriodoCategoria(snapshot, categoriaSeleccionada, periodos);
    renderBarChart(
      categoriaChart,
      periodos.map((p) => formatPeriodoLabelCorto(p)),
      [{ nombre: categoriaSeleccionada, color: "var(--color-primary)", valores: serie.map((p) => p.monto) }],
    );
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
    renderComparativa();
    renderPatrimonio();
    renderCategoria();
    renderResumenAnual();
  }

  function poblarPeriodoSelect(): void {
    periodoSelect.innerHTML = periodosDisponibles
      .map((p) => `<option value="${p.inicio}">${formatPeriodoLabel(p)}</option>`)
      .join("");
    if (periodoSeleccionado) periodoSelect.value = periodoSeleccionado.inicio;
    const idx = periodoSeleccionado ? periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio) : -1;
    periodoPrevBtn.disabled = idx <= 0;
    periodoNextBtn.disabled = idx < 0 || idx >= periodosDisponibles.length - 1;
  }

  periodoSelect.addEventListener("change", () => {
    periodoSeleccionado = periodosDisponibles.find((p) => p.inicio === periodoSelect.value) ?? periodoSeleccionado;
    poblarPeriodoSelect();
    renderAll();
  });
  periodoPrevBtn.addEventListener("click", () => {
    if (!periodoSeleccionado) return;
    const idx = periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio);
    if (idx > 0) {
      periodoSeleccionado = periodosDisponibles[idx - 1];
      poblarPeriodoSelect();
      renderAll();
    }
  });
  periodoNextBtn.addEventListener("click", () => {
    if (!periodoSeleccionado) return;
    const idx = periodosDisponibles.findIndex((p) => p.inicio === periodoSeleccionado!.inicio);
    if (idx >= 0 && idx < periodosDisponibles.length - 1) {
      periodoSeleccionado = periodosDisponibles[idx + 1];
      poblarPeriodoSelect();
      renderAll();
    }
  });

  rangoSelect.addEventListener("change", () => {
    rango = rangoSelect.value === "todo" ? "todo" : (Number(rangoSelect.value) as Rango);
    renderComparativa();
    renderCategoria();
  });

  categoriaSelect.addEventListener("change", () => {
    categoriaSeleccionada = categoriaSelect.value;
    renderCategoria();
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
    poblarPeriodoSelect();

    const categorias = listCategoriasHistoricas(snap);
    categoriaSelect.innerHTML = categorias.map((c) => `<option value="${c}">${c}</option>`).join("");
    categoriaSeleccionada = categorias[0] ?? "";

    const anios = listAniosDisponibles(snap);
    anioSelect.innerHTML = anios.map((a) => `<option value="${a}">${a}</option>`).join("");
    anioSeleccionado = anios[anios.length - 1] ?? "";

    renderAll();
  } catch (err) {
    resumenPeriodoGrid.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
