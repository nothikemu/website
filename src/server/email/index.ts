import "server-only";
import { env } from "@/server/env";
import { logger } from "@/server/observability/logger";
import type { Transporter } from "nodemailer";

export type Email = { to: string; subject: string; text: string };

/**
 * Email delivery behind a driver interface. "console" logs messages (local dev,
 * tests), "smtp" uses nodemailer. Add Resend/Postmark/SES by implementing Mailer.
 */
interface Mailer {
  send(email: Email): Promise<void>;
}

const outbox: Email[] = [];
/** Test helper: messages captured by the console driver. */
export const sentEmails = () => outbox;

class ConsoleMailer implements Mailer {
  async send(email: Email) {
    outbox.push(email);
    if (outbox.length > 100) outbox.shift();
    logger.info("email.console", { to: email.to, subject: email.subject, text: email.text });
    // Portable desktop build: emails aren't sent, so show them in the console window.
    if (process.env.FORGEBASE_SEED_AS_LIBRARY && process.env.NODE_ENV === "production")
      console.log(`\n  ✉  Email to ${email.to}: ${email.subject}\n${email.text.replace(/^/gm, "     ")}\n`);
  }
}

class SmtpMailer implements Mailer {
  private transport: Promise<Transporter>;
  constructor(url: string) {
    this.transport = import("nodemailer").then((m) => m.createTransport(url));
  }
  async send(email: Email) {
    const t = await this.transport;
    await t.sendMail({ from: env().EMAIL_FROM, to: email.to, subject: email.subject, text: email.text });
  }
}

let mailer: Mailer | undefined;
function getMailer(): Mailer {
  mailer ??= env().EMAIL_DRIVER === "smtp" ? new SmtpMailer(env().SMTP_URL!) : new ConsoleMailer();
  return mailer;
}

export async function sendEmail(email: Email) {
  try {
    await getMailer().send(email);
  } catch (err) {
    logger.error("email.failed", { to: email.to, subject: email.subject, error: (err as Error).message });
  }
}

export const templates = {
  verify: (name: string, url: string): Omit<Email, "to"> => ({
    subject: "Verify your Forgebase email",
    text: `Hi ${name},\n\nConfirm your email address to finish setting up Forgebase:\n\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, ignore this message.\n\n— Forgebase`,
  }),
  reset: (name: string, url: string): Omit<Email, "to"> => ({
    subject: "Reset your Forgebase password",
    text: `Hi ${name},\n\nSomeone (hopefully you) asked to reset your Forgebase password:\n\n${url}\n\nThis link expires in 1 hour and can be used once. If you didn't request it, you can ignore this email.\n\n— Forgebase`,
  }),
  invite: (org: string, inviter: string, role: string, url: string): Omit<Email, "to"> => ({
    subject: `${inviter} invited you to ${org} on Forgebase`,
    text: `${inviter} invited you to join ${org} as ${role === "admin" ? "an" : "a"} ${role}.\n\nAccept the invitation:\n\n${url}\n\nThis invitation expires in 7 days.\n\n— Forgebase`,
  }),
  notification: (title: string, body: string | null | undefined, url: string): Omit<Email, "to"> => ({
    subject: title,
    text: `${title}\n\n${body ?? ""}\n\nOpen in Forgebase: ${url}\n\nManage notification settings: ${env().APP_URL}/settings/notifications`,
  }),
};
