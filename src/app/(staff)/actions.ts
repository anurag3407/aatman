"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { acknowledgeAlert, createOnCallShift, resolveAlert } from "@/lib/services/alerts";
import { cancelSlotAsStaff, createSlots, markAttendance } from "@/lib/services/booking";
import { updateContactRequestStatus } from "@/lib/services/contactRequests";
import { upsertCounsellor } from "@/lib/services/counsellors";

async function requireCounsellor(): Promise<string> {
  const session = await getSession();
  if (session?.role !== "counsellor" || !session.email) redirect("/signin");
  return session.email;
}

export async function setRequestStatus(formData: FormData) {
  const actor = await requireCounsellor();
  const { id, status } = z
    .object({ id: z.uuid(), status: z.enum(["new", "contacted", "closed"]) })
    .parse({ id: formData.get("id"), status: formData.get("status") });
  await updateContactRequestStatus(id, status, actor);
  revalidatePath("/counsellor");
  revalidatePath(`/counsellor/requests/${id}`);
}

const slotForm = z.object({
  // <input type="datetime-local"> has no zone; the campus is in IST.
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  duration: z.coerce.number().int().min(15).max(120),
  perDay: z.coerce.number().int().min(1).max(12),
  weeks: z.coerce.number().int().min(1).max(12),
  location: z.string().trim().min(1).max(120),
  mode: z.enum(["in_person", "phone", "video"]),
  // An unticked checkbox is absent from the form data entirely.
  isUrgent: z.string().optional().transform((v) => v === "on"),
});

export async function createSlotsAction(formData: FormData) {
  const actor = await requireCounsellor();
  const f = slotForm.parse(Object.fromEntries(formData));
  const firstStart = new Date(`${f.start}:00+05:30`);
  await createSlots(actor, {
    firstStart,
    durationMinutes: f.duration,
    perDay: f.perDay,
    weeks: f.weeks,
    location: f.location,
    mode: f.mode,
    isUrgent: f.isUrgent,
  });
  revalidatePath("/counsellor/slots");
}

const profileForm = z.object({
  displayName: z.string().trim().min(1).max(80),
  languages: z.string().trim().max(160),
  bio: z.string().trim().max(600).optional(),
});

export async function upsertProfileAction(formData: FormData) {
  const actor = await requireCounsellor();
  const f = profileForm.parse({
    displayName: formData.get("displayName"),
    languages: formData.get("languages") ?? "",
    bio: formData.get("bio") || undefined,
  });
  await upsertCounsellor({ email: actor, ...f }, actor);
  revalidatePath("/counsellor/slots");
  revalidatePath("/book");
}

export async function markAttendanceAction(formData: FormData) {
  const actor = await requireCounsellor();
  const { id, attended } = z
    .object({ id: z.uuid(), attended: z.enum(["yes", "no"]) })
    .parse({ id: formData.get("id"), attended: formData.get("attended") });
  await markAttendance(id, actor, attended === "yes");
  revalidatePath("/counsellor");
  revalidatePath(`/counsellor/bookings/${id}`);
}

export async function cancelSlotAction(formData: FormData) {
  const actor = await requireCounsellor();
  const id = z.uuid().parse(formData.get("id"));
  await cancelSlotAsStaff(id, actor);
  revalidatePath("/counsellor/slots");
}

export async function acknowledgeAlertAction(formData: FormData) {
  const actor = await requireCounsellor();
  const { id } = z.object({ id: z.uuid() }).parse({ id: formData.get("id") });
  await acknowledgeAlert(id, actor);
  revalidatePath("/counsellor/alerts");
  revalidatePath(`/counsellor/alerts/${id}`);
}

export async function resolveAlertAction(formData: FormData) {
  const actor = await requireCounsellor();
  const { id, note } = z
    .object({ id: z.uuid(), note: z.string().max(2_000).optional() })
    .parse({ id: formData.get("id"), note: formData.get("note") || undefined });
  await resolveAlert(id, actor, note);
  revalidatePath("/counsellor/alerts");
  revalidatePath(`/counsellor/alerts/${id}`);
}

const onCallForm = z.object({
  staffEmail: z.email(),
  role: z.enum(["counsellor", "clinical_lead"]),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  backupEmail: z.union([z.email(), z.literal("")]).optional(),
});

export async function createOnCallAction(formData: FormData) {
  const actor = await requireCounsellor();
  const f = onCallForm.parse(Object.fromEntries(formData));
  await createOnCallShift(
    {
      staffEmail: f.staffEmail,
      role: f.role,
      startsAt: new Date(`${f.start}:00+05:30`),
      endsAt: new Date(`${f.end}:00+05:30`),
      backupEmail: f.backupEmail || undefined,
    },
    actor,
  );
  revalidatePath("/counsellor/alerts");
}
