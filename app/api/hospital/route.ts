import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { hospitalMembers, hospitals } from "@/db/schema";
import { claimLegacyRecords, getStaffContext, logAudit, unauthorized } from "@/lib/access";

function makeCode() {
  return `HSP-${crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase()}`;
}

export async function POST(request: Request) {
  const context = await getStaffContext();
  if (!context?.profile) return unauthorized("Create your staff profile before joining a hospital");
  if (context.profile.membership) return Response.json({ error: "This account is already linked to a hospital" }, { status: 409 });

  try {
    const payload = await request.json() as { mode?: string; hospitalName?: string; hospitalCode?: string };
    const now = new Date();
    if (payload.mode === "create") {
      const name = payload.hospitalName?.trim().slice(0, 120) ?? "";
      if (name.length < 3) return Response.json({ error: "Enter the hospital or clinic name" }, { status: 400 });
      const hospitalId = crypto.randomUUID();
      const code = makeCode();
      await getDb().insert(hospitals).values({ id: hospitalId, name, code, createdByEmail: context.user.email, createdAt: now });
      await getDb().insert(hospitalMembers).values({ email: context.user.email, hospitalId, role: "admin", status: "active", joinedAt: now, approvedAt: now, approvedByEmail: context.user.email });
      await claimLegacyRecords(context.user.email, hospitalId);
      await logAudit({ hospitalId, actorEmail: context.user.email, actorName: context.profile.name, action: "hospital_created", details: `Created ${name} and became Hospital Admin` });
    } else if (payload.mode === "join") {
      const code = payload.hospitalCode?.trim().toUpperCase() ?? "";
      const [hospital] = await getDb().select().from(hospitals).where(eq(hospitals.code, code)).limit(1);
      if (!hospital) return Response.json({ error: "Hospital code not found. Check the code with your administrator." }, { status: 404 });
      await getDb().insert(hospitalMembers).values({ email: context.user.email, hospitalId: hospital.id, role: "nurse", status: "pending", joinedAt: now });
      await logAudit({ hospitalId: hospital.id, actorEmail: context.user.email, actorName: context.profile.name, action: "join_requested", details: "Requested access as a Nurse" });
    } else {
      return Response.json({ error: "Choose whether to create or join a hospital" }, { status: 400 });
    }

    const updated = await getStaffContext();
    return Response.json({ profile: updated?.profile });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "That hospital code or membership already exists" : "Could not set up the hospital workspace";
    return Response.json({ error: message }, { status: 500 });
  }
}
