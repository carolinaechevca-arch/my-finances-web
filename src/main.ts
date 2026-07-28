import "./styles/theme.css";
import "./styles/layout.css";
import { signOut, trySilentSignIn, type AuthUser } from "./auth/google-auth";
import { ensureSpreadsheet } from "./api/spreadsheet-bootstrap";
import { ensurePeriodoActualizado } from "./domain/periodo";
import { renderLogin } from "./ui/pages/login";
import { renderAppShell, NAV_SECTIONS } from "./ui/layout";
import { renderDashboard } from "./ui/pages/dashboard";
import { renderIngresos } from "./ui/pages/ingresos";
import { renderGastosFijos } from "./ui/pages/gastos-fijos";
import { renderGastosPersonales } from "./ui/pages/gastos-personales";
import { renderDeudas } from "./ui/pages/deudas";
import { renderMeDeben } from "./ui/pages/me-deben";
import { renderAhorros } from "./ui/pages/ahorros";
import { renderHistorico } from "./ui/pages/historico";
import { renderConfiguracion } from "./ui/pages/configuracion";
import { loaderHtmlFullscreen } from "./ui/components/loader";
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

async function showApp(user: AuthUser): Promise<void> {
  try {
    const { spreadsheetId } = await ensureSpreadsheet();
    await ensurePeriodoActualizado(spreadsheetId);
  } catch {
    // Si falla, cada página reintenta ensureSpreadsheet() por su cuenta y muestra el error ahí.
  }

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
      case "deudas":
        void renderDeudas(shell.contentEl);
        break;
      case "me-deben":
        void renderMeDeben(shell.contentEl);
        break;
      case "ahorros":
        void renderAhorros(shell.contentEl);
        break;
      case "historico":
        void renderHistorico(shell.contentEl);
        break;
      case "configuracion":
        void renderConfiguracion(shell.contentEl);
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

/** Si el intento silencioso no responde (sin sesión de Google, cookies bloqueadas, etc.), no se queda colgado. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

async function bootstrap(): Promise<void> {
  root.innerHTML = `<div class="boot-loader">${loaderHtmlFullscreen()}</div>`;
  const user = await withTimeout(trySilentSignIn(), 7000, null);
  if (user) {
    void showApp(user);
  } else {
    showLogin();
  }
}

void bootstrap();
