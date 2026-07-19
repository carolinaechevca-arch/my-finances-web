import chevronDownIcon from "../../icon/chevron-down.svg?raw";
import trashIcon from "../../icon/trash-x.svg?raw";

export const OPTION_COMBO_NUEVO = "__nuevo__";

export interface OptionComboOptions {
  getOptions: () => string[];
  getValue: () => string;
  onSelect: (value: string) => void;
  onRequestNuevo: () => void;
  onRequestDelete: (value: string) => void;
  /** Ej. "Selecciona un tipo" / "Selecciona una categoría". */
  placeholder: string;
  /** Ej. "+ Nuevo tipo…" / "+ Nueva categoría…". */
  addLabel: string;
  /** Ej. "Eliminar tipo" / "Eliminar categoría" (aria-label del botón de borrar). */
  deleteLabel: string;
}

export interface OptionCombo {
  el: HTMLDivElement;
  refresh: () => void;
}

/** Dropdown a medida (no <select> nativo) con checkmark, opción de crear y borrar valor por fila. */
export function createOptionCombo(opts: OptionComboOptions): OptionCombo {
  const root = document.createElement("div");
  root.className = "combo";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "combo__trigger";
  trigger.innerHTML = `<span class="combo__value"></span>${chevronDownIcon}`;
  root.appendChild(trigger);

  const panel = document.createElement("div");
  panel.className = "combo__panel";
  panel.hidden = true;
  root.appendChild(panel);

  let closeController: AbortController | null = null;

  function close(): void {
    panel.hidden = true;
    root.classList.remove("is-open");
    closeController?.abort();
    closeController = null;
  }

  function renderPanel(): void {
    const options = opts.getOptions();
    const value = opts.getValue();

    const optionsHtml = options
      .map((option) => {
        const selected = option === value;
        return `
          <div class="combo__option ${selected ? "is-selected" : ""}" data-value="${option}">
            <span class="combo__check">${selected ? "✓" : ""}</span>
            <span class="combo__label">${option}</span>
            <button type="button" class="combo__delete" data-delete="${option}" aria-label="${opts.deleteLabel}" title="${opts.deleteLabel}">${trashIcon}</button>
          </div>
        `;
      })
      .join("");

    panel.innerHTML =
      optionsHtml +
      `<div class="combo__option combo__option--add" data-value="${OPTION_COMBO_NUEVO}">
        <span class="combo__label">${opts.addLabel}</span>
      </div>`;

    panel.querySelectorAll<HTMLElement>(".combo__option").forEach((row) => {
      row.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).closest(".combo__delete")) return;
        const val = row.dataset.value!;
        close();
        if (val === OPTION_COMBO_NUEVO) opts.onRequestNuevo();
        else opts.onSelect(val);
      });
    });

    panel.querySelectorAll<HTMLButtonElement>(".combo__delete").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = btn.dataset.delete!;
        close();
        opts.onRequestDelete(value);
      });
    });
  }

  function open(): void {
    renderPanel();
    panel.hidden = false;
    root.classList.add("is-open");
    closeController = new AbortController();
    const { signal } = closeController;
    document.addEventListener(
      "click",
      (e) => {
        if (!root.contains(e.target as Node)) close();
      },
      { signal },
    );
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Escape") close();
      },
      { signal },
    );
  }

  trigger.addEventListener("click", () => {
    if (panel.hidden) open();
    else close();
  });

  function refresh(): void {
    const valueEl = trigger.querySelector<HTMLSpanElement>(".combo__value")!;
    valueEl.textContent = opts.getValue() || opts.placeholder;
    if (!panel.hidden) renderPanel();
  }

  refresh();
  return { el: root, refresh };
}
