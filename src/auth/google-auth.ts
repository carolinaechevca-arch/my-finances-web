// Google Identity Services (GIS) token client — pure client-side OAuth.
// No backend and no client secret involved: the access token is requested
// directly in the browser and used to call the Sheets/Drive REST APIs.
// See: https://developers.google.com/identity/oauth2/web/guides/use-token-model

const SCOPES = [
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

export class AuthError extends Error {}

let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiresAt = 0;

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
    throw new AuthError("Falta VITE_GOOGLE_CLIENT_ID en el archivo .env");
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
          accessToken = resp.access_token;
          tokenExpiresAt = Date.now() + resp.expires_in * 1000;
          resolve(accessToken);
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
 * Inicia sesión, valida contra la whitelist de un solo correo y devuelve el
 * usuario. Si el correo no coincide, revoca el token y lanza AuthError.
 */
export async function signIn(): Promise<AuthUser> {
  const token = await requestToken("consent");
  const user = await fetchUserInfo(token);

  const allowedEmail = import.meta.env.VITE_ALLOWED_EMAIL?.toLowerCase();
  if (!allowedEmail || user.email.toLowerCase() !== allowedEmail) {
    await signOut();
    throw new AuthError("Esta cuenta de Google no está autorizada para usar esta app.");
  }

  return user;
}

export async function signOut(): Promise<void> {
  const token = accessToken;
  accessToken = null;
  tokenExpiresAt = 0;
  if (!token || !window.google) return;
  await new Promise<void>((resolve) => window.google!.accounts.oauth2.revoke(token, () => resolve()));
}

export function isSignedIn(): boolean {
  return !!accessToken && Date.now() < tokenExpiresAt;
}
