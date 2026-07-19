# Mis Finanzas

App personal de finanzas (HTML/CSS/TypeScript, sin backend). Usa un Google Sheet
en tu Drive como base de datos y una carpeta `Facturas/<año>/` en Drive para
las fotos de facturas. El login es con tu cuenta de Google y solo tu correo
(`carolinaechev.ca@gmail.com`) puede entrar.

Corre igual en local (`npm run dev`) y publicada en GitHub Pages — no hay
servidor: el navegador llama directo a las APIs de Google con el token que
obtiene tu propio login (patrón "OAuth para apps sin backend" de Google).

## 1. Crear credenciales en Google Cloud Console

1. Ve a [console.cloud.google.com](https://console.cloud.google.com/) y crea un proyecto nuevo (o usa uno existente), ej. "Mis Finanzas".
2. En **APIs y servicios → Biblioteca**, busca y habilita:
   - **Google Sheets API**
   - **Google Drive API**
3. Ve a **APIs y servicios → Pantalla de consentimiento OAuth**:
   - Tipo de usuario: **Externo**.
   - Completa nombre de la app, correo de soporte y correo de contacto.
   - En **Scopes**, agrega `.../auth/spreadsheets` y `.../auth/drive.file`.
   - En **Usuarios de prueba**, agrega `carolinaechev.ca@gmail.com`. (Mientras la app esté en modo "Testing" solo estos correos pueden iniciar sesión — es una capa extra de seguridad gratis, además del whitelist que hace la app.)
4. Ve a **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**:
   - Tipo de aplicación: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**, agrega:
     - `http://localhost:5173`
     - `https://<tu-usuario-github>.github.io`
   - No hace falta configurar "URI de redirección" (el flujo de token client no la usa).
   - Guarda y copia el **Client ID** (no hay/no se necesita client secret con este flujo).

## 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env`:

```
VITE_GOOGLE_CLIENT_ID=<tu client id>.apps.googleusercontent.com
VITE_ALLOWED_EMAIL=carolinaechev.ca@gmail.com
VITE_SPREADSHEET_ID=
```

Deja `VITE_SPREADSHEET_ID` vacío la primera vez: la app crea el spreadsheet
"MisFinanzas" automáticamente y lo reutiliza en logins futuros (lo busca por
nombre en tu Drive). Si quieres fijarlo explícitamente, pega ahí el ID que
aparece en la URL del Sheet después de la primera creación.

## 3. Correr en local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`.

## 4. Publicar en GitHub Pages

1. En GitHub, ve a **Settings → Pages** del repo y selecciona la fuente **GitHub Actions**.
2. En **Settings → Secrets and variables → Actions**, agrega estos repository secrets (mismos valores que tu `.env` local):
   - `VITE_GOOGLE_CLIENT_ID`
   - `VITE_ALLOWED_EMAIL`
   - `VITE_SPREADSHEET_ID` (puede quedar vacío también en el secret)
3. Haz push a `main`: el workflow en `.github/workflows/deploy.yml` compila y publica el sitio.
4. Verifica que `https://<tu-usuario>.github.io/my-finances-web/` esté en los "Orígenes de JavaScript autorizados" del paso 1 (ya debería estarlo si copiaste el usuario correcto).

## Notas de seguridad

- El token de acceso de Google vive solo en memoria del navegador (no se
  guarda en `localStorage`), así que cada recarga de página pide iniciar
  sesión de nuevo — es intencional.
- El scope `drive.file` (en vez de `drive` completo) limita a la app a ver
  solo los archivos que ella misma crea, nunca todo tu Drive.
- El whitelist de correo es una capa de UX sobre el límite de seguridad real,
  que es el consentimiento OAuth de Google sobre tu propia cuenta.

## Estado actual

Fase 1 completa: login con Google, whitelist de correo, y creación/detección
automática del Google Sheet "MisFinanzas" con las 14 hojas de datos. Las
secciones del menú (Ingresos, Gastos, Deudas, Facturas, etc.) son
placeholders — se construyen módulo por módulo en las siguientes fases.
