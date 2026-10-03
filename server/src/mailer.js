import nodemailer from 'nodemailer';
import { loadOptions } from './bootstrap.js';

const SEND_TIMEOUT_MS = 15000;

/** Normalised mail settings from the add-on options, or null when SMTP isn't fully configured. */
export function readMailConfig(options = loadOptions()) {
  const host = String(options.smtp_host || '').trim();
  const user = String(options.smtp_user || '').trim();
  const password = String(options.smtp_password || '');
  const from = String(options.smtp_from || user || '').trim();
  const port = Number(options.smtp_port) || 465;
  if (!host || !user || !password || !from) return null;

  const publicUrl = String(options.public_url || '').trim().replace(/\/+$/, '');
  return {
    host,
    port,
    user,
    password,
    from,
    // Only http(s) ends up in an email body.
    publicUrl: /^https?:\/\/[^\s]+$/i.test(publicUrl) ? publicUrl : null,
    adminEmail: String(options.admin_email || '').trim() || null,
  };
}

/**
 * Builds the single shared transporter. Port 465 uses implicit TLS; anything else must upgrade to
 * TLS before credentials are sent (requireTLS), so a misconfigured port can't downgrade to
 * plaintext. Short timeouts keep a hung SMTP server from stalling the reminder scheduler.
 */
export function createMailer(config) {
  if (!config) return null;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  return {
    config,
    async send({ to, subject, text }) {
      await transporter.sendMail({ from: config.from, to, subject, text });
    },
  };
}
