import settingsIcon from "../../icon/settings.svg?raw";
import { ensureSpreadsheet, limpiarTodosLosDatos } from "../../api/spreadsheet-bootstrap";
import { calcularDisponible } from "../../domain/balance";
import {
  actualizarDashboardCard,
  DASHBOARD_CARD_LABELS,
  guardarOrdenDashboard,
  listDashboardConfig,
  restablecerDashboardConfig,
  type DashboardCardColor,
  type DashboardCardConfig,
} from "../../domain/dashboard-config";
import { crearTipoDeuda, eliminarTipoDeuda, listTiposDeuda } from "../../domain/deudas";
import { todayISO } from "../../domain/format";
import {
  crearCategoria as crearCategoriaGastoFijo,
  eliminarCategoria as eliminarCategoriaGastoFijo,
  listCategorias as listCategoriasGastoFijo,
} from "../../domain/gastos";
import {
  crearCategoria as crearCategoriaGastoCompra,
  eliminarCategoria as eliminarCategoriaGastoCompra,
  listCategorias as listCategoriasGastoCompra,
} from "../../domain/gastos-y-compras";
import { crearTipoIngreso, eliminarTipoIngreso, listTiposIngreso } from "../../domain/ingresos";
import { cargarSnapshotHistorico, descargarHistoricoCompletoCSV } from "../../domain/historico";
import { crearTipoMeta, eliminarTipoMeta, listTiposMeta } from "../../domain/metas";
import {
  ejecutarReinicioPeriodo,
  guardarDiaInicioSemana,
  guardarFrecuenciaPeriodo,
  obtenerConfigPeriodo,
  type FrecuenciaPeriodo,
} from "../../domain/periodo";
import type { AuthUser } from "../../auth/google-auth";
import { showAlert, showConfirm, showTraspasoNegativoDialog } from "../components/dialogs";
import { loaderHtml } from "../components/loader";
import { getThemeMode, setThemeMode, type ThemeMode } from "../theme-toggle";

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

