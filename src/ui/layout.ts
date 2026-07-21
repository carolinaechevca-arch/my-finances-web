import businessplanIcon from "../icon/businessplan.svg?raw";
import cashBanknotePlusIcon from "../icon/cash-banknote-plus.svg?raw";
import cashMinusIcon from "../icon/cash-minus.svg?raw";
import fileTimeIcon from "../icon/file-time.svg?raw";
import financeIcon from "../icon/finance.svg?raw";
import homeDollarIcon from "../icon/home-dollar.svg?raw";
import logoutIcon from "../icon/logout.svg?raw";
import menuIcon from "../icon/menu-2.svg?raw";
import moneybagPlusIcon from "../icon/moneybag-plus.svg?raw";
import pigMoneyIcon from "../icon/pig-money.svg?raw";
import shoppingCartIcon from "../icon/shopping-cart.svg?raw";
import type { AuthUser } from "../auth/google-auth";
import { mountThemeToggle } from "./theme-toggle";

export interface NavSection {
  id: string;
  label: string;
  icon: string;
}

export const NAV_SECTIONS: NavSection[] = [
  { id: "inicio", label: "Inicio", icon: `<span class="nav-icon nav-icon--white">${homeDollarIcon}</span>` },
  { id: "ingresos", label: "Ingresos", icon: `<span class="nav-icon nav-icon--white">${cashBanknotePlusIcon}</span>` },
  { id: "gastos-fijos", label: "Gastos Fijos", icon: `<span class="nav-icon nav-icon--white">${cashMinusIcon}</span>` },
  { id: "gastos-personales", label: "Gastos y Compras", icon: `<span class="nav-icon nav-icon--white">${shoppingCartIcon}</span>` },
  { id: "deudas", label: "Deudas", icon: `<span class="nav-icon nav-icon--white">${pigMoneyIcon}</span>` },
  { id: "me-deben", label: "Me Deben", icon: `<span class="nav-icon nav-icon--white">${businessplanIcon}</span>` },
  { id: "ahorros", label: "Ahorros y Metas", icon: `<span class="nav-icon nav-icon--white">${moneybagPlusIcon}</span>` },
  { id: "historico", label: "Histórico", icon: `<span class="nav-icon nav-icon--white">${fileTimeIcon}</span>` },
];

export interface AppShell {
  contentEl: HTMLElement;
  setActive: (sectionId: string) => void;
}

export function renderAppShell(
  root: HTMLElement,
  user: AuthUser,
  onNavigate: (sectionId: string) => void,
  onLogout: () => void,
): AppShell {
  root.innerHTML = "";
  root.appendChild(mountThemeToggle());

  const shell = document.createElement("div");
  shell.className = "app-shell";

  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";

  const top = document.createElement("div");
  top.className = "sidebar__top";

  const brand = document.createElement("div");
  brand.className = "sidebar__brand";
  brand.innerHTML = `<span class="nav-icon nav-icon--white">${financeIcon}</span><span>Mis Finanzas</span>`;
  top.appendChild(brand);

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "sidebar__toggle";
  toggleBtn.setAttribute("aria-label", "Abrir menú");
  toggleBtn.innerHTML = menuIcon;
  toggleBtn.addEventListener("click", () => sidebar.classList.toggle("is-open"));
  top.appendChild(toggleBtn);

  sidebar.appendChild(top);

  const nav = document.createElement("nav");
  nav.className = "sidebar__nav";

  const links = new Map<string, HTMLButtonElement>();
  for (const section of NAV_SECTIONS) {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "sidebar__link";
    link.innerHTML = `<span aria-hidden="true">${section.icon}</span><span>${section.label}</span>`;
    link.addEventListener("click", () => {
      onNavigate(section.id);
      sidebar.classList.remove("is-open");
    });
    nav.appendChild(link);
    links.set(section.id, link);
  }
  sidebar.appendChild(nav);

  const footer = document.createElement("div");
  footer.className = "sidebar__footer";

  const logoutBtn = document.createElement("button");
  logoutBtn.type = "button";
  logoutBtn.className = "sidebar__link";
  logoutBtn.innerHTML = `<span class="nav-icon nav-icon--white">${logoutIcon}</span><span>Cerrar sesión (${user.name.split(" ")[0]})</span>`;
  logoutBtn.addEventListener("click", () => {
    sidebar.classList.remove("is-open");
    onLogout();
  });
  footer.appendChild(logoutBtn);
  sidebar.appendChild(footer);

  const content = document.createElement("main");
  content.className = "content";

  shell.appendChild(sidebar);
  shell.appendChild(content);
  root.appendChild(shell);

  return {
    contentEl: content,
    setActive: (sectionId: string) => {
      for (const [id, link] of links) {
        link.classList.toggle("is-active", id === sectionId);
      }
    },
  };
}
