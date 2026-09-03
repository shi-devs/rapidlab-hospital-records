import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { labRecords } from "@/db/schema";
import { requireActiveMember, unauthorized } from "@/lib/access";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const staff = await requireActiveMember();
  if (!staff) return unauthorized("An active hospital membership is required");
  const { id } = await context.params;
  const [record] = await getDb().select({ key: labRecords.reportFileKey, name: labRecords.reportFileName })
    .from(labRecords).where(and(eq(labRecords.id, id), eq(labRecords.hospitalId, staff.profile.membership.hospitalId))).limit(1);
  if (!record?.key) return Response.json({ error: "Scanned report not found" }, { status: 404 });
  const object = await env.BUCKET.get(record.key);
  if (!object) return Response.json({ error: "Scanned report file is unavailable" }, { status: 404 });
  const filename = encodeURIComponent(record.name || "lab-report");
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
