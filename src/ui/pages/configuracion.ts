import settingsIcon from "../../icon/settings.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  actualizarDashboardCard,
  DASHBOARD_CARD_LABELS,
  guardarOrdenDashboard,
  listDashboardConfig,
  restablecerDashboardConfig,
  type DashboardCardColor,
  type DashboardCardConfig,
} from "../../domain/dashboard-config";
import {
  guardarDiaInicioSemana,
  guardarFrecuenciaPeriodo,
  obtenerConfigPeriodo,
  type FrecuenciaPeriodo,
} from "../../domain/periodo";
import { showConfirm } from "../components/dialogs";
import { loaderHtml } from "../components/loader";

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/** Fila inmediatamente después de la posición `y` del mouse, para insertar el elemento arrastrado ahí. */
function filaDespuesDe(lista: HTMLElement, y: number): HTMLElement | null {
  const filas = [...lista.querySelectorAll<HTMLElement>(".dashboard-config-row:not(.is-dragging)")];
  return filas.reduce<{ offset: number; el: HTMLElement | null }>(
    (masCercana, fila) => {
      const box = fila.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      return offset < 0 && offset > masCercana.offset ? { offset, el: fila } : masCercana;
    },
    { offset: Number.NEGATIVE_INFINITY, el: null },
  ).el;
}

