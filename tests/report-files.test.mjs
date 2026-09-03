import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

test("accepts PDF lab reports", async () => {
  const { validateReportFiles } = await vite.ssrLoadModule("/lib/lab-records.ts");
  const report = new File(["%PDF-1.7"], "patient-report.pdf", { type: "application/pdf" });

  assert.equal(validateReportFiles([report]), null);
});

test("does not require a laboratory value before saving", async () => {
  const files = [
    "app/rapidlab-client.tsx",
    "app/api/records/route.ts",
    "app/api/records/[id]/route.ts",
  ];
  const source = (await Promise.all(files.map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")))).join("\n");

  assert.doesNotMatch(source, /at least one laboratory value|enter or extract at least one/i);
});
