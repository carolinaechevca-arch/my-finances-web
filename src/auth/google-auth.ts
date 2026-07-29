// Google Identity Services (GIS) token client — pure client-side OAuth.
// No backend and no client secret involved: the access token is requested
// directly in the browser and used to call the Sheets/Drive REST APIs.
// See: https://developers.google.com/identity/oauth2/web/guides/use-token-model

import { limpiarCacheSpreadsheet } from "../api/spreadsheet-bootstrap";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
].join(" ");

const GIS_SRC = "https://accounts.google.com/gsi/client";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (resp: TokenResponse) => void;
            error_callback?: (err: unknown) => void;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

export interface AuthUser {
  email: string;
  name: string;
  picture: string;
}

/** Error seguro de mostrar tal cual al usuario (ej. correo no autorizado). */
export class AuthError extends Error {}

/** Error de configuración/infraestructura: no se muestra su mensaje crudo al usuario. */
export class ConfigError extends Error {}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;
let currentUser: AuthUser | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Este flujo (GIS token client, sin backend) nunca entrega un refresh_token
 * — eso solo lo da el flujo "authorization code", que requiere client
 * secret en un servidor. Lo que hay acá es lo más parecido posible sin
 * backend: cachear el access token en localStorage para no repetir el
 * round-trip a Google en cada reload mientras siga vigente, y refrescarlo
 * solo (en silencio, sin popup) un poco antes de que expire. Si el
 * navegador bloquea el flujo silencioso de Google (cookies de terceros,
 * modo privado estricto) o el usuario revocó el acceso, esto igual cae de
 * vuelta a pedir login normal — no hay forma de evitar eso sin backend.
 */
const SESSION_KEY = "mf_auth_session";

interface StoredSession {
  accessToken: string;
  expiresAt: number;
  user: AuthUser;
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // localStorage no disponible (modo privado estricto, cuota llena, etc.): la sesión sigue
    // funcionando en memoria durante esta pestaña, solo no sobrevive a un reload.
  }
}

function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignorado a propósito, ver comentario en saveStoredSession.
  }
}

/** Guarda el token vigente (en memoria y en localStorage) y reprograma el refresco silencioso. */
function persistToken(token: string, expiresAt: number): void {
  accessToken = token;
  tokenExpiresAt = expiresAt;
  if (currentUser) {
    saveStoredSession({ accessToken: token, expiresAt, user: currentUser });
  }
  scheduleAutoRefresh(expiresAt);
}

/** Programa un refresco silencioso ~5 minutos antes de que expire el token, para que la sesión nunca llegue a expirar mientras la pestaña siga abierta. */
function scheduleAutoRefresh(expiresAt: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const delay = Math.max(expiresAt - 5 * 60_000 - Date.now(), 10_000);
  refreshTimer = setTimeout(() => {
    requestToken("").catch(() => {
      // Si falla (ej. el usuario revocó el acceso desde su cuenta de Google), no pasa nada acá:
      // el próximo getAccessToken() lo reintenta, y si sigue fallando cada página ya maneja el error.
    });
  }, delay);
}

/**
 * Nada sensible acá: solo un booleano que dice "el usuario cerró sesión a
 * propósito la última vez", para no reintentar el login silencioso en el
 * próximo reload.
 */
const LOGGED_OUT_KEY = "mf_logged_out";

function marcarSesionCerradaManualmente(): void {
  try {
    sessionStorage.setItem(LOGGED_OUT_KEY, "1");
  } catch {
    // Si sessionStorage no está disponible (modo privado estricto, etc.), no pasa nada grave:
    // en el peor caso se reintenta el login silencioso una vez de más.
  }
}

function limpiarSesionCerradaManualmente(): void {
  try {
    sessionStorage.removeItem(LOGGED_OUT_KEY);
  } catch {
    // Ignorado a propósito, ver comentario arriba.
  }
}

function sesionFueCerradaManualmente(): boolean {
  try {
    return sessionStorage.getItem(LOGGED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function loadGisScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("No se pudo cargar Google Identity Services")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(script);
  });
}

