import { api } from './api';

interface RenderedDocument {
  fileName: string;
  contentType: string;
  dataBase64: string;
}

/** Fetches a rendered business document and hands it to the browser. */
export async function downloadDocument(path: string): Promise<void> {
  const doc = await api<RenderedDocument>('GET', path);
  const bytes = Uint8Array.from(atob(doc.dataBase64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: doc.contentType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = doc.fileName;
  a.click();
  URL.revokeObjectURL(url);
}
