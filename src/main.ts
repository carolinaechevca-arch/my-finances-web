import "./styles/theme.css";
import "./styles/layout.css";
import { signOut, type AuthUser } from "./auth/google-auth";
import { renderLogin } from "./ui/pages/login";
import { renderAppShell, NAV_SECTIONS } from "./ui/layout";
import { renderDashboard } from "./ui/pages/dashboard";
import { renderIngresos } from "./ui/pages/ingresos";
import { renderGastosFijos } from "./ui/pages/gastos-fijos";
import { renderGastosPersonales } from "./ui/pages/gastos-personales";
import { initTheme } from "./ui/theme-toggle";

initTheme();

const root = document.getElementById("app")!;

function renderPlaceholder(container: HTMLElement, sectionId: string): void {
  const section = NAV_SECTIONS.find((s) => s.id === sectionId);
  container.innerHTML = `
    <h1 class="page-title">${section?.icon ?? ""} ${section?.label ?? ""}</h1>
    <div class="card">
      <p class="empty-state">Esta sección se construye en la siguiente fase.</p>
    </div>
  `;
}

function showApp(user: AuthUser): void {
  function renderSection(sectionId: string): void {
    shell.setActive(sectionId);
    switch (sectionId) {
      case "inicio":
        void renderDashboard(shell.contentEl, renderSection);
        break;
      case "ingresos":
        void renderIngresos(shell.contentEl);
        break;
      case "gastos-fijos":
        void renderGastosFijos(shell.contentEl);
        break;
      case "gastos-personales":
        void renderGastosPersonales(shell.contentEl);
        break;
      default:
        renderPlaceholder(shell.contentEl, sectionId);
    }
  }

  const shell = renderAppShell(root, user, renderSection, async () => {
    await signOut();
    showLogin();
  });
  renderSection("inicio");
}

function showLogin(): void {
  renderLogin(root, showApp);
}

showLogin();