async function ensureTokenClient(): Promise<TokenClient> {
  await loadGisScript();
  if (tokenClient) return tokenClient;

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new ConfigError("Falta VITE_GOOGLE_CLIENT_ID en el archivo .env");
  }

  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: () => {
      // Reemplazado por una promesa puntual en cada llamada a requestToken().
    },
  });
  return tokenClient;
}

function requestToken(prompt: "" | "consent"): Promise<string> {
  return new Promise((resolve, reject) => {
    ensureTokenClient()
      .then((client) => {
        const clientWithCallback = client as unknown as {
          callback: (resp: TokenResponse) => void;
          requestAccessToken: (opts?: { prompt?: string }) => void;
        };
        clientWithCallback.callback = (resp: TokenResponse) => {
          if (resp.error || !resp.access_token) {
            reject(new AuthError(resp.error ?? "No se obtuvo un token de acceso"));
            return;
          }
          persistToken(resp.access_token, Date.now() + resp.expires_in * 1000);
          resolve(resp.access_token);
        };
        clientWithCallback.requestAccessToken({ prompt });
      })
      .catch(reject);
  });
}

/** Devuelve un token válido, pidiendo uno nuevo en silencio si expiró. */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 30_000) {
    return accessToken;
  }
  return requestToken("");
}

async function fetchUserInfo(token: string): Promise<AuthUser> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new AuthError("No se pudo obtener el perfil de Google");
  const data = await res.json();
  return { email: data.email, name: data.name, picture: data.picture };
}

/**
 * Inicia sesión y devuelve el usuario. El control de acceso ya no vive en
 * la app: quién puede autenticarse lo decide Google Cloud Console (Google
 * Auth Platform → Público → Usuarios de prueba). Si Google deja pasar al
 * usuario, la app confía en eso y lo deja entrar.
 */
export async function signIn(): Promise<AuthUser> {
  const token = await requestToken("consent");
  const user = await fetchUserInfo(token);
  currentUser = user;
  saveStoredSession({ accessToken: token, expiresAt: tokenExpiresAt, user });
  limpiarSesionCerradaManualmente();
  return user;
}

/**
 * Intenta recuperar la sesión sin mostrar ningún diálogo (se usa al cargar
 * la app). Primero revisa si ya hay un token vigente guardado en
 * localStorage de una sesión anterior — si lo hay, entra directo, sin
 * siquiera contactar a Google. Si no hay uno vigente, cae al login
 * silencioso de siempre (funciona si el navegador todavía tiene la sesión
 * de Google activa y ya diste consentimiento antes); si tampoco eso
 * funciona, devuelve null y se muestra la pantalla de login normal. Si el
 * usuario cerró sesión a propósito la última vez, ni siquiera lo intenta.
 */
export async function trySilentSignIn(): Promise<AuthUser | null> {
  if (sesionFueCerradaManualmente()) return null;

  const stored = loadStoredSession();
  if (stored && Date.now() < stored.expiresAt - 30_000) {
    accessToken = stored.accessToken;
    tokenExpiresAt = stored.expiresAt;
    currentUser = stored.user;
    scheduleAutoRefresh(stored.expiresAt);
    return stored.user;
  }

  try {
    const token = await requestToken("");
    const user = await fetchUserInfo(token);
    currentUser = user;
    saveStoredSession({ accessToken: token, expiresAt: tokenExpiresAt, user });
    return user;
  } catch {
    clearStoredSession();
    return null;
  }
}

/** Siempre lo dispara el usuario desde el botón "Cerrar sesión" — evita que el próximo reload reintente el login silencioso. */
export async function signOut(): Promise<void> {
  const token = accessToken;
  accessToken = null;
  tokenExpiresAt = 0;
  currentUser = null;
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  clearStoredSession();
  limpiarCacheSpreadsheet();
  marcarSesionCerradaManualmente();
  if (!token || !window.google) return;
  await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, () => resolve()));
}

export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt;
}
