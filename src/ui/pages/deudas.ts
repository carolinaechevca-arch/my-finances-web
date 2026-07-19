import pigMoneyIcon from "../../icon/pig-money.svg?raw";
import { renderDeudasModulo } from "./deudas-shared";

export function renderDeudas(container: HTMLElement): Promise<void> {
  return renderDeudasModulo(container, {
    direccion: "YoDebo",
    icon: pigMoneyIcon,
    titulo: "Deudas",
    labelContraparte: "¿A quién le debes?",
    placeholderContraparte: "Ej. Banco XYZ, Juan Pérez",
    totalLabel: "Total que debo",
  });
}
