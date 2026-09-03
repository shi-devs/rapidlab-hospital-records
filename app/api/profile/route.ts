import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authAccounts, authSessions, emailVerificationChallenges, hospitalMembers, staffProfiles } from "@/db/schema";
import { getStaffContext, logAudit, requireActiveMember, unauthorized } from "@/lib/access";
import { clearSession } from "@/lib/auth";
import { sendAccountDeletedEmail } from "@/lib/email-verification";
import { ensureRecoverableWorkspaceReset } from "@/lib/workspace-reset";

export async function GET() {
  await ensureRecoverableWorkspaceReset();
  const context = await getStaffContext();
  if (!context) return unauthorized();
  return Response.json({ user: context.user, profile: context.profile ?? null });
}

export async function POST(request: Request) {
  const context = await getStaffContext();
  if (!context) return unauthorized();
  const user = context.user;
  try {
    const payload = await request.json() as { name?: string; staffId?: string };
    const name = payload.name?.trim().slice(0, 100) ?? "";
    const staffId = payload.staffId?.trim().toUpperCase().slice(0, 40) ?? "";
    if (name.length < 2) return Response.json({ error: "Enter your full name" }, { status: 400 });
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(staffId)) return Response.json({ error: "Use a valid staff ID with at least 3 letters or numbers" }, { status: 400 });
    const now = new Date();
    await getDb().insert(staffProfiles).values({ email: user.email, name, staffId, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({ target: staffProfiles.email, set: { name, staffId, updatedAt: now } }).returning();
    const updated = await getStaffContext();
    return Response.json({ profile: updated?.profile });
  } catch (error) {
    const message = error instanceof Error && /unique/i.test(error.message) ? "That staff ID is already registered" : "Could not create the staff profile";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const context = await requireActiveMember();
  if (!context) return unauthorized("An active hospital membership is required");
  const { membership } = context.profile;
  if (membership.role !== "nurse" && membership.role !== "doctor") {
    return Response.json({ error: "Only Nurse and Doctor accounts can delete themselves. Hospital Admin accounts are protected." }, { status: 403 });
  }

  const email = context.user.email;
  try {
    await logAudit({
      hospitalId: membership.hospitalId,
      actorEmail: email,
      actorName: context.profile.name,
      action: "member_self_deleted",
      details: `${context.profile.name} (${email}) deleted their staff account. Hospital patient records and reports retained.`,
    });

    const db = getDb();
    await db.batch([
      db.delete(authSessions).where(eq(authSessions.email, email)),
      db.delete(authAccounts).where(eq(authAccounts.email, email)),
      db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email)),
      db.delete(hospitalMembers).where(eq(hospitalMembers.email, email)),
      db.delete(staffProfiles).where(eq(staffProfiles.email, email)),
    ]);
    await clearSession();

    let emailSent = true;
    try {
      await sendAccountDeletedEmail(email, context.profile.name, membership.hospitalName);
    } catch (error) {
      emailSent = false;
      console.error("Account deleted but confirmation email failed", error instanceof Error ? error.message : error);
    }

    return Response.json({ ok: true, emailSent });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not delete the staff account" }, { status: 500 });
  }
}
