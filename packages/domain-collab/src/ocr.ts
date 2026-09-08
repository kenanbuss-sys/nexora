/**
 * OCR capture port (DOC-010). Provider OCR engines (cloud vision
 * APIs, local Tesseract, invoice-parsing services) stay behind this
 * port; the domain sees plain extracted text and typed fields.
 */

export interface OcrResult {
  text: string;
  fields: {
    invoiceNumber: string | null;
    total: string | null;
    date: string | null;
  };
}

export interface OcrPort {
  extract(input: { fileName: string; contentType: string; data: Buffer }): Promise<OcrResult>;
}

/**
 * Development adapter: reads text-based content directly (no external
 * engine) and pulls common document fields out with conservative
 * patterns — enough to exercise the capture flow end-to-end.
 */
export class DevOcrAdapter implements OcrPort {
  async extract(input: {
    fileName: string;
    contentType: string;
    data: Buffer;
  }): Promise<OcrResult> {
    const text = input.contentType.startsWith('text/')
      ? input.data.toString('utf8')
      : input.data.toString('utf8').replace(/[^\x20-\x7E\n\r\tÀ-ſ]/g, ' ');
    const invoiceNumber =
      /(?:invoice|račun|racun|faktura)[^\w]{0,10}(?:no\.?|br\.?|#)?\s*[:-]?\s*([A-Z0-9][A-Z0-9/-]{2,24})/i.exec(
        text,
      )?.[1] ?? null;
    const total =
      /(?:total|ukupno|iznos)\s*[:-]?\s*(?:EUR|BAM|USD|€|\$)?\s*([0-9][0-9.,]{0,15})/i.exec(
        text,
      )?.[1] ?? null;
    const date = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4})\b/.exec(text)?.[1] ?? null;
    return { text: text.slice(0, 20000), fields: { invoiceNumber, total, date } };
  }
}
