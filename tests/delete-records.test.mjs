import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const client = await readFile(new URL("../app/rapidlab-client.tsx", import.meta.url), "utf8");
const recordRoute = await readFile(new URL("../app/api/records/[id]/route.ts", import.meta.url), "utf8");
const reportRoute = await readFile(new URL("../app/api/records/[id]/reports/[reportId]/route.ts", import.meta.url), "utf8");

test("protects record and report deletion behind active non-viewer membership", () => {
  for (const route of [recordRoute, reportRoute]) {
    assert.match(route, /export async function DELETE/);
    assert.match(route, /requireActiveMember\(\)/);
    assert.match(route, /role === "viewer"/);
    assert.match(route, /membership\.hospitalId/);
  }
});

test("removes stored files and records the destructive action", () => {
  assert.match(recordRoute, /env\.BUCKET\.delete/);
  assert.match(recordRoute, /action: "record_deleted"/);
  assert.match(reportRoute, /env\.BUCKET\.delete/);
  assert.match(reportRoute, /action: "report_deleted"/);
});

test("requires confirmation before deleting clinical data", () => {
  assert.match(client, /Delete this patient record\?/);
  assert.match(client, /Delete this lab report\?/);
  assert.match(client, /Delete patient permanently/);
  assert.match(client, /Delete report permanently/);
});
