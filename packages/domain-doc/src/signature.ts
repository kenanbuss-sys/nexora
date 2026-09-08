import { createHash } from 'node:crypto';

/**
 * Electronic-signature port (DOC-006). Provider code (DocuSign,
 * Adobe Sign, local qualified-signature gateways) stays behind this
 * port; the domain never sees vendor payloads.
 */

export type EnvelopeStatus = 'SENT' | 'SIGNED' | 'DECLINED';

export interface SignaturePort {
  createEnvelope(input: {
    documentRef: string;
    signerEmail: string;
    title: string;
  }): Promise<{ envelopeId: string; status: EnvelopeStatus }>;
  getEnvelope(envelopeId: string): Promise<{ status: EnvelopeStatus } | null>;
}

/**
 * Development adapter: envelopes are deterministic hashes and
 * auto-sign on first poll — the full flow is exercisable end-to-end
 * without an external provider.
 */
export class DevSignatureAdapter implements SignaturePort {
  private readonly envelopes = new Map<string, EnvelopeStatus>();

  async createEnvelope(input: {
    documentRef: string;
    signerEmail: string;
    title: string;
  }): Promise<{ envelopeId: string; status: EnvelopeStatus }> {
    const envelopeId = `env_${createHash('sha256')
      .update(`${input.documentRef}:${input.signerEmail}`)
      .digest('hex')
      .slice(0, 24)}`;
    this.envelopes.set(envelopeId, 'SENT');
    return { envelopeId, status: 'SENT' };
  }

  async getEnvelope(envelopeId: string): Promise<{ status: EnvelopeStatus } | null> {
    const status = this.envelopes.get(envelopeId);
    if (status === undefined) return null;
    // Dev behaviour: a poll completes the signature.
    this.envelopes.set(envelopeId, 'SIGNED');
    return { status: 'SIGNED' };
  }
}
