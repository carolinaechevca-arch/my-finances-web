import editIcon from "../../icon/edit.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  actualizarDeuda,
  agregarMontoADeuda,
  agruparEventosPorDeuda,
  buscarDeudaActivaPorContraparte,
  calcularEstadoDeuda,
  crearContraparte,
  crearDeuda,
  crearTipoDeuda,
  eliminarContraparte,
  eliminarDeuda,
  eliminarTipoDeuda,
  estadoAlerta,
  estimarMesesRestantes,
  historialConSaldos,
  listContrapartesGuardadas,
  listDeudas,
  listTiposDeuda,
  listTodosLosEventos,
  marcarDeudaPagada,
  reabrirDeuda,
  registrarAbono,
  sumSaldoPendiente,
  type Deuda,
  type Direccion,
  type EventoAbono,
  type NuevaDeuda,
} from "../../domain/deudas";
import { formatMoney, todayISO } from "../../domain/format";
import { showAbonoDialog, showAlert, showConfirm, showMergeChoice } from "../components/dialogs";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

export interface ModuloDeudaConfig {
  direccion: Direccion;
  icon: string;
  titulo: string;
  labelContraparte: string;
  placeholderContraparte: string;
  totalLabel: string;
}

export async function renderDeudasModulo(container: HTMLElement, config: ModuloDeudaConfig): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${config.icon} ${config.titulo}</h1>
    </div>
    <div class="card stat-card stat-card--primary" style="max-width:280px;margin-bottom:20px">
      <div class="stat-card__value" id="dd-total">—</div>
      <div class="stat-card__label">${config.totalLabel}</div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar deuda</h2>
      <form id="deuda-form" class="form">
        <div class="field">
          <label>${config.labelContraparte}</label>
          <div id="dd-contraparte-mount"></div>
        </div>
        <div class="field">
          <label>Tipo</label>
          <div id="dd-tipo-mount"></div>
        </div>
        <div class="field"><label for="dd-cuota">Monto de la cuota</label><input id="dd-cuota" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="dd-num-cuotas">Número de cuotas</label><input id="dd-num-cuotas" type="number" min="1" step="1" required /></div>
        <div class="field"><label for="dd-monto">Monto original</label><input id="dd-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="dd-dia-pago">Día de pago (opcional)</label><input id="dd-dia-pago" type="number" min="1" max="31" /></div>
        <div class="field"><label for="dd-fecha-inicio">Fecha de inicio</label><input id="dd-fecha-inicio" type="date" value="${todayISO()}" required /></div>
        <div class="field"><label for="dd-notas">Notas (opcional)</label><input id="dd-notas" type="text" /></div>
        <button type="submit" class="btn">Guardar deuda</button>
      </form>
      <p class="empty-state" id="deuda-form-error" hidden></p>
    </div>

    <div id="dd-activas-list" class="deuda-list"><p class="empty-state">Cargando…</p></div>

    <details class="card" id="dd-pagadas-card" style="margin-top:20px">
      <summary style="cursor:pointer;font-weight:700">Pagadas</summary>
      <div id="dd-pagadas-list" class="deuda-list" style="margin-top:14px"></div>
    </details>

    <dialog id="edit-modal" class="modal">
      <form class="modal__form" id="edit-form">
        <h2 class="modal__title">Editar deuda</h2>
        <div class="field">
          <label>${config.labelContraparte}</label>
          <div id="edit-contraparte-mount"></div>
        </div>
        <div class="field">
          <label>Tipo</label>
          <div id="edit-tipo-mount"></div>
        </div>
        <div class="field"><label for="edit-cuota">Monto de la cuota</label><input id="edit-cuota" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="edit-num-cuotas">Número de cuotas</label><input id="edit-num-cuotas" type="number" min="1" step="1" required /></div>
        <div class="field"><label for="edit-monto">Monto original</label><input id="edit-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="edit-dia-pago">Día de pago (opcional)</label><input id="edit-dia-pago" type="number" min="1" max="31" /></div>
        <div class="field"><label for="edit-fecha-inicio">Fecha de inicio</label><input id="edit-fecha-inicio" type="date" required /></div>
        <div class="field"><label for="edit-notas">Notas</label><input id="edit-notas" type="text" /></div>
        <p class="empty-state" id="edit-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="edit-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Guardar cambios</button>
        </div>
      </form>
    </dialog>

    <dialog id="tipo-modal" class="modal">
      <form class="modal__form" id="tipo-form">
        <h2 class="modal__title">Nuevo tipo de deuda</h2>
        <div class="field">
          <label for="tipo-modal-input">Nombre</label>
          <input id="tipo-modal-input" type="text" placeholder="Ej. Crédito de estudio" required />
        </div>
        <p class="empty-state" id="tipo-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="tipo-modal-cancel">Cancelar</button>
          <button type="submit" class="btn">Agregar</button>
        </div>
      </form>
    </dialog>

    <dialog id="contraparte-modal" class="modal">
      <form class="modal__form" id="contraparte-form">
        <h2 class="modal__title">${config.labelContraparte}</h2>
        <div class="field">
          <label for="contraparte-modal-input">Nombre</label>
          <input id="contraparte-modal-input" type="text" placeholder="${config.placeholderContraparte}" required />
        </div>
        <p class="empty-state" id="contraparte-modal-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="contraparte-modal-cancel">Cancelar</button>
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

  const totalEl = container.querySelector<HTMLDivElement>("#dd-total")!;
  const activasListEl = container.querySelector<HTMLDivElement>("#dd-activas-list")!;
  const pagadasListEl = container.querySelector<HTMLDivElement>("#dd-pagadas-list")!;
  const pagadasCard = container.querySelector<HTMLDetailsElement>("#dd-pagadas-card")!;

  const form = container.querySelector<HTMLFormElement>("#deuda-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#deuda-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const montoInput = container.querySelector<HTMLInputElement>("#dd-monto")!;
  const cuotaInput = container.querySelector<HTMLInputElement>("#dd-cuota")!;
  const numCuotasInput = container.querySelector<HTMLInputElement>("#dd-num-cuotas")!;
  const diaPagoInput = container.querySelector<HTMLInputElement>("#dd-dia-pago")!;
  const fechaInicioInput = container.querySelector<HTMLInputElement>("#dd-fecha-inicio")!;
  const notasInput = container.querySelector<HTMLInputElement>("#dd-notas")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editCuotaInput = container.querySelector<HTMLInputElement>("#edit-cuota")!;
  const editNumCuotasInput = container.querySelector<HTMLInputElement>("#edit-num-cuotas")!;
  const editDiaPagoInput = container.querySelector<HTMLInputElement>("#edit-dia-pago")!;
  const editFechaInicioInput = container.querySelector<HTMLInputElement>("#edit-fecha-inicio")!;
  const editNotasInput = container.querySelector<HTMLInputElement>("#edit-notas")!;

  const historialModal = container.querySelector<HTMLDialogElement>("#historial-modal")!;
  const historialTitulo = container.querySelector<HTMLHeadingElement>("#historial-titulo")!;
  const historialListEl = container.querySelector<HTMLDivElement>("#historial-list")!;
  const historialModalClose = container.querySelector<HTMLButtonElement>("#historial-modal-close")!;

  const tipoModal = container.querySelector<HTMLDialogElement>("#tipo-modal")!;
  const tipoForm = container.querySelector<HTMLFormElement>("#tipo-form")!;
  const tipoModalInput = container.querySelector<HTMLInputElement>("#tipo-modal-input")!;
  const tipoModalError = container.querySelector<HTMLParagraphElement>("#tipo-modal-error")!;
  const tipoModalCancel = container.querySelector<HTMLButtonElement>("#tipo-modal-cancel")!;

  const contraparteModal = container.querySelector<HTMLDialogElement>("#contraparte-modal")!;
  const contraparteForm = container.querySelector<HTMLFormElement>("#contraparte-form")!;
  const contraparteModalInput = container.querySelector<HTMLInputElement>("#contraparte-modal-input")!;
  const contraparteModalError = container.querySelector<HTMLParagraphElement>("#contraparte-modal-error")!;
  const contraparteModalCancel = container.querySelector<HTMLButtonElement>("#contraparte-modal-cancel")!;

  let spreadsheetId = "";
  let deudas: Deuda[] = [];
  let eventosPorDeuda = new Map<string, EventoAbono[]>();
  let tiposDeuda: string[] = [];
  let contrapartesGuardadas: string[] = [];
  let busy = false;
  let editingDeuda: Deuda | null = null;
  let formContraparteValue = "";
  let formTipoValue = "";
  let editContraparteValue = "";
  let editTipoValue = "";

/** Nombres disponibles = los guardados en la hoja de gestión + los que ya aparecen en deudas existentes. */
  function contrapartesDisponibles(): string[] {
    return Array.from(new Set([...contrapartesGuardadas, ...deudas.map((d) => d.contraparte)]));
  }

  function tiposDisponibles(): string[] {
    return Array.from(new Set([...tiposDeuda, ...deudas.map((d) => d.tipo)]));
  }

  function refreshCombos(): void {
    contraparteCombo.refresh();
    editContraparteCombo.refresh();
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
          if (!tiposDeuda.includes(nombre)) {
            await crearTipoDeuda(spreadsheetId, nombre);
            tiposDeuda.push(nombre);
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

  function openContraparteModal(onDone: (nombre: string) => void): void {
    contraparteModalInput.value = "";
    contraparteModalError.hidden = true;
    const controller = new AbortController();
    const { signal } = controller;

    contraparteModal.addEventListener("cancel", () => controller.abort(), { signal });
    contraparteModalCancel.addEventListener("click", () => { controller.abort(); contraparteModal.close(); }, { signal });

    contraparteForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const nombre = contraparteModalInput.value.trim();
        if (!nombre) {
          contraparteModalError.hidden = false;
          contraparteModalError.textContent = "Escribe un nombre.";
          return;
        }
        const confirmBtn = contraparteForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          if (!contrapartesGuardadas.includes(nombre)) {
            await crearContraparte(spreadsheetId, nombre);
            contrapartesGuardadas.push(nombre);
          }
          controller.abort();
          contraparteModal.close();
          onDone(nombre);
          refreshCombos();
        } catch (err) {
          contraparteModalError.hidden = false;
          contraparteModalError.textContent = err instanceof Error ? err.message : "No se pudo guardar.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    contraparteModal.showModal();
    contraparteModalInput.focus();
  }

  async function handleDeleteTipo(nombre: string): Promise<void> {
    const enUso = deudas.some((d) => d.tipo === nombre);
    if (enUso) {
      await showAlert(`No puedes eliminar "${nombre}" porque hay deudas con ese tipo. Edítalas primero.`, "No se puede eliminar");
      return;
    }
    const ok = await showConfirm(`¿Eliminar el tipo "${nombre}"?`, { title: "Eliminar tipo", confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarTipoDeuda(spreadsheetId, nombre);
      tiposDeuda = tiposDeuda.filter((t) => t !== nombre);
      if (formTipoValue === nombre) formTipoValue = tiposDisponibles()[0] ?? "";
      if (editTipoValue === nombre) editTipoValue = tiposDisponibles()[0] ?? "";
      refreshCombos();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo eliminar el tipo.", "Error");
    }
  }

  async function handleDeleteContraparte(nombre: string): Promise<void> {
    const enUso = deudas.some((d) => d.contraparte === nombre);
    if (enUso) {
      await showAlert(`No puedes eliminar "${nombre}" porque tiene deudas registradas. Edítalas primero.`, "No se puede eliminar");
      return;
    }
    const ok = await showConfirm(`¿Eliminar "${nombre}" de la lista?`, { title: "Eliminar", confirmLabel: "Eliminar", danger: true });
    if (!ok) return;
    try {
      await eliminarContraparte(spreadsheetId, nombre);
      contrapartesGuardadas = contrapartesGuardadas.filter((c) => c !== nombre);
      if (formContraparteValue === nombre) formContraparteValue = "";
      if (editContraparteValue === nombre) editContraparteValue = "";
      refreshCombos();
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo eliminar.", "Error");
    }
  }

  const contraparteCombo: OptionCombo = createOptionCombo({
    getOptions: contrapartesDisponibles,
    getValue: () => formContraparteValue,
    onSelect: (v) => { formContraparteValue = v; contraparteCombo.refresh(); },
    onRequestNuevo: () => openContraparteModal((nombre) => { formContraparteValue = nombre; }),
    onRequestDelete: (v) => void handleDeleteContraparte(v),
    placeholder: config.placeholderContraparte,
    addLabel: "+ Nuevo…",
    deleteLabel: "Eliminar",
  });
  container.querySelector("#dd-contraparte-mount")!.appendChild(contraparteCombo.el);

  const editContraparteCombo: OptionCombo = createOptionCombo({
    getOptions: contrapartesDisponibles,
    getValue: () => editContraparteValue,
    onSelect: (v) => { editContraparteValue = v; editContraparteCombo.refresh(); },
    onRequestNuevo: () => openContraparteModal((nombre) => { editContraparteValue = nombre; }),
    onRequestDelete: (v) => void handleDeleteContraparte(v),
    placeholder: config.placeholderContraparte,
    addLabel: "+ Nuevo…",
    deleteLabel: "Eliminar",
  });
  container.querySelector("#edit-contraparte-mount")!.appendChild(editContraparteCombo.el);

  const tipoCombo: OptionCombo = createOptionCombo({
    getOptions: tiposDisponibles,
    getValue: () => formTipoValue,
    onSelect: (v) => { formTipoValue = v; tipoCombo.refresh(); },
    onRequestNuevo: () => openTipoModal((nombre) => { formTipoValue = nombre; }),
    onRequestDelete: (v) => void handleDeleteTipo(v),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#dd-tipo-mount")!.appendChild(tipoCombo.el);

  const editTipoCombo: OptionCombo = createOptionCombo({
    getOptions: tiposDisponibles,
    getValue: () => editTipoValue,
    onSelect: (v) => { editTipoValue = v; editTipoCombo.refresh(); },
    onRequestNuevo: () => openTipoModal((nombre) => { editTipoValue = nombre; }),
    onRequestDelete: (v) => void handleDeleteTipo(v),
    placeholder: "Selecciona un tipo",
    addLabel: "+ Nuevo tipo…",
    deleteLabel: "Eliminar tipo",
  });
  container.querySelector("#edit-tipo-mount")!.appendChild(editTipoCombo.el);

  historialModalClose.addEventListener("click", () => historialModal.close());

  function openHistorialModal(deuda: Deuda): void {
    historialTitulo.textContent = `Historial — ${deuda.contraparte}`;
    const eventos = eventosPorDeuda.get(deuda.id) ?? [];
    const historial = historialConSaldos(deuda, eventos);
    if (historial.length === 0) {
      historialListEl.innerHTML = `<p class="empty-state">Aún no hay abonos registrados.</p>`;
    } else {
      historialListEl.innerHTML = historial
        .map(({ evento, saldoPendienteDespues, cuotaLabel }) => {
          const esFusion = evento.tipo === "MontoAgregado";
          return `
            <div class="record-row">
              <div class="record-row__main">
                <span class="record-row__title">${cuotaLabel} — ${evento.fecha}</span>
                <span class="record-row__subtitle">
                  ${evento.nota ? `${evento.nota} · ` : ""}Saldo después: ${formatMoney(saldoPendienteDespues)}
                </span>
              </div>
              <div class="record-row__amount">${esFusion ? "+" : "-"}${formatMoney(evento.monto)}</div>
            </div>
          `;
        })
        .join("");
    }
    historialModal.showModal();
  }

  function alertaBadge(deuda: Deuda): string {
    const alerta = estadoAlerta(deuda, eventosPorDeuda.get(deuda.id) ?? []);
    if (alerta === "vencida") return `<span class="badge badge--vencido">Pago vencido</span>`;
    if (alerta === "proxima") return `<span class="badge badge--today">Pago próximo</span>`;
    return "";
  }

  function proyeccionTexto(deuda: Deuda): string {
    const eventos = eventosPorDeuda.get(deuda.id) ?? [];
    const meses = estimarMesesRestantes(deuda, eventos);
    if (meses === null) return "";
    if (meses === 0) return "¡Ya está saldada!";
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() + meses);
    const fechaLabel = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    return `A este ritmo, se termina de pagar en aproximadamente ${meses} ${meses === 1 ? "mes" : "meses"} (${fechaLabel}).`;
  }

  function renderDeudaCard(deuda: Deuda): HTMLDivElement {
    const eventos = eventosPorDeuda.get(deuda.id) ?? [];
    const estado = calcularEstadoDeuda(deuda, eventos);
    const pagada = deuda.estado === "Pagada";
    const card = document.createElement("div");
    card.className = "card deuda-card";
    card.innerHTML = `
      <div class="deuda-card__header">
        <div>
          <span class="deuda-card__contraparte">${deuda.contraparte}</span>
          <span class="badge">${deuda.tipo}</span>
          ${pagada ? `<span class="badge badge--fijo">Pagada</span>` : alertaBadge(deuda)}
        </div>
        <div class="deuda-card__actions">
          <button type="button" class="icon-btn icon-btn--edit" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
          <button type="button" class="icon-btn icon-btn--delete" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
        </div>
      </div>
      ${
        pagada
          ? `<p class="empty-state" style="margin:0">Monto original ${formatMoney(deuda.montoOriginal)} · Total pagado ${formatMoney(estado.totalAbonado)}</p>`
          : `
      <div class="progress-bar"><div class="progress-bar__fill" style="width:${estado.progresoPct}%"></div></div>
      <div class="deuda-card__stats">
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Saldo restante</span><span class="deuda-card__stat-value deuda-card__stat-value--total">${formatMoney(estado.saldoPendiente)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Total a pagar</span><span class="deuda-card__stat-value">${formatMoney(estado.totalAPagar)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Interés total</span><span class="deuda-card__stat-value">${formatMoney(estado.interesTotal)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Cuotas pagadas</span><span class="deuda-card__stat-value">${estado.cuotasPagadas} de ${deuda.numCuotas}</span></div>
      </div>
      <p class="empty-state" style="margin:10px 0 0">${deuda.diaPago ? `Próximo pago: día ${deuda.diaPago} · ` : ""}Cuota ${formatMoney(deuda.montoCuota)}</p>
      <p class="empty-state" style="margin:4px 0 0">${proyeccionTexto(deuda)}</p>`
      }
      <div class="deuda-card__footer">
        ${!pagada ? `<button type="button" class="btn" data-action="abonar">Registrar abono</button>` : ""}
        <button type="button" class="btn-secondary" data-action="historial">Ver historial</button>
        ${!pagada ? `<button type="button" class="btn-secondary" data-action="pagada">Marcar como pagada</button>` : `<button type="button" class="btn-secondary" data-action="reabrir">Reabrir</button>`}
      </div>
    `;

    card.querySelector('[data-action="edit"]')!.addEventListener("click", () => openEditModal(deuda));
    card.querySelector('[data-action="delete"]')!.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Eliminar la deuda con "${deuda.contraparte}"? Se borrará también su historial.`, {
        title: "Eliminar deuda",
        confirmLabel: "Eliminar",
        danger: true,
      });
      if (!ok) return;
      void runAction(() => eliminarDeuda(spreadsheetId, deuda));
    });
    card.querySelector('[data-action="historial"]')!.addEventListener("click", () => openHistorialModal(deuda));

    const abonarBtn = card.querySelector<HTMLButtonElement>('[data-action="abonar"]');
    abonarBtn?.addEventListener("click", async () => {
      const resultado = await showAbonoDialog(`Registrar abono — ${deuda.contraparte}`, deuda.montoCuota || undefined);
      if (!resultado) return;
      void runAction(() => registrarAbono(spreadsheetId, deuda, resultado.fecha, resultado.monto, resultado.nota));
    });

    const pagadaBtn = card.querySelector<HTMLButtonElement>('[data-action="pagada"]');
    pagadaBtn?.addEventListener("click", async () => {
      const mensaje =
        estado.saldoPendiente > 0
          ? `Esta deuda todavía tiene un saldo de ${formatMoney(estado.saldoPendiente)}. ¿Confirmas marcarla como pagada de todas formas?`
          : `¿Marcar la deuda con "${deuda.contraparte}" como pagada?`;
      const ok = await showConfirm(mensaje, { title: "Marcar como pagada", confirmLabel: "Marcar pagada" });
      if (!ok) return;
      void runAction(() => marcarDeudaPagada(spreadsheetId, deuda));
    });

    const reabrirBtn = card.querySelector<HTMLButtonElement>('[data-action="reabrir"]');
    reabrirBtn?.addEventListener("click", () => void runAction(() => reabrirDeuda(spreadsheetId, deuda)));

    return card;
  }

  function renderList(): void {
    const activas = deudas.filter((d) => d.estado === "Activa");
    const pagadas = deudas.filter((d) => d.estado === "Pagada");

    totalEl.textContent = formatMoney(sumSaldoPendiente(deudas, eventosPorDeuda));

    activasListEl.innerHTML = "";
    if (activas.length === 0) {
      activasListEl.innerHTML = `<div class="card"><p class="empty-state">No tienes deudas activas registradas.</p></div>`;
    } else {
      for (const deuda of activas) {
        activasListEl.appendChild(renderDeudaCard(deuda));
      }
    }

    pagadasListEl.innerHTML = "";
    if (pagadas.length === 0) {
      pagadasListEl.innerHTML = `<p class="empty-state">Aún no tienes deudas pagadas.</p>`;
    } else {
      for (const deuda of pagadas) {
        pagadasListEl.appendChild(renderDeudaCard(deuda));
      }
    }
    pagadasCard.hidden = false;
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
    const [deudasList, eventos] = await Promise.all([
      listDeudas(spreadsheetId, config.direccion),
      listTodosLosEventos(spreadsheetId),
    ]);
    deudas = deudasList;
    eventosPorDeuda = agruparEventosPorDeuda(eventos);
    refreshCombos();
    renderList();
  }

  function openEditModal(deuda: Deuda): void {
    editingDeuda = deuda;
    editContraparteValue = deuda.contraparte;
    editTipoValue = deuda.tipo;
    editContraparteCombo.refresh();
    editTipoCombo.refresh();
    editMontoInput.value = String(deuda.montoOriginal);
    editCuotaInput.value = String(deuda.montoCuota);
    editNumCuotasInput.value = String(deuda.numCuotas);
    editDiaPagoInput.value = deuda.diaPago;
    editFechaInicioInput.value = deuda.fechaInicio;
    editNotasInput.value = deuda.notas;
    editModalError.hidden = true;

    const controller = new AbortController();
    const { signal } = controller;

    editModal.addEventListener("cancel", () => controller.abort(), { signal });
    editModalCancel.addEventListener("click", () => { controller.abort(); editModal.close(); }, { signal });

    editForm.addEventListener(
      "submit",
      async (e) => {
        e.preventDefault();
        const contraparte = editContraparteValue;
        const monto = Number(editMontoInput.value);
        if (!contraparte || !monto || monto <= 0 || !editFechaInicioInput.value) {
          editModalError.hidden = false;
          editModalError.textContent = "Completa la contraparte, la fecha y un monto válido.";
          return;
        }
        if (!editingDeuda) return;
        const confirmBtn = editForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          const cambios: NuevaDeuda = {
            direccion: config.direccion,
            contraparte,
            tipo: editTipoValue,
            montoOriginal: monto,
            montoCuota: Number(editCuotaInput.value) || 0,
            numCuotas: Number(editNumCuotasInput.value) || 0,
            diaPago: editDiaPagoInput.value.trim(),
            fechaInicio: editFechaInicioInput.value,
            notas: editNotasInput.value.trim(),
          };
          await actualizarDeuda(spreadsheetId, editingDeuda, cambios);
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

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const contraparte = formContraparteValue;
    const monto = Number(montoInput.value);
    if (!contraparte || !monto || monto <= 0 || !fechaInicioInput.value) {
      formError.hidden = false;
      formError.textContent = "Completa la contraparte, la fecha y un monto válido.";
      return;
    }
    if (!formTipoValue) {
      formError.hidden = false;
      formError.textContent = "Elige o crea un tipo de deuda.";
      return;
    }

    const nueva: NuevaDeuda = {
      direccion: config.direccion,
      contraparte,
      tipo: formTipoValue,
      montoOriginal: monto,
      montoCuota: Number(cuotaInput.value) || 0,
      numCuotas: Number(numCuotasInput.value) || 0,
      diaPago: diaPagoInput.value.trim(),
      fechaInicio: fechaInicioInput.value,
      notas: notasInput.value.trim(),
    };

    submitBtn.disabled = true;
    try {
      const existente = buscarDeudaActivaPorContraparte(deudas, config.direccion, contraparte);
      if (existente) {
        const estadoExistente = calcularEstadoDeuda(existente, eventosPorDeuda.get(existente.id) ?? []);
        const eleccion = await showMergeChoice(existente.contraparte, estadoExistente.saldoPendiente);
        if (eleccion === null) return;
        if (eleccion === "fusionar") {
          await agregarMontoADeuda(spreadsheetId, existente, nueva.fechaInicio, nueva.montoCuota * nueva.numCuotas, nueva.notas);
        } else {
          await crearDeuda(spreadsheetId, nueva);
        }
      } else {
        await crearDeuda(spreadsheetId, nueva);
      }
      form.reset();
      fechaInicioInput.value = todayISO();
      await reload();
    } catch (err) {
      formError.hidden = false;
      formError.textContent = err instanceof Error ? err.message : "No se pudo guardar la deuda.";
    } finally {
      submitBtn.disabled = false;
    }
  });

  try {
    const ensured = await ensureSpreadsheet();
    spreadsheetId = ensured.spreadsheetId;
    const [tipos, contrapartes] = await Promise.all([
      listTiposDeuda(spreadsheetId),
      listContrapartesGuardadas(spreadsheetId),
    ]);
    tiposDeuda = tipos;
    contrapartesGuardadas = contrapartes;
    formTipoValue = tipos[0] ?? "";
    await reload();
  } catch (err) {
    activasListEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
