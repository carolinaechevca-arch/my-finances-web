import businessplanIcon from "../../icon/businessplan.svg?raw";
import { renderDeudasModulo } from "./deudas-shared";

export function renderMeDeben(container: HTMLElement): Promise<void> {
  return renderDeudasModulo(container, {
    direccion: "MeDeben",
    icon: businessplanIcon,
    titulo: "Me Deben",
    labelContraparte: "¿Quién te debe?",
    placeholderContraparte: "Ej. María López",
    totalLabel: "Total que me deben",
  });
}
