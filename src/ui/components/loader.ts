const DOTS = `<div class="three-body__dot"></div><div class="three-body__dot"></div><div class="three-body__dot"></div>`;

/** Spinner para reemplazar los "Cargando…" de texto dentro de una lista/tarjeta. */
export function loaderHtml(): string {
  return `<div class="loader-wrap"><div class="three-body three-body--sm">${DOTS}</div></div>`;
}

/** Mismo spinner, más grande y sin wrapper — para pantallas completas como el boot loader. */
export function loaderHtmlFullscreen(): string {
  return `<div class="three-body">${DOTS}</div>`;
}
