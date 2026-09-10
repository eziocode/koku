import assert from "node:assert/strict";
import { test } from "node:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { prepareStandalone } from "./prepare-appsail.mjs";

test("preparation copies assets and root entry point; Catalyst port takes precedence", () => {
  const root = mkdtempSync(resolve(tmpdir(), "koku-standalone-test-"));
  try {
    assert.throws(() => prepareStandalone(root), /Standalone output missing/);
    for (const folder of [".next/standalone", ".next/static", ".next/server", "public"]) mkdirSync(resolve(root, folder), { recursive: true });
    writeFileSync(resolve(root, ".next/standalone/server.js"), 'console.log(JSON.stringify({ port: process.env.PORT, host: process.env.HOSTNAME }));');
    writeFileSync(resolve(root, ".next/static/asset.js"), "fixture");
    writeFileSync(resolve(root, "public/test.txt"), "public fixture");
    cpSync(new URL("../appsail-server.cjs", import.meta.url), resolve(root, "appsail-server.cjs"));
    const standalone = prepareStandalone(root);
    assert.equal(readFileSync(resolve(standalone, ".next/static/asset.js"), "utf8"), "fixture");
    assert.equal(readFileSync(resolve(standalone, "public/test.txt"), "utf8"), "public fixture");
    for (const [catalyst, expected] of [["4200", "4200"], ["", "4100"]]) {
      const result = spawnSync(process.execPath, [resolve(standalone, "appsail-server.cjs")], {
        env: { ...process.env, PORT: "4100", X_ZOHO_CATALYST_LISTEN_PORT: catalyst, HOSTNAME: "127.0.0.1" }, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout.trim().split("\n").at(-1)), { port: expected, host: "127.0.0.1" });
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
