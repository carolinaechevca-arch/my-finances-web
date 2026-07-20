const NS = "http://www.w3.org/2000/svg";

const CHART_WIDTH = 640;
const CHART_HEIGHT = 240;
const PADDING_LEFT = 8;
const PADDING_RIGHT = 8;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 26;

function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

function scaleY(value: number, min: number, max: number, top: number, bottom: number): number {
  if (max === min) return bottom;
  return bottom - ((value - min) / (max - min)) * (bottom - top);
}

function emptyState(container: HTMLElement): void {
  container.innerHTML = `<p class="empty-state">No hay datos suficientes todavía.</p>`;
}

export interface BarSeries {
  nombre: string;
  color: string;
  valores: number[];
}

/** Barras agrupadas (una o varias series) por etiqueta, con línea de cero cuando hay valores negativos. */
export function renderBarChart(container: HTMLElement, labels: string[], series: BarSeries[]): void {
  container.innerHTML = "";
  if (labels.length === 0 || series.length === 0 || series.every((s) => s.valores.length === 0)) {
    emptyState(container);
    return;
  }

  const todos = series.flatMap((s) => s.valores);
  const max = Math.max(0, ...todos);
  const min = Math.min(0, ...todos);
  const top = PADDING_TOP;
  const bottom = CHART_HEIGHT - PADDING_BOTTOM;
  const left = PADDING_LEFT;
  const right = CHART_WIDTH - PADDING_RIGHT;
  const plotWidth = right - left;
  const groupWidth = plotWidth / labels.length;
  const gap = 3;
  const barWidth = Math.max(2, (groupWidth - gap * (series.length + 1)) / series.length);

  const svg = svgEl("svg", { viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`, class: "chart-svg" });
  const y0 = scaleY(0, min, max, top, bottom);
  svg.appendChild(svgEl("line", { x1: left, x2: right, y1: y0, y2: y0, class: "chart-axis" }));

  labels.forEach((label, i) => {
    const groupX = left + i * groupWidth;
    series.forEach((serie, j) => {
      const value = serie.valores[i] ?? 0;
      const y = scaleY(value, min, max, top, bottom);
      const barX = groupX + gap + j * (barWidth + gap);
      const barY = Math.min(y, y0);
      const barH = Math.max(0.5, Math.abs(y0 - y));
      const rect = svgEl("rect", { x: barX, y: barY, width: barWidth, height: barH, fill: serie.color, rx: 2 });
      const title = svgEl("title", {});
      title.textContent = `${serie.nombre} · ${label}: $${Math.round(value).toLocaleString("es-CO")}`;
      rect.appendChild(title);
      svg.appendChild(rect);
    });
    const text = svgEl("text", {
      x: groupX + groupWidth / 2,
      y: CHART_HEIGHT - 8,
      class: "chart-label",
      "text-anchor": "middle",
    });
    text.textContent = label;
    svg.appendChild(text);
  });

  container.appendChild(svg);

  if (series.length > 1) {
    const legend = document.createElement("div");
    legend.className = "chart-legend";
    legend.innerHTML = series
      .map(
        (s) =>
          `<span class="chart-legend__item"><span class="chart-legend__swatch" style="background:${s.color}"></span>${s.nombre}</span>`,
      )
      .join("");
    container.appendChild(legend);
  }
}

/** Línea simple con puntos, para una serie continua (ej. evolución de patrimonio neto). */
export function renderLineChart(container: HTMLElement, labels: string[], valores: number[], color: string): void {
  container.innerHTML = "";
  if (labels.length === 0) {
    emptyState(container);
    return;
  }

  const max = Math.max(0, ...valores);
  const min = Math.min(0, ...valores);
  const top = PADDING_TOP;
  const bottom = CHART_HEIGHT - PADDING_BOTTOM;
  const left = PADDING_LEFT;
  const right = CHART_WIDTH - PADDING_RIGHT;
  const plotWidth = right - left;
  const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0;

  const svg = svgEl("svg", { viewBox: `0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`, class: "chart-svg" });
  const y0 = scaleY(0, min, max, top, bottom);
  svg.appendChild(svgEl("line", { x1: left, x2: right, y1: y0, y2: y0, class: "chart-axis" }));

  const puntos = valores.map((v, i) => ({ x: left + i * step, y: scaleY(v, min, max, top, bottom), v }));
  const path = puntos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  svg.appendChild(svgEl("path", { d: path, class: "chart-line", stroke: color, fill: "none" }));

  const cadaCuantos = Math.max(1, Math.ceil(labels.length / 12));
  puntos.forEach((p, i) => {
    const circle = svgEl("circle", { cx: p.x, cy: p.y, r: 3, fill: color });
    const title = svgEl("title", {});
    title.textContent = `${labels[i]}: $${Math.round(p.v).toLocaleString("es-CO")}`;
    circle.appendChild(title);
    svg.appendChild(circle);

    if (i % cadaCuantos === 0 || i === labels.length - 1) {
      const text = svgEl("text", { x: p.x, y: CHART_HEIGHT - 8, class: "chart-label", "text-anchor": "middle" });
      text.textContent = labels[i];
      svg.appendChild(text);
    }
  });

  container.appendChild(svg);
}
