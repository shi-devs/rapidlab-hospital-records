import { env } from "cloudflare:workers";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords, labReportFiles, recordAudit } from "@/db/schema";
import { forbidden, logAudit, requireActiveMember, unauthorized } from "@/lib/access";
import { cleanValues, serializeLabRecord } from "@/lib/lab-records";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  if (staff.profile.membership.role === "viewer") return forbidden("Viewers cannot update patient records");
  const { id } = await context.params;
  const [existing] = await getDb().select().from(labRecords).where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, staff.profile.membership.hospitalId))).limit(1);
  if (!existing) return Response.json({ error: "Patient record not found" }, { status: 404 });
  try {
    const payload = await request.json() as { patientName?: string; patientAge?: string; values?: unknown; assignedToEmail?: string | null };
    const patientName = payload.patientName?.trim().slice(0, 120) ?? "";
    const ageText = payload.patientAge?.trim() ?? "";
    const values = cleanValues(payload.values);
    if (!patientName) return Response.json({ error: "Patient name is required" }, { status: 400 });
    const age = ageText && /^\d{1,3}$/.test(ageText) ? Number(ageText) : null;
    if (age !== null && (age < 0 || age > 130)) return Response.json({ error: "Enter a valid patient age" }, { status: 400 });
    const [updated] = await getDb().update(labRecords).set({
      patientName, patientAge: age, valuesJson: JSON.stringify(values),
      assignedToEmail: payload.assignedToEmail?.trim().toLowerCase() || existing.assignedToEmail,
      status: "pending", verifiedByEmail: null, verifiedAt: null, updatedAt: new Date(),
    }).where(eq(labRecords.id, id)).returning();
    await logAudit({ hospitalId: staff.profile.membership.hospitalId, recordId: id, actorEmail: staff.user.email, actorName: staff.profile.name, action: "record_updated", details: `Updated ${existing.patientCode}; verification reset to pending` });
    const reports = await getDb().select().from(labReportFiles)
      .where(and(eq(labReportFiles.recordId, id), eq(labReportFiles.hospitalId, staff.profile.membership.hospitalId)))
      .orderBy(asc(labReportFiles.createdAt));
    return Response.json({ record: serializeLabRecord(updated, reports) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update the patient record" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  if (staff.profile.membership.role === "viewer") return forbidden("Viewers cannot delete patient records");
  const { id } = await context.params;
  const hospitalId = staff.profile.membership.hospitalId;
  const db = getDb();
  const [record] = await db.select().from(labRecords)
    .where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))).limit(1);
  if (!record) return Response.json({ error: "Patient record not found" }, { status: 404 });

  try {
    const reports = await db.select().from(labReportFiles)
      .where(and(eq(labReportFiles.recordId, id), eq(labReportFiles.hospitalId, hospitalId)));
    const fileKeys = [record.reportFileKey, ...reports.map((report) => report.fileKey)].filter((key): key is string => Boolean(key));
    await db.batch([
      db.delete(labReportFiles).where(and(eq(labReportFiles.recordId, id), eq(labReportFiles.hospitalId, hospitalId))),
      db.delete(labRecords).where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))),
      db.insert(recordAudit).values({
        id: crypto.randomUUID(), recordId: id, hospitalId,
        actorEmail: staff.user.email, actorName: staff.profile.name,
        action: "record_deleted", details: `Deleted ${record.patientCode} for ${record.patientName} with ${fileKeys.length} report file${fileKeys.length === 1 ? "" : "s"}`,
        createdAt: new Date(),
      }),
    ]);
    const cleanup = await Promise.allSettled(fileKeys.map((key) => env.BUCKET.delete(key)));
    return Response.json({ ok: true, cleanupPending: cleanup.some((result) => result.status === "rejected") });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the patient record" }, { status: 500 });
  }
}
