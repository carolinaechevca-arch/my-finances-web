import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { formatMoney } from "../../domain/format";
import {
  crearIngresoFijo,
  crearTipoIngreso,
  listIngresosFijos,
  listTiposIngreso,
  setIngresoFijoActivo,
  sumIngresosFijosActivos,
  type IngresoFijo,
} from "../../domain/ingresos";

const NUEVO_TIPO_VALUE = "__nuevo__";

export async function renderIngresos(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">💵 Ingresos Fijos</h1>
    <div class="card stat-card" style="max-width:260px;margin-bottom:20px">
      <div class="stat-card__value" id="ingresos-total">—</div>
      <div class="stat-card__label">Total mensual fijo</div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar ingreso fijo</h2>
      <form id="ingreso-form" class="form">
        <div class="field">
          <label for="ingreso-tipo">Tipo</label>
          <select id="ingreso-tipo"></select>
        </div>
        <div class="field" id="nuevo-tipo-field" hidden>
          <label for="ingreso-tipo-nuevo">Nombre del nuevo tipo</label>
          <input id="ingreso-tipo-nuevo" type="text" placeholder="Ej. Arriendo recibido" />
        </div>
        <div class="field">
          <label for="ingreso-monto">Monto mensual</label>
          <input id="ingreso-monto" type="number" min="0" step="0.01" required />
        </div>
        <div class="field">
          <label for="ingreso-notas">Notas (opcional)</label>
          <input id="ingreso-notas" type="text" />
        </div>
        <button type="submit" class="btn">Guardar ingreso fijo</button>
      </form>
      <p class="empty-state" id="ingreso-form-error" hidden></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Tus ingresos fijos</h2>
      <div id="ingresos-list"><p class="empty-state">Cargando…</p></div>
    </div>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#ingresos-total")!;
  const tipoSelect = container.querySelector<HTMLSelectElement>("#ingreso-tipo")!;
  const nuevoTipoField = container.querySelector<HTMLDivElement>("#nuevo-tipo-field")!;
  const nuevoTipoInput = container.querySelector<HTMLInputElement>("#ingreso-tipo-nuevo")!;
  const montoInput = container.querySelector<HTMLInputElement>("#ingreso-monto")!;
  const notasInput = container.querySelector<HTMLInputElement>("#ingreso-notas")!;
  const form = container.querySelector<HTMLFormElement>("#ingreso-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#ingreso-form-error")!;
  const listEl = container.querySelector<HTMLDivElement>("#ingresos-list")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;

  let spreadsheetId = "";
  let tipos: string[] = [];

  function renderTipoOptions(): void {
    tipoSelect.innerHTML =
      tipos.map((t) => `<option value="${t}">${t}</option>`).join("") +
      `<option value="${NUEVO_TIPO_VALUE}">+ Nuevo tipo…</option>`;
  }

  function renderList(ingresos: IngresoFijo[]): void {
    totalEl.textContent = formatMoney(sumIngresosFijosActivos(ingresos));

    if (ingresos.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aún no tienes ingresos fijos registrados. Agrega el primero arriba.</p>`;
      return;
    }

    listEl.innerHTML = "";
    for (const ingreso of ingresos) {
      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">${ingreso.tipo}</span>
          <span class="record-row__subtitle">${ingreso.notas || "—"}</span>
        </div>
        <div class="record-row__amount">${formatMoney(ingreso.monto)}</div>
        <button type="button" class="btn-toggle ${ingreso.activo ? "" : "is-off"}">
          ${ingreso.activo ? "Activo" : "Pausado"}
        </button>
      `;
      const toggleBtn = item.querySelector<HTMLButtonElement>(".btn-toggle")!;
      toggleBtn.addEventListener("click", async () => {
        toggleBtn.disabled = true;
        await setIngresoFijoActivo(spreadsheetId, ingreso, !ingreso.activo);
        await reload();
      });
      listEl.appendChild(item);
    }
  }

  async function reload(): Promise<void> {
    const ingresos = await listIngresosFijos(spreadsheetId);
    renderList(ingresos);
  }

  tipoSelect.addEventListener("change", () => {
    nuevoTipoField.hidden = tipoSelect.value !== NUEVO_TIPO_VALUE;
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

    let tipo = tipoSelect.value;
    if (tipo === NUEVO_TIPO_VALUE) {
      tipo = nuevoTipoInput.value.trim();
      if (!tipo) {
        formError.hidden = false;
        formError.textContent = "Escribe el nombre del nuevo tipo.";
        return;
      }
    }

    submitBtn.disabled = true;
    try {
      if (!tipos.includes(tipo)) {
        await crearTipoIngreso(spreadsheetId, tipo);
        tipos.push(tipo);
        renderTipoOptions();
      }
      await crearIngresoFijo(spreadsheetId, tipo, monto, notasInput.value.trim());
      form.reset();
      nuevoTipoField.hidden = true;
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
    tipos = await listTiposIngreso(spreadsheetId);
    renderTipoOptions();
    await reload();
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
