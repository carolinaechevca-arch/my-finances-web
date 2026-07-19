import editIcon from "../../icon/edit.svg?raw";
import eyeIcon from "../../icon/eye.svg?raw";
import shoppingCartIcon from "../../icon/shopping-cart.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { uploadGastoFactura } from "../../api/drive";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  actualizarGasto,
  adjuntarFactura,
  crearCategoria,
  crearGasto,
  eliminarCategoria,
  eliminarGasto,
  listCategorias,
  listGastosDelMes,
  listPendientes,
  marcarComoPagado,
  sumGastos,
  type EstadoGasto,
  type GastoYCompra,
} from "../../domain/gastos-y-compras";
import { formatMonthLabel, formatMoney, parseDateInput, todayISO } from "../../domain/format";
import { showAlert, showCompletarGastoDialog, showConfirm } from "../components/dialogs";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

export async function renderGastosPersonales(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${shoppingCartIcon} Gastos y Compras</h1>
      <span class="month-badge">${formatMonthLabel()}</span>
    </div>
    <div class="card-grid" style="max-width:560px">
      <div class="card stat-card stat-card--primary">
        <div class="stat-card__value" id="gc-total-mes">—</div>
        <div class="stat-card__label">Gastado este mes</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="gc-pendientes-total">—</div>
        <div class="stat-card__label">Pendientes por pagar</div>
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
          <label for="gc-pendiente-check">¿Ya lo hiciste?</label>
          <select id="gc-pendiente-check">
            <option value="Pagado">Sí, ya lo pagué</option>
            <option value="Pendiente">No, es una compra pendiente</option>
          </select>
        </div>
        <button type="submit" class="btn">Guardar gasto</button>
      </form>
      <p class="empty-state" id="gasto-form-error" hidden></p>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Pendientes por pagar</h2>
      <p class="empty-state" style="margin-top:-8px;margin-bottom:14px">Compras planeadas que aún no se han hecho. Se mantienen aquí mes a mes hasta que las marques como realizadas.</p>
      <div id="pendientes-list"><p class="empty-state">Cargando…</p></div>
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
      <div id="gc-list"><p class="empty-state">Cargando…</p></div>
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
  `;

  const totalMesEl = container.querySelector<HTMLDivElement>("#gc-total-mes")!;
  const pendientesTotalEl = container.querySelector<HTMLDivElement>("#gc-pendientes-total")!;
  const pendientesListEl = container.querySelector<HTMLDivElement>("#pendientes-list")!;
  const listEl = container.querySelector<HTMLDivElement>("#gc-list")!;
  const filtroCategoriaSelect = container.querySelector<HTMLSelectElement>("#gc-filtro-categoria")!;

  const form = container.querySelector<HTMLFormElement>("#gasto-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gasto-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const fechaInput = container.querySelector<HTMLInputElement>("#gc-fecha")!;
  const nombreInput = container.querySelector<HTMLInputElement>("#gc-nombre")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gc-monto")!;
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

  let spreadsheetId = "";
  let categorias: string[] = [];
  let gastosDelMes: GastoYCompra[] = [];
  let pendientes: GastoYCompra[] = [];
  let filtroCategoria = "";
  let busy = false;
  let formCategoriaValue = "";
  let editCategoriaValue = "";
  let editingGasto: GastoYCompra | null = null;

  function refreshCombos(): void {
    categoriaCombo.refresh();
    editCategoriaCombo.refresh();
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
    const enUso = [...gastosDelMes, ...pendientes].some((g) => g.categoria === categoria);
    if (enUso) {
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

  function renderHistorial(): void {
    const visibles = filtroCategoria ? gastosDelMes.filter((g) => g.categoria === filtroCategoria) : gastosDelMes;
    totalMesEl.textContent = formatMoney(sumGastos(gastosDelMes));

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
    try {
      await action();
      await reload();
    } finally {
      busy = false;
    }
  }

  async function reload(): Promise<void> {
    [gastosDelMes, pendientes] = await Promise.all([
      listGastosDelMes(spreadsheetId),
      listPendientes(spreadsheetId),
    ]);
    renderPendientes();
    renderHistorial();
  }

  filtroCategoriaSelect.addEventListener("change", () => {
    filtroCategoria = filtroCategoriaSelect.value;
    renderHistorial();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const nombre = nombreInput.value.trim();
    const monto = Number(montoInput.value);
    if (!nombre || !monto || monto <= 0 || !fechaInput.value) {
      formError.hidden = false;
      formError.textContent = "Completa fecha, nombre y un monto válido.";
      return;
    }
    if (!formCategoriaValue) {
      formError.hidden = false;
      formError.textContent = "Elige o crea una categoría.";
      return;
    }

    submitBtn.disabled = true;
    try {
      const estado = estadoSelect.value as EstadoGasto;
      const creado = await crearGasto(spreadsheetId, {
        fecha: fechaInput.value,
        categoria: formCategoriaValue,
        nombre,
        monto,
        estado,
      });
      nombreInput.value = "";
      montoInput.value = "";
      fechaInput.value = todayISO();
      estadoSelect.value = "Pagado";
      await reload();
      if (estado === "Pagado") {
        await attachFacturaFlow(creado, true);
      }
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
    categorias = await listCategorias(spreadsheetId);
    formCategoriaValue = categorias[0] ?? "";
    refreshCombos();
    await reload();
  } catch (err) {
    const message = err instanceof Error ? err.message : "No se pudo cargar la información.";
    listEl.innerHTML = `<p class="empty-state">${message}</p>`;
    pendientesListEl.innerHTML = "";
  }
}
