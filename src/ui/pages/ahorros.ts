import editIcon from "../../icon/edit.svg?raw";
import moneybagPlusIcon from "../../icon/moneybag-plus.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney, todayISO } from "../../domain/format";
import {
  buscarGastoPorId,
  deshacerAhorrando,
  marcarComoPagado as marcarGastoComoPagado,
} from "../../domain/gastos-y-compras";
import {
  actualizarMeta,
  agruparMovimientosPorMeta,
  calcularAcumulado,
  calcularProgresoPct,
  crearMeta,
  crearTipoMeta,
  eliminarMeta,
  eliminarTipoMeta,
  listMetas,
  listTiposMeta,
  listTodosLosMovimientos,
  registrarAporte,
  registrarRetiro,
  setEstadoMeta,
  type Meta,
  type MetaCambios,
  type MovimientoMeta,
} from "../../domain/metas";
import { showAbonoDialog, showAlert, showConfirm, showRetiroDialog } from "../components/dialogs";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

type SortOrder = "progreso" | "fecha-limite";

export async function renderAhorros(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${moneybagPlusIcon} Ahorros y Metas</h1>
    </div>
    <div class="card stat-card stat-card--primary" style="max-width:280px;margin-bottom:20px">
      <div class="stat-card__value" id="ah-total">—</div>
      <div class="stat-card__label">Total acumulado</div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar meta</h2>
      <form id="meta-form" class="form">
        <div class="field"><label for="mt-nombre">Nombre</label><input id="mt-nombre" type="text" placeholder="Ej. Vacaciones" required /></div>
        <div class="field">
          <label>Tipo</label>
          <div id="mt-tipo-mount"></div>
        </div>
        <div class="field"><label for="mt-monto">Monto objetivo</label><input id="mt-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="mt-fecha-limite">Fecha límite (opcional)</label><input id="mt-fecha-limite" type="date" /></div>
        <button type="submit" class="btn">Guardar meta</button>
      </form>
      <p class="empty-state" id="meta-form-error" hidden></p>
    </div>

    <div class="table-toolbar" style="margin-bottom:0">
      <span></span>
      <div class="field field--inline">
        <label for="ah-orden">Ordenar por</label>
        <select id="ah-orden">
          <option value="progreso">Más cerca de cumplirse</option>
          <option value="fecha-limite">Fecha límite más próxima</option>
        </select>
      </div>
    </div>

    <div id="ah-activas-list" class="deuda-list" style="margin-top:14px"><p class="empty-state">Cargando…</p></div>

    <details class="card" id="ah-cumplidas-card" style="margin-top:20px">
      <summary style="cursor:pointer;font-weight:700">Cumplidas</summary>
      <div id="ah-cumplidas-list" class="deuda-list" style="margin-top:14px"></div>
    </details>

    <dialog id="edit-modal" class="modal">
      <form class="modal__form" id="edit-form">
        <h2 class="modal__title">Editar meta</h2>
        <div class="field"><label for="edit-nombre">Nombre</label><input id="edit-nombre" type="text" required /></div>
        <div class="field">
          <label>Tipo</label>
          <div id="edit-tipo-mount"></div>
        </div>
        <div class="field"><label for="edit-monto">Monto objetivo</label><input id="edit-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="edit-fecha-limite">Fecha límite</label><input id="edit-fecha-limite" type="date" /></div>
        <p class="empty-state" id="edit-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>

    <dialog id="tipo-modal" class="modal">
      <form class="modal__form" id="tipo-form">
        <h2 class="modal__title">Nuevo tipo de meta</h2>
        <div class="field">
          <label for="tipo-modal-input">Nombre</label>
          <input id="tipo-modal-input" type="text" placeholder="Ej. Viaje" required />
        </div>
        <p class="empty-state" id="tipo-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="tipo-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Agregar</button>
        </div>
      </form>
    </dialog>

    <dialog id="historial-modal" class="modal">
      <div class="modal__form">
        <h2 class="modal__title" id="historial-titulo">Historial</h2>
        <div id="historial-list"></div>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="historial-modal-close">Cerrar</button>
        </div>
      </div>
    </dialog>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#ah-total")!;
  const activasListEl = container.querySelector<HTMLDivElement>("#ah-activas-list")!;
  const cumplidasListEl = container.querySelector<HTMLDivElement>("#ah-cumplidas-list")!;
  const cumplidasCard = container.querySelector<HTMLDetailsElement>("#ah-cumplidas-card")!;
  const ordenSelect = container.querySelector<HTMLSelectElement>("#ah-orden")!;

  const form = container.querySelector<HTMLFormElement>("#meta-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#meta-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const nombreInput = container.querySelector<HTMLInputElement>("#mt-nombre")!;
  const montoInput = container.querySelector<HTMLInputElement>("#mt-monto")!;
  const fechaLimiteInput = container.querySelector<HTMLInputElement>("#mt-fecha-limite")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;
  const editNombreInput = container.querySelector<HTMLInputElement>("#edit-nombre")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editFechaLimiteInput = container.querySelector<HTMLInputElement>("#edit-fecha-limite")!;

  const tipoModal = container.querySelector<HTMLDialogElement>("#tipo-modal")!;
  const tipoForm = container.querySelector<HTMLFormElement>("#tipo-form")!;
  const tipoModalInput = container.querySelector<HTMLInputElement>("#tipo-modal-input")!;
  const tipoModalError = container.querySelector<HTMLParagraphElement>("#tipo-modal-error")!;
  const tipoModalCancel = container.querySelector<HTMLButtonElement>("#tipo-modal-cancel")!;

  const historialModal = container.querySelector<HTMLDialogElement>("#historial-modal")!;
  const historialTitulo = container.querySelector<HTMLHeadingElement>("#historial-titulo")!;
  const historialListEl = container.querySelector<HTMLDivElement>("#historial-list")!;
  const historialModalClose = container.querySelector<HTMLButtonElement>("#historial-modal-close")!;

  let spreadsheetId = "";
  let metas: Meta[] = [];
  let movimientosPorMeta = new Map<string, MovimientoMeta[]>();
  let tiposMeta: string[] = [];
  let formTipoValue = "";
  let editTipoValue = "";
  let sortOrder: SortOrder = "progreso";
  let busy = false;
  let editingMeta: Meta | null = null;

  function refreshCombos(): void {
    tipoCombo.refresh();
    editTipoCombo.refresh();
  }

  function openTipoModal(onDone: (nombre: string) => void): void {
    tipoModalInput.value = "";
    tipoModalError.hidden = true;
    const controller = new AbortController();
    const { signal } = controller;

    tipoModal.addEventListener("cancel", () => controller.abort(), { signal });
    tipoModalCancel.addEventListener("click", () => { controller.abort(); tipoModal.close(); }, { signal });

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
          if (!tiposMeta.includes(nombre)) {
            await crearTipoMeta(spreadsheetId, nombre);
            tiposMeta.push(nombre);
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

  async function handleDeleteTipo(nombre: string): Promise<void> {
    const enUso = metas.some((m) => m.tipo === nombre);
    if (enUso) {
      await showAlert(
        `No puedes eliminar "${nombre}" porque tienes metas con este tipo. Edítalas primero.`,
        "No se puede eliminar",
      );
      return;
    }
    const ok = await showConfirm(`¿Eliminar el tipo "${nombre}"? Podrás volver a crearlo cuando quieras.`, {
      title: "Eliminar tipo",
      confirmLabel: "Eliminar",
      danger: true,
    });
    if (!ok) return;
    try {
      await eliminarTipoMeta(spreadsheetId, nombre);
      tiposMeta = tiposMeta.filter((t) => t !== nombre);
      if (formTipoValue === nombre) formTipoValue = tiposMeta[0] ?? "";
      if (editTipoValue === nombre) editTipoValue = tiposMeta[0] ?? "";
      refreshCombos();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo eliminar el tipo.", "Error");
    }
  }

  const tipoCombo: OptionCombo = createOptionCombo({
    getOptions: () => tiposMeta,
    getValue: () => formTipoValue,
    onSelect: (tipo) => { formTipoValue = tipo; tipoCombo.refresh(); },
    onRequestNuevo: () => openTipoModal((nombre) => { formTipoValue = nombre; }),
    onRequestDelete: (tipo) => void handleDeleteTipo(tipo),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#mt-tipo-mount")!.appendChild(tipoCombo.el);

  const editTipoCombo: OptionCombo = createOptionCombo({
    getOptions: () => tiposMeta,
    getValue: () => editTipoValue,
    onSelect: (tipo) => { editTipoValue = tipo; editTipoCombo.refresh(); },
    onRequestNuevo: () => openTipoModal((nombre) => { editTipoValue = nombre; }),
    onRequestDelete: (tipo) => void handleDeleteTipo(tipo),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#edit-tipo-mount")!.appendChild(editTipoCombo.el);

  historialModalClose.addEventListener("click", () => historialModal.close());

  function openHistorialModal(meta: Meta): void {
    historialTitulo.textContent = `Historial — ${meta.nombre}`;
    const movimientos = [...(movimientosPorMeta.get(meta.id) ?? [])].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (movimientos.length === 0) {
      historialListEl.innerHTML = `<p class="empty-state">Aún no hay movimientos registrados.</p>`;
    } else {
      let acumulado = 0;
      historialListEl.innerHTML = movimientos
        .map((m) => {
          const esRetiro = m.tipo === "Retiro";
          acumulado += esRetiro ? -m.monto : m.monto;
          const tipoLabel = m.tipo === "AporteAutomatico" ? "Aporte automático" : m.tipo === "Retiro" ? "Retiro" : "Aporte manual";
          return `
            <div class="record-row">
              <div class="record-row__main">
                <span class="record-row__title">${tipoLabel} — ${m.fecha}</span>
                <span class="record-row__subtitle">${m.nota || "—"} · Acumulado después: ${formatMoney(acumulado)}</span>
              </div>
              <div class="record-row__amount" style="color:${esRetiro ? "var(--color-danger)" : "var(--color-success)"}">${esRetiro ? "-" : "+"}${formatMoney(m.monto)}</div>
            </div>
          `;
        })
        .join("");
    }
    historialModal.showModal();
  }

  function renderMetaCard(meta: Meta): HTMLDivElement {
    const movimientos = movimientosPorMeta.get(meta.id) ?? [];
    const acumulado = calcularAcumulado(movimientos);
    const progreso = calcularProgresoPct(meta, movimientos);
    const cumplida = meta.estado === "Cumplida";
    const pausada = meta.estado === "Pausada";
    const card = document.createElement("div");
    card.className = "card deuda-card";
    card.innerHTML = `
      <div class="deuda-card__header">
        <div>
          <span class="deuda-card__contraparte">${meta.nombre}</span>
          ${meta.tipo ? `<span class="badge">${meta.tipo}</span>` : ""}
          ${meta.compraVinculadaId ? `<span class="badge">Vinculada a una compra</span>` : ""}
          ${cumplida ? `<span class="badge badge--fijo">Cumplida</span>` : pausada ? `<span class="badge badge--neutral">Pausada</span>` : ""}
        </div>
        <div class="deuda-card__actions">
          <button type="button" class="icon-btn icon-btn--edit" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
          <button type="button" class="icon-btn icon-btn--delete" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-bar__fill" style="width:${progreso}%"></div></div>
      <div class="deuda-card__stats">
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Acumulado</span><span class="deuda-card__stat-value deuda-card__stat-value--total">${formatMoney(acumulado)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Objetivo</span><span class="deuda-card__stat-value">${formatMoney(meta.montoObjetivo)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Progreso</span><span class="deuda-card__stat-value">${progreso.toFixed(0)}%</span></div>
      </div>
      ${meta.fechaLimite ? `<p class="empty-state" style="margin:10px 0 0">Fecha límite: ${meta.fechaLimite}</p>` : ""}
      <div class="deuda-card__footer">
        ${!cumplida ? `<button type="button" class="btn" data-action="aportar">Aportar</button>` : ""}
        ${!cumplida && acumulado > 0 ? `<button type="button" class="btn-secondary" data-action="retirar">Retirar</button>` : ""}
        <button type="button" class="btn-secondary" data-action="historial">Ver historial</button>
        ${meta.compraVinculadaId && !cumplida && progreso >= 100 ? `<button type="button" class="btn" data-action="marcar-comprada">Marcar compra como pagada</button>` : ""}
        ${meta.compraVinculadaId && !cumplida ? `<button type="button" class="btn-secondary" data-action="deshacer-conversion">Deshacer conversión</button>` : ""}
        ${!cumplida ? `<button type="button" class="btn-secondary" data-action="${pausada ? "reanudar" : "pausar"}">${pausada ? "Reanudar" : "Pausar"}</button>` : ""}
        ${!cumplida ? `<button type="button" class="btn-secondary" data-action="cumplida">Marcar cumplida</button>` : `<button type="button" class="btn-secondary" data-action="reabrir">Reabrir</button>`}
      </div>
    `;

    card.querySelector('[data-action="edit"]')!.addEventListener("click", () => openEditModal(meta));
    card.querySelector('[data-action="delete"]')!.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Eliminar la meta "${meta.nombre}"? Se borrará también su historial.`, {
        title: "Eliminar meta",
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      void runAction(() => eliminarMeta(spreadsheetId, meta));
    });
    card.querySelector('[data-action="historial"]')!.addEventListener("click", () => openHistorialModal(meta));

    card.querySelector('[data-action="aportar"]')?.addEventListener("click", async () => {
      const resultado = await showAbonoDialog(`Aportar — ${meta.nombre}`);
      if (!resultado) return;
      void runAction(() => registrarAporte(spreadsheetId, meta, resultado.fecha, resultado.monto, resultado.nota));
    });

    card.querySelector('[data-action="retirar"]')?.addEventListener("click", async () => {
      const resultado = await showRetiroDialog(`Retirar — ${meta.nombre}`, acumulado);
      if (!resultado) return;
      void runAction(() => registrarRetiro(spreadsheetId, meta, movimientosPorMeta.get(meta.id) ?? [], resultado.fecha, resultado.monto, resultado.motivo));
    });

    card.querySelector('[data-action="cumplida"]')?.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Marcar la meta "${meta.nombre}" como cumplida?`, { title: "Marcar cumplida", confirmLabel: "Marcar cumplida" });
      if (!ok) return;
      void runAction(() => setEstadoMeta(spreadsheetId, meta, "Cumplida"));
    });
    card.querySelector('[data-action="reabrir"]')?.addEventListener("click", () => void runAction(() => setEstadoMeta(spreadsheetId, meta, "Activa")));
    card.querySelector('[data-action="pausar"]')?.addEventListener("click", () => void runAction(() => setEstadoMeta(spreadsheetId, meta, "Pausada")));
    card.querySelector('[data-action="reanudar"]')?.addEventListener("click", () => void runAction(() => setEstadoMeta(spreadsheetId, meta, "Activa")));

    card.querySelector('[data-action="marcar-comprada"]')?.addEventListener("click", async () => {
      if (!meta.compraVinculadaId) return;
      const ok = await showConfirm(
        `¿Marcar la compra "${meta.nombre}" como pagada por ${formatMoney(acumulado)} (lo que ahorraste)?`,
        { title: "Marcar compra como pagada", confirmLabel: "Marcar pagada" },
      );
      if (!ok) return;
      void runAction(async () => {
        const gasto = await buscarGastoPorId(spreadsheetId, meta.compraVinculadaId);
        if (gasto) {
          const gastoActualizado = await marcarGastoComoPagado(spreadsheetId, gasto, { monto: acumulado, fecha: todayISO() });
          const quiere = await showConfirm("¿Deseas anexar la factura de esta compra?", {
            title: "Factura",
            confirmLabel: "Sí, más tarde en Gastos y Compras",
            cancelLabel: "No, gracias",
          });
          void quiere; // el flujo de subida vive en Gastos y Compras; aquí solo dejamos el gasto listo para adjuntarla ahí.
          void gastoActualizado;
        }
        await setEstadoMeta(spreadsheetId, meta, "Cumplida");
      });
    });

    card.querySelector('[data-action="deshacer-conversion"]')?.addEventListener("click", async () => {
      if (!meta.compraVinculadaId) return;
      const tieneMovimientos = (movimientosPorMeta.get(meta.id) ?? []).length > 0;
      const ok = await showConfirm(
        tieneMovimientos
          ? "Esta meta ya tiene aportes registrados. Si deshaces la conversión, se eliminará la meta junto con su historial de aportes. ¿Continuar?"
          : "¿Deshacer la conversión? La compra vuelve a Pendiente de pago normal.",
        { title: "Deshacer conversión", confirmLabel: "Deshacer", danger: true },
      );
      if (!ok) return;
      void runAction(async () => {
        const gasto = await buscarGastoPorId(spreadsheetId, meta.compraVinculadaId);
        if (gasto) await deshacerAhorrando(spreadsheetId, gasto);
        await eliminarMeta(spreadsheetId, meta);
      });
    });

    return card;
  }

  function renderList(): void {
    const activasTodas = metas.filter((m) => m.estado !== "Cumplida");
    const cumplidas = metas.filter((m) => m.estado === "Cumplida");

    totalEl.textContent = formatMoney(
      metas.reduce((s, m) => s + calcularAcumulado(movimientosPorMeta.get(m.id) ?? []), 0),
    );

    const ordenadas = [...activasTodas].sort((a, b) => {
      if (sortOrder === "fecha-limite") {
        if (!a.fechaLimite) return 1;
        if (!b.fechaLimite) return -1;
        return a.fechaLimite.localeCompare(b.fechaLimite);
      }
      const progA = calcularProgresoPct(a, movimientosPorMeta.get(a.id) ?? []);
      const progB = calcularProgresoPct(b, movimientosPorMeta.get(b.id) ?? []);
      return progB - progA;
    });

    activasListEl.innerHTML = "";
    if (ordenadas.length === 0) {
      activasListEl.innerHTML = `<div class="card"><p class="empty-state">No tienes metas activas todavía. Crea la primera arriba.</p></div>`;
    } else {
      for (const meta of ordenadas) activasListEl.appendChild(renderMetaCard(meta));
    }

    cumplidasListEl.innerHTML = "";
    if (cumplidas.length === 0) {
      cumplidasListEl.innerHTML = `<p class="empty-state">Aún no tienes metas cumplidas.</p>`;
    } else {
      for (const meta of cumplidas) cumplidasListEl.appendChild(renderMetaCard(meta));
    }
    cumplidasCard.hidden = false;
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await action();
      await reload();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "Ocurrió un error.", "Error");
    } finally {
      busy = false;
    }
  }

  async function reload(): Promise<void> {
    const [metasList, movimientos] = await Promise.all([listMetas(spreadsheetId), listTodosLosMovimientos(spreadsheetId)]);
    metas = metasList;
    movimientosPorMeta = agruparMovimientosPorMeta(movimientos);
    renderList();
  }

  function openEditModal(meta: Meta): void {
    editingMeta = meta;
    editNombreInput.value = meta.nombre;
    editTipoValue = meta.tipo;
    editTipoCombo.refresh();
    editMontoInput.value = String(meta.montoObjetivo);
    editFechaLimiteInput.value = meta.fechaLimite;
    editModalError.hidden = true;

    const controller = new AbortController();
    const { signal } = controller;

    editModal.addEventListener("cancel", () => controller.abort(), { signal });
    editModalCancel.addEventListener("click", () => { controller.abort(); editModal.close(); }, { signal });

    editForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = editNombreInput.value.trim();
        const monto = Number(editMontoInput.value);
        if (!nombre || !monto || monto <= 0) {
          editModalError.hidden = false;
          editModalError.textContent = "Completa el nombre y un monto objetivo válido.";
          return;
        }
        if (!editingMeta) return;
        const confirmBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          const cambios: MetaCambios = {
            nombre,
            montoObjetivo: monto,
            fechaLimite: editFechaLimiteInput.value,
            tipo: editTipoValue,
          };
          await actualizarMeta(spreadsheetId, editingMeta, cambios);
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
      formError.textContent = "Completa el nombre y un monto objetivo válido.";
      return;
    }
    if (!formTipoValue) {
      formError.hidden = false;
      formError.textContent = "Elige o crea un tipo.";
      return;
    }

    submitBtn.disabled = true;
    try {
      await crearMeta(spreadsheetId, {
        nombre,
        montoObjetivo: monto,
        fechaLimite: fechaLimiteInput.value,
        tipo: formTipoValue,
        compraVinculadaId: "",
      });
      form.reset();
      await reload();
    } catch (err) {
      formError.hidden = false;
      formError.textContent = err instanceof Error ? err.message : "No se pudo guardar la meta.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  try {
    const ensured = await ensureSpreadsheet();
    spreadsheetId = ensured.spreadsheetId;
    tiposMeta = await listTiposMeta(spreadsheetId);
    formTipoValue = tiposMeta[0] ?? "";
    refreshCombos();
    await reload();
  } catch (err) {
    activasListEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
