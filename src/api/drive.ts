import { getAccessToken } from "../auth/google-auth";

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

async function authedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }
  return res;
}

// Nota: el scope usado es "drive.file", que solo da acceso a archivos creados
// por esta app (o abiertos explícitamente por el usuario vía Picker). Eso
// alcanza para todo lo que la app necesita: crear/encontrar su propio
// spreadsheet y sus carpetas de facturas.

export async function findFileByName(name: string, mimeType?: string): Promise<string | null> {
  const mimeClause = mimeType ? ` and mimeType='${mimeType}'` : "";
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and trashed=false${mimeClause}`);
  const res = await authedFetch(`${DRIVE_FILES}?q=${q}&fields=files(id,name)`);
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await authedFetch(DRIVE_FILES, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    }),
  });
  const data = await res.json();
  return data.id;
}

async function findOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const parentClause = parentId ? ` and '${parentId}' in parents` : "";
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`,
  );
  const res = await authedFetch(`${DRIVE_FILES}?q=${q}&fields=files(id)`);
  const data = await res.json();
  const existing = data.files?.[0]?.id;
  if (existing) return existing;
  return createFolder(name, parentId);
}

/** Encuentra o crea la carpeta Facturas/<año> y devuelve su ID. */
export async function ensureFacturasFolder(year: number): Promise<string> {
  const rootId = await findOrCreateFolder("Facturas");
  return findOrCreateFolder(String(year), rootId);
}

export interface UploadedFile {
  id: string;
  webViewLink: string;
}

/** Sube una foto de factura a la carpeta Facturas/<año> y devuelve su link. */
export async function uploadFacturaFoto(file: File, year: number): Promise<UploadedFile> {
  const folderId = await ensureFacturasFolder(year);
  return uploadFileToFolder(file, folderId, file.name);
}

/** Encuentra o crea FINANZAS_<año>/<Mes> (mes en español, ej. "Julio") y devuelve su ID. */
export async function ensureGastoFacturaFolder(year: number, mesNombre: string): Promise<string> {
  const rootId = await findOrCreateFolder(`FINANZAS_${year}`);
  return findOrCreateFolder(mesNombre, rootId);
}

/** name→lowercase, sin tildes, espacios por guiones (para nombres de archivo). */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "gasto"
  );
}

async function uploadFileToFolder(file: File, folderId: string, name: string): Promise<UploadedFile> {
  const token = await getAccessToken();

  const metadata = { name, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Drive API error ${res.status}: ${body}`);
  }
  return res.json();
}

/**
 * Sube la foto/PDF de una factura de un gasto a FINANZAS_<año>/<Mes>/,
 * nombrada "<descripcion-slug>_<YYYY-MM-DD>.<ext>".
 */
export async function uploadGastoFactura(
  file: File,
  fecha: Date,
  descripcion: string,
  fechaISO: string,
): Promise<UploadedFile> {
  const folderId = await ensureGastoFacturaFolder(fecha.getFullYear(), monthNameFor(fecha));
  const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
  const name = `${slugify(descripcion)}_${fechaISO}${ext}`;
  return uploadFileToFolder(file, folderId, name);
}

const monthFormatterEs = new Intl.DateTimeFormat("es-CO", { month: "long" });
function monthNameFor(date: Date): string {
  const label = monthFormatterEs.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
