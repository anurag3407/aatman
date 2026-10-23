"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { cancelSlotAsStaff, createSlots } from "@/lib/services/booking";
import { updateContactRequestStatus } from "@/lib/services/contactRequests";

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
  });
  revalidatePath("/counsellor/slots");
}

export async function cancelSlotAction(formData: FormData) {
  const actor = await requireCounsellor();
  const id = z.uuid().parse(formData.get("id"));
  await cancelSlotAsStaff(id, actor);
  revalidatePath("/counsellor/slots");
}
