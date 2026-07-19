import cashMinusIcon from "../../icon/cash-minus.svg?raw";
import editIcon from "../../icon/edit.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney, formatMonthLabel } from "../../domain/format";
import {
  actualizarGastoFijo,
  crearCategoria,
  crearGastoFijo,
  diferenciasPago,
  eliminarCategoria,
  eliminarGastoFijo,
  listCategorias,
  listGastosFijosDelMes,
  listGastosFijosNombres,
  marcarGastoPagado,
  marcarGastoPendiente,
  sumDiferenciasPago,
  sumGastosFijosPagado,
  sumGastosFijosPendientes,
  type GastoFijo,
} from "../../domain/gastos";
import { showAlert, showConfirm, showMontoPagadoDialog } from "../components/dialogs";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

type SortOrder = "nombre" | "monto-desc" | "monto-asc" | "dia";

function sortGastos(list: GastoFijo[], order: SortOrder): GastoFijo[] {
  const copy = [...list];
  switch (order) {
    case "monto-desc":
      return copy.sort((a, b) => b.monto - a.monto);
    case "monto-asc":
      return copy.sort((a, b) => a.monto - b.monto);
    case "dia":
      return copy.sort((a, b) => (Number(a.diaPago) || 99) - (Number(b.diaPago) || 99));
    default:
      return copy.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
}

export async function renderGastosFijos(container: HTMLElement): Promise<void> {
  const hoy = new Date().getDate();

  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${cashMinusIcon} Gastos Fijos</h1>
      <span class="month-badge">${formatMonthLabel()}</span>
    </div>
    <div class="card-grid" style="max-width:820px">
      <div class="card stat-card stat-card--primary">
        <div class="stat-card__value" id="gf-pendiente">—</div>
        <div class="stat-card__label">Gastos pendientes</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="gf-total">—</div>
        <div class="stat-card__label">Total gastos fijos</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="gf-pagado">—</div>
        <div class="stat-card__label">Pagado</div>
      </div>
    </div>
    <button type="button" class="diff-pill" id="gf-diferencia-btn" style="margin-bottom:20px">
      Diferencia con lo pagado: <span id="gf-diferencia-valor">$0</span>
    </button>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar gasto fijo de este mes</h2>
      <form id="gasto-form" class="form">
        <div class="field">
          <label for="gf-nombre">Nombre</label>
          <input id="gf-nombre" type="text" list="gf-nombres-datalist" autocomplete="off" required />
          <datalist id="gf-nombres-datalist"></datalist>
        </div>
        <div class="field">
          <label>Categoría</label>
          <div id="gf-categoria-mount"></div>
        </div>
        <div class="field"><label for="gf-monto">Monto</label><input id="gf-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="gf-dia">Día de pago</label><input id="gf-dia" type="number" min="1" max="31" /></div>
        <button type="submit" class="btn">Guardar gasto fijo</button>
      </form>
      <p class="empty-state" id="gasto-form-error" hidden></p>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <h2 style="margin:0">Gastos fijos — ${formatMonthLabel()}</h2>
        <div class="field field--inline">
          <label for="gf-orden">Ordenar por</label>
          <select id="gf-orden">
            <option value="nombre">Nombre (A-Z)</option>
            <option value="dia">Día de pago</option>
            <option value="monto-desc">Monto (mayor a menor)</option>
            <option value="monto-asc">Monto (menor a mayor)</option>
          </select>
        </div>
      </div>
      <div id="gf-list"><p class="empty-state">Cargando…</p></div>
    </div>

    <dialog id="categoria-modal" class="modal">
      <form class="modal__form" id="categoria-form">
        <h2 class="modal__title">Nueva categoría</h2>
        <div class="field">
          <label for="categoria-modal-input">Nombre</label>
          <input id="categoria-modal-input" type="text" placeholder="Ej. Vivienda" required />
        </div>
        <p class="empty-state" id="categoria-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="categoria-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Agregar</button>
        </div>
      </form>
    </dialog>

    <dialog id="diferencia-modal" class="modal">
      <div class="modal__form">
        <h2 class="modal__title">Diferencias entre lo esperado y lo pagado</h2>
        <div id="diferencia-list"></div>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="diferencia-modal-close">Cerrar</button>
        </div>
      </div>
    </dialog>

    <dialog id="edit-modal" class="modal">
      <form class="modal__form" id="edit-form">
        <h2 class="modal__title">Editar gasto fijo</h2>
        <div class="field"><label for="edit-nombre">Nombre</label><input id="edit-nombre" type="text" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="edit-categoria-mount"></div>
        </div>
        <div class="field"><label for="edit-monto">Monto</label><input id="edit-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="edit-dia">Día de pago</label><input id="edit-dia" type="number" min="1" max="31" /></div>
        <p class="empty-state" id="edit-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#gf-total")!;
  const pendienteEl = container.querySelector<HTMLDivElement>("#gf-pendiente")!;
  const pagadoEl = container.querySelector<HTMLDivElement>("#gf-pagado")!;
  const diferenciaBtn = container.querySelector<HTMLButtonElement>("#gf-diferencia-btn")!;
  const diferenciaValorEl = container.querySelector<HTMLSpanElement>("#gf-diferencia-valor")!;
  const diferenciaModal = container.querySelector<HTMLDialogElement>("#diferencia-modal")!;
  const diferenciaListEl = container.querySelector<HTMLDivElement>("#diferencia-list")!;
  const diferenciaModalClose = container.querySelector<HTMLButtonElement>("#diferencia-modal-close")!;
  const listEl = container.querySelector<HTMLDivElement>("#gf-list")!;
  const form = container.querySelector<HTMLFormElement>("#gasto-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gasto-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const nombreInput = container.querySelector<HTMLInputElement>("#gf-nombre")!;
  const nombresDatalist = container.querySelector<HTMLDataListElement>("#gf-nombres-datalist")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gf-monto")!;
  const diaInput = container.querySelector<HTMLInputElement>("#gf-dia")!;
  const ordenSelect = container.querySelector<HTMLSelectElement>("#gf-orden")!;

  const categoriaModal = container.querySelector<HTMLDialogElement>("#categoria-modal")!;
  const categoriaForm = container.querySelector<HTMLFormElement>("#categoria-form")!;
  const categoriaModalInput = container.querySelector<HTMLInputElement>("#categoria-modal-input")!;
  const categoriaModalError = container.querySelector<HTMLParagraphElement>("#categoria-modal-error")!;
  const categoriaModalCancel = container.querySelector<HTMLButtonElement>("#categoria-modal-cancel")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editNombreInput = container.querySelector<HTMLInputElement>("#edit-nombre")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editDiaInput = container.querySelector<HTMLInputElement>("#edit-dia")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;

  let spreadsheetId = "";
  let categorias: string[] = [];
  let nombresConocidos: string[] = [];
  let currentGastos: GastoFijo[] = [];
  let sortOrder: SortOrder = "nombre";
  let busy = false;
  let formCategoriaValue = "";
  let editCategoriaValue = "";
  let editingGasto: GastoFijo | null = null;

  function refreshCombos(): void {
    categoriaCombo.refresh();
    editCategoriaCombo.refresh();
  }

  function renderNombresDatalist(): void {
    nombresDatalist.innerHTML = nombresConocidos.map((n) => `<option value="${n}"></option>`).join("");
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
    const enUso = currentGastos.some((g) => g.categoria === categoria);
    if (enUso) {
      await showAlert(
        `No puedes eliminar "${categoria}" porque tienes gastos fijos con esta categoría. Edítalos o elimínalos primero.`,
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
  container.querySelector("#gf-categoria-mount")!.appendChild(categoriaCombo.el);

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

  function openEditModal(gasto: GastoFijo): void {
    editingGasto = gasto;
    editNombreInput.value = gasto.nombre;
    editCategoriaValue = gasto.categoria;
    editCategoriaCombo.refresh();
    editMontoInput.value = String(gasto.monto);
    editDiaInput.value = gasto.diaPago;
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
        if (!nombre || !monto || monto <= 0) {
          editModalError.hidden = false;
          editModalError.textContent = "Ingresa un nombre y un monto válido.";
          return;
        }
        if (!editingGasto) return;
        const confirmBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          await actualizarGastoFijo(spreadsheetId, editingGasto, {
            nombre,
            monto,
            categoria: editCategoriaValue,
            diaPago: editDiaInput.value.trim(),
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

  function openDiferenciaModal(): void {
    const diffs = diferenciasPago(currentGastos);
    if (diffs.length === 0) {
      diferenciaListEl.innerHTML = `<p class="empty-state">No hay diferencias este mes: lo que pagaste coincide con lo esperado.</p>`;
    } else {
      diferenciaListEl.innerHTML = diffs
        .map(({ gasto, diferencia }) => {
          const mas = diferencia > 0;
          return `
            <div class="record-row">
              <div class="record-row__main">
                <span class="record-row__title">${gasto.nombre}</span>
                <span class="record-row__subtitle">Esperado ${formatMoney(gasto.monto)} · Pagaste ${formatMoney(gasto.montoPagado ?? gasto.monto)}</span>
              </div>
              <div class="record-row__amount" style="color:${mas ? "var(--color-danger)" : "var(--color-success)"}">
                ${mas ? "+" : ""}${formatMoney(diferencia)}
              </div>
            </div>
          `;
        })
        .join("");
    }
    diferenciaModal.showModal();
  }

  diferenciaBtn.addEventListener("click", openDiferenciaModal);
  diferenciaModalClose.addEventListener("click", () => diferenciaModal.close());

  function renderList(): void {
    totalEl.textContent = formatMoney(currentGastos.reduce((s, g) => s + g.monto, 0));
    pendienteEl.textContent = formatMoney(sumGastosFijosPendientes(currentGastos));
    pagadoEl.textContent = formatMoney(sumGastosFijosPagado(currentGastos));
    diferenciaValorEl.textContent = formatMoney(sumDiferenciasPago(currentGastos));

    if (currentGastos.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aún no registras gastos fijos este mes.</p>`;
      return;
    }

    const ordered = sortGastos(currentGastos, sortOrder);
    const rows = ordered
      .map((gasto) => {
        const pagado = gasto.estado === "Pagado";
        const diaPagoNum = Number(gasto.diaPago) || 0;
        const esHoy = diaPagoNum === hoy;
        const vencido = !pagado && diaPagoNum > 0 && diaPagoNum < hoy;
        const tieneDiferencia = pagado && gasto.montoPagado !== null && gasto.montoPagado !== gasto.monto;
        const diferencia = tieneDiferencia ? (gasto.montoPagado as number) - gasto.monto : 0;
        const diferenciaHtml = tieneDiferencia
          ? `<div class="amount-diff" style="color:${diferencia > 0 ? "var(--color-danger)" : "var(--color-success)"}">${diferencia > 0 ? "+" : ""}${formatMoney(diferencia)}</div>`
          : "";
        const diaBadge = vencido
          ? ` <span class="badge badge--vencido">Vencido</span>`
          : esHoy
            ? ` <span class="badge badge--today">Hoy</span>`
            : "";
        return `
          <tr data-row="${gasto.row}" class="${vencido ? "is-vencido" : esHoy ? "is-today" : ""}">
            <td data-label="Nombre">${gasto.nombre}</td>
            <td data-label="Categoría">${gasto.categoria ? `<span class="badge">${gasto.categoria}</span>` : "—"}</td>
            <td data-label="Día de pago">${gasto.diaPago || "—"}${diaBadge}</td>
            <td data-label="Estado"><button type="button" class="btn-toggle ${pagado ? "" : "is-off"}" data-row="${gasto.row}" data-action="toggle">${pagado ? "Pagado" : "Pendiente"}</button></td>
            <td data-label="Monto" class="text-right amount-cell">${formatMoney(pagado ? (gasto.montoPagado ?? gasto.monto) : gasto.monto)}${diferenciaHtml}</td>
            <td class="actions-cell">
              <button type="button" class="icon-btn icon-btn--edit" data-row="${gasto.row}" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
              <button type="button" class="icon-btn icon-btn--delete" data-row="${gasto.row}" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
            </td>
          </tr>
        `;
      })
      .join("");

    listEl.innerHTML = `
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Día de pago</th>
              <th>Estado</th>
              <th class="text-right">Monto</th>
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
      const gasto = currentGastos.find((g) => g.row === row);
      if (!gasto) return;

      if (btn.dataset.action === "toggle") {
        const pagado = gasto.estado === "Pagado";
        btn.addEventListener("click", async () => {
          if (pagado) {
            void runAction(() => marcarGastoPendiente(spreadsheetId, gasto));
            return;
          }
          const montoPagado = await showMontoPagadoDialog(gasto.nombre, gasto.monto);
          if (montoPagado === null) return;
          void runAction(() => marcarGastoPagado(spreadsheetId, gasto, montoPagado));
        });
      } else if (btn.dataset.action === "edit") {
        btn.addEventListener("click", () => openEditModal(gasto));
      } else if (btn.dataset.action === "delete") {
        btn.addEventListener("click", async () => {
          const ok = await showConfirm(`¿Eliminar el gasto fijo "${gasto.nombre}" de ${formatMoney(gasto.monto)}?`, {
            title: "Eliminar gasto fijo",
            confirmLabel: "Eliminar",
            danger: true,
          });
          if (!ok) return;
          void runAction(() => eliminarGastoFijo(spreadsheetId, gasto));
        });
      }
    });
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    renderList();
    try {
      await action();
      await reload();
    } finally {
      busy = false;
      renderList();
    }
  }

  async function reload(): Promise<void> {
    currentGastos = await listGastosFijosDelMes(spreadsheetId);
    renderList();
  }

  ordenSelect.addEventListener("change", () => {
    sortOrder = ordenSelect.value as SortOrder;
    renderList();
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

    submitBtn.disabled = true;
    try {
      await crearGastoFijo(spreadsheetId, nombre, monto, formCategoriaValue, diaInput.value.trim());
      if (!nombresConocidos.includes(nombre)) {
        nombresConocidos.push(nombre);
        renderNombresDatalist();
      }
      nombreInput.value = "";
      montoInput.value = "";
      diaInput.value = "";
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
    const [categoriasList, nombresList] = await Promise.all([
      listCategorias(spreadsheetId),
      listGastosFijosNombres(spreadsheetId),
    ]);
    categorias = categoriasList;
    nombresConocidos = nombresList;
    formCategoriaValue = categorias[0] ?? "";
    refreshCombos();
    renderNombresDatalist();
    await reload();
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
