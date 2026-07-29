import chevronDownIcon from "../../icon/chevron-down.svg?raw";
import deviceFloppyIcon from "../../icon/device-floppy.svg?raw";
import editIcon from "../../icon/edit.svg?raw";
import eyeIcon from "../../icon/eye.svg?raw";
import shoppingCartIcon from "../../icon/shopping-cart.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { uploadGastoFactura } from "../../api/drive";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  actualizarArchivado,
  crearArchivado,
  eliminarArchivado,
  listArchivados,
  registrarArchivado,
  type Archivado,
} from "../../domain/archivados";
import {
  actualizarGasto,
  adjuntarFactura,
  crearCategoria,
  crearGasto,
  eliminarCategoria,
  eliminarGasto,
  filtrarAhorrando,
  filtrarGastosDelMes,
  filtrarGastosDelPeriodo,
  filtrarPendientes,
  listCategorias,
  listTodosLosGastos,
  marcarComoAhorrando,
  marcarComoPagado,
  sumGastos,
  type EstadoGasto,
  type GastoYCompra,
} from "../../domain/gastos-y-compras";
import { formatMonthLabel, formatMoney, parseDateInput, todayISO } from "../../domain/format";
import { crearMeta } from "../../domain/metas";
import { formatPeriodoBadge, obtenerConfigPeriodo } from "../../domain/periodo";
import { showAlert, showCompletarGastoDialog, showConfirm, showConvertirMetaDialog } from "../components/dialogs";
import { loaderHtml } from "../components/loader";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5" /></svg>`;

