import "./styles/theme.css";
import "./styles/layout.css";
import { signOut, type AuthUser } from "./auth/google-auth";
import { renderLogin } from "./ui/pages/login";
import { renderAppShell, NAV_SECTIONS } from "./ui/layout";
import { renderDashboard } from "./ui/pages/dashboard";
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
  const shell = renderAppShell(
    root,
    user,
    (sectionId) => {
      shell.setActive(sectionId);
      if (sectionId === "inicio") {
        void renderDashboard(shell.contentEl);
      } else {
        renderPlaceholder(shell.contentEl, sectionId);
      }
    },
    async () => {
      await signOut();
      showLogin();
    },
  );
  shell.setActive("inicio");
  void renderDashboard(shell.contentEl);
}

function showLogin(): void {
  renderLogin(root, showApp);
}

showLogin();
