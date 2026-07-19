import { AuthError, signIn, type AuthUser } from "../../auth/google-auth";
import { mountThemeToggle } from "../theme-toggle";

export function renderLogin(root: HTMLElement, onSuccess: (user: AuthUser) => void): void {
  root.innerHTML = "";
  root.appendChild(mountThemeToggle());

  const screen = document.createElement("div");
  screen.className = "login-screen";
  screen.innerHTML = `
    <div class="login-hero">
      <h1>Mis Finanzas</h1>
      <p>Administra tus gastos, deudas, ahorros y facturas en un solo lugar, respaldado en tu propio Google Drive.</p>
    </div>
    <div class="login-panel">
      <div class="login-card">
        <p class="login-card__eyebrow">¡Hola!</p>
        <h2>Bienvenida</h2>
        <p>Inicia sesión con tu cuenta de Google. Tus datos se guardan en tu propio Drive.</p>
        <button type="button" class="google-btn" id="google-signin-btn">
          Iniciar sesión con Google
        </button>
        <div id="login-error" hidden></div>
        <p class="login-note">Tu información es privada y solo tú puedes verla</p>
      </div>
    </div>
  `;
  root.appendChild(screen);

  const button = screen.querySelector<HTMLButtonElement>("#google-signin-btn")!;
  const errorBox = screen.querySelector<HTMLDivElement>("#login-error")!;
  errorBox.className = "login-error";

  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Conectando…";
    errorBox.hidden = true;
    try {
      const user = await signIn();
      onSuccess(user);
    } catch (err) {
      errorBox.hidden = false;
      errorBox.textContent =
        err instanceof AuthError ? err.message : "No se pudo iniciar sesión. Intenta de nuevo.";
      button.disabled = false;
      button.textContent = "Iniciar sesión con Google";
    }
  });
}
