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
  const token = await getAccessToken();

  const metadata = { name: file.name, parents: [folderId] };
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
