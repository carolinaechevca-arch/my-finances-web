import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { crearGastoFijo, listGastosFijosDelMes, setGastoFijoEstado, type GastoFijo } from "../../domain/gastos";
import { formatMonthLabel, formatMoney } from "../../domain/format";

export async function renderGastosFijos(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">🏦 Gastos Fijos — ${formatMonthLabel()}</h1>
    <div class="card stat-card" style="max-width:260px;margin-bottom:20px">
      <div class="stat-card__value" id="gf-total">—</div>
      <div class="stat-card__label">Total del mes</div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Agregar gasto fijo de este mes</h2>
      <form id="gasto-form" class="form">
        <div class="field"><label for="gf-nombre">Nombre</label><input id="gf-nombre" type="text" required /></div>
        <div class="field"><label for="gf-monto">Monto</label><input id="gf-monto" type="number" min="0" step="0.01" required /></div>
        <div class="field"><label for="gf-categoria">Categoría</label><input id="gf-categoria" type="text" /></div>
        <div class="field"><label for="gf-dia">Día de pago</label><input id="gf-dia" type="number" min="1" max="31" /></div>
        <button type="submit" class="btn">Guardar gasto fijo</button>
      </form>
      <p class="empty-state" id="gasto-form-error" hidden></p>
    </div>

    <div class="card">
      <h2 style="margin-top:0">Gastos fijos de este mes</h2>
      <div id="gf-list"><p class="empty-state">Cargando…</p></div>
    </div>
  `;

  const totalEl = container.querySelector<HTMLDivElement>("#gf-total")!;
  const listEl = container.querySelector<HTMLDivElement>("#gf-list")!;
  const form = container.querySelector<HTMLFormElement>("#gasto-form")!;
  const formError = container.querySelector<HTMLParagraphElement>("#gasto-form-error")!;
  const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const nombreInput = container.querySelector<HTMLInputElement>("#gf-nombre")!;
  const montoInput = container.querySelector<HTMLInputElement>("#gf-monto")!;
  const categoriaInput = container.querySelector<HTMLInputElement>("#gf-categoria")!;
  const diaInput = container.querySelector<HTMLInputElement>("#gf-dia")!;

  let spreadsheetId = "";

  function renderList(gastos: GastoFijo[]): void {
    totalEl.textContent = formatMoney(gastos.reduce((s, g) => s + g.monto, 0));

    if (gastos.length === 0) {
      listEl.innerHTML = `<p class="empty-state">Aún no registras gastos fijos este mes.</p>`;
      return;
    }

    listEl.innerHTML = "";
    for (const gasto of gastos) {
      const item = document.createElement("div");
      item.className = "record-row";
      const pagado = gasto.estado === "Pagado";
      item.innerHTML = `
        <div class="record-row__main">
          <span class="record-row__title">${gasto.nombre}</span>
          <span class="record-row__subtitle">${gasto.categoria || "—"}${gasto.diaPago ? ` · Día ${gasto.diaPago}` : ""}</span>
        </div>
        <div class="record-row__amount">${formatMoney(gasto.monto)}</div>
        <button type="button" class="btn-toggle ${pagado ? "" : "is-off"}">${pagado ? "Pagado" : "Pendiente"}</button>
      `;
      const toggleBtn = item.querySelector<HTMLButtonElement>(".btn-toggle")!;
      toggleBtn.addEventListener("click", async () => {
        toggleBtn.disabled = true;
        await setGastoFijoEstado(spreadsheetId, gasto, pagado ? "Pendiente" : "Pagado");
        await reload();
      });
      listEl.appendChild(item);
    }
  }

  async function reload(): Promise<void> {
    renderList(await listGastosFijosDelMes(spreadsheetId));
  }

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

    submitBtn.disabled = true;
    try {
      await crearGastoFijo(spreadsheetId, nombre, monto, categoriaInput.value.trim(), diaInput.value.trim());
      form.reset();
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
