import cashBanknotePlusIcon from "../../icon/cash-banknote-plus.svg?raw";
import editIcon from "../../icon/edit.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney, formatMonthLabel } from "../../domain/format";
import { listGastosFijosDelMes, sumGastosFijosTotal } from "../../domain/gastos";
import { listGastosDelMes, sumGastos as sumGastosYCompras } from "../../domain/gastos-y-compras";
import {
  actualizarIngreso,
  crearIngreso,
  crearTipoIngreso,
  eliminarIngreso,
  eliminarTipoIngreso,
  listIngresosVigentes,
  listTiposIngreso,
  setIngresoActivo,
  sumIngresosActivos,
  sumIngresosFijosRecurrentes,
  type IngresoFijo,
} from "../../domain/ingresos";
import { showAlert, showConfirm } from "../components/dialogs";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

type SortOrder = "tipo" | "monto-desc" | "monto-asc";

function sortIngresos(list: IngresoFijo[], order: SortOrder): IngresoFijo[] {
  const copy = [...list];
  switch (order) {
    case "monto-desc":
      return copy.sort((a, b) => b.monto - a.monto);
    case "monto-asc":
      return copy.sort((a, b) => a.monto - b.monto);
    default:
      return copy.sort((a, b) => a.tipo.localeCompare(b.tipo, "es"));
  }
}

