import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { authAccounts, emailVerificationChallenges, staffProfiles } from "@/db/schema";
import { isValidEmail, makePasswordCredential, normalizeEmail, validatePassword } from "@/lib/auth";
import { createCodeSalt, createVerificationCode, hashVerificationCode, sendVerificationEmail, verificationTimes } from "@/lib/email-verification";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { name?: string; staffId?: string; email?: string; password?: string };
    const name = payload.name?.trim().replace(/\s+/g, " ").slice(0, 100) ?? "";
    const staffId = payload.staffId?.trim().toUpperCase().slice(0, 40) ?? "";
    const email = normalizeEmail(payload.email ?? "");
    const password = payload.password ?? "";

    if (name.length < 2) return Response.json({ error: "Enter your full name" }, { status: 400 });
    if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(staffId)) return Response.json({ error: "Use a valid staff ID with at least 3 letters or numbers" }, { status: 400 });
    if (!isValidEmail(email)) return Response.json({ error: "Enter a valid email address" }, { status: 400 });
    const passwordError = validatePassword(password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });

    const db = getDb();
    const [account, profile, staffIdOwner, existingChallenge] = await Promise.all([
      db.select({ email: authAccounts.email }).from(authAccounts).where(eq(authAccounts.email, email)).limit(1),
      db.select().from(staffProfiles).where(eq(staffProfiles.email, email)).limit(1),
      db.select({ email: staffProfiles.email }).from(staffProfiles).where(eq(staffProfiles.staffId, staffId)).limit(1),
      db.select({ resendAfter: emailVerificationChallenges.resendAfter }).from(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email)).limit(1),
    ]);
    if (account[0]) return Response.json({ error: "An account already exists for this email. Sign in instead." }, { status: 409 });
    if (staffIdOwner[0] && normalizeEmail(staffIdOwner[0].email) !== email) return Response.json({ error: "That staff ID is already registered" }, { status: 409 });
    if (profile[0] && profile[0].staffId.toUpperCase() !== staffId) {
      return Response.json({ error: "To activate this existing profile, enter its original Staff ID" }, { status: 403 });
    }

    const now = new Date();
    if (existingChallenge[0]?.resendAfter && existingChallenge[0].resendAfter > now) {
      const retryAfter = Math.max(1, Math.ceil((existingChallenge[0].resendAfter.getTime() - now.getTime()) / 1000));
      return Response.json({ error: `Please wait ${retryAfter} seconds before requesting another code`, retryAfter }, { status: 429 });
    }

    const credential = await makePasswordCredential(password);
    const code = createVerificationCode();
    const codeSalt = createCodeSalt();
    const codeHash = await hashVerificationCode(email, code, codeSalt);
    const times = verificationTimes(now);
    await db.insert(emailVerificationChallenges).values({
      email, name, staffId, ...credential, codeHash, codeSalt, attempts: 0,
      ...times, createdAt: now,
    }).onConflictDoUpdate({
      target: emailVerificationChallenges.email,
      set: { name, staffId, ...credential, codeHash, codeSalt, attempts: 0, ...times, createdAt: now },
    });

    try {
      await sendVerificationEmail(email, name, code);
    } catch (error) {
      await db.delete(emailVerificationChallenges).where(eq(emailVerificationChallenges.email, email));
      throw error;
    }

    return Response.json({ verificationRequired: true, email, expiresInMinutes: 10 }, { status: 202 });
  } catch (error) {
    console.error("Signup verification request failed", error instanceof Error ? error.message : error);
    const message = error instanceof Error && /unique/i.test(error.message)
      ? "That email or Staff ID is already registered"
      : error instanceof Error && /Verification email could not be sent|Email delivery is not configured/.test(error.message)
        ? "Could not send the verification email. Please try again shortly."
        : "Could not start email verification. Please try again.";
    return Response.json({ error: message }, { status: 500 });
  }
}
