"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");
const detect = require("../src/lib/detect");
const installMethod = require("../src/lib/install-method");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function whichFrom(installed) {
  return (bin) => installed.includes(bin);
}

test("detect: versión de Node contra el mínimo 20.12 (FR-3.2)", () => {
  const opts = { which: () => false, run: () => "", platform: "linux" };
  assert.equal(detect.detect({ ...opts, nodeVersion: "v20.11.0" }).node.ok, false);
  assert.equal(detect.detect({ ...opts, nodeVersion: "v20.12.0" }).node.ok, true);
  assert.equal(detect.detect({ ...opts, nodeVersion: "v22.3.0" }).node.ok, true);
  assert.equal(detect.detect({ ...opts, nodeVersion: "v18.20.4" }).node.ok, false);
  assert.equal(detect.detect({ ...opts, nodeVersion: "v20.12.0" }).node.required, "20.12");
});

test("detect: herdr presente con versión y comando de instalación por OS (FR-3.4)", () => {
  const present = detect.detect({
    platform: "darwin",
    which: whichFrom(["herdr"]),
    run: () => "herdr 0.9.1",
    nodeVersion: "v22.0.0",
  });
  assert.equal(present.herdr.present, true);
  assert.equal(present.herdr.version, "0.9.1");
  assert.equal(present.herdr.install, "brew install herdr");

  const absent = detect.detect({ platform: "linux", which: () => false, run: () => "", nodeVersion: "v22.0.0" });
  assert.equal(absent.herdr.present, false);
  assert.equal(absent.herdr.version, null);
  assert.match(absent.herdr.install, /install\.sh/);

  assert.match(detect.detect({ platform: "win32", which: () => false, run: () => "" }).herdr.install, /install\.ps1/);
});

test("detect: vendors instalados, con flag experimental (FR-3.4, FR-4.4)", () => {
  const d = detect.detect({ which: whichFrom(["claude", "codex"]), run: () => "", nodeVersion: "v22.0.0" });
  assert.deepEqual(
    d.vendors.sort((a, b) => a.kind.localeCompare(b.kind)),
    [
      { kind: "claude", experimental: false },
      { kind: "codex", experimental: true },
    ]
  );
});

test("detect: sin herdr no ejecuta nada (sin efectos secundarios)", () => {
  let ran = 0;
  const d = detect.detect({ which: () => false, nodeVersion: "v22.0.0", run: () => (ran++, "") });
  assert.equal(d.herdr.present, false);
  assert.equal(ran, 0, "no debe correr `herdr --version` si no está instalado");
});

test("install-method.detect: .git → git (FR-7.4)", () => {
  const dir = tmp("hermad-im-git-");
  fs.mkdirSync(path.join(dir, ".git"));
  assert.equal(installMethod.detect({ repoRoot: dir, npmRoot: () => "/nope" }), "git");
});

test("install-method.detect: bajo npm root -g → npm-global, si no unknown (FR-7.4)", () => {
  const parent = tmp("hermad-im-npm-");
  const repo = path.join(parent, "hermad");
  fs.mkdirSync(repo, { recursive: true });
  assert.equal(installMethod.detect({ repoRoot: repo, npmRoot: () => parent }), "npm-global");
  assert.equal(installMethod.detect({ repoRoot: repo, npmRoot: () => path.join(os.tmpdir(), "otro-lugar") }), "unknown");
  assert.equal(installMethod.detect({ repoRoot: repo, npmRoot: () => { throw new Error("npm ausente"); } }), "unknown");
});

test("install-method: currentVersion lee package.json; availableVersion cae a null sin red", async () => {
  const repo = tmp("hermad-im-ver-");
  fs.writeFileSync(
    path.join(repo, "package.json"),
    JSON.stringify({ version: "1.2.3", repository: { type: "git", url: "https://github.com/DdeDiegoA/hermad.git" } })
  );
  assert.equal(installMethod.currentVersion({ repoRoot: repo }), "1.2.3");
  assert.equal(
    installMethod.rawPackageUrl("https://github.com/DdeDiegoA/hermad.git"),
    "https://raw.githubusercontent.com/DdeDiegoA/hermad/main/package.json"
  );
  assert.equal(await installMethod.availableVersion({ repoRoot: repo, fetchImpl: null }), null, "sin fetch → null");
  const fakeFetch = async () => ({ ok: true, json: async () => ({ version: "9.9.9" }) });
  assert.equal(await installMethod.availableVersion({ repoRoot: repo, fetchImpl: fakeFetch }), "9.9.9");
  const boom = async () => {
    throw new Error("sin red");
  };
  assert.equal(await installMethod.availableVersion({ repoRoot: repo, fetchImpl: boom }), null, "fetch que falla → null");
});
