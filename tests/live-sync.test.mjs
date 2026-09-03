import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../app/rapidlab-client.tsx", import.meta.url), "utf8");

test("refreshes shared hospital data without a manual page reload", () => {
  assert.match(source, /fetch\("\/api\/records", \{ cache: "no-store" \}\)/);
  assert.match(source, /fetch\("\/api\/team", \{ cache: "no-store" \}\)/);
  assert.match(source, /fetch\("\/api\/activity", \{ cache: "no-store" \}\)/);
  assert.match(source, /window\.setInterval\(refreshWhenVisible, 5000\)/);
  assert.match(source, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(source, /window\.addEventListener\("focus", refreshWhenVisible\)/);
});

test("automatically detects hospital membership approval", () => {
  assert.match(source, /fetch\("\/api\/profile", \{ cache: "no-store" \}\)/);
  assert.match(source, /void refreshProfile\(false\)/);
});
