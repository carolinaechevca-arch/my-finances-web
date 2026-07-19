import { formatMoney, todayISO } from "../../domain/format";

function createDialog(): HTMLDialogElement {
  const dialog = document.createElement("dialog");
  dialog.className = "modal";
  document.body.appendChild(dialog);
  return dialog;
}

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

/** Modal de confirmación (reemplaza al confirm() nativo). Resuelve true/false. */
export function showConfirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        ${opts.title ? `<h2 class="modal__title">${opts.title}</h2>` : ""}
        <p class="modal__message">${message}</p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" data-action="cancel">${opts.cancelLabel ?? "Cancelar"}</button>
          <button type="button" class="${opts.danger ? "btn-danger" : "btn"}" data-action="confirm">${opts.confirmLabel ?? "Confirmar"}</button>
        </div>
      </div>
    `;

    const cleanup = (result: boolean) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('[data-action="cancel"]')!.addEventListener("click", () => cleanup(false));
    dialog.querySelector('[data-action="confirm"]')!.addEventListener("click", () => cleanup(true));
    dialog.addEventListener("cancel", () => cleanup(false));
    dialog.showModal();
  });
}

/** Modal informativo con un botón "Entendido" (reemplaza al alert() nativo). */
export function showAlert(message: string, title?: string): Promise<void> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        ${title ? `<h2 class="modal__title">${title}</h2>` : ""}
        <p class="modal__message">${message}</p>
        <div class="modal__actions">
          <button type="button" class="btn" data-action="ok">Entendido</button>
        </div>
      </div>
    `;

    const cleanup = () => {
      dialog.close();
      dialog.remove();
      resolve();
    };

    dialog.querySelector('[data-action="ok"]')!.addEventListener("click", cleanup);
    dialog.addEventListener("cancel", cleanup);
    dialog.showModal();
  });
}

/**
 * Modal para marcar un gasto como pagado: pregunta si el monto fue el
 * esperado o uno distinto, y si es distinto pide el valor real. Devuelve el
 * monto a registrar, o null si se canceló.
 */
export function showMontoPagadoDialog(nombre: string, montoEsperado: number): Promise<number | null> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        <h2 class="modal__title">Marcar como pagado</h2>
        <p class="modal__message">¿Pagaste el monto exacto de <strong>${formatMoney(montoEsperado)}</strong> de "${nombre}"?</p>
        <div class="field" id="monto-diferente-field" hidden>
          <label for="monto-diferente-input">¿Cuánto pagaste realmente?</label>
          <input id="monto-diferente-input" type="number" min="0" step="0.01" value="${montoEsperado}" />
        </div>
        <p class="empty-state" id="monto-diferente-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="btn-secondary" data-action="diferente">Fue otro monto</button>
          <button type="button" class="btn" data-action="exacto">Sí, exacto</button>
        </div>
      </div>
    `;

    const field = dialog.querySelector<HTMLDivElement>("#monto-diferente-field")!;
    const input = dialog.querySelector<HTMLInputElement>("#monto-diferente-input")!;
    const error = dialog.querySelector<HTMLParagraphElement>("#monto-diferente-error")!;
    const diferenteBtn = dialog.querySelector<HTMLButtonElement>('[data-action="diferente"]')!;
    const exactoBtn = dialog.querySelector<HTMLButtonElement>('[data-action="exacto"]')!;
    const cancelBtn = dialog.querySelector<HTMLButtonElement>('[data-action="cancel"]')!;

    const cleanup = (result: number | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    let modoDiferente = false;

    function setModoDiferente(value: boolean): void {
      modoDiferente = value;
      field.hidden = !value;
      error.hidden = true;
      // .btn ya trae "display: inline-flex", que empata en especificidad con
      // el estilo por defecto de [hidden] y gana por orden — por eso no basta
      // con el atributo `hidden` aquí, hay que forzar el display a mano.
      exactoBtn.style.display = value ? "none" : "";
      diferenteBtn.textContent = value ? "Confirmar monto" : "Fue otro monto";
      cancelBtn.textContent = value ? "Atrás" : "Cancelar";
      if (value) {
        input.focus();
        input.select();
      }
    }

    diferenteBtn.addEventListener("click", () => {
      if (!modoDiferente) {
        setModoDiferente(true);
        return;
      }
      const monto = Number(input.value);
      if (!monto || monto <= 0) {
        error.hidden = false;
        error.textContent = "Ingresa un monto válido.";
        return;
      }
      cleanup(monto);
    });
    exactoBtn.addEventListener("click", () => cleanup(montoEsperado));
    cancelBtn.addEventListener("click", () => {
      if (modoDiferente) {
        setModoDiferente(false);
        return;
      }
      cleanup(null);
    });
    dialog.addEventListener("cancel", () => cleanup(null));

    dialog.showModal();
  });
}

/**
 * Modal para marcar una compra/gasto pendiente como realizado: pide el
 * monto real y la fecha real en que se hizo (puede ser distinta a cuando se
 * planeó). Devuelve { monto, fecha } o null si se canceló.
 */
export function showCompletarGastoDialog(
  descripcion: string,
  montoPlaneado: number,
): Promise<{ monto: number; fecha: string } | null> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        <h2 class="modal__title">Marcar "${descripcion}" como realizado</h2>
        <div class="field">
          <label for="completar-fecha">¿Cuándo lo hiciste?</label>
          <input id="completar-fecha" type="date" value="${todayISO()}" />
        </div>
        <div class="field">
          <label for="completar-monto">¿Cuánto pagaste?</label>
          <input id="completar-monto" type="number" min="0" step="0.01" value="${montoPlaneado}" />
        </div>
        <p class="empty-state" id="completar-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="confirm">Marcar como realizado</button>
        </div>
      </div>
    `;

    const fechaInput = dialog.querySelector<HTMLInputElement>("#completar-fecha")!;
    const montoInput = dialog.querySelector<HTMLInputElement>("#completar-monto")!;
    const error = dialog.querySelector<HTMLParagraphElement>("#completar-error")!;

    const cleanup = (result: { monto: number; fecha: string } | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('[data-action="cancel"]')!.addEventListener("click", () => cleanup(null));
    dialog.querySelector('[data-action="confirm"]')!.addEventListener("click", () => {
      const monto = Number(montoInput.value);
      if (!monto || monto <= 0 || !fechaInput.value) {
        error.hidden = false;
        error.textContent = "Ingresa una fecha y un monto válido.";
        return;
      }
      cleanup({ monto, fecha: fechaInput.value });
    });
    dialog.addEventListener("cancel", () => cleanup(null));

    dialog.showModal();
  });
}