export async function renderIngresos(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${cashBanknotePlusIcon} Ingresos Fijos</h1>
      <span class="month-badge">${formatMonthLabel()}</span>
    </div>
    <div class="card-grid" style="max-width:820px">
      <div class="card stat-card stat-card--primary">
        <div class="stat-card__value" id="ingresos-total">—</div>
        <div class="stat-card__label">Total mensual vigente</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="ingresos-total-fijo">—</div>
        <div class="stat-card__label">Ingresos fijos recurrentes</div>
      </div>
      <div class="card stat-card">
        <div class="stat-card__value" id="ingresos-balance">—</div>
        <div class="stat-card__label">Balance disponible este mes</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar ingreso</h2>
      <form id="ingreso-form" class="form">
        <div class="field">
          <label>Tipo</label>
          <div id="ingreso-tipo-mount"></div>
        </div>
        <div class="field">
          <label for="ingreso-recurrencia">¿Cada cuánto aplica?</label>
          <select id="ingreso-recurrencia">
            <option value="Fijo">Todos los meses (fijo)</option>
            <option value="UnicoMes">Solo este mes</option>
          </select>
        </div>
        <div class="field">
          <label for="ingreso-monto">Monto</label>
          <input id="ingreso-monto" type="number" min="0" step="0.01" required />
        </div>
        <div class="field">
          <label for="ingreso-notas">Notas (opcional)</label>
          <input id="ingreso-notas" type="text" />
        </div>
        <button type="submit" class="btn">Guardar ingreso</button>
      </form>
      <p class="empty-state" id="ingreso-form-error" hidden></p>
    </div>

    <div class="card">
      <div class="table-toolbar">
        <h2 style="margin:0">Tus ingresos — ${formatMonthLabel()}</h2>
        <div class="field field--inline">
          <label for="ingresos-orden">Ordenar por</label>
          <select id="ingresos-orden">
            <option value="tipo">Tipo (A-Z)</option>
            <option value="monto-desc">Monto (mayor a menor)</option>
            <option value="monto-asc">Monto (menor a mayor)</option>
          </select>
        </div>
      </div>
      <div id="ingresos-list"><p class="empty-state">Cargando…</p></div>
    </div>

    <dialog id="tipo-modal" class="modal">
      <form class="modal__form" id="tipo-form">
        <h2 class="modal__title">Nuevo tipo de ingreso</h2>
        <div class="field">
          <label for="tipo-modal-input">Nombre</label>
          <input id="tipo-modal-input" type="text" placeholder="Ej. Arriendo recibido" required />
        </div>
        <p class="empty-state" id="tipo-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="tipo-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Agregar</button>
        </div>
      </form>
    </dialog>

    <dialog id="edit-modal" class="modal">
      <form class="modal__form" id="edit-form">
        <h2 class="modal__title">Editar ingreso</h2>
        <div class="field">
          <label>Tipo</label>
          <div id="edit-tipo-mount"></div>
        </div>
        <div class="field">
          <label for="edit-recurrencia">¿Cada cuánto aplica?</label>
          <select id="edit-recurrencia">
            <option value="Fijo">Todos los meses (fijo)</option>
            <option value="UnicoMes">Solo este mes</option>
          </select>
        </div>
        <div class="field">
          <label for="edit-monto">Monto</label>
          <input id="edit-monto" type="number" min="0" step="0.01" required />
        </div>
        <div class="field">
          <label for="edit-notas">Notas</label>
          <input id="edit-notas" type="text" />
        </div>
        <p class="empty-state" id="edit-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#ingresos-total")!;
  const totalFijoEl = container.querySelector<HTMLDivElement>("#ingresos-total-fijo")!;
  const balanceEl = container.querySelector<HTMLDivElement>("#ingresos-balance")!;
  const recurrenciaSelect = container.querySelector<HTMLSelectElement>("#ingreso-recurrencia")!;
  const montoInput = container.querySelector<HTMLInputElement>("#ingreso-monto")!;
  const notasInput = container.querySelector<HTMLInputElement>("#ingreso-notas")!;
  const form = container.querySelector<HTMLFormElement>("#ingreso-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#ingreso-form-error")!;
  const listEl = container.querySelector<HTMLDivElement>("#ingresos-list")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const ordenSelect = container.querySelector<HTMLSelectElement>("#ingresos-orden")!;

  const tipoModal = container.querySelector<HTMLDialogElement>("#tipo-modal")!;
  const tipoForm = container.querySelector<HTMLFormElement>("#tipo-form")!;
  const tipoModalInput = container.querySelector<HTMLInputElement>("#tipo-modal-input")!;
  const tipoModalError = container.querySelector<HTMLParagraphElement>("#tipo-modal-error")!;
  const tipoModalCancel = container.querySelector<HTMLButtonElement>("#tipo-modal-cancel")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editRecurrenciaSelect = container.querySelector<HTMLSelectElement>("#edit-recurrencia")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editNotasInput = container.querySelector<HTMLInputElement>("#edit-notas")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;

  let spreadsheetId = "";
  let tipos: string[] = [];
  let currentIngresos: IngresoFijo[] = [];
  let gastosDelMesTotal = 0;
  let sortOrder: SortOrder = "tipo";
  let busy = false;
  let formTipoValue = "";
  let editTipoValue = "";
  let editingIngreso: IngresoFijo | null = null;

  function refreshCombos(): void {
    tipoCombo.refresh();
    editTipoCombo.refresh();
  }

  /** Abre el modal para crear un tipo nuevo; al confirmar, lo selecciona con onDone. */
  function openTipoModal(onDone: (nombre: string) => void): void {
    tipoModalInput.value = "";
    tipoModalError.hidden = true;
    const controller = new AbortController();
    const { signal } = controller;

    tipoModal.addEventListener("cancel", () => controller.abort(), { signal });

    tipoModalCancel.addEventListener(
      "click",
      () => {
        controller.abort();
        tipoModal.close();
      },
      { signal },
    );

    tipoForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = tipoModalInput.value.trim();
        if (!nombre) {
          tipoModalError.hidden = false;
          tipoModalError.textContent = "Escribe un nombre.";
          return;
        }
        const confirmBtn = tipoForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          if (!tipos.includes(nombre)) {
            await crearTipoIngreso(spreadsheetId, nombre);
            tipos.push(nombre);
          }
          controller.abort();
          tipoModal.close();
          onDone(nombre);
          refreshCombos();
        } catch (err) {
          tipoModalError.hidden = false;
          tipoModalError.textContent = err instanceof Error ? err.message : "No se pudo crear el tipo.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    tipoModal.showModal();
    tipoModalInput.focus();
  }

  async function handleDeleteTipo(tipo: string): Promise<void> {
    const enUso = currentIngresos.some((i) => i.tipo === tipo);
    if (enUso) {
      await showAlert(
        `No puedes eliminar "${tipo}" porque tienes ingresos activos de este tipo. Edítalos o elimínalos primero.`,
        "No se puede eliminar",
      );
      return;
    }
    const ok = await showConfirm(`¿Eliminar el tipo "${tipo}"? Podrás volver a crearlo cuando quieras.`, {
      title: "Eliminar tipo",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await eliminarTipoIngreso(spreadsheetId, tipo);
      tipos = tipos.filter((t) => t !== tipo);
      if (formTipoValue === tipo) formTipoValue = tipos[0] ?? "";
      if (editTipoValue === tipo) editTipoValue = tipos[0] ?? "";
      refreshCombos();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo eliminar el tipo.", "Error");
    }
  }

  const tipoCombo: OptionCombo = createOptionCombo({
    getOptions: () => tipos,
    getValue: () => formTipoValue,
    onSelect: (tipo) => {
      formTipoValue = tipo;
      tipoCombo.refresh();
    },
    onRequestNuevo: () =>
      openTipoModal((nombre) => {
        formTipoValue = nombre;
      }),
    onRequestDelete: (tipo) => void handleDeleteTipo(tipo),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#ingreso-tipo-mount")!.appendChild(tipoCombo.el);

  const editTipoCombo: OptionCombo = createOptionCombo({
    getOptions: () => tipos,
    getValue: () => editTipoValue,
    onSelect: (tipo) => {
      editTipoValue = tipo;
      editTipoCombo.refresh();
    },
    onRequestNuevo: () =>
      openTipoModal((nombre) => {
        editTipoValue = nombre;
      }),
    onRequestDelete: (tipo) => void handleDeleteTipo(tipo),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#edit-tipo-mount")!.appendChild(editTipoCombo.el);

  function openEditModal(ingreso: IngresoFijo): void {
    editingIngreso = ingreso;
    editTipoValue = ingreso.tipo;
    editTipoCombo.refresh();
    editRecurrenciaSelect.value = ingreso.recurrencia;
    editMontoInput.value = String(ingreso.monto);
    editNotasInput.value = ingreso.notas;
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
        const monto = Number(editMontoInput.value);
        if (!monto || monto <= 0) {
          editModalError.hidden = false;
          editModalError.textContent = "Ingresa un monto válido.";
          return;
        }
        if (!editingIngreso) return;
        const confirmBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          await actualizarIngreso(spreadsheetId, editingIngreso, {
            tipo: editTipoValue,
            monto,
            notas: editNotasInput.value.trim(),
            recurrencia: editRecurrenciaSelect.value === "UnicoMes" ? "UnicoMes" : "Fijo",
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

  function renderList(): void {
    const totalIngresos = sumIngresosActivos(currentIngresos);
    totalEl.textContent = formatMoney(totalIngresos);
    totalFijoEl.textContent = formatMoney(sumIngresosFijosRecurrentes(currentIngresos));
    balanceEl.textContent = formatMoney(totalIngresos - gastosDelMesTotal);

    if (currentIngresos.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aún no tienes ingresos registrados este mes. Agrega el primero arriba.</p>`;
      return;
    }

    const ordered = sortIngresos(currentIngresos, sortOrder);
    const rows = ordered
      .map((ingreso) => {
        const esFijo = ingreso.recurrencia === "Fijo";
        const estadoCell = esFijo
          ? `<button type="button" class="btn-toggle ${ingreso.activo ? "" : "is-off"}" data-row="${ingreso.row}" data-action="toggle">${ingreso.activo ? "Activo" : "Pausado"}</button>`
          : `<span class="badge badge--neutral">Puntual</span>`;
        return `
          <tr data-row="${ingreso.row}">
            <td data-label="Tipo">${ingreso.tipo}</td>
            <td data-label="Recurrencia"><span class="badge ${esFijo ? "badge--fijo" : "badge--unico"}">${esFijo ? "Fijo" : "Solo este mes"}</span></td>
            <td data-label="Notas" class="text-muted">${ingreso.notas || "—"}</td>
            <td data-label="Estado">${estadoCell}</td>
            <td data-label="Monto" class="text-right amount-cell">${formatMoney(ingreso.monto)}</td>
            <td class="actions-cell">
              <button type="button" class="icon-btn icon-btn--edit" data-row="${ingreso.row}" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
              <button type="button" class="icon-btn icon-btn--delete" data-row="${ingreso.row}" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
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
              <th>Tipo</th>
              <th>Recurrencia</th>
              <th>Notas</th>
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
      const ingreso = currentIngresos.find((i) => i.row === row);
      if (!ingreso) return;

      if (btn.dataset.action === "toggle") {
        btn.addEventListener("click", () => runAction(() => setIngresoActivo(spreadsheetId, ingreso, !ingreso.activo)));
      } else if (btn.dataset.action === "edit") {
        btn.addEventListener("click", () => openEditModal(ingreso));
      } else if (btn.dataset.action === "delete") {
        btn.addEventListener("click", async () => {
          const ok = await showConfirm(`¿Eliminar el ingreso "${ingreso.tipo}" de ${formatMoney(ingreso.monto)}?`, {
            title: "Eliminar ingreso",
            confirmLabel: "Eliminar",
            danger: true,
          });
          if (!ok) return;
          void runAction(() => eliminarIngreso(spreadsheetId, ingreso));
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
    currentIngresos = await listIngresosVigentes(spreadsheetId);
    renderList();
  }

  ordenSelect.addEventListener("change", () => {
    sortOrder = ordenSelect.value as SortOrder;
    renderList();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const monto = Number(montoInput.value);
    if (!monto || monto <= 0) {
      formError.hidden = false;
      formError.textContent = "Ingresa un monto válido.";
      return;
    }
    if (!formTipoValue) {
      formError.hidden = false;
      formError.textContent = "Elige o crea un tipo de ingreso.";
      return;
    }

    submitBtn.disabled = true;
    try {
      await crearIngreso(
        spreadsheetId,
        formTipoValue,
        monto,
        notasInput.value.trim(),
        recurrenciaSelect.value === "UnicoMes" ? "UnicoMes" : "Fijo",
      );
      montoInput.value = "";
      notasInput.value = "";
      recurrenciaSelect.value = "Fijo";
      await reload();
    } catch (err) {
      formError.hidden = false;
      formError.textContent = err instanceof Error ? err.message : "No se pudo guardar el ingreso.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  try {
    const ensured = await ensureSpreadsheet();
    spreadsheetId = ensured.spreadsheetId;
    const [tiposList, gastosFijos, gastosYCompras] = await Promise.all([
      listTiposIngreso(spreadsheetId),
      listGastosFijosDelMes(spreadsheetId),
      listGastosDelMes(spreadsheetId),
    ]);
    tipos = tiposList;
    gastosDelMesTotal = sumGastosFijosTotal(gastosFijos) + sumGastosYCompras(gastosYCompras);
    formTipoValue = tipos[0] ?? "";
    refreshCombos();
    await reload();
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
