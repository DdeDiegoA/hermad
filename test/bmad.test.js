"use strict";
const assert = require("assert");
const os = require("os");
const path = require("path");
const { test } = require("node:test");
const bmad = require("../src/lib/bmad");

test("toolsFor mapea vendors a ids de BMad y deduplica (FR-1.4)", () => {
  assert.deepEqual(bmad.toolsFor(["claude"]), ["claude-code"]);
  assert.deepEqual(bmad.toolsFor(["opencode"]), ["opencode"]);
  assert.deepEqual(bmad.toolsFor(["opencode", "claude", "claude"]), ["opencode", "claude-code"], "dedupe preservando el orden");
  assert.deepEqual(bmad.toolsFor(["hermes", "gemini"]), [], "vendors sin tool BMad no se pasan");
  assert.deepEqual(bmad.toolsFor(), []);
});

test("languageName: es → Spanish, en/desconocido → English (FR-1.4)", () => {
  assert.equal(bmad.languageName("es"), "Spanish");
  assert.equal(bmad.languageName("en"), "English");
  assert.equal(bmad.languageName("fr"), "English");
});

test("installCommand unix: script + stty, tools, idioma y log en os.tmpdir (FR-1.4)", () => {
  const cmd = bmad.installCommand({ language: "es", vendors: ["claude", "opencode"], platform: "linux" });
  assert.match(cmd, /^script -q /);
  assert.match(cmd, /stty cols 160 rows 50/);
  assert.ok(cmd.includes(path.join(os.tmpdir(), "hermad-bmad.log")), "log en os.tmpdir");
  assert.match(cmd, /npx -y bmad-method@latest install --yes --directory \. --modules bmm/);
  assert.match(cmd, /--tools claude-code,opencode/);
  assert.match(cmd, /--communication-language Spanish --document-output-language Spanish/);
  assert.doesNotMatch(cmd, /\/tmp\/b\.log/, "sin ruta fija /tmp");
});

test("installCommand windows: npx directo, sin script ni log (NFR-7)", () => {
  const cmd = bmad.installCommand({ language: "en", vendors: ["claude"], platform: "win32" });
  assert.doesNotMatch(cmd, /script -q|stty/);
  assert.match(cmd, /--tools claude-code/);
  assert.match(cmd, /--communication-language English/);
});

test("installCommand sin vendors BMad omite --tools; tmpdir inyectable", () => {
  const cmd = bmad.installCommand({ language: "en", vendors: ["hermes"], platform: "darwin", tmpdir: "/tmp/x" });
  assert.doesNotMatch(cmd, /--tools/);
  assert.ok(cmd.includes(path.join("/tmp/x", "hermad-bmad.log")));
});

test("wantsInstall: preferencia o --run-bmad-install, nunca por default (FR-1.4)", () => {
  assert.equal(bmad.wantsInstall({ bmad: { autoInstall: true } }, []), true);
  assert.equal(bmad.wantsInstall({ bmad: { autoInstall: false } }, ["--run-bmad-install"]), true);
  assert.equal(bmad.wantsInstall({ bmad: { autoInstall: false } }, []), false);
  assert.equal(bmad.wantsInstall(undefined, []), false);
  assert.equal(bmad.wantsInstall({}, []), false);
});
