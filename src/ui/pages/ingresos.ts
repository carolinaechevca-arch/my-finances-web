import cashBanknotePlusIcon from "../../icon/cash-banknote-plus.svg?raw";
import deviceFloppyIcon from "../../icon/device-floppy.svg?raw";
import editIcon from "../../icon/edit.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { calcularDisponible } from "../../domain/balance";
import { formatMoney, todayISO } from "../../domain/format";
import {
  crearFuenteIngreso,
  crearTipoIngreso,
  actualizarIngreso,
  eliminarIngreso,
  eliminarTipoIngreso,
  listIngresosVigentes,
  listMovimientosIngresos,
  listTiposIngreso,
  omitirProximoIngreso,
  registrarIngresoRecibido,
  setIngresoActivo,
  sumMovimientosRecibidos,
  type FrecuenciaIngreso,
  type IngresoFijo,
  type MovimientoIngreso,
} from "../../domain/ingresos";
import { formatPeriodoBadge, obtenerConfigPeriodo } from "../../domain/periodo";
import { showAlert, showConfirm } from "../components/dialogs";
import { mountEyeToggle } from "../components/eye-toggle";
import { loaderHtml } from "../components/loader";
import { createOptionCombo, type OptionCombo } from "../components/tipo-combo";

const MODALIDAD_LABELS: Record<FrecuenciaIngreso, string> = {
  Mensual: "Mensual",
  Quincenal: "Quincenal (dos fechas al mes)",
  Semanal: "Semanal",
  PagoUnico: "Pago único",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]!);
}

function formatFecha(fecha: string): string {
  if (!fecha) return "Sin fecha programada";
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" })
    .format(new Date(`${fecha}T12:00:00`))
    .replace(".", "");
}

