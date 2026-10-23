import "server-only";
import { env } from "@/lib/env";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SmsMessage {
  to: string;
  text: string;
}

export type DeliveryResult = { ok: true } | { ok: false; error: string };

/**
 * Generic transport so the pilot can use an institute SMTP relay or any HTTP email
 * provider without a code change. The payload is deliberately small: no student data.
 */
export async function sendEmail(message: EmailMessage): Promise<DeliveryResult> {
  const e = env();

  if (e.NOTIFY_WEBHOOK_URL) {
    try {
      const res = await fetch(e.NOTIFY_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(e.NOTIFY_WEBHOOK_TOKEN ? { authorization: `Bearer ${e.NOTIFY_WEBHOOK_TOKEN}` } : {}),
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `webhook_${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "webhook_failed" };
    }
  }

  if (e.NODE_ENV !== "production") {
    // Local/test fallback. Never log the body: it can name a staff recipient.
    console.info(`[notify] ${message.to}: ${message.subject}`);
    return { ok: true };
  }

  return { ok: false, error: "no_transport" };
}

export async function sendSms(message: SmsMessage): Promise<DeliveryResult> {
  const e = env();

  if (e.SMS_WEBHOOK_URL) {
    try {
      const res = await fetch(e.SMS_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(e.SMS_WEBHOOK_TOKEN ? { authorization: `Bearer ${e.SMS_WEBHOOK_TOKEN}` } : {}),
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok ? { ok: true } : { ok: false, error: `sms_webhook_${res.status}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "sms_webhook_failed" };
    }
  }

  if (e.NODE_ENV !== "production") {
    // Mask the number; never log the message body.
    console.info(`[notify:sms] to …${message.to.slice(-4)}`);
    return { ok: true };
  }

  return { ok: false, error: "no_sms_transport" };
}