export async function renderConfiguracion(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">${settingsIcon} Configuración</h1>

    <div class="card" style="margin-bottom:20px">
      <div class="card__title">Periodo de la app</div>
      <p class="empty-state" style="margin:0 0 16px">
        Cada cuánto se reinicia el periodo (ingresos "Fijo" se reaplican solos, los "Adicional" se archivan). En modo Manual, el reinicio se dispara con un botón desde Inicio.
      </p>
      <div class="field" style="max-width:260px">
        <label for="periodo-frecuencia">Frecuencia</label>
        <select id="periodo-frecuencia">
          <option value="Semanal">Semanal</option>
          <option value="Quincenal">Quincenal</option>
          <option value="Mensual">Mensual</option>
          <option value="Manual">Manual</option>
        </select>
      </div>
      <div class="field" id="periodo-dia-semana-field" style="max-width:260px;margin-top:14px" hidden>
        <label for="periodo-dia-semana">¿Qué día empieza tu semana?</label>
        <select id="periodo-dia-semana">
          ${DIAS_SEMANA.map((d, i) => `<option value="${i}">${d}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="card">
      <div class="table-toolbar" style="margin-bottom:16px">
        <div class="card__title" style="margin-bottom:0">Personalizar dashboard</div>
        <button type="button" class="btn-secondary" id="restablecer-dashboard-btn">Restablecer a valores por defecto</button>
      </div>
      <p class="empty-state" style="margin:-8px 0 16px">
        Elige qué tarjetas se muestran en Inicio, su color y su orden. Arrastra desde el ícono <i class="bi bi-grip-vertical"></i> para reordenar.
      </p>
      <div class="dashboard-config-list" id="dashboard-config-list">
        ${loaderHtml()}
      </div>
    </div>
  `;

  const periodoSelect = container.querySelector<HTMLSelectElement>("#periodo-frecuencia")!;
  const diaSemanaField = container.querySelector<HTMLDivElement>("#periodo-dia-semana-field")!;
  const diaSemanaSelect = container.querySelector<HTMLSelectElement>("#periodo-dia-semana")!;
  const restablecerBtn = container.querySelector<HTMLButtonElement>("#restablecer-dashboard-btn")!;
  const listEl = container.querySelector<HTMLDivElement>("#dashboard-config-list")!;

  try {
    const { spreadsheetId } = await ensureSpreadsheet();
    const [configPeriodo, configsIniciales] = await Promise.all([
      obtenerConfigPeriodo(spreadsheetId),
      listDashboardConfig(spreadsheetId),
    ]);
    let configs = configsIniciales;

    periodoSelect.value = configPeriodo.frecuencia;
    diaSemanaSelect.value = String(configPeriodo.diaInicioSemana);
    diaSemanaField.hidden = configPeriodo.frecuencia !== "Semanal";
    periodoSelect.addEventListener("change", () => {
      diaSemanaField.hidden = periodoSelect.value !== "Semanal";
      void guardarFrecuenciaPeriodo(spreadsheetId, periodoSelect.value as FrecuenciaPeriodo);
    });
    diaSemanaSelect.addEventListener("change", () => {
      void guardarDiaInicioSemana(spreadsheetId, Number(diaSemanaSelect.value));
    });

    montarLista(listEl, spreadsheetId, configs);

    restablecerBtn.addEventListener("click", async () => {
      const ok = await showConfirm(
        "Todas las tarjetas vuelven a mostrarse, Balance en Primario y el resto en Neutro, en el orden original. ¿Restablecer?",
        { title: "Restablecer dashboard", confirmLabel: "Restablecer" },
      );
      if (!ok) return;
      configs = await restablecerDashboardConfig(spreadsheetId, configs);
      montarLista(listEl, spreadsheetId, configs);
    });
  } catch (err) {
    listEl.innerHTML = "";
    const p = document.createElement("p");
    p.className = "empty-state";
    p.textContent = err instanceof Error ? err.message : "No se pudo conectar con Google Sheets.";
    listEl.appendChild(p);
  }
}

function montarLista(listEl: HTMLDivElement, spreadsheetId: string, configs: DashboardCardConfig[]): void {
  listEl.innerHTML = "";

  for (const cfg of configs) {
    const row = document.createElement("div");
    row.className = "dashboard-config-row";
    row.draggable = true;
    row.dataset.cardId = cfg.cardId;
    row.innerHTML = `
      <span class="dashboard-config-row__grip"><i class="bi bi-grip-vertical"></i></span>
      <span class="dashboard-config-row__label">${DASHBOARD_CARD_LABELS[cfg.cardId]}</span>
      <div class="segmented" role="group" aria-label="Color">
        <button type="button" class="segmented__option${cfg.color === "Neutro" ? " is-active" : ""}" data-color="Neutro">Neutro</button>
        <button type="button" class="segmented__option${cfg.color === "Primario" ? " is-active" : ""}" data-color="Primario">Primario</button>
      </div>
      <button type="button" class="switch${cfg.visible ? " is-on" : ""}" aria-label="Mostrar u ocultar tarjeta"></button>
    `;
    listEl.appendChild(row);

    for (const btn of row.querySelectorAll<HTMLButtonElement>(".segmented__option")) {
      btn.addEventListener("click", () => {
        const color = btn.dataset.color as DashboardCardColor;
        if (color === cfg.color) return;
        cfg.color = color;
        for (const b of row.querySelectorAll<HTMLButtonElement>(".segmented__option")) {
          b.classList.toggle("is-active", b === btn);
        }
        void actualizarDashboardCard(spreadsheetId, cfg);
      });
    }

    const switchBtn = row.querySelector<HTMLButtonElement>(".switch")!;
    switchBtn.addEventListener("click", () => {
      cfg.visible = !cfg.visible;
      switchBtn.classList.toggle("is-on", cfg.visible);
      void actualizarDashboardCard(spreadsheetId, cfg);
    });

    row.addEventListener("dragstart", () => row.classList.add("is-dragging"));
    row.addEventListener("dragend", () => {
      row.classList.remove("is-dragging");
      const ordenNuevo = [...listEl.querySelectorAll<HTMLElement>(".dashboard-config-row")]
        .map((el) => configs.find((c) => c.cardId === el.dataset.cardId)!)
        .map((c, i) => ({ ...c, orden: i }));
      void guardarOrdenDashboard(spreadsheetId, ordenNuevo);
    });
  }

  listEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    const dragging = listEl.querySelector<HTMLElement>(".is-dragging");
    if (!dragging) return;
    const after = filaDespuesDe(listEl, e.clientY);
    if (after == null) listEl.appendChild(dragging);
    else listEl.insertBefore(dragging, after);
  });
}
