import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords, labReportFiles, recordAudit } from "@/db/schema";
import { forbidden, requireActiveMember, unauthorized } from "@/lib/access";

export async function GET(_request: Request, context: { params: Promise<{ id: string; reportId: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  const { id, reportId } = await context.params;
  const [report] = await getDb().select().from(labReportFiles).where(and(
    eq(labReportFiles.id, reportId),
    eq(labReportFiles.recordId, id),
    eq(labReportFiles.hospitalId, staff.profile.membership.hospitalId),
  )).limit(1);
  if (!report) return Response.json({ error: "Scanned report not found" }, { status: 404 });
  const object = await env.BUCKET.get(report.fileKey);
  if (!object) return Response.json({ error: "Scanned report file is unavailable" }, { status: 404 });
  const filename = encodeURIComponent(report.fileName || "lab-report");
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || report.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; reportId: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  if (staff.profile.membership.role === "viewer") return forbidden("Viewers cannot delete patient reports");
  const { id, reportId } = await context.params;
  const hospitalId = staff.profile.membership.hospitalId;
  const db = getDb();
  const [record] = await db.select().from(labRecords)
    .where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))).limit(1);
  if (!record) return Response.json({ error: "Patient record not found" }, { status: 404 });

  try {
    const now = new Date();
    let fileKey: string;
    let fileName: string;
    if (reportId === "legacy") {
      if (!record.reportFileKey) return Response.json({ error: "Lab report not found" }, { status: 404 });
      fileKey = record.reportFileKey;
      fileName = record.reportFileName || "lab-report";
      await db.batch([
        db.update(labRecords).set({ reportFileKey: null, reportFileName: null, status: "pending", verifiedByEmail: null, verifiedAt: null, updatedAt: now })
          .where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))),
        db.insert(recordAudit).values({
          id: crypto.randomUUID(), recordId: id, hospitalId,
          actorEmail: staff.user.email, actorName: staff.profile.name,
          action: "report_deleted", details: `Deleted report ${fileName} from ${record.patientCode}`,
          createdAt: now,
        }),
      ]);
    } else {
      const [report] = await db.select().from(labReportFiles).where(and(
        eq(labReportFiles.id, reportId), eq(labReportFiles.recordId, id), eq(labReportFiles.hospitalId, hospitalId),
      )).limit(1);
      if (!report) return Response.json({ error: "Lab report not found" }, { status: 404 });
      fileKey = report.fileKey;
      fileName = report.fileName;
      await db.batch([
        db.delete(labReportFiles).where(and(eq(labReportFiles.id, reportId), eq(labReportFiles.recordId, id), eq(labReportFiles.hospitalId, hospitalId))),
        db.update(labRecords).set({ status: "pending", verifiedByEmail: null, verifiedAt: null, updatedAt: now })
          .where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))),
        db.insert(recordAudit).values({
          id: crypto.randomUUID(), recordId: id, hospitalId,
          actorEmail: staff.user.email, actorName: staff.profile.name,
          action: "report_deleted", details: `Deleted report ${fileName} from ${record.patientCode}`,
          createdAt: now,
        }),
      ]);
    }
    let cleanupPending = false;
    try { await env.BUCKET.delete(fileKey); } catch { cleanupPending = true; }
    return Response.json({ ok: true, status: "pending", updatedAt: now.toISOString(), cleanupPending });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the lab report" }, { status: 500 });
  }
}
