import { env } from "cloudflare:workers";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords, labReportFiles } from "@/db/schema";
import { forbidden, logAudit, requireActiveMember, unauthorized } from "@/lib/access";
import { validateReportFiles } from "@/lib/lab-records";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  if (staff.profile.membership.role === "viewer") return forbidden("Viewers cannot add patient reports");
  const { id } = await context.params;
  const hospitalId = staff.profile.membership.hospitalId;
  const [record] = await getDb().select().from(labRecords)
    .where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, hospitalId))).limit(1);
  if (!record) return Response.json({ error: "Patient record not found" }, { status: 404 });

  const uploadedKeys: string[] = [];
  const insertedIds: string[] = [];
  try {
    const form = await request.formData();
    const reports = form.getAll("reports").filter((value): value is File => value instanceof File && value.size > 0);
    if (!reports.length) return Response.json({ error: "Choose at least one report file" }, { status: 400 });
    const fileError = validateReportFiles(reports);
    if (fileError) return Response.json({ error: fileError }, { status: 400 });

    const now = new Date();
    const storedReports: Array<typeof labReportFiles.$inferInsert> = [];
    for (const report of reports) {
      const reportId = crypto.randomUUID();
      const fileName = report.name.slice(0, 180) || "lab-report";
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const fileKey = `reports/${id}/${reportId}-${safeName}`;
      await env.BUCKET.put(fileKey, await report.arrayBuffer(), { httpMetadata: { contentType: report.type } });
      uploadedKeys.push(fileKey);
      insertedIds.push(reportId);
      storedReports.push({ id: reportId, recordId: id, hospitalId, fileKey, fileName, contentType: report.type, uploadedByEmail: staff.user.email, createdAt: now });
    }

    await getDb().insert(labReportFiles).values(storedReports);
    await getDb().update(labRecords).set({ source: "Scan / upload", status: "pending", verifiedByEmail: null, verifiedAt: null, updatedAt: now }).where(eq(labRecords.id, id));
    await logAudit({ hospitalId, recordId: id, actorEmail: staff.user.email, actorName: staff.profile.name, action: "reports_added", details: `Added ${reports.length} report file${reports.length === 1 ? "" : "s"} to ${record.patientCode}` });
    return Response.json({
      reports: storedReports.map((report) => ({ id: report.id, fileName: report.fileName, url: `/api/records/${id}/reports/${report.id}`, uploadedAt: now.toISOString() })),
      status: "pending",
      updatedAt: now.toISOString(),
    }, { status: 201 });
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => env.BUCKET.delete(key).catch(() => undefined)));
    if (insertedIds.length) await getDb().delete(labReportFiles).where(inArray(labReportFiles.id, insertedIds)).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not add the report files" }, { status: 500 });
  }
}
