import businessplanIcon from "../../icon/businessplan.svg?raw";
import calendarMonthIcon from "../../icon/calendar-month.svg?raw";
import cashIcon from "../../icon/cash.svg?raw";
import cashMinusIcon from "../../icon/cash-minus.svg?raw";
import chartPieIcon from "../../icon/chart-pie.svg?raw";
import eyeIcon from "../../icon/eye.svg?raw";
import eyeOffIcon from "../../icon/eye-off.svg?raw";
import financeIcon from "../../icon/finance.svg?raw";
import fileSpreadsheetIcon from "../../icon/file-spreadsheet.svg?raw";
import homeDollarIcon from "../../icon/home-dollar.svg?raw";
import moneybagPlusIcon from "../../icon/moneybag-plus.svg?raw";
import pigMoneyIcon from "../../icon/pig-money.svg?raw";
import trendingUpIcon from "../../icon/trending-up.svg?raw";
import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { calcularDisponibleDesde } from "../../domain/balance";
import { listDashboardConfig } from "../../domain/dashboard-config";
import { agruparEventosPorDeuda, calcularEstadoDeuda, estadoAlerta, listDeudas, listTodosLosEventos } from "../../domain/deudas";
import { formatFullDateLabel, formatMoney, monthKey, parseDateInput, todayISO } from "../../domain/format";
import {
  calcularGastosFijosVigentes,
  estadoAlertaGastoFijo,
  filtrarGastosFijosDelMes,
  listTodosLosGastosFijos,
  sumGastosFijosPagado,
  sumGastosFijosPendientes,
  sumGastosFijosTotal,
  type GastoFijo,
} from "../../domain/gastos";
import {
  filtrarGastosDelMes,
  filtrarGastosDelPeriodo,
  filtrarPendientes,
  listTodosLosGastos,
  sumGastos as sumGastosYCompras,
  type GastoYCompra,
} from "../../domain/gastos-y-compras";
import { listIngresosVigentes } from "../../domain/ingresos";
import { ejecutarReinicioPeriodo, obtenerConfigPeriodo } from "../../domain/periodo";
import {
  agruparMovimientosPorMeta,
  calcularAcumulado,
  calcularProgresoPct,
  listMetas,
  listTodosLosMovimientos,
} from "../../domain/metas";
import { showConfirm, showTraspasoNegativoDialog } from "../components/dialogs";
import { loaderHtml } from "../components/loader";

