import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authAccounts, authSessions, emailVerificationChallenges, hospitalMembers, hospitals, staffProfiles } from "@/db/schema";
import { claimLegacyRecords, forbidden, logAudit, requireActiveMember, StaffRole, unauthorized } from "@/lib/access";
import { sendAccessRemovedEmail } from "@/lib/email-verification";

const ROLES: StaffRole[] = ["nurse", "doctor", "admin", "viewer"];

export async function GET() {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  const rows = await getDb().select({
    email: hospitalMembers.email,
    role: hospitalMembers.role,
    status: hospitalMembers.status,
    joinedAt: hospitalMembers.joinedAt,
    name: staffProfiles.name,
    staffId: staffProfiles.staffId,
  }).from(hospitalMembers).innerJoin(staffProfiles, eq(staffProfiles.email, hospitalMembers.email))
    .where(eq(hospitalMembers.hospitalId, context.profile.membership.hospitalId)).orderBy(desc(hospitalMembers.joinedAt));
  return Response.json({ members: rows.map((row) => ({ ...row, joinedAt: row.joinedAt.toISOString() })) });
}

export async function PATCH(request: Request) {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  if (context.profile.membership.role !== "admin") return forbidden("Only Hospital Admins can manage staff access");
  try {
    const payload = await request.json() as { email?: string; role?: StaffRole; status?: "active" | "inactive" };
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (!email || !payload.role || !ROLES.includes(payload.role) || !payload.status) return Response.json({ error: "Choose a valid staff role and status" }, { status: 400 });
    if (email === context.user.email && (payload.role !== "admin" || payload.status !== "active")) return Response.json({ error: "You cannot remove your own Hospital Admin access" }, { status: 400 });
    const [member] = await getDb().select().from(hospitalMembers).where(eq(hospitalMembers.email, email)).limit(1);
    if (!member || member.hospitalId !== context.profile.membership.hospitalId) return Response.json({ error: "Staff member not found in this hospital" }, { status: 404 });
    const [creatorHospital] = await getDb().select({ id: hospitals.id }).from(hospitals)
      .where(and(eq(hospitals.id, member.hospitalId), eq(hospitals.createdByEmail, email))).limit(1);
    if (creatorHospital && (payload.role !== "admin" || payload.status !== "active")) return Response.json({ error: "The hospital creator must remain an active Hospital Admin" }, { status: 400 });
    const approving = member.status === "pending" && payload.status === "active";
    await getDb().update(hospitalMembers).set({
      role: payload.role,
      status: payload.status,
      approvedAt: approving ? new Date() : member.approvedAt,
      approvedByEmail: approving ? context.user.email : member.approvedByEmail,
    }).where(eq(hospitalMembers.email, email));
    if (approving) await claimLegacyRecords(email, member.hospitalId);
    await logAudit({ hospitalId: member.hospitalId, actorEmail: context.user.email, actorName: context.profile.name, action: approving ? "member_approved" : "member_updated", details: `${email} set to ${payload.role} · ${payload.status}` });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update staff access" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  if (context.profile.membership.role !== "admin") return forbidden("Only Hospital Admins can remove staff accounts");
  try {
    const payload = await request.json() as { email?: string };
    const email = payload.email?.trim().toLowerCase() ?? "";
    if (!email) return Response.json({ error: "Choose a staff member to remove" }, { status: 400 });
    if (email === context.user.email) return Response.json({ error: "You cannot remove your own Hospital Admin account" }, { status: 400 });

    const db = getDb();
    const [member] = await db.select({
      email: hospitalMembers.email,
      hospitalId: hospitalMembers.hospitalId,
      name: staffProfiles.name,
    }).from(hospitalMembers).innerJoin(staffProfiles, eq(staffProfiles.email, hospitalMembers.email))
      .where(eq(hospitalMembers.email, email)).limit(1);
    if (!member || member.hospitalId !== context.profile.membership.hospitalId) {
      return Response.json({ error: "Staff member not found in this hospital" }, { status: 404 });
    }

    const [creatorHospital] = await db.select({ id: hospitals.id }).from(hospitals)
      .where(and(eq(hospitals.id, member.hospitalId), eq(hospitals.createdByEmail, email))).limit(1);
    if (creatorHospital) return Response.json({ error: "The hospital creator account cannot be removed" }, { status: 400 });

    await db.batch([
      db.delete(authSessions).where(eq(authSessions.email, email)),
      db.delete(authAccounts).where(eq(authAccounts.email, email)),
      db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email)),
      db.delete(hospitalMembers).where(eq(hospitalMembers.email, email)),
    ]);

    await logAudit({
      hospitalId: member.hospitalId,
      actorEmail: context.user.email,
      actorName: context.profile.name,
      action: "member_removed",
      details: `${member.name} (${email}) removed. Login revoked; hospital patient records retained.`,
    });

    let emailSent = true;
    try {
      await sendAccessRemovedEmail(email, member.name, context.profile.membership.hospitalName);
    } catch (error) {
      emailSent = false;
      console.error("Staff removal completed but notification failed", error instanceof Error ? error.message : error);
    }
    return Response.json({ ok: true, emailSent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not remove staff account" }, { status: 500 });
  }
}
