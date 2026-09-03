import { env } from "cloudflare:workers";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords, labReportFiles } from "@/db/schema";
import { forbidden, logAudit, requireActiveMember, unauthorized } from "@/lib/access";
import { cleanValues, serializeLabRecord, validateReportFiles } from "@/lib/lab-records";

export async function GET() {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  try {
    const db = getDb();
    const hospitalId = context.profile.membership.hospitalId;
    const [rows, reportRows] = await Promise.all([
      db.select().from(labRecords).where(eq(labRecords.hospitalId, hospitalId)).orderBy(desc(labRecords.createdAt)).limit(200),
      db.select().from(labReportFiles).where(eq(labReportFiles.hospitalId, hospitalId)).orderBy(asc(labReportFiles.createdAt)),
    ]);
    const reportsByRecord = new Map<string, Array<typeof labReportFiles.$inferSelect>>();
    for (const report of reportRows) reportsByRecord.set(report.recordId, [...(reportsByRecord.get(report.recordId) ?? []), report]);
    return Response.json({ records: rows.map((row) => serializeLabRecord(row, reportsByRecord.get(row.id))) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load records" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  if (context.profile.membership.role === "viewer") return forbidden("Viewers cannot create patient records");
  const ownerEmail = context.user.email;
  const uploadedKeys: string[] = [];
  let createdRecordId: string | null = null;
  try {
    const form = await request.formData();
    const patientName = String(form.get("patientName") ?? "").trim().slice(0, 120);
    const ageText = String(form.get("patientAge") ?? "").trim();
    const source = form.get("source") === "Scan / upload" ? "Scan / upload" : "Manual";
    const values = cleanValues(JSON.parse(String(form.get("values") ?? "{}")));
    const reports = [...form.getAll("reports"), form.get("report")]
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (!patientName) return Response.json({ error: "Patient name is required" }, { status: 400 });
    const fileError = validateReportFiles(reports);
    if (fileError) return Response.json({ error: fileError }, { status: 400 });
    const age = ageText && /^\d{1,3}$/.test(ageText) ? Number(ageText) : null;
    if (age !== null && (age < 0 || age > 130)) return Response.json({ error: "Enter a valid patient age" }, { status: 400 });

    const id = crypto.randomUUID();
    const patientCode = `PT-${id.replaceAll("-", "").slice(0, 5).toUpperCase()}`;
    const now = new Date();
    const storedReports: Array<typeof labReportFiles.$inferInsert> = [];
    for (const report of reports) {
      const reportId = crypto.randomUUID();
      const fileName = report.name.slice(0, 180) || "lab-report";
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "-");
      const fileKey = `reports/${id}/${reportId}-${safeName}`;
      await env.BUCKET.put(fileKey, await report.arrayBuffer(), { httpMetadata: { contentType: report.type } });
      uploadedKeys.push(fileKey);
      storedReports.push({ id: reportId, recordId: id, hospitalId: context.profile.membership.hospitalId, fileKey, fileName, contentType: report.type, uploadedByEmail: context.user.email, createdAt: now });
    }

    const [row] = await getDb().insert(labRecords).values({
      id, patientCode, patientName, patientAge: age, source,
      valuesJson: JSON.stringify(values), ownerEmail, hospitalId: context.profile.membership.hospitalId,
      createdByEmail: context.user.email, status: "pending", updatedAt: now, createdAt: now,
    }).returning();
    createdRecordId = id;
    if (storedReports.length) await getDb().insert(labReportFiles).values(storedReports);
    await logAudit({ hospitalId: context.profile.membership.hospitalId, recordId: id, actorEmail: context.user.email, actorName: context.profile.name, action: "record_created", details: `Created ${patientCode} for ${patientName} using ${source} with ${reports.length} report file${reports.length === 1 ? "" : "s"}` });
    return Response.json({ record: serializeLabRecord(row, storedReports as Array<typeof labReportFiles.$inferSelect>) }, { status: 201 });
  } catch (error) {
    await Promise.all(uploadedKeys.map((key) => env.BUCKET.delete(key).catch(() => undefined)));
    if (createdRecordId) await getDb().delete(labRecords).where(eq(labRecords.id, createdRecordId)).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Could not save record" }, { status: 500 });
  }
}
