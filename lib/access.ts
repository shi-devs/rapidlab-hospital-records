import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { hospitalMembers, hospitals, labRecords, recordAudit, staffProfiles } from "@/db/schema";
import { getAuthenticatedUser, normalizeEmail } from "@/lib/auth";

export type StaffRole = "nurse" | "doctor" | "admin" | "viewer";
export type MemberStatus = "pending" | "active" | "inactive";

export async function getStaffContext() {
  const authenticated = await getAuthenticatedUser();
  if (!authenticated) return null;
  return getStaffContextForEmail(authenticated.email);
}

export async function getStaffContextForEmail(inputEmail: string) {
  const email = normalizeEmail(inputEmail);
  const [row] = await getDb().select({
    profileEmail: staffProfiles.email,
    profileName: staffProfiles.name,
    staffId: staffProfiles.staffId,
    hospitalId: hospitalMembers.hospitalId,
    role: hospitalMembers.role,
    memberStatus: hospitalMembers.status,
    hospitalName: hospitals.name,
    hospitalCode: hospitals.code,
    hospitalCreatedByEmail: hospitals.createdByEmail,
  }).from(staffProfiles)
    .leftJoin(hospitalMembers, eq(hospitalMembers.email, staffProfiles.email))
    .leftJoin(hospitals, eq(hospitals.id, hospitalMembers.hospitalId))
    .where(eq(staffProfiles.email, email)).limit(1);

  const isHospitalCreator = row?.hospitalCreatedByEmail?.trim().toLowerCase() === email;
  if (isHospitalCreator && row?.role !== "admin") {
    await getDb().update(hospitalMembers).set({ role: "admin", status: "active" })
      .where(eq(hospitalMembers.email, email));
  }

  return {
    user: { email, name: row?.profileName ?? email },
    profile: row?.profileEmail ? {
      email: row.profileEmail,
      name: row.profileName!,
      staffId: row.staffId!,
      membership: row.hospitalId && row.hospitalName && row.hospitalCode ? {
        hospitalId: row.hospitalId,
        hospitalName: row.hospitalName,
        hospitalCode: row.hospitalCode,
        // The hospital creator is always the recovery administrator. This also
        // repairs older workspaces whose first membership was accidentally
        // stored with the default nurse role.
        role: isHospitalCreator ? "admin" : row.role as StaffRole,
        status: row.memberStatus as MemberStatus,
      } : null,
    } : null,
  };
}

export async function requireActiveMember() {
  const context = await getStaffContext();
  if (!context?.profile?.membership || context.profile.membership.status !== "active") return null;
  return { ...context, profile: { ...context.profile, membership: context.profile.membership } };
}

export function unauthorized(message = "Sign in to your RapidLab staff account") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "You do not have permission for this action") {
  return Response.json({ error: message }, { status: 403 });
}

export async function claimLegacyRecords(email: string, hospitalId: string) {
  await getDb().update(labRecords).set({ hospitalId, createdByEmail: email })
    .where(and(eq(labRecords.ownerEmail, email), isNull(labRecords.hospitalId)));
}

export async function logAudit(input: { hospitalId: string; recordId?: string | null; actorEmail: string; actorName: string; action: string; details: string }) {
  await getDb().insert(recordAudit).values({
    id: crypto.randomUUID(),
    recordId: input.recordId ?? null,
    hospitalId: input.hospitalId,
    actorEmail: input.actorEmail,
    actorName: input.actorName,
    action: input.action,
    details: input.details.slice(0, 500),
    createdAt: new Date(),
  });
}