function hace(fecha: string): string {
  const dias = Math.round((parseDateInput(todayISO()).getTime() - parseDateInput(fecha).getTime()) / 86400000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "hace 1 día";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
}

function mesAnteriorDate(): Date {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d;
}

function cardTitle(icon: string, texto: string): string {
  return `<div class="card__title"><span class="card__icon-badge">${icon}</span>${texto}</div>`;
}

export async function renderDashboard(container: HTMLElement, onNavigate: (sectionId: string) => void): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">${calendarMonthIcon} Cómo van mis finanzas</h1>
      <div style="display:flex;align-items:center;gap:10px">
        <button type="button" class="btn-secondary" id="reiniciar-periodo-btn" hidden>Reiniciar periodo</button>
        <span class="month-badge">${formatFullDateLabel()}</span>
      </div>
    </div>

    <div class="dashboard-grid" id="dashboard-grid">
      <div class="card stat-card card--span2" id="balance-card" data-card-id="balance" style="cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          ${cardTitle(financeIcon, "Balance")}
          <button type="button" class="icon-btn" id="balance-eye-btn" aria-label="Mostrar u ocultar" title="Mostrar u ocultar" style="color:white">${eyeIcon}</button>
        </div>
        <div class="stat-card__value" id="stat-balance">—</div>
        <div class="stat-card__label">Disponible este mes</div>
        <div class="empty-state" style="margin-top:4px;font-size:12px">Ver desglose →</div>
      </div>

      <div class="card" id="alertas-card" data-card-id="alertas">
        ${cardTitle(`<i class="bi bi-bell-fill"></i>`, "Alertas")}
        <div id="alertas-list">${loaderHtml()}</div>
      </div>

      <div class="card" id="gastos-fijos-card" data-card-id="resumenGastosFijos">
        <div class="table-toolbar">
          ${cardTitle(cashMinusIcon, "Gastos Fijos")}
          <div style="display:flex;align-items:center;gap:8px">
            <button type="button" class="icon-btn" id="gastos-fijos-eye-btn" aria-label="Mostrar u ocultar" title="Mostrar u ocultar">${eyeIcon}</button>
            <button type="button" class="btn-secondary" id="gastos-fijos-btn">Ver módulo</button>
          </div>
        </div>
        <div id="gastos-fijos-resumen"></div>
      </div>

      <div class="card" id="deudas-card" data-card-id="resumenDeudas">
        <div class="table-toolbar">
          ${cardTitle(pigMoneyIcon, "Deudas")}
          <button type="button" class="btn-secondary" id="deudas-btn">Ver módulo</button>
        </div>
        <div id="deudas-resumen"></div>
      </div>

      <div class="card" id="me-deben-card" data-card-id="resumenMeDeben">
        <div class="table-toolbar">
          ${cardTitle(businessplanIcon, "Me Deben")}
          <button type="button" class="btn-secondary" id="me-deben-btn">Ver módulo</button>
        </div>
        <div id="me-deben-resumen"></div>
      </div>

      <div class="card" id="metas-resumen-card" data-card-id="resumenAhorros" hidden>
        <div class="table-toolbar">
          ${cardTitle(moneybagPlusIcon, "Ahorros y Metas")}
          <button type="button" class="btn-secondary" id="metas-resumen-btn">Ver todas</button>
        </div>
        <div class="stat-card__value" id="metas-total" style="margin-bottom:12px">—</div>
        <div id="metas-resumen-list"></div>
      </div>

      <div class="card card--span2" id="categorias-card" data-card-id="gastosPorCategoria">
        ${cardTitle(chartPieIcon, "Gastos del mes por categoría")}
        <div id="categorias-resumen"></div>
      </div>

      <div class="card card--span2" id="comparativo-card" data-card-id="comparativoMesAnterior" hidden>
        ${cardTitle(trendingUpIcon, "Comparativo")}
        <p style="margin:0" id="comparativo-texto"></p>
      </div>

      <div class="card" id="movimientos-card" data-card-id="ultimosMovimientos">
        ${cardTitle(cashIcon, "Últimos movimientos")}
        <div id="movimientos-list"></div>
      </div>

      <div class="card" id="ingresos-cta-card" data-card-id="cta" hidden>
        <div class="card__title" style="font-size:14px;font-weight:400;color:var(--color-text-muted)">
          <span class="card__icon-badge">${homeDollarIcon}</span>
          Aún no registras ningún ingreso fijo mensual.
        </div>
        <button type="button" class="btn" id="ingresos-cta-btn">➕ Agregar ingreso fijo</button>
      </div>

      <div class="card" id="sheet-link-card" data-card-id="hojaDrive">
        ${cardTitle(fileSpreadsheetIcon, "Tu Hoja de Cálculo en Drive")}
        <p class="empty-state" id="sheet-status">Conectando con Google Sheets…</p>
      </div>
    </div>

    <dialog id="balance-modal" class="modal">
      <div class="modal__form">
        <h2 class="modal__title">Desglose del disponible — este periodo</h2>
        <div id="balance-detalle-list"></div>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" id="balance-modal-close">Cerrar</button>
        </div>
      </div>
    </dialog>
  `;

  const grid = container.querySelector<HTMLDivElement>("#dashboard-grid")!;
  const status = container.querySelector<HTMLParagraphElement>("#sheet-status")!;
  const sheetCard = container.querySelector<HTMLDivElement>("#sheet-link-card")!;
  const statBalance = container.querySelector<HTMLDivElement>("#stat-balance")!;
  const balanceCard = container.querySelector<HTMLDivElement>("#balance-card")!;
  const balanceEyeBtn = container.querySelector<HTMLButtonElement>("#balance-eye-btn")!;
  const balanceModal = container.querySelector<HTMLDialogElement>("#balance-modal")!;
  const balanceDetalleList = container.querySelector<HTMLDivElement>("#balance-detalle-list")!;
  const balanceModalClose = container.querySelector<HTMLButtonElement>("#balance-modal-close")!;
  balanceModalClose.addEventListener("click", () => balanceModal.close());
  const ctaCard = container.querySelector<HTMLDivElement>("#ingresos-cta-card")!;
  const ctaBtn = container.querySelector<HTMLButtonElement>("#ingresos-cta-btn")!;
  ctaBtn.addEventListener("click", () => onNavigate("ingresos"));

  const alertasList = container.querySelector<HTMLDivElement>("#alertas-list")!;

  const gastosFijosResumen = container.querySelector<HTMLDivElement>("#gastos-fijos-resumen")!;
  const gastosFijosEyeBtn = container.querySelector<HTMLButtonElement>("#gastos-fijos-eye-btn")!;
  container.querySelector<HTMLButtonElement>("#gastos-fijos-btn")!.addEventListener("click", () => onNavigate("gastos-fijos"));

  let showBalance = true;
  let showGastosFijos = true;

  const deudasResumen = container.querySelector<HTMLDivElement>("#deudas-resumen")!;
  container.querySelector<HTMLButtonElement>("#deudas-btn")!.addEventListener("click", () => onNavigate("deudas"));

  const meDebenResumen = container.querySelector<HTMLDivElement>("#me-deben-resumen")!;
  container.querySelector<HTMLButtonElement>("#me-deben-btn")!.addEventListener("click", () => onNavigate("me-deben"));

  const metasResumenCard = container.querySelector<HTMLDivElement>("#metas-resumen-card")!;
  const metasTotal = container.querySelector<HTMLDivElement>("#metas-total")!;
  const metasResumenList = container.querySelector<HTMLDivElement>("#metas-resumen-list")!;
  container.querySelector<HTMLButtonElement>("#metas-resumen-btn")!.addEventListener("click", () => onNavigate("ahorros"));

  const categoriasResumen = container.querySelector<HTMLDivElement>("#categorias-resumen")!;
  const comparativoCard = container.querySelector<HTMLDivElement>("#comparativo-card")!;
  const comparativoTexto = container.querySelector<HTMLParagraphElement>("#comparativo-texto")!;
  const movimientosList = container.querySelector<HTMLDivElement>("#movimientos-list")!;
  const reiniciarPeriodoBtn = container.querySelector<HTMLButtonElement>("#reiniciar-periodo-btn")!;

  try {
    const { spreadsheetId, created } = await ensureSpreadsheet();
    status.remove();
    const link = document.createElement("a");
    link.className = "btn";
    link.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `📊 Abrir en Google Sheets`;
    sheetCard.appendChild(link);

    if (created) {
      const note = document.createElement("p");
      note.className = "empty-state";
      note.style.marginTop = "12px";
      note.textContent = "Se creó tu hoja de cálculo 'MisFinanzas' con todas las secciones.";
      sheetCard.appendChild(note);
    }

    const configPeriodo = await obtenerConfigPeriodo(spreadsheetId);

    const [
      ingresos,
      todosLosGastosFijos,
      todosLosGastosYCompras,
      deudasYoDebo,
      deudasMeDeben,
      eventosDeudas,
      metas,
      movimientosMetas,
      dashboardConfig,
    ] = await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listTodosLosGastosFijos(spreadsheetId),
      listTodosLosGastos(spreadsheetId),
      listDeudas(spreadsheetId, "YoDebo"),
      listDeudas(spreadsheetId, "MeDeben"),
      listTodosLosEventos(spreadsheetId),
      listMetas(spreadsheetId),
      listTodosLosMovimientos(spreadsheetId),
      listDashboardConfig(spreadsheetId),
    ]);
    const { delPeriodo: gastosFijos } = calcularGastosFijosVigentes(todosLosGastosFijos, configPeriodo.fechaUltimoReinicio);
    const gastosFijosMesAnterior = filtrarGastosFijosDelMes(todosLosGastosFijos, mesAnteriorDate());
    const gastosYCompras = filtrarGastosDelMes(todosLosGastosYCompras);
    const gastosYComprasMesAnterior = filtrarGastosDelMes(todosLosGastosYCompras, mesAnteriorDate());
    const gastosVariablesDelPeriodo = filtrarGastosDelPeriodo(todosLosGastosYCompras, configPeriodo.fechaUltimoReinicio);
    const pendientes = filtrarPendientes(todosLosGastosYCompras);

    // No vuelve a pedirle nada a Sheets: reutiliza lo que ya se cargó arriba para las demás tarjetas.
    const disponibleDetalle = calcularDisponibleDesde(
      { ingresos, gastosFijosDelPeriodo: gastosFijos, gastosVariablesDelPeriodo, deudasYoDebo, deudasMeDeben, eventosDeudas, movimientosMetas },
      configPeriodo.fechaUltimoReinicio,
    );

    if (ingresos.length === 0) ctaCard.hidden = false;

    if (configPeriodo.frecuencia === "Manual") {
      reiniciarPeriodoBtn.hidden = false;
      reiniciarPeriodoBtn.addEventListener("click", async () => {
        const ok = await showConfirm(
          "Esto reaplica tus ingresos \"Fijo\" y archiva los \"Adicional\" del periodo que termina. ¿Reiniciar el periodo ahora?",
          { title: "Reiniciar periodo", confirmLabel: "Reiniciar" },
        );
        if (!ok) return;

        let traspasoDeficit: "adicional" | "deuda" = "adicional";
        if (disponibleDetalle.disponible < 0) {
          const eleccion = await showTraspasoNegativoDialog(Math.abs(disponibleDetalle.disponible));
          if (eleccion === null) return;
          traspasoDeficit = eleccion;
        }

        reiniciarPeriodoBtn.disabled = true;
        await ejecutarReinicioPeriodo(spreadsheetId, todayISO(), traspasoDeficit);
        await renderDashboard(container, onNavigate);
      });
    }

    const eventosPorDeuda = agruparEventosPorDeuda(eventosDeudas);

    // --- A. Balance del periodo ---
    const disponible = disponibleDetalle.disponible;
    statBalance.textContent = formatMoney(disponible);

    const detalleItems: { label: string; monto: number; signo: "+" | "-" }[] = [
      { label: "Ingresos", monto: disponibleDetalle.ingresos, signo: "+" },
      { label: "Gastos fijos pagados", monto: disponibleDetalle.gastosFijosPagados, signo: "-" },
      { label: "Gastos y compras", monto: disponibleDetalle.gastosVariables, signo: "-" },
      { label: "Abonado a deudas", monto: disponibleDetalle.abonosDeudas, signo: "-" },
      { label: "Cobrado (Me deben)", monto: disponibleDetalle.cobrosMeDeben, signo: "+" },
      { label: "Aportes a ahorros", monto: disponibleDetalle.aportesAhorros, signo: "-" },
      { label: "Retiros de ahorros", monto: disponibleDetalle.retirosAhorros, signo: "+" },
    ];
    balanceDetalleList.innerHTML =
      detalleItems
        .map(
          ({ label, monto, signo }) => `
            <div class="record-row">
              <div class="record-row__main"><span class="record-row__title">${label}</span></div>
              <div class="record-row__amount" style="color:${signo === "+" ? "var(--color-success)" : "var(--color-danger)"}">${signo}${formatMoney(monto)}</div>
            </div>
          `,
        )
        .join("") +
      `
        <div class="record-row" style="border-top:2px solid var(--color-border);margin-top:6px;padding-top:14px">
          <div class="record-row__main"><span class="record-row__title" style="font-weight:800">Disponible</span></div>
          <div class="record-row__amount" style="font-weight:800">${formatMoney(disponible)}</div>
        </div>
      `;
    balanceCard.addEventListener("click", () => balanceModal.showModal());
    balanceEyeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showBalance = !showBalance;
      balanceEyeBtn.innerHTML = showBalance ? eyeIcon : eyeOffIcon;
      statBalance.textContent = showBalance ? formatMoney(disponible) : "••••••";
    });

    // --- B. Alertas activas ---
    const hoy = new Date();
    const hoyDia = hoy.getDate();

    type NivelAlerta = "rojo" | "naranja" | "amarillo" | "verde";
    type TipoAlerta = "gastoFijo" | "deuda" | "compra" | "meDeben";
    type Alerta = { nivel: NivelAlerta; tipo: TipoAlerta; texto: string; destino: string };
    const alertas: Alerta[] = [];

    for (const g of gastosFijos) {
      const estadoG = estadoAlertaGastoFijo(g, hoy);
      if (estadoG === "vencida") {
        const dias = hoyDia - Number(g.diaPago);
        alertas.push({
          nivel: "rojo",
          tipo: "gastoFijo",
          texto: `${g.nombre} (${formatMoney(g.monto)}) vencido hace ${dias} día${dias === 1 ? "" : "s"}`,
          destino: "gastos-fijos",
        });
      } else if (estadoG === "proxima") {
        alertas.push({
          nivel: "naranja",
          tipo: "gastoFijo",
          texto: `${g.nombre} (${formatMoney(g.monto)}) vence el día ${g.diaPago}`,
          destino: "gastos-fijos",
        });
      }
    }

    for (const d of deudasYoDebo) {
      const estadoD = estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy);
      if (estadoD === "vencida") {
        alertas.push({ nivel: "rojo", tipo: "deuda", texto: `Cuota vencida con ${d.contraparte} (${formatMoney(d.montoCuota)})`, destino: "deudas" });
      } else if (estadoD === "proxima") {
        alertas.push({ nivel: "naranja", tipo: "deuda", texto: `Cuota próxima a vencer con ${d.contraparte} (${formatMoney(d.montoCuota)})`, destino: "deudas" });
      }
    }

    if (pendientes.length > 0) {
      alertas.push({
        nivel: "amarillo",
        tipo: "compra",
        texto: `${formatMoney(sumGastosYCompras(pendientes))} en ${pendientes.length} compra${pendientes.length === 1 ? "" : "s"} pendiente${pendientes.length === 1 ? "" : "s"} por pagar`,
        destino: "gastos-personales",
      });
    }

    for (const d of deudasMeDeben) {
      const estadoD = estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy);
      if (estadoD === "vencida") {
        alertas.push({ nivel: "verde", tipo: "meDeben", texto: `${d.contraparte} tiene un pago comprometido vencido (${formatMoney(d.montoCuota)})`, destino: "me-deben" });
      }
    }

    const iconoTipo: Record<TipoAlerta, string> = {
      gastoFijo: "bi-cash-coin",
      deuda: "bi-credit-card",
      compra: "bi-cart",
      meDeben: "bi-people",
    };
    if (alertas.length === 0) {
      alertasList.innerHTML = `<p class="empty-state"><i class="bi bi-check-circle alert-icon alert-icon--verde"></i> Todo al día</p>`;
    } else {
      const orden: NivelAlerta[] = ["rojo", "naranja", "amarillo", "verde"];
      alertas.sort((a, b) => orden.indexOf(a.nivel) - orden.indexOf(b.nivel));
      alertasList.innerHTML = "";
      for (const alerta of alertas) {
        const row = document.createElement("div");
        row.className = "record-row";
        row.innerHTML = `<div class="record-row__main"><span class="record-row__title"><i class="bi ${iconoTipo[alerta.tipo]} alert-icon alert-icon--${alerta.nivel}"></i> ${alerta.texto}</span></div>`;
        row.addEventListener("click", () => onNavigate(alerta.destino));
        row.style.cursor = "pointer";
        alertasList.appendChild(row);
      }
    }

    // --- C. Resumen de Gastos Fijos del mes ---
    const pagadosCount = gastosFijos.filter((g) => g.estado === "Pagado").length;
    const gastosFijosPagado = sumGastosFijosPagado(gastosFijos);
    const gastosFijosPendiente = sumGastosFijosPendientes(gastosFijos);
    const progresoFijos = gastosFijos.length > 0 ? (pagadosCount / gastosFijos.length) * 100 : 0;
    const proximosFijos = [...gastosFijos]
      .filter((g) => g.estado !== "Pagado" && Number(g.diaPago) > 0)
      .sort((a, b) => Number(a.diaPago) - Number(b.diaPago))
      .slice(0, 3);

    gastosFijosResumen.innerHTML =
      gastosFijos.length === 0
        ? `<p class="empty-state">Aún no registras gastos fijos este mes.</p>`
        : `
        <div class="deuda-card__stats" style="margin-bottom:12px">
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Total</span><span class="deuda-card__stat-value" id="gf-dash-total">${formatMoney(sumGastosFijosTotal(gastosFijos))}</span></div>
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Pagado</span><span class="deuda-card__stat-value" id="gf-dash-pagado">${formatMoney(gastosFijosPagado)}</span></div>
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Falta</span><span class="deuda-card__stat-value" id="gf-dash-falta">${formatMoney(gastosFijosPendiente)}</span></div>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${progresoFijos}%"></div></div>
        <p class="empty-state" style="margin:0 0 12px">${pagadosCount} de ${gastosFijos.length} pagados</p>
        ${proximosFijos
          .map((g) => `<div class="record-row"><div class="record-row__main"><span class="record-row__title">${g.nombre}</span><span class="record-row__subtitle">Vence el día ${g.diaPago}</span></div><div class="record-row__amount">${formatMoney(g.monto)}</div></div>`)
          .join("")}
      `;
    gastosFijosEyeBtn.hidden = gastosFijos.length === 0;
    if (gastosFijos.length > 0) {
      const gfTotalEl = gastosFijosResumen.querySelector<HTMLSpanElement>("#gf-dash-total")!;
      const gfPagadoEl = gastosFijosResumen.querySelector<HTMLSpanElement>("#gf-dash-pagado")!;
      const gfFaltaEl = gastosFijosResumen.querySelector<HTMLSpanElement>("#gf-dash-falta")!;
      const gfTotalReal = formatMoney(sumGastosFijosTotal(gastosFijos));
      const gfPagadoReal = formatMoney(gastosFijosPagado);
      const gfFaltaReal = formatMoney(gastosFijosPendiente);
      gastosFijosEyeBtn.onclick = () => {
        showGastosFijos = !showGastosFijos;
        gastosFijosEyeBtn.innerHTML = showGastosFijos ? eyeIcon : eyeOffIcon;
        gfTotalEl.textContent = showGastosFijos ? gfTotalReal : "••••••";
        gfPagadoEl.textContent = showGastosFijos ? gfPagadoReal : "••••••";
        gfFaltaEl.textContent = showGastosFijos ? gfFaltaReal : "••••••";
      };
    }

    // --- D. Resumen de Deudas ---
    const deudasActivas = deudasYoDebo.filter((d) => d.estado === "Activa");
    const totalDeudas = deudasActivas.reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).saldoPendiente, 0);
    const conProximoPago = deudasActivas
      .filter((d) => Number(d.diaPago) > 0 && estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy) !== null)
      .sort((a, b) => Math.abs(Number(a.diaPago) - hoyDia) - Math.abs(Number(b.diaPago) - hoyDia));
    const proximoPago = conProximoPago[0];
    const destacadasDeudas = [...deudasActivas]
      .sort(
        (a, b) =>
          calcularEstadoDeuda(b, eventosPorDeuda.get(b.id) ?? []).saldoPendiente -
          calcularEstadoDeuda(a, eventosPorDeuda.get(a.id) ?? []).saldoPendiente,
      )
      .slice(0, 3);

    deudasResumen.innerHTML =
      deudasActivas.length === 0
        ? `<p class="empty-state">No tienes deudas activas.</p>`
        : `
        <div class="stat-card__value" style="margin-bottom:4px">${formatMoney(totalDeudas)}</div>
        <p class="empty-state" style="margin:0 0 14px">Total pendiente</p>
        ${proximoPago ? `<p style="margin:0 0 14px">Próxima cuota: <strong>${formatMoney(proximoPago.montoCuota)}</strong> a ${proximoPago.contraparte} el día ${proximoPago.diaPago}</p>` : ""}
        ${destacadasDeudas
          .map((d) => {
            const estado = calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []);
            return `
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span>${d.contraparte}</span>
                  <span class="empty-state">${formatMoney(estado.saldoPendiente)}</span>
                </div>
                <div class="progress-bar"><div class="progress-bar__fill" style="width:${estado.progresoPct}%"></div></div>
              </div>
            `;
          })
          .join("")}
      `;

    // --- E. Resumen de Me Deben ---
    const meDebenActivas = deudasMeDeben.filter((d) => d.estado === "Activa");
    const totalMeDeben = meDebenActivas.reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).saldoPendiente, 0);
    const vencidasMeDeben = meDebenActivas.filter((d) => estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy) === "vencida");

    meDebenResumen.innerHTML =
      meDebenActivas.length === 0
        ? `<p class="empty-state">Nadie te debe dinero por ahora.</p>`
        : `
        <div class="stat-card__value" style="margin-bottom:4px">${formatMoney(totalMeDeben)}</div>
        <p class="empty-state" style="margin:0 0 10px">Total que te deben</p>
        ${vencidasMeDeben.length > 0 ? `<p style="margin:0;color:var(--color-danger)">⚠️ ${vencidasMeDeben.map((d) => d.contraparte).join(", ")} con compromiso de pago vencido.</p>` : ""}
      `;

    // --- F. Ahorros y Metas ---
    const movimientosPorMeta = agruparMovimientosPorMeta(movimientosMetas);
    const totalAhorrado = metas.reduce((s, m) => s + calcularAcumulado(movimientosPorMeta.get(m.id) ?? []), 0);
    metasTotal.textContent = formatMoney(totalAhorrado);

    const metasVivas = metas.filter((m) => m.estado === "Activa");
    if (metasVivas.length > 0) {
      metasResumenCard.hidden = false;
      const destacadas = [...metasVivas]
        .sort(
          (a, b) =>
            calcularProgresoPct(b, movimientosPorMeta.get(b.id) ?? []) -
            calcularProgresoPct(a, movimientosPorMeta.get(a.id) ?? []),
        )
        .slice(0, 3);
      metasResumenList.innerHTML = destacadas
        .map((m) => {
          const progreso = calcularProgresoPct(m, movimientosPorMeta.get(m.id) ?? []);
          return `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span>${m.nombre}</span>
                <span class="empty-state">${progreso.toFixed(0)}%</span>
              </div>
              <div class="progress-bar"><div class="progress-bar__fill" style="width:${progreso}%"></div></div>
            </div>
          `;
        })
        .join("");
    }

    // --- G. Gráfico de gastos del mes por categoría ---
    const porCategoria = new Map<string, number>();
    for (const g of gastosFijos) porCategoria.set(g.categoria || "Sin categoría", (porCategoria.get(g.categoria || "Sin categoría") ?? 0) + g.monto);
    for (const g of gastosYCompras) porCategoria.set(g.categoria || "Sin categoría", (porCategoria.get(g.categoria || "Sin categoría") ?? 0) + g.monto);
    const categoriasOrdenadas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
    const maxCategoria = categoriasOrdenadas[0]?.[1] ?? 0;

    categoriasResumen.innerHTML =
      categoriasOrdenadas.length === 0
        ? `<p class="empty-state">Aún no registras gastos este mes.</p>`
        : categoriasOrdenadas
            .map(
              ([categoria, monto]) => `
                <div style="margin-bottom:10px">
                  <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                    <span>${categoria}</span>
                    <span class="empty-state">${formatMoney(monto)}</span>
                  </div>
                  <div class="progress-bar"><div class="progress-bar__fill" style="width:${maxCategoria > 0 ? (monto / maxCategoria) * 100 : 0}%"></div></div>
                </div>
              `,
            )
            .join("");

    // --- H. Comparativo con el mes anterior ---
    const gastadoHastaHoy = (fijos: GastoFijo[], variables: GastoYCompra[], diaCorte: number): number => {
      const fijosPagados = fijos.filter((g) => g.estado === "Pagado" && Number(g.diaPago) <= diaCorte);
      const variablesEnRango = variables.filter((g) => parseDateInput(g.fecha).getDate() <= diaCorte);
      return sumGastosFijosPagado(fijosPagados) + sumGastosYCompras(variablesEnRango);
    };
    const gastadoEsteMes = gastadoHastaHoy(gastosFijos, gastosYCompras, hoyDia);
    const gastadoMesAnterior = gastadoHastaHoy(gastosFijosMesAnterior, gastosYComprasMesAnterior, hoyDia);
    if (gastadoMesAnterior > 0) {
      const cambio = ((gastadoEsteMes - gastadoMesAnterior) / gastadoMesAnterior) * 100;
      comparativoCard.hidden = false;
      const verbo = cambio >= 0 ? "más" : "menos";
      comparativoTexto.textContent = `Llevas gastado ${Math.abs(cambio).toFixed(0)}% ${verbo} que en el mismo periodo del mes pasado (hasta el día ${hoyDia}).`;
    }

    // --- I. Últimos movimientos ---
    interface Movimiento { fecha: string; texto: string; monto: number }
    const movimientos: Movimiento[] = [];
    for (const g of [...gastosYCompras, ...gastosYComprasMesAnterior]) {
      if (g.estado === "Pagado") movimientos.push({ fecha: g.fecha, texto: g.nombre, monto: -g.monto });
    }
    for (const e of eventosDeudas) {
      if (e.tipo !== "Abono") continue;
      const esMia = deudasYoDebo.some((d) => d.id === e.idDeuda);
      movimientos.push({ fecha: e.fecha, texto: esMia ? "Abono a deuda" : "Pago recibido", monto: esMia ? -e.monto : e.monto });
    }
    for (const m of movimientosMetas) {
      movimientos.push({ fecha: m.fecha, texto: m.tipo === "Retiro" ? "Retiro de ahorro" : "Aporte a meta", monto: m.tipo === "Retiro" ? m.monto : -m.monto });
    }
    for (const i of ingresos) {
      if (i.recurrencia === "UnicoMes" && i.mes === monthKey()) movimientos.push({ fecha: `${i.mes}-01`, texto: i.tipo, monto: i.monto });
    }
    movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));
    const recientes = movimientos.slice(0, 6);

    movimientosList.innerHTML =
      recientes.length === 0
        ? `<p class="empty-state">Aún no tienes movimientos recientes.</p>`
        : recientes
            .map(
              (m) => `
                <div class="record-row">
                  <div class="record-row__main">
                    <span class="record-row__title"><span class="nav-icon">${cashIcon}</span> ${m.texto}</span>
                    <span class="record-row__subtitle">${hace(m.fecha)}</span>
                  </div>
                  <div class="record-row__amount" style="color:${m.monto < 0 ? "var(--color-danger)" : "var(--color-success)"}">${m.monto < 0 ? "-" : "+"}${formatMoney(Math.abs(m.monto))}</div>
                </div>
              `,
            )
            .join("");

    // --- J. Personalización (Configuración → "Personalizar dashboard"): visibilidad, color y orden ---
    for (const cfg of dashboardConfig) {
      const card = grid.querySelector<HTMLElement>(`[data-card-id="${cfg.cardId}"]`);
      if (!card) continue;
      if (!cfg.visible) card.hidden = true;
      card.classList.toggle("card--primary", cfg.color === "Primario");
      grid.appendChild(card);
    }
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "No se pudo conectar con Google Sheets.";
  }
}
