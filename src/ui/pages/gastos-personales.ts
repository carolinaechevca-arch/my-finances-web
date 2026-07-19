import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { crearGastoPersonal, listGastosPersonalesDelMes, type GastoPersonal } from "../../domain/gastos";
import { formatMonthLabel, formatMoney } from "../../domain/format";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function renderGastosPersonales(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">🛒 Gastos y Compras — ${formatMonthLabel()}</h1>
    <div class="card stat-card" style="max-width:260px;margin-bottom:20px">
      <div class="stat-card__value" id="gp-total">—</div>
      <div class="stat-card__label">Total del mes</div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar gasto</h2>
      <form id="gp-form" class="form">
        <div class="field"><label for="gp-fecha">Fecha</label><input id="gp-fecha" type="date" value="${todayISO()}" required /></div>
        <div class="field"><label for="gp-categoria">Categoría</label><input id="gp-categoria" type="text" /></div>
        <div class="field"><label for="gp-monto">Monto</label><input id="gp-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="gp-descripcion">Descripción</label><input id="gp-descripcion" type="text" /></div>
        <button type="submit" class="btn">Guardar gasto</button>
      </form>
      <p class="empty-state" id="gp-form-error" hidden></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Gastos de este mes</h2>
      <div id="gp-list"><p class="empty-state">Cargando…</p></div>
    </div>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#gp-total")!;
  const listEl = container.querySelector<HTMLDivElement>("#gp-list")!;
  const form = container.querySelector<HTMLFormElement>("#gp-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gp-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const fechaInput = container.querySelector<HTMLInputElement>("#gp-fecha")!;
  const categoriaInput = container.querySelector<HTMLInputElement>("#gp-categoria")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gp-monto")!;
  const descripcionInput = container.querySelector<HTMLInputElement>("#gp-descripcion")!;

  let spreadsheetId = "";

  function renderList(gastos: GastoPersonal[]): void {
    totalEl.textContent = formatMoney(gastos.reduce((s, g) => s + g.monto, 0));

    if (gastos.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aún no registras gastos este mes.</p>`;
      return;
    }

    listEl.innerHTML = "";
    for (const gasto of [...gastos].reverse()) {
      const item = document.createElement("div");
      item.className = "record-row";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">${gasto.descripcion || gasto.categoria || "Gasto"}</span>
          <span class="record-row__subtitle">${gasto.fecha}${gasto.categoria ? ` · ${gasto.categoria}` : ""}</span>
        </div>
        <div class="record-row__amount">${formatMoney(gasto.monto)}</div>
      `;
      listEl.appendChild(item);
    }
  }

  async function reload(): Promise<void> {
    renderList(await listGastosPersonalesDelMes(spreadsheetId));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.hidden = true;

    const fecha = fechaInput.value;
    const monto = Number(montoInput.value);
    if (!fecha || !monto || monto <= 0) {
      formError.hidden = false;
      formError.textContent = "Ingresa una fecha y un monto válido.";
      return;
    }

    submitBtn.disabled = true;
    try {
      await crearGastoPersonal(spreadsheetId, fecha, categoriaInput.value.trim(), monto, descripcionInput.value.trim());
      form.reset();
      fechaInput.value = todayISO();
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
    await reload();
  } catch (err) {
    listEl.innerHTML = `<p class="empty-state">${err instanceof Error ? err.message : "No se pudo cargar la información."}</p>`;
  }
}