export async function renderConfiguracion(container: HTMLElement, user: AuthUser, onLogout: () => Promise<void>): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">${settingsIcon} Configuración</h1>

    <div class="card" style="margin-bottom:20px">
      <div class="card__title">Periodo de la app</div>
      <p class="empty-state" style="margin:0 0 16px">
        Cada cuánto se reinicia el periodo (ingresos "Fijo" se reaplican solos, los "Adicional" se archivan). En modo Manual, el reinicio se dispara con el botón de abajo.
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
      <div id="periodo-reinicio-row" style="margin-top:16px;display:flex;align-items:center;gap:10px" hidden>
        <button type="button" class="btn" id="reiniciar-periodo-btn">Reiniciar periodo</button>
        <button type="button" class="btn-secondary" id="forzar-reinicio-btn" hidden style="font-size:12px;padding:6px 12px">Forzar reinicio de todas formas</button>
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

    <div class="card" style="margin-top:20px">
      <div class="card__title">Preferencias de la app</div>
      <div class="field" style="max-width:260px">
        <label for="tema-select">Tema</label>
        <select id="tema-select">
          <option value="auto">Automático (según el sistema)</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </div>
      <p class="empty-state" style="margin:14px 0 0">Moneda: Peso colombiano (COP)</p>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card__title">Categorías y tipos</div>
      <p class="empty-state" style="margin:0 0 16px">
        Gestiona en un solo lugar las categorías y tipos que usas en cada módulo.
      </p>
      <div id="categorias-tipos-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:24px">
        ${loaderHtml()}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card__title">Tu cuenta</div>
      <p class="empty-state" style="margin:0 0 12px">Sesión iniciada como <strong id="cuenta-email" style="color:var(--color-text)"></strong></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <a href="#" target="_blank" rel="noopener" class="btn-secondary" id="cuenta-sheet-link" style="text-decoration:none" hidden>Abrir Hoja de Cálculo en Drive</a>
        <button type="button" class="btn-secondary" id="cuenta-logout-btn">Cerrar sesión</button>
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card__title">Datos</div>
      <p class="empty-state" style="margin:0 0 16px">
        Exporta todo tu historial (todos los años con datos) a un solo archivo CSV.
      </p>
      <button type="button" class="btn-secondary" id="exportar-todo-btn">⬇️ Exportar todo el histórico (CSV)</button>
    </div>

    <div class="card" style="margin-top:20px;border:1px solid var(--color-danger)">
      <div class="card__title" style="color:var(--color-danger)">Zona peligrosa</div>
      <p class="empty-state" style="margin:0 0 16px">
        Borra todos tus ingresos, gastos fijos, gastos y compras, deudas, abonos, ahorros, categorías y tipos, y restablece los valores por defecto. Esta acción no se puede deshacer.
      </p>
      <button type="button" class="btn-danger" id="limpiar-todo-btn">Limpiar todo</button>
    </div>
  `;

  const periodoSelect = container.querySelector<HTMLSelectElement>("#periodo-frecuencia")!;
  const diaSemanaField = container.querySelector<HTMLDivElement>("#periodo-dia-semana-field")!;
  const diaSemanaSelect = container.querySelector<HTMLSelectElement>("#periodo-dia-semana")!;
  const reinicioRow = container.querySelector<HTMLDivElement>("#periodo-reinicio-row")!;
  const reiniciarPeriodoBtn = container.querySelector<HTMLButtonElement>("#reiniciar-periodo-btn")!;
  const forzarReinicioBtn = container.querySelector<HTMLButtonElement>("#forzar-reinicio-btn")!;
  const restablecerBtn = container.querySelector<HTMLButtonElement>("#restablecer-dashboard-btn")!;
  const listEl = container.querySelector<HTMLDivElement>("#dashboard-config-list")!;
  const limpiarTodoBtn = container.querySelector<HTMLButtonElement>("#limpiar-todo-btn")!;
  const categoriasTiposGrid = container.querySelector<HTMLDivElement>("#categorias-tipos-grid")!;
  const cuentaEmail = container.querySelector<HTMLElement>("#cuenta-email")!;
  const cuentaSheetLink = container.querySelector<HTMLAnchorElement>("#cuenta-sheet-link")!;
  const cuentaLogoutBtn = container.querySelector<HTMLButtonElement>("#cuenta-logout-btn")!;
  const exportarTodoBtn = container.querySelector<HTMLButtonElement>("#exportar-todo-btn")!;

  const temaSelect = container.querySelector<HTMLSelectElement>("#tema-select")!;
  temaSelect.value = getThemeMode();
  temaSelect.addEventListener("change", () => {
    setThemeMode(temaSelect.value as ThemeMode);
  });

  cuentaEmail.textContent = user.email;
  cuentaLogoutBtn.addEventListener("click", () => void onLogout());

  try {
    const { spreadsheetId } = await ensureSpreadsheet();
    cuentaSheetLink.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    cuentaSheetLink.hidden = false;
    exportarTodoBtn.addEventListener("click", async () => {
      exportarTodoBtn.disabled = true;
      try {
        const snap = await cargarSnapshotHistorico(spreadsheetId);
        descargarHistoricoCompletoCSV(snap);
      } catch (err) {
        await showAlert(err instanceof Error ? err.message : "No se pudo exportar el histórico.", "Error");
      } finally {
        exportarTodoBtn.disabled = false;
      }
    });

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

    if (configPeriodo.frecuencia === "Manual") {
      reinicioRow.hidden = false;
      const yaReinicioHoy = configPeriodo.fechaUltimoReinicio === todayISO();

      async function correrReinicio(): Promise<void> {
        const { disponible } = await calcularDisponible(spreadsheetId, configPeriodo.fechaUltimoReinicio);
        const ok = await showConfirm(
          "Esto reaplica tus ingresos \"Fijo\" y archiva los \"Adicional\" del periodo que termina. ¿Reiniciar el periodo ahora?",
          { title: "Reiniciar periodo", confirmLabel: "Reiniciar" },
        );
        if (!ok) return;

        let traspasoDeficit: "adicional" | "deuda" = "adicional";
        if (disponible < 0) {
          const eleccion = await showTraspasoNegativoDialog(Math.abs(disponible));
          if (eleccion === null) return;
          traspasoDeficit = eleccion;
        }

        reiniciarPeriodoBtn.disabled = true;
        forzarReinicioBtn.disabled = true;
        try {
          await ejecutarReinicioPeriodo(spreadsheetId, todayISO(), traspasoDeficit);
          await renderConfiguracion(container, user, onLogout);
        } catch (err) {
          reiniciarPeriodoBtn.disabled = false;
          forzarReinicioBtn.disabled = false;
          await showAlert(
            err instanceof Error ? err.message : "No se pudo reiniciar el periodo.",
            "Error al reiniciar el periodo",
          );
        }
      }

      if (yaReinicioHoy) {
        reiniciarPeriodoBtn.disabled = true;
        reiniciarPeriodoBtn.className = "btn-secondary";
        reiniciarPeriodoBtn.textContent = "Ya reiniciaste hoy";
        reiniciarPeriodoBtn.title = "Solo se puede reiniciar el periodo una vez por día — vuelve a intentarlo mañana.";
        forzarReinicioBtn.hidden = false;
        forzarReinicioBtn.addEventListener("click", async () => {
          const ok = await showConfirm(
            "Ya reiniciaste el periodo hoy. Reiniciarlo otra vez el mismo día puede contar abonos/gastos de hoy dos veces en el cálculo de disponible. ¿Reiniciar de todas formas?",
            { title: "Forzar reinicio", confirmLabel: "Sí, forzar", danger: true },
          );
          if (!ok) return;
          await correrReinicio();
        });
      } else {
        reiniciarPeriodoBtn.addEventListener("click", correrReinicio);
      }
    }

    montarLista(listEl, spreadsheetId, configs);
    void montarCategoriasTipos(categoriasTiposGrid, spreadsheetId);

    restablecerBtn.addEventListener("click", async () => {
      const ok = await showConfirm(
        "Todas las tarjetas vuelven a mostrarse, Balance en Primario y el resto en Neutro, en el orden original. ¿Restablecer?",
        { title: "Restablecer dashboard", confirmLabel: "Restablecer" },
      );
      if (!ok) return;
      configs = await restablecerDashboardConfig(spreadsheetId, configs);
      montarLista(listEl, spreadsheetId, configs);
    });

    limpiarTodoBtn.addEventListener("click", async () => {
      const ok = await showConfirm(
        "Esto borra TODOS tus datos — ingresos, gastos fijos, gastos y compras, deudas, abonos, ahorros, categorías y tipos — y restablece los valores por defecto. No se puede deshacer.",
        { title: "Limpiar todo", confirmLabel: "Sí, borrar todo", danger: true },
      );
      if (!ok) return;
      limpiarTodoBtn.disabled = true;
      try {
        await limpiarTodosLosDatos(spreadsheetId);
        await renderConfiguracion(container, user, onLogout);
      } catch (err) {
        limpiarTodoBtn.disabled = false;
        await showAlert(err instanceof Error ? err.message : "No se pudo limpiar los datos.", "Error");
      }
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

interface ListaSimpleConfig {
  titulo: string;
  listar: () => Promise<string[]>;
  crear: (nombre: string) => Promise<void>;
  eliminar: (nombre: string) => Promise<void>;
}

/** Monta las 6 listas simples (crear/borrar) que hoy están dispersas por cada módulo, centralizadas aquí. */
async function montarCategoriasTipos(grid: HTMLDivElement, spreadsheetId: string): Promise<void> {
  const listas: ListaSimpleConfig[] = [
    {
      titulo: "Tipos de ingreso",
      listar: () => listTiposIngreso(spreadsheetId),
      crear: (n) => crearTipoIngreso(spreadsheetId, n),
      eliminar: (n) => eliminarTipoIngreso(spreadsheetId, n),
    },
    {
      titulo: "Categorías de gastos fijos",
      listar: () => listCategoriasGastoFijo(spreadsheetId),
      crear: (n) => crearCategoriaGastoFijo(spreadsheetId, n),
      eliminar: (n) => eliminarCategoriaGastoFijo(spreadsheetId, n),
    },
    {
      titulo: "Categorías de gastos y compras",
      listar: () => listCategoriasGastoCompra(spreadsheetId),
      crear: (n) => crearCategoriaGastoCompra(spreadsheetId, n),
      eliminar: (n) => eliminarCategoriaGastoCompra(spreadsheetId, n),
    },
    {
      titulo: "Tipos de deuda (Yo debo)",
      listar: () => listTiposDeuda(spreadsheetId, "YoDebo"),
      crear: (n) => crearTipoDeuda(spreadsheetId, "YoDebo", n),
      eliminar: (n) => eliminarTipoDeuda(spreadsheetId, "YoDebo", n),
    },
    {
      titulo: "Tipos de deuda (Me deben)",
      listar: () => listTiposDeuda(spreadsheetId, "MeDeben"),
      crear: (n) => crearTipoDeuda(spreadsheetId, "MeDeben", n),
      eliminar: (n) => eliminarTipoDeuda(spreadsheetId, "MeDeben", n),
    },
    {
      titulo: "Tipos de meta",
      listar: () => listTiposMeta(spreadsheetId),
      crear: (n) => crearTipoMeta(spreadsheetId, n),
      eliminar: (n) => eliminarTipoMeta(spreadsheetId, n),
    },
  ];

  grid.innerHTML = "";
  for (const cfg of listas) {
    const section = document.createElement("div");
    grid.appendChild(section);
    void montarListaSimple(section, cfg);
  }
}

async function montarListaSimple(section: HTMLDivElement, cfg: ListaSimpleConfig): Promise<void> {
  section.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;font-size:14px">${cfg.titulo}</div>
    <div class="chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;min-height:26px"></div>
    <div style="display:flex;gap:6px">
      <input type="text" placeholder="Nuevo…" style="flex:1;min-width:0;padding:9px 12px;border-radius:var(--radius-sm);border:1px solid var(--color-border);background:var(--color-bg);color:var(--color-text);font-size:14px;font-family:inherit" />
      <button type="button" class="btn-secondary" style="padding:8px 12px;font-size:12px;white-space:nowrap">Agregar</button>
    </div>
    <p class="empty-state" hidden style="margin:6px 0 0;color:var(--color-danger)"></p>
  `;
  const chipsEl = section.querySelector<HTMLDivElement>(".chips")!;
  const input = section.querySelector<HTMLInputElement>("input")!;
  const addBtn = section.querySelector<HTMLButtonElement>("button")!;
  const errorEl = section.querySelector<HTMLParagraphElement>("p")!;

  let items: string[] = [];

  function renderChips(): void {
    if (items.length === 0) {
      chipsEl.innerHTML = `<span class="empty-state" style="font-size:12px">Sin elementos.</span>`;
      return;
    }
    chipsEl.innerHTML = items
      .map(
        (nombre) => `
          <span class="badge" style="display:inline-flex;align-items:center;gap:4px;padding:4px 4px 4px 10px">
            ${nombre}
            <button type="button" data-nombre="${nombre}" aria-label="Eliminar ${nombre}" title="Eliminar" style="border:none;background:transparent;cursor:pointer;color:inherit;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px">×</button>
          </span>
        `,
      )
      .join("");
    chipsEl.querySelectorAll<HTMLButtonElement>("[data-nombre]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nombre = btn.dataset.nombre!;
        const ok = await showConfirm(`¿Eliminar "${nombre}"?`, { title: "Eliminar", confirmLabel: "Eliminar", danger: true });
        if (!ok) return;
        errorEl.hidden = true;
        try {
          await cfg.eliminar(nombre);
          await reload();
        } catch (err) {
          errorEl.hidden = false;
          errorEl.textContent = err instanceof Error ? err.message : "No se pudo eliminar.";
        }
      });
    });
  }

  async function reload(): Promise<void> {
    items = await cfg.listar();
    renderChips();
  }

  addBtn.addEventListener("click", async () => {
    const nombre = input.value.trim();
    if (!nombre) return;
    errorEl.hidden = true;
    addBtn.disabled = true;
    try {
      await cfg.crear(nombre);
      input.value = "";
      await reload();
    } catch (err) {
      errorEl.hidden = false;
      errorEl.textContent = err instanceof Error ? err.message : "No se pudo crear.";
    } finally {
      addBtn.disabled = false;
    }
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addBtn.click();
    }
  });

  await reload();
}