export async function renderIngresos(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${cashBanknotePlusIcon} Ingresos</h1>
      <span class="month-badge" id="periodo-badge">Cargando…</span>
    </div>

    <div class="card-grid" style="margin-bottom:20px">
      <div class="card card--primary stat-card" style="position:relative">
        <button type="button" class="icon-btn" id="ingresos-eye-btn" aria-label="Mostrar u ocultar montos" title="Mostrar u ocultar montos" style="position:absolute;right:14px;top:14px;color:white"></button>
        <span class="stat-card__label">Recibido en el periodo</span><div class="stat-card__value" id="ing-recibido">—</div>
      </div>
      <div class="card stat-card"><span class="stat-card__label">Disponible</span><div class="stat-card__value" id="ing-disponible">—</div></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar fuente de ingreso</h2>
      <p class="empty-state" style="margin-top:-6px">Configura lo que esperas recibir. El dinero solo contará como disponible cuando registres el pago real.</p>
      <form id="fuente-form" class="form">
        <div class="field"><label for="fuente-nombre">Nombre de la fuente</label><input id="fuente-nombre" type="text" placeholder="Ej. Salario empresa, Arriendo apartamento" required /></div>
        <div class="field">
          <label>Categoría</label>
          <div id="ingreso-categoria-mount"></div>
        </div>
        <div class="field"><label for="fuente-modalidad">Modalidad</label><select id="fuente-modalidad">${Object.entries(MODALIDAD_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
        <div class="field"><label for="fuente-monto">Monto estimado por pago</label><input id="fuente-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field" id="proxima-field"><label for="fuente-proxima">Próxima fecha esperada</label><input id="fuente-proxima" type="date" /></div>
        <div class="field" id="quincena-field" hidden><label for="fuente-quincena">Días de pago</label><input id="fuente-quincena" type="text" value="15,30" placeholder="15,30" /></div>
        <div class="field"><label for="fuente-cuenta">Cuenta destino (opcional)</label><input id="fuente-cuenta" type="text" placeholder="Ej. Bancolombia" /></div>
        <div class="field"><label for="fuente-notas">Notas (opcional)</label><input id="fuente-notas" type="text" /></div>
        <button type="submit" class="btn">${deviceFloppyIcon} Guardar fuente</button>
      </form>
      <p class="empty-state" id="fuente-error" hidden></p>
    </div>

    <div class="card" style="margin-bottom:20px">
      <div class="table-toolbar"><h2 style="margin:0">Próximos pagos y fuentes</h2></div>
      <div id="fuentes-list">${loaderHtml()}</div>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Movimientos de este periodo</h2>
      <div id="movimientos-list">${loaderHtml()}</div>
    </div>

    <dialog id="recibir-modal" class="modal">
      <form class="modal__form" id="recibir-form">
        <h2 class="modal__title">Registrar ingreso recibido</h2>
        <p class="modal__message" id="recibir-fuente"></p>
        <div class="field"><label for="recibir-fecha">Fecha recibida</label><input id="recibir-fecha" type="date" required /></div>
        <div class="field"><label for="recibir-monto">Monto real recibido</label><input id="recibir-monto" type="number" step="0.01" required /></div>
        <div class="field"><label for="recibir-notas">Notas (opcional)</label><input id="recibir-notas" type="text" /></div>
        <p class="empty-state" id="recibir-error" hidden></p>
        <div class="modal__actions"><button type="button" class="btn-secondary" data-action="cancel">Cancelar</button><button type="submit" class="btn">Registrar</button></div>
      </form>
    </dialog>

    <dialog id="editar-fuente-modal" class="modal">
      <form class="modal__form" id="editar-fuente-form">
        <h2 class="modal__title">Editar fuente</h2>
        <div class="field"><label for="editar-nombre">Nombre</label><input id="editar-nombre" type="text" required /></div>
        <div class="field"><label>Categoría</label><div id="editar-ingreso-categoria-mount"></div></div>
        <div class="field"><label for="editar-modalidad">Modalidad</label><select id="editar-modalidad">${Object.entries(MODALIDAD_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></div>
        <div class="field"><label for="editar-monto">Monto estimado</label><input id="editar-monto" type="number" min="0" step="0.01" /></div>
        <div class="field" id="editar-proxima-field"><label for="editar-proxima">Próxima fecha esperada</label><input id="editar-proxima" type="date" /></div>
        <div class="field" id="editar-quincena-field" hidden><label for="editar-quincena">Días quincenales</label><input id="editar-quincena" type="text" placeholder="15,30" /></div>
        <div class="field"><label for="editar-cuenta">Cuenta destino</label><input id="editar-cuenta" type="text" /></div>
        <div class="field"><label for="editar-notas">Notas</label><input id="editar-notas" type="text" /></div>
        <p class="empty-state" id="editar-error" hidden></p>
        <div class="modal__actions"><button type="button" class="btn-secondary" data-action="cancel">Cancelar</button><button type="submit" class="btn">Guardar</button></div>
      </form>
    </dialog>

    <dialog id="categoria-modal" class="modal">
      <form class="modal__form" id="categoria-form">
        <h2 class="modal__title">Nueva categoría de ingreso</h2>
        <div class="field"><label for="categoria-nombre">Nombre</label><input id="categoria-nombre" type="text" placeholder="Ej. Comisión, Arriendo, Freelance" required /></div>
        <p class="empty-state" id="categoria-error" hidden></p>
        <div class="modal__actions"><button type="button" class="btn-secondary" data-action="cancel">Cancelar</button><button type="submit" class="btn">Agregar</button></div>
      </form>
    </dialog>
  `;

  const periodoBadge = container.querySelector<HTMLSpanElement>("#periodo-badge")!;
  const recibidoEl = container.querySelector<HTMLElement>("#ing-recibido")!;
  const disponibleEl = container.querySelector<HTMLElement>("#ing-disponible")!;
  const eyeBtn = container.querySelector<HTMLButtonElement>("#ingresos-eye-btn")!;
  const fuentesList = container.querySelector<HTMLDivElement>("#fuentes-list")!;
  const movimientosList = container.querySelector<HTMLDivElement>("#movimientos-list")!;
  const fuenteForm = container.querySelector<HTMLFormElement>("#fuente-form")!;
  const nombreInput = container.querySelector<HTMLInputElement>("#fuente-nombre")!;
  const modalidadSelect = container.querySelector<HTMLSelectElement>("#fuente-modalidad")!;
  const montoInput = container.querySelector<HTMLInputElement>("#fuente-monto")!;
  const proximaField = container.querySelector<HTMLElement>("#proxima-field")!;
  const proximaInput = container.querySelector<HTMLInputElement>("#fuente-proxima")!;
  const quincenaField = container.querySelector<HTMLElement>("#quincena-field")!;
  const quincenaInput = container.querySelector<HTMLInputElement>("#fuente-quincena")!;
  const cuentaInput = container.querySelector<HTMLInputElement>("#fuente-cuenta")!;
  const notasInput = container.querySelector<HTMLInputElement>("#fuente-notas")!;
  const fuenteError = container.querySelector<HTMLElement>("#fuente-error")!;
  const categoriaModal = container.querySelector<HTMLDialogElement>("#categoria-modal")!;
  const categoriaForm = container.querySelector<HTMLFormElement>("#categoria-form")!;
  const categoriaNombre = container.querySelector<HTMLInputElement>("#categoria-nombre")!;
  const categoriaError = container.querySelector<HTMLElement>("#categoria-error")!;

  const recibirModal = container.querySelector<HTMLDialogElement>("#recibir-modal")!;
  const recibirForm = container.querySelector<HTMLFormElement>("#recibir-form")!;
  const recibirFuente = container.querySelector<HTMLElement>("#recibir-fuente")!;
  const recibirFecha = container.querySelector<HTMLInputElement>("#recibir-fecha")!;
  const recibirMonto = container.querySelector<HTMLInputElement>("#recibir-monto")!;
  const recibirNotas = container.querySelector<HTMLInputElement>("#recibir-notas")!;
  const recibirError = container.querySelector<HTMLElement>("#recibir-error")!;
  const editarModal = container.querySelector<HTMLDialogElement>("#editar-fuente-modal")!;
  const editarForm = container.querySelector<HTMLFormElement>("#editar-fuente-form")!;
  const editarNombre = container.querySelector<HTMLInputElement>("#editar-nombre")!;
  const editarModalidad = container.querySelector<HTMLSelectElement>("#editar-modalidad")!;
  const editarMonto = container.querySelector<HTMLInputElement>("#editar-monto")!;
  const editarProximaField = container.querySelector<HTMLElement>("#editar-proxima-field")!;
  const editarProxima = container.querySelector<HTMLInputElement>("#editar-proxima")!;
  const editarQuincenaField = container.querySelector<HTMLElement>("#editar-quincena-field")!;
  const editarQuincena = container.querySelector<HTMLInputElement>("#editar-quincena")!;
  const editarCuenta = container.querySelector<HTMLInputElement>("#editar-cuenta")!;
  const editarNotas = container.querySelector<HTMLInputElement>("#editar-notas")!;
  const editarError = container.querySelector<HTMLElement>("#editar-error")!;

  let spreadsheetId = "";
  let periodoInicio = "";
  let fuentes: IngresoFijo[] = [];
  let movimientos: MovimientoIngreso[] = [];
  let categorias: string[] = [];
  let formCategoriaValue = "";
  let editCategoriaValue = "";
  let fuenteSeleccionada: IngresoFijo | null = null;
  let fuenteEditando: IngresoFijo | null = null;
  let busy = false;
  let latestRecibido = 0;
  let latestDisponible = 0;
  const eyeToggle = mountEyeToggle(eyeBtn, [recibidoEl, disponibleEl], () => [
    formatMoney(latestRecibido),
    formatMoney(latestDisponible),
  ]);

  function refreshCombos(): void {
    categoriaCombo.refresh();
    editCategoriaCombo.refresh();
  }

  function openCategoriaModal(onDone: (nombre: string) => void): void {
    categoriaNombre.value = "";
    categoriaError.hidden = true;
    const controller = new AbortController();
    const { signal } = controller;

    categoriaModal.addEventListener("cancel", () => controller.abort(), { signal });
    categoriaModal.querySelector('[data-action="cancel"]')!.addEventListener(
      "click",
      () => {
        controller.abort();
        categoriaModal.close();
      },
      { signal },
    );

    categoriaForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();
        const nombre = categoriaNombre.value.trim();
        if (!nombre) {
          categoriaError.hidden = false;
          categoriaError.textContent = "Escribe un nombre.";
          return;
        }
        const existente = categorias.find((categoria) => categoria.toLocaleLowerCase("es") === nombre.toLocaleLowerCase("es"));
        const confirmBtn = categoriaForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
        confirmBtn.disabled = true;
        try {
          const categoria = existente ?? nombre;
          if (!existente) {
            await crearTipoIngreso(spreadsheetId, nombre);
            categorias.push(nombre);
          }
          controller.abort();
          categoriaModal.close();
          onDone(categoria);
          refreshCombos();
        } catch (err) {
          categoriaError.hidden = false;
          categoriaError.textContent = err instanceof Error ? err.message : "No se pudo crear la categoría.";
        } finally {
          confirmBtn.disabled = false;
        }
      },
      { signal },
    );

    categoriaModal.showModal();
    categoriaNombre.focus();
  }

  async function handleDeleteCategoria(categoria: string): Promise<void> {
    const enUso = fuentes.some((fuente) => fuente.tipo === categoria);
    if (enUso) {
      await showAlert(
        `No puedes eliminar "${categoria}" porque tienes fuentes de ingreso con esta categoría. Edítalas o elimínalas primero.`,
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
      await eliminarTipoIngreso(spreadsheetId, categoria);
      categorias = categorias.filter((item) => item !== categoria);
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
  container.querySelector("#ingreso-categoria-mount")!.appendChild(categoriaCombo.el);

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
  container.querySelector("#editar-ingreso-categoria-mount")!.appendChild(editCategoriaCombo.el);

  function actualizarModalidad(): void {
    const modalidad = modalidadSelect.value as FrecuenciaIngreso;
    quincenaField.hidden = modalidad !== "Quincenal";
    proximaField.hidden = modalidad === "Quincenal";
    proximaInput.required = modalidad !== "Quincenal";
    montoInput.required = true;
  }
  modalidadSelect.addEventListener("change", actualizarModalidad);
  actualizarModalidad();

  function actualizarModalidadEdicion(): void {
    const esQuincenal = editarModalidad.value === "Quincenal";
    editarQuincenaField.hidden = !esQuincenal;
    editarProximaField.hidden = esQuincenal;
    editarProxima.required = !esQuincenal;
  }
  editarModalidad.addEventListener("change", actualizarModalidadEdicion);

  function abrirRecibir(fuente: IngresoFijo): void {
    fuenteSeleccionada = fuente;
    recibirFuente.textContent = `${fuente.nombre} · estimado ${formatMoney(fuente.monto)}`;
    recibirFecha.value = fuente.proximaFecha || todayISO();
    recibirMonto.value = fuente.monto ? String(fuente.monto) : "";
    recibirNotas.value = "";
    recibirError.hidden = true;
    recibirModal.showModal();
  }

  recibirModal.querySelector('[data-action="cancel"]')!.addEventListener("click", () => recibirModal.close());
  recibirForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!fuenteSeleccionada || busy) return;
    const monto = Number(recibirMonto.value);
    if (!recibirFecha.value || !Number.isFinite(monto) || monto === 0) {
      recibirError.hidden = false;
      recibirError.textContent = "Ingresa una fecha y un monto real diferente de cero.";
      return;
    }
    busy = true;
    try {
      await registrarIngresoRecibido(spreadsheetId, fuenteSeleccionada, {
        fechaRecibida: recibirFecha.value,
        montoReal: monto,
        notas: recibirNotas.value.trim(),
        periodoId: periodoInicio,
      });
      recibirModal.close();
      await reload();
    } catch (err) {
      recibirError.hidden = false;
      recibirError.textContent = err instanceof Error ? err.message : "No se pudo registrar el pago.";
    } finally {
      busy = false;
    }
  });

  function abrirEditar(fuente: IngresoFijo): void {
    fuenteEditando = fuente;
    editarNombre.value = fuente.nombre;
    editCategoriaValue = fuente.tipo;
    editCategoriaCombo.refresh();
    editarModalidad.value = fuente.frecuencia;
    editarMonto.value = String(fuente.monto);
    editarProxima.value = fuente.proximaFecha;
    editarQuincena.value = fuente.diaPago || "15,30";
    actualizarModalidadEdicion();
    editarCuenta.value = fuente.cuentaDestino;
    editarNotas.value = fuente.notas;
    editarError.hidden = true;
    editarModal.showModal();
  }

  editarModal.querySelector('[data-action="cancel"]')!.addEventListener("click", () => editarModal.close());
  editarForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!fuenteEditando || busy) return;
    const modalidad = editarModalidad.value as FrecuenciaIngreso;
    const monto = Number(editarMonto.value || 0);
    if (!editarNombre.value.trim() || monto <= 0 || (modalidad !== "Quincenal" && !editarProxima.value)) {
      editarError.hidden = false;
      editarError.textContent = "Completa el nombre y un monto estimado válido.";
      return;
    }
    busy = true;
    try {
      await actualizarIngreso(spreadsheetId, fuenteEditando, {
        nombre: editarNombre.value.trim(),
        tipo: editCategoriaValue || "Otro",
        monto,
        notas: editarNotas.value.trim(),
        recurrencia: modalidad === "PagoUnico" ? "UnicoMes" : "Fijo",
        frecuencia: modalidad,
        diaPago: modalidad === "Quincenal" ? editarQuincena.value || "15,30" : "",
        proximaFecha: modalidad === "Quincenal" ? "" : editarProxima.value,
        cuentaDestino: editarCuenta.value.trim(),
      });
      editarModal.close();
      await reload();
    } catch (err) {
      editarError.hidden = false;
      editarError.textContent = err instanceof Error ? err.message : "No se pudo editar la fuente.";
    } finally {
      busy = false;
    }
  });

  function renderFuentes(): void {
    const visibles = fuentes.filter((f) => !(f.frecuencia === "PagoUnico" && f.cerrado));
    if (visibles.length === 0) {
      fuentesList.innerHTML = `<p class="empty-state">Aún no tienes fuentes configuradas.</p>`;
      return;
    }
    fuentesList.innerHTML = visibles
      .sort((a, b) => (a.proximaFecha || "9999").localeCompare(b.proximaFecha || "9999"))
      .map((f) => {
        const vencido = f.activo && f.frecuencia !== "PagoUnico" && f.proximaFecha && f.proximaFecha < todayISO();
        return `<div class="record-row" data-id="${escapeHtml(f.id)}">
          <div class="record-row__main"><span class="record-row__title">${escapeHtml(f.nombre)} <span class="badge ${vencido ? "badge--unico" : "badge--fijo"}">${vencido ? "Atrasado" : escapeHtml(MODALIDAD_LABELS[f.frecuencia])}</span></span>
          <span class="record-row__subtitle">${escapeHtml(f.tipo)} · ${escapeHtml(formatFecha(f.proximaFecha))}${f.cuentaDestino ? ` · ${escapeHtml(f.cuentaDestino)}` : ""}</span></div>
          <div class="record-row__amount">${formatMoney(f.monto)}</div>
          ${f.activo ? `<button type="button" class="btn" data-action="receive">Registrar recibido</button>` : ""}
          ${f.activo && f.proximaFecha ? `<button type="button" class="btn-secondary" data-action="skip">Omitir</button>` : ""}
          ${f.frecuencia !== "PagoUnico" ? `<button type="button" class="btn-secondary" data-action="toggle">${f.activo ? "Pausar" : "Reactivar"}</button>` : ""}
          <button type="button" class="icon-btn icon-btn--edit" data-action="edit" aria-label="Editar" title="Editar">${editIcon}</button>
          <button type="button" class="icon-btn icon-btn--delete" data-action="delete" aria-label="Eliminar" title="Eliminar">${trashIcon}</button>
        </div>`;
      }).join("");
    fuentesList.querySelectorAll<HTMLElement>("[data-id]").forEach((row) => {
      const fuente = fuentes.find((f) => f.id === row.dataset.id);
      if (!fuente) return;
      row.querySelector<HTMLButtonElement>('[data-action="receive"]')?.addEventListener("click", () => abrirRecibir(fuente));
      row.querySelector<HTMLButtonElement>('[data-action="skip"]')?.addEventListener("click", async () => {
        const ok = await showConfirm(`¿Omitir el pago esperado de "${fuente.nombre}"? No sumará al disponible y se avanzará la próxima fecha.`, { title: "Omitir pago", confirmLabel: "Omitir" });
        if (ok) void ejecutar(() => omitirProximoIngreso(spreadsheetId, fuente, periodoInicio));
      });
      row.querySelector<HTMLButtonElement>('[data-action="toggle"]')?.addEventListener("click", () => void ejecutar(() => setIngresoActivo(spreadsheetId, fuente, !fuente.activo)));
      row.querySelector<HTMLButtonElement>('[data-action="edit"]')?.addEventListener("click", () => abrirEditar(fuente));
      row.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener("click", async () => {
        const ok = await showConfirm(`¿Eliminar la fuente "${fuente.nombre}"? Los pagos ya recibidos se conservarán en el historial.`, { title: "Eliminar fuente", confirmLabel: "Eliminar", danger: true });
        if (ok) void ejecutar(() => eliminarIngreso(spreadsheetId, fuente));
      });
    });
  }

  function renderMovimientos(): void {
    // Esta pantalla empieza limpia en cada reinicio. Los movimientos de
    // periodos anteriores se conservan y siguen disponibles en Histórico.
    const historial = movimientos
      .filter((m) => m.periodoId ? m.periodoId === periodoInicio : (m.fechaRecibida || m.fechaEsperada) >= periodoInicio)
      .sort((a, b) => (b.fechaRecibida || b.fechaEsperada).localeCompare(a.fechaRecibida || a.fechaEsperada));
    if (historial.length === 0) {
      movimientosList.innerHTML = `<p class="empty-state">Aún no has confirmado ingresos en este periodo.</p>`;
      return;
    }
    movimientosList.innerHTML = historial.slice(0, 50).map((m) => `<div class="record-row">
      <div class="record-row__main"><span class="record-row__title">${escapeHtml(m.fuenteNombre || m.tipo)} <span class="badge ${m.estado === "Recibido" ? "badge--fijo" : "badge--neutral"}">${m.estado}</span></span><span class="record-row__subtitle">${escapeHtml(formatFecha(m.fechaRecibida || m.fechaEsperada))}${m.notas ? ` · ${escapeHtml(m.notas)}` : ""}</span></div>
      <div class="record-row__amount">${m.estado === "Recibido" ? formatMoney(m.montoReal) : "—"}</div>
    </div>`).join("");
  }

  async function ejecutar(action: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      await action();
      try {
        await reload();
      } catch (err) {
        await showAlert(
          `La acción se guardó, pero no se pudo actualizar la pantalla. ${err instanceof Error ? err.message : "Vuelve a cargar la página."}`,
          "Acción completada",
        );
      }
    } catch (err) {
      await showAlert(err instanceof Error ? err.message : "No se pudo completar la acción.", "Error");
    }
    finally { busy = false; }
  }

  async function reload(): Promise<void> {
    const [fuentesActuales, movimientosActuales, detalleDisponible] = await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listMovimientosIngresos(spreadsheetId),
      calcularDisponible(spreadsheetId, periodoInicio),
    ]);
    fuentes = fuentesActuales;
    movimientos = movimientosActuales;
    const recibido = sumMovimientosRecibidos(movimientos, periodoInicio);
    latestRecibido = recibido;
    latestDisponible = detalleDisponible.disponible;
    eyeToggle.refresh();
    renderFuentes();
    renderMovimientos();
  }

  fuenteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    fuenteError.hidden = true;
    const modalidad = modalidadSelect.value as FrecuenciaIngreso;
    const monto = Number(montoInput.value || 0);
    if (!nombreInput.value.trim() || monto <= 0 || (modalidad !== "Quincenal" && !proximaInput.value)) {
      fuenteError.hidden = false;
      fuenteError.textContent = "Completa el nombre, el monto estimado y la próxima fecha.";
      return;
    }
    await ejecutar(() => crearFuenteIngreso(spreadsheetId, {
      nombre: nombreInput.value.trim(), tipo: formCategoriaValue || "Otro", montoEstimado: monto,
      modalidad, proximaFecha: modalidad === "Quincenal" ? "" : proximaInput.value, diasQuincena: quincenaInput.value,
      cuentaDestino: cuentaInput.value.trim(), notas: notasInput.value.trim(),
    }));
    fuenteForm.reset();
    modalidadSelect.value = "Mensual";
    quincenaInput.value = "15,30";
    actualizarModalidad();
  });

  try {
    spreadsheetId = (await ensureSpreadsheet()).spreadsheetId;
    const [tipos, config] = await Promise.all([listTiposIngreso(spreadsheetId), obtenerConfigPeriodo(spreadsheetId)]);
    periodoInicio = config.fechaUltimoReinicio;
    periodoBadge.textContent = formatPeriodoBadge(config);
    categorias = tipos;
    formCategoriaValue = categorias[0] ?? "";
    refreshCombos();
    proximaInput.value = todayISO();
    await reload();
  } catch (err) {
    fuentesList.innerHTML = `<p class="empty-state">${escapeHtml(err instanceof Error ? err.message : "No se pudo cargar la información.")}</p>`;
    movimientosList.innerHTML = "";
  }
}