/**
 * Cuando ya existe una deuda activa con la misma contraparte: pregunta si
 * sumar el monto nuevo a esa deuda o crear una separada.
 */
export function showMergeChoice(nombre: string, montoRestante: number): Promise<"fusionar" | "separada" | null> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        <h2 class="modal__title">Ya existe una deuda con ${nombre}</h2>
        <p class="modal__message">Ya tienes una deuda activa con <strong>${nombre}</strong> por ${formatMoney(montoRestante)}. ¿Quieres sumar este nuevo monto a la deuda existente, o crear una deuda separada?</p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="btn-secondary" data-action="separada">Crear separada</button>
          <button type="button" class="btn" data-action="fusionar">Sumar a la existente</button>
        </div>
      </div>
    `;

    const cleanup = (result: "fusionar" | "separada" | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('[data-action="cancel"]')!.addEventListener("click", () => cleanup(null));
    dialog.querySelector('[data-action="separada"]')!.addEventListener("click", () => cleanup("separada"));
    dialog.querySelector('[data-action="fusionar"]')!.addEventListener("click", () => cleanup("fusionar"));
    dialog.addEventListener("cancel", () => cleanup(null));

    dialog.showModal();
  });
}

/** Modal para registrar un abono (o un monto agregado): fecha, monto y nota opcional. */
export function showAbonoDialog(
  titulo: string,
  montoSugerido?: number,
): Promise<{ fecha: string; monto: number; nota: string } | null> {
  return new Promise((resolve) => {
    const dialog = createDialog();
    dialog.innerHTML = `
      <div class="modal__form">
        <h2 class="modal__title">${titulo}</h2>
        <div class="field">
          <label for="abono-fecha">Fecha</label>
          <input id="abono-fecha" type="date" value="${todayISO()}" />
        </div>
        <div class="field">
          <label for="abono-monto">Monto</label>
          <input id="abono-monto" type="number" min="0" step="0.01" ${montoSugerido ? `value="${montoSugerido}"` : ""} />
        </div>
        <div class="field">
          <label for="abono-nota">Nota (opcional)</label>
          <input id="abono-nota" type="text" />
        </div>
        <p class="empty-state" id="abono-error" hidden></p>
        <div class="modal__actions">
          <button type="button" class="btn-secondary" data-action="cancel">Cancelar</button>
          <button type="button" class="btn" data-action="confirm">Guardar</button>
        </div>
      </div>
    `;

    const fechaInput = dialog.querySelector<HTMLInputElement>("#abono-fecha")!;
    const montoInput = dialog.querySelector<HTMLInputElement>("#abono-monto")!;
    const notaInput = dialog.querySelector<HTMLInputElement>("#abono-nota")!;
    const error = dialog.querySelector<HTMLParagraphElement>("#abono-error")!;

    const cleanup = (result: { fecha: string; monto: number; nota: string } | null) => {
      dialog.close();
      dialog.remove();
      resolve(result);
    };

    dialog.querySelector('[data-action="cancel"]')!.addEventListener("click", () => cleanup(null));
    dialog.querySelector('[data-action="confirm"]')!.addEventListener("click", () => {
      const monto = Number(montoInput.value);
      if (!monto || monto <= 0 || !fechaInput.value) {
        error.hidden = false;
        error.textContent = "Ingresa una fecha y un monto válido.";
        return;
      }
      cleanup({ fecha: fechaInput.value, monto, nota: notaInput.value.trim() });
    });
    dialog.addEventListener("cancel", () => cleanup(null));

    dialog.showModal();
  });
}
