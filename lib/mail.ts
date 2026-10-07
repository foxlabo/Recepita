// lib/mail.ts
// The only mail module: Azure Communication Services (ACS) Email.
// In non-production environments without ACS configured, the message
// (including any links) is printed to the server console instead of sent.
import 'server-only';
import { EmailClient } from '@azure/communication-email';

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

function acsConfig() {
  const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING?.trim();
  const sender = process.env.AZURE_COMMUNICATION_SENDER?.trim();
  return connectionString && sender ? { connectionString, sender } : null;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const cfg = acsConfig();
  if (!cfg) {
    if (process.env.NODE_ENV !== 'production') {
      console.info(
        `[mail:dev] ACS is not configured; printing instead of sending.\n` +
          `  to: ${msg.to}\n  subject: ${msg.subject}\n${msg.text}`,
      );
      return;
    }
    throw new Error('Mail is not configured: set AZURE_COMMUNICATION_CONNECTION_STRING and AZURE_COMMUNICATION_SENDER');
  }

  const client = new EmailClient(cfg.connectionString);
  const poller = await client.beginSend({
    senderAddress: cfg.sender,
    content: { subject: msg.subject, html: msg.html, plainText: msg.text },
    recipients: { to: [{ address: msg.to }] },
  });
  const result = await poller.pollUntilDone();
  if (result.status !== 'Succeeded') {
    throw new Error(`ACS send failed with status ${result.status}`);
  }
}

/** Minimal HTML escaping for values interpolated into mail bodies. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
