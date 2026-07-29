import sunIcon from "../icon/sun.svg?raw";
import moonIcon from "../icon/moon.svg?raw";

const STORAGE_KEY = "mf-theme";

export type ThemeMode = "light" | "dark" | "auto";

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  }
}

/** Modo guardado explícitamente por el usuario ("light"/"dark"), o "auto" si sigue el tema del sistema. */
export function getThemeMode(): ThemeMode {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "light" || saved === "dark" ? saved : "auto";
}

/** Fija el modo: "auto" quita la preferencia guardada y vuelve a seguir el tema del sistema. */
export function setThemeMode(mode: ThemeMode): void {
  if (mode === "auto") {
    localStorage.removeItem(STORAGE_KEY);
    document.documentElement.removeAttribute("data-theme");
  } else {
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.setAttribute("data-theme", mode);
  }
}

function currentTheme(): "light" | "dark" {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Switch con sol/luna: el thumb se desliza hacia el ícono del tema activo. */
export function mountThemeToggle(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "theme-switch";
  btn.type = "button";
  btn.setAttribute("aria-label", "Cambiar tema claro/oscuro");

  btn.innerHTML = `
    <span class="theme-switch__icon theme-switch__icon--sun">${sunIcon}</span>
    <span class="theme-switch__icon theme-switch__icon--moon">${moonIcon}</span>
    <span class="theme-switch__thumb"></span>
  `;

  const render = () => {
    const theme = currentTheme();
    btn.dataset.active = theme;
    btn.setAttribute("aria-pressed", String(theme === "dark"));
  };
  render();

  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(STORAGE_KEY, next);
    render();
  });

  return btn;
}
