import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const workspaceArchiveRows = sqliteTable("workspace_archive_rows", {
  id: text("id").primaryKey(),
  archiveId: text("archive_id").notNull(),
  sourceTable: text("source_table").notNull(),
  sourceKey: text("source_key").notNull(),
  rowJson: text("row_json").notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_workspace_archive_rows_archive_id").on(table.archiveId),
  index("idx_workspace_archive_rows_source_table").on(table.sourceTable),
]);

export const workspaceResetState = sqliteTable("workspace_reset_state", {
  resetId: text("reset_id").primaryKey(),
  archiveId: text("archive_id").notNull(),
  appliedAt: integer("applied_at", { mode: "timestamp" }).notNull(),
});

export const labRecords = sqliteTable("lab_records", {
  id: text("id").primaryKey(),
  patientCode: text("patient_code").notNull(),
  patientName: text("patient_name").notNull(),
  patientAge: integer("patient_age"),
  source: text("source").notNull(),
  valuesJson: text("values_json").notNull(),
  reportFileKey: text("report_file_key"),
  reportFileName: text("report_file_name"),
  ownerEmail: text("owner_email"),
  hospitalId: text("hospital_id"),
  createdByEmail: text("created_by_email"),
  assignedToEmail: text("assigned_to_email"),
  status: text("status").notNull().default("pending"),
  verifiedByEmail: text("verified_by_email"),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const labReportFiles = sqliteTable("lab_report_files", {
  id: text("id").primaryKey(),
  recordId: text("record_id").notNull(),
  hospitalId: text("hospital_id").notNull(),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  uploadedByEmail: text("uploaded_by_email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_lab_report_files_hospital_id").on(table.hospitalId),
  index("idx_lab_report_files_record_id").on(table.recordId),
]);

export const staffProfiles = sqliteTable("staff_profiles", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  staffId: text("staff_id").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const authAccounts = sqliteTable("auth_accounts", {
  email: text("email").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  email: text("email").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_auth_sessions_email").on(table.email),
  index("idx_auth_sessions_expires_at").on(table.expiresAt),
]);

export const emailVerificationChallenges = sqliteTable("email_verification_challenges", {
  email: text("email").primaryKey(),
  name: text("name").notNull(),
  staffId: text("staff_id").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull(),
  codeHash: text("code_hash").notNull(),
  codeSalt: text("code_salt").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  resendAfter: integer("resend_after", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
}, (table) => [
  index("idx_email_verification_expires_at").on(table.expiresAt),
]);

export const hospitals = sqliteTable("hospitals", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const hospitalMembers = sqliteTable("hospital_members", {
  email: text("email").primaryKey(),
  hospitalId: text("hospital_id").notNull(),
  role: text("role").notNull().default("nurse"),
  status: text("status").notNull().default("pending"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull(),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  approvedByEmail: text("approved_by_email"),
});

export const recordAudit = sqliteTable("record_audit", {
  id: text("id").primaryKey(),
  recordId: text("record_id"),
  hospitalId: text("hospital_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
