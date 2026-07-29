import eyeIcon from "../../icon/eye.svg?raw";
import eyeOffIcon from "../../icon/eye-off.svg?raw";

/**
 * Conecta un botón de ojo a uno o más elementos de valor: alterna entre el
 * texto real (recalculado con `getFormatted`) y "••••••". El estado es solo
 * en memoria (se resetea al recargar), igual que en Ingresos/Inicio.
 */
export function mountEyeToggle(btn: HTMLButtonElement, valueEls: HTMLElement | HTMLElement[], getFormatted: () => string | string[]): { refresh: () => void } {
  const els = Array.isArray(valueEls) ? valueEls : [valueEls];
  let visible = true;

  function render(): void {
    btn.innerHTML = visible ? eyeIcon : eyeOffIcon;
    if (!visible) {
      for (const el of els) el.textContent = "••••••";
      return;
    }
    const formatted = getFormatted();
    const values = Array.isArray(formatted) ? formatted : [formatted];
    els.forEach((el, i) => {
      el.textContent = values[i] ?? values[0] ?? "";
    });
  }

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    visible = !visible;
    render();
  });
  render();

  return { refresh: render };
}
