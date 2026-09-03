import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { recordAudit } from "@/db/schema";
import { requireActiveMember, unauthorized } from "@/lib/access";

export async function GET() {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  const rows = await getDb().select().from(recordAudit)
    .where(eq(recordAudit.hospitalId, context.profile.membership.hospitalId))
    .orderBy(desc(recordAudit.createdAt)).limit(100);
  return Response.json({ activity: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) });
}
