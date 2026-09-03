import { labRecords, labReportFiles } from "@/db/schema";

export const VALUE_KEYS = [
  "haemoglobin", "wbc", "rbc", "platelets", "haematocrit", "mcv", "mch",
  "mchc", "neutrophils", "lymphocytes", "sodium", "potassium", "chloride",
  "creatinine", "urea",
] as const;

export function cleanValues(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const input = raw as Record<string, unknown>;
  return Object.fromEntries(VALUE_KEYS.map((key) => [key, typeof input[key] === "string" ? input[key].trim().slice(0, 40) : ""]));
}

export function serializeLabRecord(
  row: typeof labRecords.$inferSelect,
  storedReports: Array<typeof labReportFiles.$inferSelect> = [],
) {
  let values: Record<string, string> = {};
  try { values = JSON.parse(row.valuesJson) as Record<string, string>; } catch { values = {}; }

  const reports = [
    ...(row.reportFileKey ? [{
      id: "legacy",
      fileName: row.reportFileName || "lab-report",
      url: `/api/records/${row.id}/report`,
      uploadedAt: row.createdAt.toISOString(),
    }] : []),
    ...storedReports.map((report) => ({
      id: report.id,
      fileName: report.fileName,
      url: `/api/records/${row.id}/reports/${report.id}`,
      uploadedAt: report.createdAt.toISOString(),
    })),
  ];

  return {
    id: row.patientCode,
    recordId: row.id,
    name: row.patientName,
    age: row.patientAge === null ? "" : String(row.patientAge),
    source: row.source,
    values,
    createdAt: row.createdAt.toISOString(),
    reports,
    reportCount: reports.length,
    reportFileName: reports[0]?.fileName ?? null,
    reportUrl: reports[0]?.url ?? null,
    status: row.status,
    createdByEmail: row.createdByEmail ?? row.ownerEmail,
    assignedToEmail: row.assignedToEmail,
    verifiedByEmail: row.verifiedByEmail,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? row.createdAt.toISOString(),
  };
}

export function validateReportFiles(files: File[]) {
  if (files.length > 8) return "Upload up to 8 report files at a time";
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
  if (files.some((file) => !allowedTypes.has(file.type))) return "Only JPG, PNG, WebP, and PDF report files are supported";
  if (files.some((file) => file.size > 10 * 1024 * 1024)) return "Each report file must be under 10 MB";
  if (files.reduce((total, file) => total + file.size, 0) > 30 * 1024 * 1024) return "Choose report files totaling under 30 MB";
  return null;
}
