import { getConfig } from "./config";

/**
 * Envío de correo (reemplaza la lib email de CodeIgniter).
 * Si no hay SMTP configurado, el mensaje se registra en consola (modo demo).
 */
export async function sendMail(to: string, subject: string, message: string): Promise<void> {
  const cfg = getConfig();
  const host = process.env.BIBLEOL_SMTP_HOST;
  if (!host) {
    console.log(`[mail demo] to=${to} subject="${subject}"\n${message}`);
    return;
  }
  const { createTransport } = await import("nodemailer");
  const transport = createTransport({
    host,
    port: Number(process.env.BIBLEOL_SMTP_PORT ?? 587),
    secure: process.env.BIBLEOL_SMTP_SECURE === "true",
    auth: process.env.BIBLEOL_SMTP_USER
      ? { user: process.env.BIBLEOL_SMTP_USER, pass: process.env.BIBLEOL_SMTP_PASS }
      : undefined,
  });
  await transport.sendMail({
    from: `"${cfg.mail_sender_name}" <${cfg.mail_sender_address}>`,
    to,
    subject,
    text: message,
  });
}
