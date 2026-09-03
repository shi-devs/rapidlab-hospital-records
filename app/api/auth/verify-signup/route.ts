import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authAccounts, emailVerificationChallenges, staffProfiles } from "@/db/schema";
import { createSession, isValidEmail, normalizeEmail } from "@/lib/auth";
import { getStaffContextForEmail } from "@/lib/access";
import { hashVerificationCode, verificationCodeMatches } from "@/lib/email-verification";

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { email?: string; code?: string };
    const email = normalizeEmail(payload.email ?? "");
    const code = payload.code?.trim() ?? "";
    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return Response.json({ error: "Enter the 6-digit code from your email" }, { status: 400 });
    }

    const db = getDb();
    const [challenge] = await db.select().from(emailVerificationChallenges)
      .where(eq(emailVerificationChallenges.email, email)).limit(1);
    if (!challenge) return Response.json({ error: "Request a new verification code" }, { status: 404 });

    const now = new Date();
    if (challenge.expiresAt <= now) {
      await db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email));
      return Response.json({ error: "This code has expired. Request a new code." }, { status: 410 });
    }
    if (challenge.attempts >= MAX_ATTEMPTS) {
      await db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email));
      return Response.json({ error: "Too many incorrect attempts. Request a new code." }, { status: 429 });
    }

    const candidate = await hashVerificationCode(email, code, challenge.codeSalt);
    if (!verificationCodeMatches(candidate, challenge.codeHash)) {
      const attempts = challenge.attempts + 1;
      await db.update(emailVerificationChallenges).set({ attempts })
        .where(eq(emailVerificationChallenges.email, email));
      const remaining = MAX_ATTEMPTS - attempts;
      return Response.json({ error: remaining > 0 ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Request a new code." }, { status: 400 });
    }

    const [account, profile, staffIdOwner] = await Promise.all([
      db.select({ email: authAccounts.email }).from(authAccounts).where(eq(authAccounts.email, email)).limit(1),
      db.select().from(staffProfiles).where(eq(staffProfiles.email, email)).limit(1),
      db.select({ email: staffProfiles.email }).from(staffProfiles).where(eq(staffProfiles.staffId, challenge.staffId)).limit(1),
    ]);
    if (account[0]) {
      await db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email));
      return Response.json({ error: "An account already exists for this email. Sign in instead." }, { status: 409 });
    }
    if (staffIdOwner[0] && normalizeEmail(staffIdOwner[0].email) !== email) {
      return Response.json({ error: "That staff ID is already registered" }, { status: 409 });
    }
    if (profile[0] && profile[0].staffId.toUpperCase() !== challenge.staffId) {
      return Response.json({ error: "This profile no longer matches the supplied Staff ID" }, { status: 403 });
    }

    const accountValues = {
      email,
      passwordHash: challenge.passwordHash,
      passwordSalt: challenge.passwordSalt,
      passwordIterations: challenge.passwordIterations,
      createdAt: now,
      updatedAt: now,
    };
    if (profile[0]) {
      await db.batch([
        db.insert(authAccounts).values(accountValues),
        db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email)),
      ]);
    } else {
      await db.batch([
        db.insert(staffProfiles).values({ email, name: challenge.name, staffId: challenge.staffId, createdAt: now, updatedAt: now }),
        db.insert(authAccounts).values(accountValues),
        db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email)),
      ]);
    }

    await createSession(email);
    const context = await getStaffContextForEmail(email);
    return Response.json({ user: context.user, profile: context.profile }, { status: 201 });
  } catch (error) {
    console.error("Signup verification failed", error instanceof Error ? error.message : error);
    const message = error instanceof Error && /unique/i.test(error.message)
      ? "That email or Staff ID is already registered"
      : "Could not verify the account. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
