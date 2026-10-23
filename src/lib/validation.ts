import { z } from "zod";

const likert4 = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).nullable();
const yesNo = z.boolean().nullable();

export const checkinBody = z.object({
  answers: z.object({
    phq9: z.array(likert4).length(9),
    gad7: z.array(likert4).length(7),
    cssrs: z
      .object({
        wishToBeDead: yesNo,
        activeThoughts: yesNo,
        method: yesNo.optional(),
        intent: yesNo.optional(),
        planWithIntent: yesNo.optional(),
        behavior: z.enum(["never", "over_3_months_ago", "within_3_months"]).nullable(),
      })
      .optional(),
    freeText: z.array(z.string().max(4000)).max(1).optional(),
  }),
  campus: z.object({
    sleep: likert4,
    academics: likert4,
    safety: z.enum(["no", "yes", "prefer_not"]).nullable(),
  }),
  locale: z.enum(["en", "hi"]),
});

const phone = z
  .string()
  .trim()
  .max(20)
  .regex(/^[+\d][\d\s-]{6,18}$/, "invalid phone");

export const contactBody = z
  .object({
    checkinId: z.uuid().optional(),
    name: z.string().trim().max(60).optional(),
    phone: phone.optional().or(z.literal("")),
    email: z.email().max(120).optional().or(z.literal("")),
    bestTime: z.string().trim().max(80).optional(),
    consent: z.literal(true),
  })
  .refine((b) => Boolean(b.phone || b.email), { message: "phone or email required" });

export const bookBody = z.object({
  share: z.boolean(),
  phone: phone.optional().or(z.literal("")),
});

export const chatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(40),
  locale: z.enum(["en", "hi"]),
});

export const keepBody = z.object({ keep: z.boolean() });