export async function renderGastosPersonales(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${shoppingCartIcon} Gastos y Compras</h1>
      <span class="month-badge" id="periodo-badge">Cargando…</span>
    </div>
    <div class="card-grid" style="max-width:560px">
      <div class="card" style="background:var(--color-primary);color:white;display:flex;flex-direction:column;gap:8px">
        <span style="font-size:14px;font-weight:600;opacity:0.85">Gastado en el periodo</span>
        <div style="font-size:32px;font-weight:800" id="gc-total-periodo">—</div>
      </div>
      <div class="card" style="display:flex;flex-direction:column;gap:8px">
        <span class="empty-state" style="font-weight:600">Pendientes</span>
        <div style="font-size:28px;font-weight:800;color:var(--color-danger)" id="gc-pendientes-total">—</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar gasto o compra</h2>
      <form id="gasto-form" class="form">
        <div class="field"><label for="gc-fecha">Fecha</label><input id="gc-fecha" type="date" value="${todayISO()}" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="gc-categoria-mount"></div>
        </div>
        <div class="field"><label for="gc-nombre">Nombre</label><input id="gc-nombre" type="text" placeholder="Ej. Mercado Éxito" required /></div>
        <div class="field"><label for="gc-monto">Monto</label><input id="gc-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field">
          <div class="segmented" id="gc-pendiente-toggle">
            <button type="button" class="segmented__btn" data-value="Pendiente">Pendiente</button>
            <button type="button" class="segmented__btn" data-value="Pagado">Ya lo pagué</button>
          </div>
        </div>
        <div class="field">
          <label>Archivar</label>
          <button type="button" class="archive-toggle" id="gc-archivar-toggle" title="Archivar para agregarla la próxima vez">
            <span class="archive-toggle__box" id="gc-archivar-box"></span>
          </button>
        </div>
        <button type="submit" class="btn" id="gasto-submit-btn">${deviceFloppyIcon} Guardar</button>
      </form>
      <p class="empty-state" id="gasto-form-error" hidden></p>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Pendientes</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Compras planeadas que aún no se han hecho. Se mantienen aquí mes a mes hasta que las marques como realizadas.</p>
      <div id="pendientes-list">${loaderHtml()}</div>
    </div>

    <div class="card" id="archivados-card" style="margin-bottom:20px" hidden>
      <div class="accordion-header" style="margin-bottom:0">
        <button type="button" class="accordion-toggle" id="archivados-toggle">
          ${chevronDownIcon}
          <h2 style="margin:0">Archivados</h2>
        </button>
      </div>
      <div id="archivados-body" hidden>
        <p class="empty-state" style="margin-top:12px;margin-bottom:14px">Compras que haces normalmente, guardadas para la próxima vez.</p>
        <div id="archivados-list"></div>
      </div>
    </div>

    <div class="card" id="ahorrando-card" style="margin-bottom:20px" hidden>
      <h2 style="margin-top:0">Ahorrando para estas compras</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Ya no cuentan como pendientes: se están gestionando como metas de ahorro. Aporta y márcalas como pagadas desde Ahorros y Metas.</p>
      <div id="ahorrando-list"></div>
    </div>

    <div class="card">
      <div class="accordion-header">
        <button type="button" class="accordion-toggle" id="historial-toggle">
          ${chevronDownIcon}
          <h2 style="margin:0">Historial — ${formatMonthLabel()}</h2>
        </button>
        <div class="field field--inline">
          <label for="gc-filtro-categoria">Categoría</label>
          <select id="gc-filtro-categoria">
            <option value="">Todas</option>
          </select>
        </div>
      </div>
      <div id="historial-body" hidden>
        <div id="gc-list">${loaderHtml()}</div>
      </div>
    </div>

    <input type="file" id="factura-input" accept="image/*,application/pdf" capture="environment" hidden />

    <dialog id="categoria-modal" class="modal">
      <form class="modal__form" id="categoria-form">
        <h2 class="modal__title">Nueva categoría</h2>
        <div class="field">
          <label for="categoria-modal-input">Nombre</label>
          <input id="categoria-modal-input" type="text" placeholder="Ej. Comida" required />
        </div>
        <p class="empty-state" id="categoria-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="categoria-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Agregar</button>
        </div>
      </form>
    </dialog>

    <dialog id="edit-modal" class="modal">
      <form class="modal__form" id="edit-form">
        <h2 class="modal__title">Editar gasto</h2>
        <div class="field"><label for="edit-fecha">Fecha</label><input id="edit-fecha" type="date" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="edit-categoria-mount"></div>
        </div>
        <div class="field"><label for="edit-nombre">Nombre</label><input id="edit-nombre" type="text" required /></div>
        <div class="field"><label for="edit-monto">Monto</label><input id="edit-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field">
          <label for="edit-estado">Estado</label>
          <select id="edit-estado">
            <option value="Pagado">Pagado</option>
            <option value="Pendiente">Pendiente</option>
          </select>
        </div>
        <p class="empty-state" id="edit-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">${deviceFloppyIcon} Guardar</button>
        </div>
      </form>
    </dialog>

    <dialog id="edit-recurrente-modal" class="modal">
      <form class="modal__form" id="edit-recurrente-form">
        <h2 class="modal__title">Editar archivado</h2>
        <div class="field"><label for="edit-recurrente-nombre">Nombre</label><input id="edit-recurrente-nombre" type="text" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="edit-recurrente-categoria-mount"></div>
        </div>
        <div class="field"><label for="edit-recurrente-monto">Monto de referencia</label><input id="edit-recurrente-monto" type="number" min="0" step="0.01" required /></div>
        <p class="empty-state" id="edit-recurrente-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-recurrente-cancel">Cancelar</button>
          <button type="submit" class="btn">${deviceFloppyIcon} Guardar</button>
        </div>
      </form>
    </dialog>
  `;

  const periodoBadge = container.querySelector<HTMLSpanElement>("#periodo-badge")!;
  const totalPeriodoEl = container.querySelector<HTMLDivElement>("#gc-total-periodo")!;
  const pendientesTotalEl = container.querySelector<HTMLDivElement>("#gc-pendientes-total")!;
  const pendientesListEl = container.querySelector<HTMLDivElement>("#pendientes-list")!;
  const archivadosCard = container.querySelector<HTMLDivElement>("#archivados-card")!;
  const archivadosListEl = container.querySelector<HTMLDivElement>("#archivados-list")!;
  const archivadosToggle = container.querySelector<HTMLButtonElement>("#archivados-toggle")!;
  const archivadosBody = container.querySelector<HTMLDivElement>("#archivados-body")!;
  const ahorrandoCard = container.querySelector<HTMLDivElement>("#ahorrando-card")!;
  const ahorrandoListEl = container.querySelector<HTMLDivElement>("#ahorrando-list")!;
  const listEl = container.querySelector<HTMLDivElement>("#gc-list")!;
  const filtroCategoriaSelect = container.querySelector<HTMLSelectElement>("#gc-filtro-categoria")!;
  const historialToggle = container.querySelector<HTMLButtonElement>("#historial-toggle")!;
  const historialBody = container.querySelector<HTMLDivElement>("#historial-body")!;

  const form = container.querySelector<HTMLFormElement>("#gasto-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gasto-form-error")!;
  const submitBtn = container.querySelector<HTMLButtonElement>("#gasto-submit-btn")!;
  const fechaInput = container.querySelector<HTMLInputElement>("#gc-fecha")!;
  const nombreInput = container.querySelector<HTMLInputElement>("#gc-nombre")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gc-monto")!;
  const pendienteToggle = container.querySelector<HTMLDivElement>("#gc-pendiente-toggle")!;
  const pendienteToggleBtns = pendienteToggle.querySelectorAll<HTMLButtonElement>(".segmented__btn");
  const archivarToggle = container.querySelector<HTMLButtonElement>("#gc-archivar-toggle")!;
  const archivarBox = container.querySelector<HTMLSpanElement>("#gc-archivar-box")!;

  const facturaInput = container.querySelector<HTMLInputElement>("#factura-input")!;

  const categoriaModal = container.querySelector<HTMLDialogElement>("#categoria-modal")!;
  const categoriaForm = container.querySelector<HTMLFormElement>("#categoria-form")!;
  const categoriaModalInput = container.querySelector<HTMLInputElement>("#categoria-modal-input")!;
  const categoriaModalError = container.querySelector<HTMLParagraphElement>("#categoria-modal-error")!;
  const categoriaModalCancel = container.querySelector<HTMLButtonElement>("#categoria-modal-cancel")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editFechaInput = container.querySelector<HTMLInputElement>("#edit-fecha")!;
  const editNombreInput = container.querySelector<HTMLInputElement>("#edit-nombre")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editEstadoSelect = container.querySelector<HTMLSelectElement>("#edit-estado")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;

  const editRecurrenteModal = container.querySelector<HTMLDialogElement>("#edit-recurrente-modal")!;
  const editRecurrenteForm = container.querySelector<HTMLFormElement>("#edit-recurrente-form")!;
  const editRecurrenteNombreInput = container.querySelector<HTMLInputElement>("#edit-recurrente-nombre")!;
  const editRecurrenteMontoInput = container.querySelector<HTMLInputElement>("#edit-recurrente-monto")!;
  const editRecurrenteModalError = container.querySelector<HTMLParagraphElement>("#edit-recurrente-error")!;
  const editRecurrenteModalCancel = container.querySelector<HTMLButtonElement>("#edit-recurrente-cancel")!;

  let spreadsheetId = "";
  let periodoActualFecha = "";
  let categorias: string[] = [];
  let gastosDelMes: GastoYCompra[] = [];
  let gastadoEnPeriodo = 0;
  let pendientes: GastoYCompra[] = [];
  let archivados: Archivado[] = [];
  let ahorrando: GastoYCompra[] = [];
  let filtroCategoria = "";
  let busy = false;
  let formCategoriaValue = "";
  let editCategoriaValue = "";
  let editRecurrenteCategoriaValue = "";
  let archivarChecked = false;
  let editingGasto: GastoYCompra | null = null;
  let editingArchivado: Archivado | null = null;
  let estadoValue: EstadoGasto = "Pagado";

  function renderPendienteToggle(): void {
    pendienteToggleBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.value === estadoValue);
    });
  }
  pendienteToggleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      estadoValue = btn.dataset.value as EstadoGasto;
      renderPendienteToggle();
    });
  });
  renderPendienteToggle();

  function renderArchivarToggle(): void {
    archivarToggle.classList.toggle("is-active", archivarChecked);
    archivarBox.innerHTML = archivarChecked ? CHECK_SVG : "";
  }
  archivarToggle.addEventListener("click", () => {
    archivarChecked = !archivarChecked;
    renderArchivarToggle();
  });
  renderArchivarToggle();

  function refreshCombos(): void {
    categoriaCombo.refresh();
    editCategoriaCombo.refresh();
    editRecurrenteCategoriaCombo.refresh();
    renderFiltroCategoriaOptions();
  }

  function renderFiltroCategoriaOptions(): void {
    const selected = filtroCategoriaSelect.value;
    filtroCategoriaSelect.innerHTML =
      `<option value="">Todas</option>` + categorias.map((c) => `<option value="${c}">${c}</option>`).join("");
    if (categorias.includes(selected)) filtroCategoriaSelect.value = selected;
  }

  function openCategoriaModal(onDone: (nombre: string) => void): void {
    categoriaModalInput.value = "";
    categoriaModalError.hidden = true;
    const controller = new AbortController();
    const { signal } = controller;

    categoriaModal.addEventListener("cancel", () => controller.abort(), { signal });
    categoriaModalCancel.addEventListener(
      "click",
      () => {
        controller.abort();
        categoriaModal.close();
      },
      { signal },
    );

    categoriaForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = categoriaModalInput.value.trim();
        if (!nombre) {
          categoriaModalError.hidden = false;
          categoriaModalError.textContent = "Escribe un nombre.";
          return;
        }
        const confirmBtn = categoriaForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          if (!categorias.includes(nombre)) {
            await crearCategoria(spreadsheetId, nombre);
            categorias.push(nombre);
          }
          controller.abort();
          categoriaModal.close();
          onDone(nombre);
          refreshCombos();
        } catch (err) {
          categoriaModalError.hidden = false;
          categoriaModalError.textContent = err instanceof Error ? err.message : "No se pudo crear la categoría.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    categoriaModal.showModal();
    categoriaModalInput.focus();
  }

  async function handleDeleteCategoria(categoria: string): Promise<void> {
    const enUso = [...gastosDelMes, ...pendientes, ...ahorrando].some((g) => g.categoria === categoria);
    const enUsoArchivado = archivados.some((a) => a.categoria === categoria);
    if (enUso || enUsoArchivado) {
      await showAlert(
        `No puedes eliminar "${categoria}" porque tienes gastos con esta categoría. Edítalos o elimínalos primero.`,
        "No se puede eliminar",
      );
      return;
    }
    const ok = await showConfirm(`¿Eliminar la categoría "${categoria}"? Podrás volver a crearla cuando quieras.`, {
      title: "Eliminar categoría",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await eliminarCategoria(spreadsheetId, categoria);
      categorias = categorias.filter((c) => c !== categoria);
      if (formCategoriaValue === categoria) formCategoriaValue = categorias[0] ?? "";
      if (editCategoriaValue === categoria) editCategoriaValue = categorias[0] ?? "";
      if (editRecurrenteCategoriaValue === categoria) editRecurrenteCategoriaValue = categorias[0] ?? "";
      refreshCombos();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo eliminar la categoría.", "Error");
    }
  }

  const categoriaCombo: OptionCombo = createOptionCombo({
    getOptions: () => categorias,
    getValue: () => formCategoriaValue,
    onSelect: (categoria) => {
      formCategoriaValue = categoria;
      categoriaCombo.refresh();
    },
    onRequestNuevo: () => openCategoriaModal((nombre) => { formCategoriaValue = nombre; }),
    onRequestDelete: (categoria) => void handleDeleteCategoria(categoria),
    placeholder: "Selecciona una categoría",
    addLabel: "+ Nueva categoría…",
    deleteLabel: "Eliminar categoría",
  });
  container.querySelector("#gc-categoria-mount")!.appendChild(categoriaCombo.el);

  const editCategoriaCombo: OptionCombo = createOptionCombo({
    getOptions: () => categorias,
    getValue: () => editCategoriaValue,
    onSelect: (categoria) => {
      editCategoriaValue = categoria;
      editCategoriaCombo.refresh();
    },
    onRequestNuevo: () => openCategoriaModal((nombre) => { editCategoriaValue = nombre; }),
    onRequestDelete: (categoria) => void handleDeleteCategoria(categoria),
    placeholder: "Selecciona una categoría",
    addLabel: "+ Nueva categoría…",
    deleteLabel: "Eliminar categoría",
  });
  container.querySelector("#edit-categoria-mount")!.appendChild(editCategoriaCombo.el);

  const editRecurrenteCategoriaCombo: OptionCombo = createOptionCombo({
    getOptions: () => categorias,
    getValue: () => editRecurrenteCategoriaValue,
    onSelect: (categoria) => {
      editRecurrenteCategoriaValue = categoria;
      editRecurrenteCategoriaCombo.refresh();
    },
    onRequestNuevo: () => openCategoriaModal((nombre) => { editRecurrenteCategoriaValue = nombre; }),
    onRequestDelete: (categoria) => void handleDeleteCategoria(categoria),
    placeholder: "Selecciona una categoría",
    addLabel: "+ Nueva categoría…",
    deleteLabel: "Eliminar categoría",
  });
  container.querySelector("#edit-recurrente-categoria-mount")!.appendChild(editRecurrenteCategoriaCombo.el);

  function pickFacturaFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const controller = new AbortController();
      facturaInput.value = "";
      facturaInput.addEventListener(
        "change",
        () => {
          controller.abort();
          resolve(facturaInput.files?.[0] ?? null);
        },
        { signal: controller.signal },
      );
      facturaInput.click();
    });
  }

  async function attachFacturaFlow(gasto: GastoYCompra, askFirst: boolean): Promise<void> {
    if (askFirst) {
      const quiere = await showConfirm("¿Deseas anexar la factura de este gasto?", {
        title: "Factura",
        confirmLabel: "Sí, adjuntar foto",
        cancelLabel: "No, gracias",
      });
      if (!quiere) return;
    }
    const file = await pickFacturaFile();
    if (!file) return;
    try {
      const uploaded = await uploadGastoFactura(file, parseDateInput(gasto.fecha), gasto.nombre, gasto.fecha);
      await adjuntarFactura(spreadsheetId, gasto, uploaded.webViewLink);
      await reload();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo subir la factura.", "Error");
    }
  }

  function openEditModal(gasto: GastoYCompra): void {
    editingGasto = gasto;
    editFechaInput.value = gasto.fecha;
    editCategoriaValue = gasto.categoria;
    editCategoriaCombo.refresh();
    editNombreInput.value = gasto.nombre;
    editMontoInput.value = String(gasto.monto);
    editEstadoSelect.value = gasto.estado;
    editModalError.hidden = true;

    const controller = new AbortController();
    const { signal } = controller;

    editModal.addEventListener("cancel", () => controller.abort(), { signal });
    editModalCancel.addEventListener(
      "click",
      () => {
        controller.abort();
        editModal.close();
      },
      { signal },
    );

    editForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = editNombreInput.value.trim();
        const monto = Number(editMontoInput.value);
        if (!nombre || !monto || monto <= 0 || !editFechaInput.value) {
          editModalError.hidden = false;
          editModalError.textContent = "Completa fecha, nombre y un monto válido.";
          return;
        }
        if (!editingGasto) return;
        const confirmBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          await actualizarGasto(spreadsheetId, editingGasto, {
            fecha: editFechaInput.value,
            categoria: editCategoriaValue,
            nombre,
            monto,
            estado: editEstadoSelect.value as EstadoGasto,
          });
          controller.abort();
          editModal.close();
          await reload();
        } catch (err) {
          editModalError.hidden = false;
          editModalError.textContent = err instanceof Error ? err.message : "No se pudo guardar el cambio.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    editModal.showModal();
  }

  function openEditArchivadoModal(archivado: Archivado): void {
    editingArchivado = archivado;
    editRecurrenteNombreInput.value = archivado.nombre;
    editRecurrenteCategoriaValue = archivado.categoria;
    editRecurrenteCategoriaCombo.refresh();
    editRecurrenteMontoInput.value = String(archivado.monto);
    editRecurrenteModalError.hidden = true;

    const controller = new AbortController();
    const { signal } = controller;

    editRecurrenteModal.addEventListener("cancel", () => controller.abort(), { signal });
    editRecurrenteModalCancel.addEventListener(
      "click",
      () => {
        controller.abort();
        editRecurrenteModal.close();
      },
      { signal },
    );

    editRecurrenteForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = editRecurrenteNombreInput.value.trim();
        const monto = Number(editRecurrenteMontoInput.value);
        if (!nombre || !monto || monto <= 0) {
          editRecurrenteModalError.hidden = false;
          editRecurrenteModalError.textContent = "Ingresa un nombre y un monto válido.";
          return;
        }
        if (!editingArchivado) return;
        const confirmBtn = editRecurrenteForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          await actualizarArchivado(spreadsheetId, editingArchivado, {
            nombre,
            categoria: editRecurrenteCategoriaValue,
            monto,
          });
          controller.abort();
          editRecurrenteModal.close();
          await reload();
        } catch (err) {
          editRecurrenteModalError.hidden = false;
          editRecurrenteModalError.textContent = err instanceof Error ? err.message : "No se pudo guardar el cambio.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    editRecurrenteModal.showModal();
  }

  function facturaCellHtml(gasto: GastoYCompra): string {
    if (gasto.linkFactura) {
      return `<a href="${gasto.linkFactura}" target="_blank" rel="noopener" class="icon-btn icon-btn--edit" aria-label="Ver factura" title="Ver factura">${eyeIcon}</a>`;
    }
    return `<button type="button" class="btn-secondary" style="padding:6px 10px;font-size:12px" data-row="${gasto.row}" data-action="adjuntar">Adjuntar factura</button>`;
  }

  function renderPendientes(): void {
    pendientesTotalEl.textContent = formatMoney(sumGastos(pendientes));

    if (pendientes.length === 0) {
      pendientesListEl.innerHTML = `<p class="empty-state">No tienes compras pendientes registradas.</p>`;
      return;
    }

    pendientesListEl.innerHTML = "";
    for (const gasto of pendientes) {
      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">${gasto.nombre}${gasto.categoria ? ` <span class="badge">${gasto.categoria}</span>` : ""}</span>
          <span class="record-row__subtitle">Registrado el ${gasto.fecha}</span>
        </div>
        <div class="record-row__amount">${formatMoney(gasto.monto)}</div>
        <button type="button" class="btn-secondary" data-action="completar">Marcar como realizado</button>
        <button type="button" class="btn-secondary" data-action="convertir">Convertir en meta de ahorro</button>
        <button type="button" class="icon-btn icon-btn--delete" data-action="eliminar" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
      `;
      item.querySelector('[data-action="completar"]')!.addEventListener("click", async () => {
        const resultado = await showCompletarGastoDialog(gasto.nombre, gasto.monto);
        if (!resultado) return;
        await runAction(async () => {
          const actualizado = await marcarComoPagado(spreadsheetId, gasto, resultado);
          await attachFacturaFlow(actualizado, true);
        });
      });
      item.querySelector('[data-action="convertir"]')!.addEventListener("click", async () => {
        const nombre = await showConvertirMetaDialog(gasto.nombre, gasto.monto);
        if (!nombre) return;
        void runAction(async () => {
          await crearMeta(spreadsheetId, {
            nombre,
            montoObjetivo: gasto.monto,
            fechaLimite: "",
            tipo: gasto.categoria,
            compraVinculadaId: gasto.id,
          });
          await marcarComoAhorrando(spreadsheetId, gasto);
        });
      });
      item.querySelector('[data-action="eliminar"]')!.addEventListener("click", async () => {
        const ok = await showConfirm(`¿Eliminar "${gasto.nombre}" de las compras pendientes?`, {
          title: "Eliminar pendiente",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        void runAction(() => eliminarGasto(spreadsheetId, gasto));
      });
      pendientesListEl.appendChild(item);
    }
  }

  function renderArchivados(): void {
    archivadosCard.hidden = archivados.length === 0;
    archivadosListEl.innerHTML = "";
    if (archivados.length === 0) return;

    for (const archivado of archivados) {
      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">
            ${archivado.nombre}
            ${archivado.categoria ? ` <span class="badge">${archivado.categoria}</span>` : ""}
          </span>
        </div>
        <div class="record-row__amount">${formatMoney(archivado.monto)}</div>
        <button type="button" class="btn-secondary" data-action="a-pagado">Ya la compré</button>
        <button type="button" class="btn-secondary" data-action="a-pendiente">Pasar a pendientes</button>
        <button type="button" class="icon-btn icon-btn--edit" data-action="editar" aria-label="Editar" title="Editar">${editIcon}</button>
        <button type="button" class="icon-btn icon-btn--delete" data-action="eliminar" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
      `;

      item.querySelector('[data-action="a-pagado"]')!.addEventListener("click", async () => {
        const resultado = await showCompletarGastoDialog(archivado.nombre, archivado.monto);
        if (!resultado) return;
        await runAction(async () => {
          const gasto = await registrarArchivado(spreadsheetId, archivado, { ...resultado, estado: "Pagado" });
          await attachFacturaFlow(gasto, true);
        });
      });
      item.querySelector('[data-action="a-pendiente"]')!.addEventListener("click", () => {
        void runAction(() => registrarArchivado(spreadsheetId, archivado, { monto: archivado.monto, fecha: todayISO(), estado: "Pendiente" }).then(() => {}));
      });
      item.querySelector('[data-action="editar"]')!.addEventListener("click", () => openEditArchivadoModal(archivado));
      item.querySelector('[data-action="eliminar"]')!.addEventListener("click", async () => {
        const ok = await showConfirm(`¿Eliminar "${archivado.nombre}" de archivados?`, {
          title: "Eliminar archivado",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        void runAction(() => eliminarArchivado(spreadsheetId, archivado));
      });

      archivadosListEl.appendChild(item);
    }
  }

  function renderAhorrando(): void {
    ahorrandoCard.hidden = ahorrando.length === 0;
    if (ahorrando.length === 0) {
      ahorrandoListEl.innerHTML = "";
      return;
    }
    ahorrandoListEl.innerHTML = "";
    for (const gasto of ahorrando) {
      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">${gasto.nombre} <span class="badge">Ahorrando</span></span>
          <span class="record-row__subtitle">Objetivo: ${formatMoney(gasto.monto)} · aporta, marca como pagada o deshaz la conversión desde Ahorros y Metas</span>
        </div>
      `;
      ahorrandoListEl.appendChild(item);
    }
  }

  function renderHistorial(): void {
    const visibles = filtroCategoria ? gastosDelMes.filter((g) => g.categoria === filtroCategoria) : gastosDelMes;
    totalPeriodoEl.textContent = formatMoney(gastadoEnPeriodo);

    if (visibles.length === 0) {
      listEl.innerHTML = `<p class="empty-state">${gastosDelMes.length === 0 ? "Aún no registras gastos este mes." : "No hay gastos con esa categoría."}</p>`;
      return;
    }

    const rows = [...visibles]
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .map(
        (gasto) => `
          <tr data-row="${gasto.row}">
            <td data-label="Fecha">${gasto.fecha}</td>
            <td data-label="Categoría">${gasto.categoria ? `<span class="badge">${gasto.categoria}</span>` : "—"}</td>
            <td data-label="Nombre">${gasto.nombre}</td>
            <td data-label="Monto" class="text-right amount-cell">${formatMoney(gasto.monto)}</td>
            <td data-label="Factura">${facturaCellHtml(gasto)}</td>
            <td class="actions-cell">
              <button type="button" class="icon-btn icon-btn--edit" data-row="${gasto.row}" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
              <button type="button" class="icon-btn icon-btn--delete" data-row="${gasto.row}" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
            </td>
          </tr>
        `,
      )
      .join("");

    listEl.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoría</th>
              <th>Nombre</th>
              <th class="text-right">Monto</th>
              <th>Factura</th>
              <th class="actions-col">Acciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    listEl.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((btn) => {
      btn.disabled = busy;
      const row = Number(btn.dataset.row);
      const gasto = gastosDelMes.find((g) => g.row === row);
      if (!gasto) return;

      if (btn.dataset.action === "edit") {
        btn.addEventListener("click", () => openEditModal(gasto));
      } else if (btn.dataset.action === "delete") {
        btn.addEventListener("click", async () => {
          const ok = await showConfirm(`¿Eliminar el gasto "${gasto.nombre}" de ${formatMoney(gasto.monto)}?`, {
            title: "Eliminar gasto",
            confirmLabel: "Eliminar",
            danger: true,
          });
          if (!ok) return;
          void runAction(() => eliminarGasto(spreadsheetId, gasto));
        });
      } else if (btn.dataset.action === "adjuntar") {
        btn.addEventListener("click", () => attachFacturaFlow(gasto, false));
      }
    });
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    renderHistorial();
    try {
      await action();
      await reload();
    } finally {
      busy = false;
      renderHistorial();
    }
  }

  async function reload(): Promise<void> {
    const [todosLosGastos, archivadosList] = await Promise.all([
      listTodosLosGastos(spreadsheetId),
      listArchivados(spreadsheetId),
    ]);
    gastosDelMes = filtrarGastosDelMes(todosLosGastos);
    pendientes = filtrarPendientes(todosLosGastos);
    ahorrando = filtrarAhorrando(todosLosGastos);
    archivados = archivadosList;
    gastadoEnPeriodo = sumGastos(filtrarGastosDelPeriodo(todosLosGastos, periodoActualFecha));
    renderPendientes();
    renderArchivados();
    renderAhorrando();
    renderHistorial();
  }

  filtroCategoriaSelect.addEventListener("change", () => {
    filtroCategoria = filtroCategoriaSelect.value;
    renderHistorial();
  });

  historialToggle.addEventListener("click", () => {
    historialBody.hidden = !historialBody.hidden;
    historialToggle.classList.toggle("is-open", !historialBody.hidden);
  });

  archivadosToggle.addEventListener("click", () => {
    archivadosBody.hidden = !archivadosBody.hidden;
    archivadosToggle.classList.toggle("is-open", !archivadosBody.hidden);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const nombre = nombreInput.value.trim();
    const monto = Number(montoInput.value);

    if (!nombre || !monto || monto <= 0) {
      formError.hidden = false;
      formError.textContent = "Ingresa un nombre y un monto válido.";
      return;
    }
    if (!formCategoriaValue) {
      formError.hidden = false;
      formError.textContent = "Elige o crea una categoría.";
      return;
    }
    if (!fechaInput.value) {
      formError.hidden = false;
      formError.textContent = "Elige una fecha.";
      return;
    }

    submitBtn.disabled = true;
    try {
      const estado = estadoValue;
      const creado = await crearGasto(spreadsheetId, {
        fecha: fechaInput.value,
        categoria: formCategoriaValue,
        nombre,
        monto,
        estado,
      });
      if (estado === "Pagado") await attachFacturaFlow(creado, true);
      if (archivarChecked) {
        await crearArchivado(spreadsheetId, { nombre, categoria: formCategoriaValue, monto });
      }
      nombreInput.value = "";
      montoInput.value = "";
      fechaInput.value = todayISO();
      estadoValue = "Pagado";
      renderPendienteToggle();
      archivarChecked = false;
      renderArchivarToggle();
      await reload();
    } catch (err) {
      formError.hidden = false;
      formError.textContent = err instanceof Error ? err.message : "No se pudo guardar el gasto.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  try {
    const ensured = await ensureSpreadsheet();
    spreadsheetId = ensured.spreadsheetId;
    const [categoriasList, configPeriodo] = await Promise.all([
      listCategorias(spreadsheetId),
      obtenerConfigPeriodo(spreadsheetId),
    ]);
    categorias = categoriasList;
    formCategoriaValue = categorias[0] ?? "";
    periodoActualFecha = configPeriodo.fechaUltimoReinicio;
    periodoBadge.textContent = formatPeriodoBadge(configPeriodo);
    refreshCombos();
    await reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar la información.";
    listEl.innerHTML = `<p class="empty-state">${message}</p>`;
    pendientesListEl.innerHTML = "";
  }
}
