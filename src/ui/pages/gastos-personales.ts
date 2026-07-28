import editIcon from "../../icon/edit.svg?raw";
import eyeIcon from "../../icon/eye.svg?raw";
import shoppingCartIcon from "../../icon/shopping-cart.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { uploadGastoFactura } from "../../api/drive";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  actualizarCompraRecurrente,
  crearCompraRecurrente,
  eliminarCompraRecurrente,
  esCompraDue,
  listComprasRecurrentes,
  registrarCompraRecurrente,
  type CompraRecurrente,
  type RecurrenciaCompra,
} from "../../domain/compras-recurrentes";
import {
  actualizarGasto,
  adjuntarFactura,
  crearCategoria,
  crearGasto,
  eliminarCategoria,
  eliminarGasto,
  listAhorrando,
  listCategorias,
  listGastosDelMes,
  listGastosDelPeriodo,
  listPendientes,
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

const RECURRENCIA_BADGE: Record<RecurrenciaCompra, string> = {
  Fijo: "badge--fijo",
  Personalizado: "badge--personalizado",
};

export async function renderGastosPersonales(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${shoppingCartIcon} Gastos y Compras</h1>
      <span class="month-badge" id="periodo-badge">Cargando…</span>
    </div>
    <div class="card-grid" style="max-width:560px">
      <div class="card stat-card stat-card--primary">
        <div class="stat-card__value" id="gc-total-periodo">—</div>
        <div class="stat-card__label">Gastado en el periodo</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="gc-pendientes-total">—</div>
        <div class="stat-card__label">Pendientes por pagar</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar gasto o compra</h2>
      <form id="gasto-form" class="form">
        <div class="field">
          <label for="gc-recurrencia">Tipo de recurrencia</label>
          <select id="gc-recurrencia">
            <option value="Adicional">Adicional</option>
            <option value="Fijo">Fijo</option>
            <option value="Personalizado">Personalizado</option>
          </select>
        </div>
        <div class="field" id="gc-repite-n-field" hidden>
          <label for="gc-repite-n">¿Cada cuántos periodos se repite?</label>
          <input id="gc-repite-n" type="number" min="2" step="1" />
        </div>
        <div class="field" id="gc-fecha-field"><label for="gc-fecha">Fecha</label><input id="gc-fecha" type="date" value="${todayISO()}" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="gc-categoria-mount"></div>
        </div>
        <div class="field"><label for="gc-nombre">Nombre</label><input id="gc-nombre" type="text" placeholder="Ej. Mercado Éxito" required /></div>
        <div class="field"><label for="gc-monto" id="gc-monto-label">Monto</label><input id="gc-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field" id="gc-pendiente-field">
          <label for="gc-pendiente-check">¿Ya lo hiciste?</label>
          <select id="gc-pendiente-check">
            <option value="Pagado">Sí, ya lo pagué</option>
            <option value="Pendiente">No, es una compra pendiente</option>
          </select>
        </div>
        <button type="submit" class="btn" id="gasto-submit-btn">Guardar gasto</button>
      </form>
      <p class="empty-state" id="gasto-form-error" hidden></p>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Pendientes por pagar</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Compras planeadas que aún no se han hecho. Se mantienen aquí mes a mes hasta que las marques como realizadas.</p>
      <div id="pendientes-list">${loaderHtml()}</div>
    </div>

    <div class="card" id="recurrentes-card" style="margin-bottom:20px" hidden>
      <h2 style="margin-top:0">Compras recurrentes pendientes de registrar</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Recordatorios de compras que se repiten (como champú o maquillaje) — nunca son obligatorias, puedes posponerlas sin problema.</p>
      <div id="recurrentes-list"></div>
    </div>

    <div class="card" id="ahorrando-card" style="margin-bottom:20px" hidden>
      <h2 style="margin-top:0">Ahorrando para estas compras</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Ya no cuentan como pendientes: se están gestionando como metas de ahorro. Aporta y márcalas como pagadas desde Ahorros y Metas.</p>
      <div id="ahorrando-list"></div>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <h2 style="margin:0">Historial — ${formatMonthLabel()}</h2>
        <div class="field field--inline">
          <label for="gc-filtro-categoria">Categoría</label>
          <select id="gc-filtro-categoria">
            <option value="">Todas</option>
          </select>
        </div>
      </div>
      <div id="gc-list">${loaderHtml()}</div>
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
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>

    <dialog id="edit-recurrente-modal" class="modal">
      <form class="modal__form" id="edit-recurrente-form">
        <h2 class="modal__title">Editar compra recurrente</h2>
        <div class="field"><label for="edit-recurrente-nombre">Nombre</label><input id="edit-recurrente-nombre" type="text" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="edit-recurrente-categoria-mount"></div>
        </div>
        <div class="field">
          <label for="edit-recurrente-tipo">Tipo de recurrencia</label>
          <select id="edit-recurrente-tipo">
            <option value="Fijo">Fijo</option>
            <option value="Personalizado">Personalizado</option>
          </select>
        </div>
        <div class="field" id="edit-recurrente-repite-n-field" hidden>
          <label for="edit-recurrente-repite-n">¿Cada cuántos periodos se repite?</label>
          <input id="edit-recurrente-repite-n" type="number" min="2" step="1" />
        </div>
        <div class="field"><label for="edit-recurrente-monto">Monto de referencia</label><input id="edit-recurrente-monto" type="number" min="0" step="0.01" required /></div>
        <p class="empty-state" id="edit-recurrente-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-recurrente-cancel">Cancelar</button>
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const periodoBadge = container.querySelector<HTMLSpanElement>("#periodo-badge")!;
  const totalPeriodoEl = container.querySelector<HTMLDivElement>("#gc-total-periodo")!;
  const pendientesTotalEl = container.querySelector<HTMLDivElement>("#gc-pendientes-total")!;
  const pendientesListEl = container.querySelector<HTMLDivElement>("#pendientes-list")!;
  const recurrentesCard = container.querySelector<HTMLDivElement>("#recurrentes-card")!;
  const recurrentesListEl = container.querySelector<HTMLDivElement>("#recurrentes-list")!;
  const ahorrandoCard = container.querySelector<HTMLDivElement>("#ahorrando-card")!;
  const ahorrandoListEl = container.querySelector<HTMLDivElement>("#ahorrando-list")!;
  const listEl = container.querySelector<HTMLDivElement>("#gc-list")!;
  const filtroCategoriaSelect = container.querySelector<HTMLSelectElement>("#gc-filtro-categoria")!;

  const form = container.querySelector<HTMLFormElement>("#gasto-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gasto-form-error")!;
  const submitBtn = container.querySelector<HTMLButtonElement>("#gasto-submit-btn")!;
  const recurrenciaSelect = container.querySelector<HTMLSelectElement>("#gc-recurrencia")!;
  const repiteNField = container.querySelector<HTMLDivElement>("#gc-repite-n-field")!;
  const repiteNInput = container.querySelector<HTMLInputElement>("#gc-repite-n")!;
  const fechaField = container.querySelector<HTMLDivElement>("#gc-fecha-field")!;
  const fechaInput = container.querySelector<HTMLInputElement>("#gc-fecha")!;
  const nombreInput = container.querySelector<HTMLInputElement>("#gc-nombre")!;
  const montoLabel = container.querySelector<HTMLLabelElement>("#gc-monto-label")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gc-monto")!;
  const pendienteField = container.querySelector<HTMLDivElement>("#gc-pendiente-field")!;
  const estadoSelect = container.querySelector<HTMLSelectElement>("#gc-pendiente-check")!;

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
  const editRecurrenteTipoSelect = container.querySelector<HTMLSelectElement>("#edit-recurrente-tipo")!;
  const editRecurrenteRepiteNField = container.querySelector<HTMLDivElement>("#edit-recurrente-repite-n-field")!;
  const editRecurrenteRepiteNInput = container.querySelector<HTMLInputElement>("#edit-recurrente-repite-n")!;
  const editRecurrenteMontoInput = container.querySelector<HTMLInputElement>("#edit-recurrente-monto")!;
  const editRecurrenteModalError = container.querySelector<HTMLParagraphElement>("#edit-recurrente-error")!;
  const editRecurrenteModalCancel = container.querySelector<HTMLButtonElement>("#edit-recurrente-cancel")!;

  let spreadsheetId = "";
  let periodoActualFecha = "";
  let categorias: string[] = [];
  let gastosDelMes: GastoYCompra[] = [];
  let gastadoEnPeriodo = 0;
  let pendientes: GastoYCompra[] = [];
  let recurrentes: CompraRecurrente[] = [];
  let ahorrando: GastoYCompra[] = [];
  let filtroCategoria = "";
  let busy = false;
  let formCategoriaValue = "";
  let editCategoriaValue = "";
  let editRecurrenteCategoriaValue = "";
  let editingGasto: GastoYCompra | null = null;
  let editingRecurrente: CompraRecurrente | null = null;

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

  function actualizarVisibilidadRecurrencia(): void {
    const esAdicional = recurrenciaSelect.value === "Adicional";
    fechaField.hidden = !esAdicional;
    fechaInput.required = esAdicional;
    pendienteField.hidden = !esAdicional;
    repiteNField.hidden = recurrenciaSelect.value !== "Personalizado";
    montoLabel.textContent = esAdicional ? "Monto" : "Monto de referencia";
    submitBtn.textContent = esAdicional ? "Guardar gasto" : "Guardar compra recurrente";
  }
  recurrenciaSelect.addEventListener("change", actualizarVisibilidadRecurrencia);
  editRecurrenteTipoSelect.addEventListener("change", () => {
    editRecurrenteRepiteNField.hidden = editRecurrenteTipoSelect.value !== "Personalizado";
  });

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
    const enUsoRecurrente = recurrentes.some((c) => c.categoria === categoria);
    if (enUso || enUsoRecurrente) {
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

  function openEditRecurrenteModal(compra: CompraRecurrente): void {
    editingRecurrente = compra;
    editRecurrenteNombreInput.value = compra.nombre;
    editRecurrenteCategoriaValue = compra.categoria;
    editRecurrenteCategoriaCombo.refresh();
    editRecurrenteTipoSelect.value = compra.recurrencia;
    editRecurrenteRepiteNField.hidden = compra.recurrencia !== "Personalizado";
    editRecurrenteRepiteNInput.value = compra.repiteCadaN > 0 ? String(compra.repiteCadaN) : "";
    editRecurrenteMontoInput.value = String(compra.monto);
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
        const recurrencia = editRecurrenteTipoSelect.value as RecurrenciaCompra;
        const repiteCadaN = Number(editRecurrenteRepiteNInput.value) || 0;
        if (!nombre || !monto || monto <= 0) {
          editRecurrenteModalError.hidden = false;
          editRecurrenteModalError.textContent = "Ingresa un nombre y un monto válido.";
          return;
        }
        if (recurrencia === "Personalizado" && repiteCadaN < 2) {
          editRecurrenteModalError.hidden = false;
          editRecurrenteModalError.textContent = "Indica cada cuántos periodos se repite (2 o más).";
          return;
        }
        if (!editingRecurrente) return;
        const confirmBtn = editRecurrenteForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          await actualizarCompraRecurrente(spreadsheetId, editingRecurrente, {
            nombre,
            categoria: editRecurrenteCategoriaValue,
            monto,
            recurrencia,
            repiteCadaN,
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

  function renderRecurrentes(): void {
    recurrentesCard.hidden = recurrentes.length === 0;
    recurrentesListEl.innerHTML = "";
    if (recurrentes.length === 0) return;

    for (const compra of recurrentes) {
      const due = esCompraDue(compra);
      const subtitulo = due
        ? "Toca registrarla en este periodo"
        : compra.recurrencia === "Personalizado"
          ? `cada ${compra.repiteCadaN} periodos · faltan ${Math.max(compra.repiteCadaN - compra.contadorPeriodos, 1)}`
          : "cada periodo";

      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">
            ${due ? "Toca tu compra recurrente: " : ""}${compra.nombre}
            ${compra.categoria ? ` <span class="badge">${compra.categoria}</span>` : ""}
            <span class="badge ${RECURRENCIA_BADGE[compra.recurrencia]}">${compra.recurrencia}</span>
          </span>
          <span class="record-row__subtitle">${subtitulo}</span>
        </div>
        <div class="record-row__amount">${formatMoney(compra.monto)}</div>
        ${
          due
            ? `<button type="button" class="btn-secondary" data-action="registrar">Registrar ahora</button><button type="button" class="btn-secondary" data-action="posponer">Posponer</button>`
            : ""
        }
        <button type="button" class="icon-btn icon-btn--edit" data-action="editar" aria-label="Editar" title="Editar">${editIcon}</button>
        <button type="button" class="icon-btn icon-btn--delete" data-action="eliminar" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
      `;

      item.querySelector('[data-action="registrar"]')?.addEventListener("click", async () => {
        const resultado = await showCompletarGastoDialog(compra.nombre, compra.monto);
        if (!resultado) return;
        await runAction(async () => {
          const gasto = await registrarCompraRecurrente(spreadsheetId, compra, resultado);
          await attachFacturaFlow(gasto, true);
        });
      });
      item.querySelector('[data-action="posponer"]')?.addEventListener("click", (e) => {
        const btn = e.currentTarget as HTMLButtonElement;
        btn.disabled = true;
        btn.textContent = "Pospuesta";
      });
      item.querySelector('[data-action="editar"]')!.addEventListener("click", () => openEditRecurrenteModal(compra));
      item.querySelector('[data-action="eliminar"]')!.addEventListener("click", async () => {
        const ok = await showConfirm(`¿Eliminar la compra recurrente "${compra.nombre}"?`, {
          title: "Eliminar compra recurrente",
          confirmLabel: "Eliminar",
          danger: true,
        });
        if (!ok) return;
        void runAction(() => eliminarCompraRecurrente(spreadsheetId, compra));
      });

      recurrentesListEl.appendChild(item);
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
    [gastosDelMes, pendientes, ahorrando, recurrentes] = await Promise.all([
      listGastosDelMes(spreadsheetId),
      listPendientes(spreadsheetId),
      listAhorrando(spreadsheetId),
      listComprasRecurrentes(spreadsheetId),
    ]);
    gastadoEnPeriodo = sumGastos(await listGastosDelPeriodo(spreadsheetId, periodoActualFecha));
    renderPendientes();
    renderRecurrentes();
    renderAhorrando();
    renderHistorial();
  }

  filtroCategoriaSelect.addEventListener("change", () => {
    filtroCategoria = filtroCategoriaSelect.value;
    renderHistorial();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const recurrencia = recurrenciaSelect.value as "Adicional" | RecurrenciaCompra;
    const nombre = nombreInput.value.trim();
    const monto = Number(montoInput.value);
    const repiteCadaN = Number(repiteNInput.value) || 0;

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
    if (recurrencia === "Adicional" && !fechaInput.value) {
      formError.hidden = false;
      formError.textContent = "Elige una fecha.";
      return;
    }
    if (recurrencia === "Personalizado" && repiteCadaN < 2) {
      formError.hidden = false;
      formError.textContent = "Indica cada cuántos periodos se repite (2 o más).";
      return;
    }

    submitBtn.disabled = true;
    try {
      if (recurrencia === "Adicional") {
        const estado = estadoSelect.value as EstadoGasto;
        const creado = await crearGasto(spreadsheetId, {
          fecha: fechaInput.value,
          categoria: formCategoriaValue,
          nombre,
          monto,
          estado,
        });
        if (estado === "Pagado") await attachFacturaFlow(creado, true);
      } else {
        await crearCompraRecurrente(spreadsheetId, {
          nombre,
          categoria: formCategoriaValue,
          monto,
          recurrencia,
          repiteCadaN,
        });
      }
      nombreInput.value = "";
      montoInput.value = "";
      fechaInput.value = todayISO();
      estadoSelect.value = "Pagado";
      repiteNInput.value = "";
      recurrenciaSelect.value = "Adicional";
      actualizarVisibilidadRecurrencia();
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
