import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";
import { agruparEventosPorDeuda, calcularEstadoDeuda, estadoAlerta, listDeudas, listTodosLosEventos } from "../../domain/deudas";
import { formatMonthLabel, formatMoney, monthKey, parseDateInput, todayISO } from "../../domain/format";
import {
  estadoAlertaGastoFijo,
  listGastosFijosDelMes,
  sumGastosFijosPagado,
  sumGastosFijosPendientes,
  sumGastosFijosTotal,
  type GastoFijo,
} from "../../domain/gastos";
import {
  listGastosDelMes,
  listPendientes,
  sumGastos as sumGastosYCompras,
  type GastoYCompra,
} from "../../domain/gastos-y-compras";
import { listIngresosVigentes, sumIngresosActivos } from "../../domain/ingresos";
import {
  agruparMovimientosPorMeta,
  calcularAcumulado,
  calcularProgresoPct,
  listMetas,
  listTodosLosMovimientos,
  type FrecuenciaAporte,
} from "../../domain/metas";

const APORTES_POR_MES: Record<FrecuenciaAporte, number> = { Mensual: 1, Quincenal: 2, Semanal: 4.33 };

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

export async function renderDashboard(container: HTMLElement, onNavigate: (sectionId: string) => void): Promise<void> {
  container.innerHTML = `
    <div class="page-title-row">
      <h1 class="page-title">🏆 Resumen del Mes</h1>
      <span class="month-badge">${formatMonthLabel()}</span>
    </div>

    <div class="card stat-card stat-card--primary" id="balance-card" style="margin-bottom:8px">
      <div class="stat-card__value" id="stat-balance">—</div>
      <div class="stat-card__label">Disponible este mes</div>
    </div>
    <p class="empty-state" id="balance-nota" style="margin-top:0;margin-bottom:20px"></p>

    <div class="card" id="alertas-card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Alertas</h2>
      <div id="alertas-list"><p class="empty-state">Cargando…</p></div>
    </div>

    <div class="card" id="gastos-fijos-card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">📅 Gastos Fijos</h2>
        <button type="button" class="btn-secondary" id="gastos-fijos-btn">Ver módulo</button>
      </div>
      <div id="gastos-fijos-resumen"></div>
    </div>

    <div class="card" id="deudas-card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">🐷 Deudas</h2>
        <button type="button" class="btn-secondary" id="deudas-btn">Ver módulo</button>
      </div>
      <div id="deudas-resumen"></div>
    </div>

    <div class="card" id="me-deben-card" style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">💼 Me Deben</h2>
        <button type="button" class="btn-secondary" id="me-deben-btn">Ver módulo</button>
      </div>
      <div id="me-deben-resumen"></div>
    </div>

    <div class="card" id="metas-resumen-card" hidden style="margin-bottom:20px">
      <div class="table-toolbar">
        <h2 style="margin:0">🐷 Ahorros y Metas</h2>
        <button type="button" class="btn-secondary" id="metas-resumen-btn">Ver todas</button>
      </div>
      <div class="stat-card__value" id="metas-total" style="margin-bottom:12px">—</div>
      <div id="metas-resumen-list"></div>
    </div>

    <div class="card" id="categorias-card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Gastos del mes por categoría</h2>
      <div id="categorias-resumen"></div>
    </div>

    <div class="card" id="comparativo-card" hidden style="margin-bottom:20px">
      <p style="margin:0" id="comparativo-texto"></p>
    </div>

    <div class="card" id="movimientos-card" style="margin-bottom:20px">
      <h2 style="margin-top:0">Últimos movimientos</h2>
      <div id="movimientos-list"></div>
    </div>

    <div class="card" id="ingresos-cta-card" hidden style="margin-bottom:20px">
      <p class="empty-state" style="margin:0 0 12px">Aún no registras ningún ingreso fijo mensual.</p>
      <button type="button" class="btn" id="ingresos-cta-btn">➕ Agregar ingreso fijo</button>
    </div>

    <div class="card" id="sheet-link-card">
      <h2 style="margin-top:0">🔗 Tu Hoja de Cálculo en Drive</h2>
      <p class="empty-state" id="sheet-status">Conectando con Google Sheets…</p>
    </div>
  `;

  const status = container.querySelector<HTMLParagraphElement>("#sheet-status")!;
  const sheetCard = container.querySelector<HTMLDivElement>("#sheet-link-card")!;
  const statBalance = container.querySelector<HTMLDivElement>("#stat-balance")!;
  const balanceNota = container.querySelector<HTMLParagraphElement>("#balance-nota")!;
  const ctaCard = container.querySelector<HTMLDivElement>("#ingresos-cta-card")!;
  const ctaBtn = container.querySelector<HTMLButtonElement>("#ingresos-cta-btn")!;
  ctaBtn.addEventListener("click", () => onNavigate("ingresos"));

  const alertasList = container.querySelector<HTMLDivElement>("#alertas-list")!;

  const gastosFijosResumen = container.querySelector<HTMLDivElement>("#gastos-fijos-resumen")!;
  container.querySelector<HTMLButtonElement>("#gastos-fijos-btn")!.addEventListener("click", () => onNavigate("gastos-fijos"));

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

    const [
      ingresos,
      gastosFijos,
      gastosFijosMesAnterior,
      gastosYCompras,
      gastosYComprasMesAnterior,
      pendientes,
      deudasYoDebo,
      deudasMeDeben,
      eventosDeudas,
      metas,
      movimientosMetas,
    ] = await Promise.all([
      listIngresosVigentes(spreadsheetId),
      listGastosFijosDelMes(spreadsheetId),
      listGastosFijosDelMes(spreadsheetId, mesAnteriorDate()),
      listGastosDelMes(spreadsheetId),
      listGastosDelMes(spreadsheetId, mesAnteriorDate()),
      listPendientes(spreadsheetId),
      listDeudas(spreadsheetId, "YoDebo"),
      listDeudas(spreadsheetId, "MeDeben"),
      listTodosLosEventos(spreadsheetId),
      listMetas(spreadsheetId),
      listTodosLosMovimientos(spreadsheetId),
    ]);

    if (ingresos.length === 0) ctaCard.hidden = false;

    // --- A. Balance del mes ---
    const totalIngresos = sumIngresosActivos(ingresos);
    const totalGastosFijos = sumGastosFijosTotal(gastosFijos);
    const totalGastosVariables = sumGastosYCompras(gastosYCompras);
    const disponible = totalIngresos - totalGastosFijos - totalGastosVariables;
    statBalance.textContent = formatMoney(disponible);

    const metasActivas = metas.filter((m) => m.estado === "Activa" && m.aporteAutoActivo && m.aporteAutoMonto > 0);
    const comprometidoMetas = metasActivas.reduce(
      (s, m) => s + m.aporteAutoMonto * APORTES_POR_MES[m.aporteAutoFrecuencia],
      0,
    );
    balanceNota.textContent =
      comprometidoMetas > 0
        ? `De eso, ${formatMoney(comprometidoMetas)} ya están comprometidos este mes en aportes automáticos a tus metas de ahorro.`
        : "";

    // --- B. Alertas activas ---
    const eventosPorDeuda = agruparEventosPorDeuda(eventosDeudas);
    const hoy = new Date();
    const hoyDia = hoy.getDate();

    type Alerta = { nivel: "rojo" | "naranja" | "amarillo" | "verde"; texto: string; destino: string };
    const alertas: Alerta[] = [];

    for (const g of gastosFijos) {
      const estadoG = estadoAlertaGastoFijo(g, hoy);
      if (estadoG === "vencida") {
        const dias = hoyDia - Number(g.diaPago);
        alertas.push({
          nivel: "rojo",
          texto: `${g.nombre} (${formatMoney(g.monto)}) vencido hace ${dias} día${dias === 1 ? "" : "s"}`,
          destino: "gastos-fijos",
        });
      } else if (estadoG === "proxima") {
        alertas.push({
          nivel: "naranja",
          texto: `${g.nombre} (${formatMoney(g.monto)}) vence el día ${g.diaPago}`,
          destino: "gastos-fijos",
        });
      }
    }

    for (const d of deudasYoDebo) {
      const estadoD = estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy);
      if (estadoD === "vencida") {
        alertas.push({ nivel: "rojo", texto: `Pago mínimo vencido con ${d.contraparte} (${formatMoney(d.pagoMinimo)})`, destino: "deudas" });
      } else if (estadoD === "proxima") {
        alertas.push({ nivel: "naranja", texto: `Pago mínimo próximo a vencer con ${d.contraparte} (${formatMoney(d.pagoMinimo)})`, destino: "deudas" });
      }
    }

    if (pendientes.length > 0) {
      alertas.push({
        nivel: "amarillo",
        texto: `${formatMoney(sumGastosYCompras(pendientes))} en ${pendientes.length} compra${pendientes.length === 1 ? "" : "s"} pendiente${pendientes.length === 1 ? "" : "s"} por pagar`,
        destino: "gastos-personales",
      });
    }

    for (const d of deudasMeDeben) {
      const estadoD = estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy);
      if (estadoD === "vencida") {
        alertas.push({ nivel: "verde", texto: `${d.contraparte} tiene un pago comprometido vencido (${formatMoney(d.pagoMinimo)})`, destino: "me-deben" });
      }
    }

    const iconoNivel: Record<Alerta["nivel"], string> = { rojo: "🔴", naranja: "🟠", amarillo: "🟡", verde: "🟢" };
    if (alertas.length === 0) {
      alertasList.innerHTML = `<p class="empty-state">Todo al día ✅</p>`;
    } else {
      const orden: Alerta["nivel"][] = ["rojo", "naranja", "amarillo", "verde"];
      alertas.sort((a, b) => orden.indexOf(a.nivel) - orden.indexOf(b.nivel));
      alertasList.innerHTML = "";
      for (const alerta of alertas) {
        const row = document.createElement("div");
        row.className = "record-row";
        row.innerHTML = `<div class="record-row__main"><span class="record-row__title">${iconoNivel[alerta.nivel]} ${alerta.texto}</span></div>`;
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
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Total</span><span class="deuda-card__stat-value">${formatMoney(sumGastosFijosTotal(gastosFijos))}</span></div>
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Pagado</span><span class="deuda-card__stat-value">${formatMoney(gastosFijosPagado)}</span></div>
          <div class="deuda-card__stat"><span class="deuda-card__stat-label">Falta</span><span class="deuda-card__stat-value">${formatMoney(gastosFijosPendiente)}</span></div>
        </div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${progresoFijos}%"></div></div>
        <p class="empty-state" style="margin:0 0 12px">${pagadosCount} de ${gastosFijos.length} pagados</p>
        ${proximosFijos
          .map((g) => `<div class="record-row"><div class="record-row__main"><span class="record-row__title">${g.nombre}</span><span class="record-row__subtitle">Vence el día ${g.diaPago}</span></div><div class="record-row__amount">${formatMoney(g.monto)}</div></div>`)
          .join("")}
      `;

    // --- D. Resumen de Deudas ---
    const deudasActivas = deudasYoDebo.filter((d) => d.estado === "Activa");
    const totalDeudas = deudasActivas.reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).totalHoy, 0);
    const conProximoPago = deudasActivas
      .filter((d) => Number(d.diaPago) > 0 && estadoAlerta(d, eventosPorDeuda.get(d.id) ?? [], hoy) !== null)
      .sort((a, b) => Math.abs(Number(a.diaPago) - hoyDia) - Math.abs(Number(b.diaPago) - hoyDia));
    const proximoPago = conProximoPago[0];
    const destacadasDeudas = [...deudasActivas]
      .sort((a, b) => calcularEstadoDeuda(b, eventosPorDeuda.get(b.id) ?? []).totalHoy - calcularEstadoDeuda(a, eventosPorDeuda.get(a.id) ?? []).totalHoy)
      .slice(0, 3);

    deudasResumen.innerHTML =
      deudasActivas.length === 0
        ? `<p class="empty-state">No tienes deudas activas.</p>`
        : `
        <div class="stat-card__value" style="margin-bottom:4px">${formatMoney(totalDeudas)}</div>
        <p class="empty-state" style="margin:0 0 14px">Total pendiente (capital + interés)</p>
        ${proximoPago ? `<p style="margin:0 0 14px">Próximo pago mínimo: <strong>${formatMoney(proximoPago.pagoMinimo)}</strong> a ${proximoPago.contraparte} el día ${proximoPago.diaPago}</p>` : ""}
        ${destacadasDeudas
          .map((d) => {
            const estado = calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []);
            return `
              <div style="margin-bottom:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                  <span>${d.contraparte}</span>
                  <span class="empty-state">${formatMoney(estado.totalHoy)}</span>
                </div>
                <div class="progress-bar"><div class="progress-bar__fill" style="width:${estado.progresoPct}%"></div></div>
              </div>
            `;
          })
          .join("")}
      `;

    // --- E. Resumen de Me Deben ---
    const meDebenActivas = deudasMeDeben.filter((d) => d.estado === "Activa");
    const totalMeDeben = meDebenActivas.reduce((s, d) => s + calcularEstadoDeuda(d, eventosPorDeuda.get(d.id) ?? []).totalHoy, 0);
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
      const emergencia = metasVivas.filter((m) => m.esFondoEmergencia);
      const resto = [...metasVivas.filter((m) => !m.esFondoEmergencia)].sort(
        (a, b) =>
          calcularProgresoPct(b, movimientosPorMeta.get(b.id) ?? []) -
          calcularProgresoPct(a, movimientosPorMeta.get(a.id) ?? []),
      );
      const destacadas = [...emergencia, ...resto].slice(0, 3);
      metasResumenList.innerHTML = destacadas
        .map((m) => {
          const progreso = calcularProgresoPct(m, movimientosPorMeta.get(m.id) ?? []);
          return `
            <div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span>${m.icono} ${m.nombre}</span>
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
    interface Movimiento { fecha: string; icono: string; texto: string; monto: number }
    const movimientos: Movimiento[] = [];
    for (const g of [...gastosYCompras, ...gastosYComprasMesAnterior]) {
      if (g.estado === "Pagado") movimientos.push({ fecha: g.fecha, icono: "🛍️", texto: g.nombre, monto: -g.monto });
    }
    for (const e of eventosDeudas) {
      if (e.tipo !== "Abono") continue;
      const esMia = deudasYoDebo.some((d) => d.id === e.idDeuda);
      movimientos.push({ fecha: e.fecha, icono: esMia ? "💳" : "💼", texto: esMia ? "Abono a deuda" : "Pago recibido", monto: esMia ? -e.monto : e.monto });
    }
    for (const m of movimientosMetas) {
      movimientos.push({ fecha: m.fecha, icono: "🐷", texto: m.tipo === "Retiro" ? "Retiro de ahorro" : "Aporte a meta", monto: m.tipo === "Retiro" ? m.monto : -m.monto });
    }
    for (const i of ingresos) {
      if (i.recurrencia === "UnicoMes" && i.mes === monthKey()) movimientos.push({ fecha: `${i.mes}-01`, icono: "💰", texto: i.tipo, monto: i.monto });
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
                    <span class="record-row__title">${m.icono} ${m.texto}</span>
                    <span class="record-row__subtitle">${hace(m.fecha)}</span>
                  </div>
                  <div class="record-row__amount" style="color:${m.monto < 0 ? "var(--color-danger)" : "var(--color-success)"}">${m.monto < 0 ? "-" : "+"}${formatMoney(Math.abs(m.monto))}</div>
                </div>
              `,
            )
            .join("");
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "No se pudo conectar con Google Sheets.";
  }
}
