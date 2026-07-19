import { ensureSpreadsheet } from "../../api/spreadsheet-bootstrap";

export async function renderDashboard(container: HTMLElement): Promise<void> {
  container.innerHTML = `
    <h1 class="page-title">🏆 Resumen del Mes</h1>
    <div class="card-grid" id="stats-grid">
      <div class="card stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Ingresos</div></div>
      <div class="card stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Gastos</div></div>
      <div class="card stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Me queda libre</div></div>
      <div class="card stat-card"><div class="stat-card__value">—</div><div class="stat-card__label">Ahorrado</div></div>
    </div>
    <div class="card" id="sheet-link-card">
      <h2 style="margin-top:0">🔗 Tu Hoja de Cálculo en Drive</h2>
      <p class="empty-state" id="sheet-status">Conectando con Google Sheets…</p>
    </div>
  `;

  const status = container.querySelector<HTMLParagraphElement>("#sheet-status")!;
  const card = container.querySelector<HTMLDivElement>("#sheet-link-card")!;

  try {
    const { spreadsheetId, created } = await ensureSpreadsheet();
    status.remove();
    const link = document.createElement("a");
    link.className = "btn";
    link.href = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    link.target = "_blank";
    link.rel = "noopener";
    link.innerHTML = `📊 Abrir en Google Sheets`;
    card.appendChild(link);

    if (created) {
      const note = document.createElement("p");
      note.className = "empty-state";
      note.style.marginTop = "12px";
      note.textContent = "Se creó tu hoja de cálculo 'MisFinanzas' con todas las secciones.";
      card.appendChild(note);
    }
  } catch (err) {
    status.textContent = err instanceof Error ? err.message : "No se pudo conectar con Google Sheets.";
  }
}
