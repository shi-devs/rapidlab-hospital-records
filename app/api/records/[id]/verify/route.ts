import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords } from "@/db/schema";
import { forbidden, logAudit, requireActiveMember, unauthorized } from "@/lib/access";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  if (!(["doctor", "admin"] as string[]).includes(staff.profile.membership.role)) return forbidden("Only Doctors, Supervisors, or Hospital Admins can verify records");
  const { id } = await context.params;
  const [record] = await getDb().select().from(labRecords).where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, staff.profile.membership.hospitalId))).limit(1);
  if (!record) return Response.json({ error: "Patient record not found" }, { status: 404 });
  const now = new Date();
  await getDb().update(labRecords).set({ status: "verified", verifiedByEmail: staff.user.email, verifiedAt: now, updatedAt: now }).where(eq(labRecords.id, id));
  await logAudit({ hospitalId: staff.profile.membership.hospitalId, recordId: id, actorEmail: staff.user.email, actorName: staff.profile.name, action: "record_verified", details: `Verified ${record.patientCode} for ${record.patientName}` });
  return Response.json({ status: "verified", verifiedByEmail: staff.user.email, verifiedAt: now.toISOString(), updatedAt: now.toISOString() });
}
