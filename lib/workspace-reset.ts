import { env } from "cloudflare:workers";

const RESET_ID = "fresh-active-workspace-2026-09-03-v1";
let resetPromise: Promise<void> | null = null;

const ACTIVE_TABLES = [
  {
    name: "auth_accounts",
    key: "email",
    columns: ["email", "password_hash", "password_salt", "password_iterations", "created_at", "updated_at"],
  },
  {
    name: "auth_sessions",
    key: "token_hash",
    columns: ["token_hash", "email", "expires_at", "created_at"],
  },
  {
    name: "email_verification_challenges",
    key: "email",
    columns: ["email", "name", "staff_id", "password_hash", "password_salt", "password_iterations", "code_hash", "code_salt", "attempts", "expires_at", "resend_after", "created_at"],
  },
  {
    name: "hospital_members",
    key: "email",
    columns: ["email", "hospital_id", "role", "status", "joined_at", "approved_at", "approved_by_email"],
  },
  {
    name: "hospitals",
    key: "id",
    columns: ["id", "name", "code", "created_by_email", "created_at"],
  },
  {
    name: "lab_records",
    key: "id",
    columns: ["id", "patient_code", "patient_name", "patient_age", "source", "values_json", "report_file_key", "report_file_name", "owner_email", "hospital_id", "created_by_email", "assigned_to_email", "status", "verified_by_email", "verified_at", "updated_at", "created_at"],
  },
  {
    name: "lab_report_files",
    key: "id",
    columns: ["id", "record_id", "hospital_id", "file_key", "file_name", "content_type", "uploaded_by_email", "created_at"],
  },
  {
    name: "record_audit",
    key: "id",
    columns: ["id", "record_id", "hospital_id", "actor_email", "actor_name", "action", "details", "created_at"],
  },
  {
    name: "staff_profiles",
    key: "email",
    columns: ["email", "name", "staff_id", "created_at", "updated_at"],
  },
] as const;

export function ensureRecoverableWorkspaceReset() {
  if (!resetPromise) {
    resetPromise = applyReset().catch((error) => {
      resetPromise = null;
      throw error;
    });
  }
  return resetPromise;
}

function archiveSql(table: (typeof ACTIVE_TABLES)[number]) {
  const jsonPairs = table.columns.map((column) => `'${column}', "${column}"`).join(", ");
  return `
    INSERT INTO workspace_archive_rows
      (id, archive_id, source_table, source_key, row_json, archived_at)
    SELECT
      ?1 || ':' || '${table.name}' || ':' || CAST("${table.key}" AS TEXT),
      ?1,
      '${table.name}',
      CAST("${table.key}" AS TEXT),
      json_object(${jsonPairs}),
      ?2
    FROM "${table.name}"
  `;
}

async function resetWasApplied() {
  return env.DB.prepare("SELECT reset_id FROM workspace_reset_state WHERE reset_id = ?1 LIMIT 1")
    .bind(RESET_ID)
    .first();
}

async function applyReset() {
  if (await resetWasApplied()) return;

  const archiveId = crypto.randomUUID();
  const appliedAt = Date.now();
  const archiveStatements = ACTIVE_TABLES.map((table) => env.DB.prepare(archiveSql(table)).bind(archiveId, appliedAt));
  const clearStatements = [
    "auth_sessions",
    "email_verification_challenges",
    "hospital_members",
    "lab_report_files",
    "lab_records",
    "record_audit",
    "hospitals",
    "auth_accounts",
    "staff_profiles",
  ].map((table) => env.DB.prepare(`DELETE FROM "${table}"`));
  const marker = env.DB.prepare(
    "INSERT INTO workspace_reset_state (reset_id, archive_id, applied_at) VALUES (?1, ?2, ?3)",
  ).bind(RESET_ID, archiveId, appliedAt);

  try {
    await env.DB.batch([...archiveStatements, ...clearStatements, marker]);
  } catch (error) {
    if (!(await resetWasApplied())) throw error;
  }
}
