import editIcon from "../../icon/edit.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import {
  TIPOS_DEUDA,
  actualizarDeuda,
  agregarMontoADeuda,
  agruparEventosPorDeuda,
  buscarDeudaActivaPorContraparte,
  calcularEstadoDeuda,
  crearDeuda,
  eliminarDeuda,
  estadoAlerta,
  estimarMesesRestantes,
  historialConSaldos,
  listContrapartes,
  listDeudas,
  listTodosLosEventos,
  marcarDeudaPagada,
  reabrirDeuda,
  registrarAbono,
  sumTotalHoy,
  type Deuda,
  type Direccion,
  type EventoAbono,
  type NuevaDeuda,
  type PeriodicidadInteres,
} from "../../domain/deudas";
import { formatMoney, todayISO } from "../../domain/format";
import { showAbonoDialog, showAlert, showConfirm, showMergeChoice } from "../components/dialogs";

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
          <label for="dd-contraparte">${config.labelContraparte}</label>
          <input id="dd-contraparte" type="text" list="dd-contrapartes" placeholder="${config.placeholderContraparte}" autocomplete="off" required />
          <datalist id="dd-contrapartes"></datalist>
        </div>
        <div class="field">
          <label for="dd-tipo">Tipo</label>
          <select id="dd-tipo">${TIPOS_DEUDA.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="dd-monto">Monto original</label><input id="dd-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="dd-tasa">Tasa de interés (%)</label><input id="dd-tasa" type="number" min="0" step="0.01" value="0" /></div>
        <div class="field">
          <label for="dd-periodicidad">Periodicidad</label>
          <select id="dd-periodicidad">
            <option value="Mensual">Mensual</option>
            <option value="Anual">Anual</option>
          </select>
        </div>
        <div class="field"><label for="dd-pago-minimo">Pago mínimo mensual</label><input id="dd-pago-minimo" type="number" min="0" step="0.01" value="0" /></div>
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
        <div class="field"><label for="edit-contraparte">${config.labelContraparte}</label><input id="edit-contraparte" type="text" required /></div>
        <div class="field">
          <label for="edit-tipo">Tipo</label>
          <select id="edit-tipo">${TIPOS_DEUDA.map((t) => `<option value="${t}">${t}</option>`).join("")}</select>
        </div>
        <div class="field"><label for="edit-monto">Monto original</label><input id="edit-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="edit-tasa">Tasa de interés (%)</label><input id="edit-tasa" type="number" min="0" step="0.01" /></div>
        <div class="field">
          <label for="edit-periodicidad">Periodicidad</label>
          <select id="edit-periodicidad">
            <option value="Mensual">Mensual</option>
            <option value="Anual">Anual</option>
          </select>
        </div>
        <div class="field"><label for="edit-pago-minimo">Pago mínimo mensual</label><input id="edit-pago-minimo" type="number" min="0" step="0.01" /></div>
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
  const contrapartesDatalist = container.querySelector<HTMLDataListElement>("#dd-contrapartes")!;

  const form = container.querySelector<HTMLFormElement>("#deuda-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#deuda-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const contraparteInput = container.querySelector<HTMLInputElement>("#dd-contraparte")!;
  const tipoSelect = container.querySelector<HTMLSelectElement>("#dd-tipo")!;
  const montoInput = container.querySelector<HTMLInputElement>("#dd-monto")!;
  const tasaInput = container.querySelector<HTMLInputElement>("#dd-tasa")!;
  const periodicidadSelect = container.querySelector<HTMLSelectElement>("#dd-periodicidad")!;
  const pagoMinimoInput = container.querySelector<HTMLInputElement>("#dd-pago-minimo")!;
  const diaPagoInput = container.querySelector<HTMLInputElement>("#dd-dia-pago")!;
  const fechaInicioInput = container.querySelector<HTMLInputElement>("#dd-fecha-inicio")!;
  const notasInput = container.querySelector<HTMLInputElement>("#dd-notas")!;

  const editModal = container.querySelector<HTMLDialogElement>("#edit-modal")!;
  const editForm = container.querySelector<HTMLFormElement>("#edit-form")!;
  const editModalError = container.querySelector<HTMLParagraphElement>("#edit-modal-error")!;
  const editModalCancel = container.querySelector<HTMLButtonElement>("#edit-modal-cancel")!;
  const editContraparteInput = container.querySelector<HTMLInputElement>("#edit-contraparte")!;
  const editTipoSelect = container.querySelector<HTMLSelectElement>("#edit-tipo")!;
  const editMontoInput = container.querySelector<HTMLInputElement>("#edit-monto")!;
  const editTasaInput = container.querySelector<HTMLInputElement>("#edit-tasa")!;
  const editPeriodicidadSelect = container.querySelector<HTMLSelectElement>("#edit-periodicidad")!;
  const editPagoMinimoInput = container.querySelector<HTMLInputElement>("#edit-pago-minimo")!;
  const editDiaPagoInput = container.querySelector<HTMLInputElement>("#edit-dia-pago")!;
  const editFechaInicioInput = container.querySelector<HTMLInputElement>("#edit-fecha-inicio")!;
  const editNotasInput = container.querySelector<HTMLInputElement>("#edit-notas")!;

  const historialModal = container.querySelector<HTMLDialogElement>("#historial-modal")!;
  const historialTitulo = container.querySelector<HTMLHeadingElement>("#historial-titulo")!;
  const historialListEl = container.querySelector<HTMLDivElement>("#historial-list")!;
  const historialModalClose = container.querySelector<HTMLButtonElement>("#historial-modal-close")!;

  let spreadsheetId = "";
  let deudas: Deuda[] = [];
  let eventosPorDeuda = new Map<string, EventoAbono[]>();
  let busy = false;
  let editingDeuda: Deuda | null = null;

  function renderContrapartesDatalist(): void {
    contrapartesDatalist.innerHTML = listContrapartes(deudas)
      .map((n) => `<option value="${n}"></option>`)
      .join("");
  }

  historialModalClose.addEventListener("click", () => historialModal.close());

  function openHistorialModal(deuda: Deuda): void {
    historialTitulo.textContent = `Historial — ${deuda.contraparte}`;
    const eventos = eventosPorDeuda.get(deuda.id) ?? [];
    const historial = historialConSaldos(deuda, eventos);
    if (historial.length === 0) {
      historialListEl.innerHTML = `<p class="empty-state">Aún no hay abonos registrados.</p>`;
    } else {
      historialListEl.innerHTML = historial
        .map(({ evento, saldoCapitalDespues, interesPendienteDespues }) => {
          const esFusion = evento.tipo === "MontoAgregado";
          return `
            <div class="record-row">
              <div class="record-row__main">
                <span class="record-row__title">${esFusion ? "Monto agregado" : "Abono"} — ${evento.fecha}</span>
                <span class="record-row__subtitle">
                  ${esFusion ? "Se sumó a la deuda" : `Interés ${formatMoney(evento.montoInteres)} · Capital ${formatMoney(evento.montoCapital)}`}
                  ${evento.nota ? ` · ${evento.nota}` : ""} · Saldo después: ${formatMoney(saldoCapitalDespues + interesPendienteDespues)}
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
    if (meses === null) return "A este ritmo no se alcanza a cubrir el interés — no se terminará de pagar así.";
    if (meses === 0) return "¡Ya está saldada!";
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() + meses);
    const fechaLabel = fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
    return `A este ritmo, se termina de pagar en aproximadamente ${meses} ${meses === 1 ? "mes" : "meses"} (${fechaLabel}).`;
  }

  function renderDeudaCard(deuda: Deuda): HTMLDivElement {
    const eventos = eventosPorDeuda.get(deuda.id) ?? [];
    const estado = calcularEstadoDeuda(deuda, eventos);
    const card = document.createElement("div");
    card.className = "card deuda-card";
    card.innerHTML = `
      <div class="deuda-card__header">
        <div>
          <span class="deuda-card__contraparte">${deuda.contraparte}</span>
          <span class="badge">${deuda.tipo}</span>
          ${deuda.estado === "Activa" ? alertaBadge(deuda) : ""}
        </div>
        <div class="deuda-card__actions">
          <button type="button" class="icon-btn icon-btn--edit" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
          <button type="button" class="icon-btn icon-btn--delete" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
        </div>
      </div>
      <div class="progress-bar"><div class="progress-bar__fill" style="width:${estado.progresoPct}%"></div></div>
      <div class="deuda-card__stats">
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Saldo capital</span><span class="deuda-card__stat-value">${formatMoney(estado.saldoCapital)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Interés pendiente</span><span class="deuda-card__stat-value">${formatMoney(estado.interesPendiente)}</span></div>
        <div class="deuda-card__stat"><span class="deuda-card__stat-label">Total hoy</span><span class="deuda-card__stat-value deuda-card__stat-value--total">${formatMoney(estado.totalHoy)}</span></div>
      </div>
      ${deuda.estado === "Activa" ? `<p class="empty-state" style="margin:10px 0 0">${deuda.diaPago ? `Próximo pago: día ${deuda.diaPago} · ` : ""}Mínimo ${formatMoney(deuda.pagoMinimo)}</p>
      <p class="empty-state" style="margin:4px 0 0">${proyeccionTexto(deuda)}</p>` : ""}
      <div class="deuda-card__footer">
        ${deuda.estado === "Activa" ? `<button type="button" class="btn" data-action="abonar">Registrar abono</button>` : ""}
        <button type="button" class="btn-secondary" data-action="historial">Ver historial</button>
        ${deuda.estado === "Activa" ? `<button type="button" class="btn-secondary" data-action="pagada">Marcar como pagada</button>` : `<button type="button" class="btn-secondary" data-action="reabrir">Reabrir</button>`}
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
      const resultado = await showAbonoDialog(`Registrar abono — ${deuda.contraparte}`, deuda.pagoMinimo || undefined);
      if (!resultado) return;
      void runAction(() =>
        registrarAbono(spreadsheetId, deuda, eventosPorDeuda.get(deuda.id) ?? [], resultado.fecha, resultado.monto, resultado.nota),
      );
    });

    const pagadaBtn = card.querySelector<HTMLButtonElement>('[data-action="pagada"]');
    pagadaBtn?.addEventListener("click", async () => {
      const ok = await showConfirm(`¿Marcar la deuda con "${deuda.contraparte}" como pagada?`, {
        title: "Marcar como pagada",
        confirmLabel: "Marcar pagada",
      });
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

    totalEl.textContent = formatMoney(sumTotalHoy(deudas, eventosPorDeuda));

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
    renderContrapartesDatalist();
    renderList();
  }

  function openEditModal(deuda: Deuda): void {
    editingDeuda = deuda;
    editContraparteInput.value = deuda.contraparte;
    editTipoSelect.value = deuda.tipo;
    editMontoInput.value = String(deuda.montoOriginal);
    editTasaInput.value = String(deuda.tasaInteres);
    editPeriodicidadSelect.value = deuda.periodicidadInteres;
    editPagoMinimoInput.value = String(deuda.pagoMinimo);
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
        const contraparte = editContraparteInput.value.trim();
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
            tipo: editTipoSelect.value,
            montoOriginal: monto,
            tasaInteres: Number(editTasaInput.value) || 0,
            periodicidadInteres: editPeriodicidadSelect.value as PeriodicidadInteres,
            pagoMinimo: Number(editPagoMinimoInput.value) || 0,
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

    const contraparte = contraparteInput.value.trim();
    const monto = Number(montoInput.value);
    if (!contraparte || !monto || monto <= 0 || !fechaInicioInput.value) {
      formError.hidden = false;
      formError.textContent = "Completa la contraparte, la fecha y un monto válido.";
      return;
    }

    const nueva: NuevaDeuda = {
      direccion: config.direccion,
      contraparte,
      tipo: tipoSelect.value,
      montoOriginal: monto,
      tasaInteres: Number(tasaInput.value) || 0,
      periodicidadInteres: periodicidadSelect.value as PeriodicidadInteres,
      pagoMinimo: Number(pagoMinimoInput.value) || 0,
      diaPago: diaPagoInput.value.trim(),
      fechaInicio: fechaInicioInput.value,
      notas: notasInput.value.trim(),
    };

    submitBtn.disabled = true;
    try {
      const existente = buscarDeudaActivaPorContraparte(deudas, config.direccion, contraparte);
      if (existente) {
        const estadoExistente = calcularEstadoDeuda(existente, eventosPorDeuda.get(existente.id) ?? []);
        const eleccion = await showMergeChoice(existente.contraparte, estadoExistente.totalHoy);
        if (eleccion === null) return;
        if (eleccion === "fusionar") {
          await agregarMontoADeuda(spreadsheetId, existente, nueva.fechaInicio, nueva.montoOriginal, nueva.notas);
        } else {
          await crearDeuda(spreadsheetId, nueva);
        }
      } else {
        await crearDeuda(spreadsheetId, nueva);
      }
      form.reset();
      fechaInicioInput.value = todayISO();
      tasaInput.value = "0";
      pagoMinimoInput.value = "0";
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
    await reload();
  } catch (err) {
    activasListEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
