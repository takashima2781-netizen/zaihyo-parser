import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.resolve(fileURLToPath(import.meta.url), "..", "..");

test("package.json is valid and declares the test script", () => {
  const pkg = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  assert.equal(pkg.name, "boki-app");
  assert.equal(pkg.type, "module");
  assert.ok(pkg.scripts.test, "package.json must declare a test script");
});

test(".gitignore protects material directories (/input/, /output/)", () => {
  const gitignore = readFileSync(path.join(rootDir, ".gitignore"), "utf8");
  assert.ok(gitignore.includes("/input/"), ".gitignore must exclude /input/ (教材原本PDF)");
  assert.ok(gitignore.includes("/output/"), ".gitignore must exclude /output/ (教材原文を含む生成物)");
});
