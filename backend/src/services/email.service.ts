/**
 * Email Service
 * Transactional email via Resend: signer invites, OTP codes, and envelope
 * completion notices. Resend requires a verified sending domain, so this
 * fails loudly (not silently) when it isn't configured instead of pretending
 * an email went out.
 */

import { Resend } from 'resend';

const API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'QuantumGuard <firmas@postcuantica.io>';
export const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || 'https://app.postcuantica.io').replace(/\/$/, '');

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('RESEND_API_KEY is not set; email sending is disabled');
  }
}

let client: Resend | null = null;
function getClient(): Resend {
  if (!API_KEY) throw new EmailNotConfiguredError();
  client ??= new Resend(API_KEY);
  return client;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const resend = getClient();
  const { error } = await resend.emails.send({ from: FROM_EMAIL, to, subject, html });
  if (error) throw new Error(`Resend error: ${error.message}`);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html lang="es"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f7fc;padding:32px 0;margin:0;">
    <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;">
      <p style="font-size:13px;font-weight:800;letter-spacing:-0.3px;color:#2743e0;margin:0 0 20px;">QuantumGuard</p>
      <h1 style="font-size:19px;margin:0 0 16px;color:#12141c;">${escapeHtml(title)}</h1>
      ${bodyHtml}
      <p style="font-size:11.5px;color:#8a8f9c;margin-top:28px;">Firma post-cuántica QuantumGuard · Postcuantica</p>
    </div>
  </body></html>`;
}

function signingLink(token: string): string {
  return `${FRONTEND_BASE_URL}/firmar/${token}`;
}

export const emailService = {
  async sendSignerInvite(params: {
    to: string; signerName: string; ownerName: string; documentName: string; token: string;
  }): Promise<void> {
    const link = signingLink(params.token);
    await send(
      params.to,
      `${params.ownerName} te invitó a firmar "${params.documentName}"`,
      layout('Te invitaron a firmar un documento', `
        <p style="font-size:14px;color:#444;line-height:1.5;">Hola ${escapeHtml(params.signerName)},</p>
        <p style="font-size:14px;color:#444;line-height:1.5;"><strong>${escapeHtml(params.ownerName)}</strong> te invitó a firmar
        <strong>${escapeHtml(params.documentName)}</strong> con QuantumGuard.</p>
        <p style="margin:24px 0;"><a href="${link}" style="background:#2743e0;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">Revisar y firmar</a></p>
        <p style="font-size:12px;color:#8a8f9c;">Si el botón no funciona, copia este enlace: ${link}</p>
      `),
    );
  },

  async sendOtpCode(params: { to: string; signerName: string; code: string }): Promise<void> {
    await send(
      params.to,
      `${params.code} es tu código para firmar`,
      layout('Tu código de verificación', `
        <p style="font-size:14px;color:#444;line-height:1.5;">Hola ${escapeHtml(params.signerName)}, usa este código para confirmar tu identidad y firmar:</p>
        <p style="font-size:32px;font-weight:800;letter-spacing:4px;color:#12141c;margin:20px 0;">${escapeHtml(params.code)}</p>
        <p style="font-size:12px;color:#8a8f9c;">Vence en 10 minutos. Si no lo solicitaste, ignora este correo.</p>
      `),
    );
  },

  async sendNextSignerTurn(params: {
    to: string; signerName: string; ownerName: string; documentName: string; token: string;
  }): Promise<void> {
    await this.sendSignerInvite(params);
  },

  async sendEnvelopeCompleted(params: { to: string; ownerName: string; documentName: string }): Promise<void> {
    await send(
      params.to,
      `Todos firmaron "${params.documentName}"`,
      layout('Documento completamente firmado', `
        <p style="font-size:14px;color:#444;line-height:1.5;">Hola ${escapeHtml(params.ownerName)}, todos los firmantes de
        <strong>${escapeHtml(params.documentName)}</strong> ya firmaron. Puedes descargar el documento firmado desde QuantumGuard.</p>
      `),
    );
  },
};
