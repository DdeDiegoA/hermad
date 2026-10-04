"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test } = require("node:test");
const pack = require("../src/lib/pack");

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// En Windows el symlink de directorio pide privilegios; junction no.
const DIR_LINK = process.platform === "win32" ? "junction" : "dir";

function dirLink(target, p) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.symlinkSync(target, p, DIR_LINK);
}

function fixtureRepo() {
  const repo = tmp("hermad-pack-repo-");
  fs.mkdirSync(path.join(repo, "skill", "scripts"), { recursive: true });
  fs.writeFileSync(path.join(repo, "skill", "SKILL.md"), "# herdr-bmad\n");
  fs.writeFileSync(path.join(repo, "skill", "scripts", "personas.env"), "SECRET=1\n");
  fs.mkdirSync(path.join(repo, "command"), { recursive: true });
  fs.writeFileSync(path.join(repo, "command", "hermad.md"), "hermad cmd\n");
  fs.writeFileSync(path.join(repo, "command", "orchestrate.md"), "orchestrate cmd\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ version: "0.2.0" }));
  return repo;
}

test("install copia skill + los dos comandos a ~/.hermad/pack sin personas.env (FR-1.1)", () => {
  const home = tmp("hermad-pack-home-");
  const repo = fixtureRepo();
  const { packDir } = pack.install({ home, repoRoot: repo });

  assert.ok(fs.existsSync(path.join(packDir, "skill", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(packDir, "command", "hermad.md")));
  assert.ok(fs.existsSync(path.join(packDir, "command", "orchestrate.md")));
  assert.ok(!fs.existsSync(path.join(packDir, "skill", "scripts", "personas.env")), "personas.env no se distribuye");

  const manifest = JSON.parse(fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"));
  assert.equal(manifest.version, "0.2.0");
  assert.ok(manifest.installedAt, "installedAt ISO");
  assert.deepEqual(manifest.links, []);
});

test("cancelar a mitad de install deja el pack anterior intacto y sin tmp (FR-3.6)", () => {
  const home = tmp("hermad-pack-home-");
  const repo = fixtureRepo();
  const { packDir } = pack.install({ home, repoRoot: repo });
  const before = fs.readFileSync(path.join(packDir, "skill", "SKILL.md"), "utf8");

  assert.throws(
    () =>
      pack.install({
        home,
        repoRoot: repo,
        copy: () => {
          throw new Error("cancelado a mitad");
        },
      }),
    /cancelado a mitad/
  );

  assert.equal(fs.readFileSync(path.join(packDir, "skill", "SKILL.md"), "utf8"), before, "pack anterior intacto");
  assert.ok(!fs.existsSync(`${packDir}.tmp-${process.pid}`), "tmp limpiado");
});

test("relink enlaza solo vendors detectados, migra el symlink viejo al repo y es idempotente (A9)", () => {
  const home = tmp("hermad-pack-home-");
  const repo = fixtureRepo();
  const { packDir } = pack.install({ home, repoRoot: repo });

  // symlink viejo (instalación previa): apunta al clone del repo.
  const claudeSkill = path.join(home, ".claude", "skills", "herdr-bmad");
  dirLink(path.join(repo, "skill"), claudeSkill);

  const first = pack.relink({ home, vendors: ["claude"], platform: process.platform, repoRoot: repo });
  assert.equal(first.actions.find((a) => a.linkPath === claudeSkill).action, "migrate", "migra el enlace viejo");
  assert.equal(fs.realpathSync(claudeSkill), fs.realpathSync(path.join(packDir, "skill")));
  assert.ok(!fs.existsSync(path.join(home, ".config", "opencode", "commands", "hermad.md")), "no crea enlaces de vendors ausentes");
  assert.ok(first.changed >= 1);

  const second = pack.relink({ home, vendors: ["claude"], platform: process.platform, repoRoot: repo });
  assert.equal(second.changed, 0, "segunda corrida no cambia nada");
  assert.ok(second.actions.every((a) => a.action === "ok"), "todos los destinos ya están OK");
});

test("relink sin pack instalado manda a hermad setup", () => {
  assert.throws(
    () => pack.relink({ home: tmp("hermad-pack-home-"), vendors: ["claude"], platform: "linux", repoRoot: fixtureRepo() }),
    /hermad setup/
  );
});

test("plan no exige el pack y lista creates (lo usa el resumen pre-apply)", () => {
  const actions = pack.plan({ home: tmp("hermad-pack-home-"), vendors: ["claude"], platform: "linux", repoRoot: fixtureRepo() });
  assert.ok(actions.length > 0);
  assert.ok(actions.every((a) => a.action === "create"));
});

test("un symlink ajeno se deja intacto (no se pisa)", () => {
  const home = tmp("hermad-pack-home-");
  const repo = fixtureRepo();
  pack.install({ home, repoRoot: repo });
  const p = path.join(home, ".claude", "skills", "herdr-bmad");
  const foreign = tmp("hermad-foreign-");
  dirLink(foreign, p);

  const res = pack.relink({ home, vendors: ["claude"], platform: process.platform, repoRoot: repo });
  assert.equal(res.actions.find((a) => a.linkPath === p).action, "skip-foreign");
  assert.equal(fs.realpathSync(p), fs.realpathSync(foreign), "sigue apuntando a lo del usuario");
});

test("desiredLinks filtra por vendor y no enlaza hermes en Windows (NFR-7)", () => {
  assert.deepEqual(pack.desiredLinks({ home: tmp("h-"), vendors: ["hermes"], platform: "win32" }), []);
  const claudeOnly = pack.desiredLinks({ home: tmp("h-"), vendors: ["claude"], platform: "linux" });
  assert.ok(claudeOnly.length > 0);
  assert.ok(claudeOnly.every((l) => l.vendor === "claude"));
});

test("Windows: symlink de archivo rechazado → copia, registrada e idempotente (NFR-7)", () => {
  const home = tmp("hermad-pack-home-");
  const repo = fixtureRepo();
  pack.install({ home, repoRoot: repo });

  const fsImpl = Object.create(fs);
  fsImpl.symlinkSync = (target, p, type) => {
    if (type === "file") {
      const e = new Error("EPERM: symlink no permitido");
      e.code = "EPERM";
      throw e;
    }
    return fs.symlinkSync(target, p, type === "junction" ? "dir" : type);
  };

  const first = pack.relink({ home, vendors: ["opencode"], platform: "win32", repoRoot: repo, fsImpl });
  const cmd = path.join(home, ".config", "opencode", "commands", "hermad.md");
  assert.ok(!fs.lstatSync(cmd).isSymbolicLink(), "archivo copiado, no symlink");
  assert.equal(fs.readFileSync(cmd, "utf8"), "hermad cmd\n");
  const manifest = JSON.parse(fs.readFileSync(path.join(pack.packDirFor(home), "manifest.json"), "utf8"));
  assert.equal(manifest.links.find((l) => l.path === cmd).mode, "copy");

  const second = pack.relink({ home, vendors: ["opencode"], platform: "win32", repoRoot: repo, fsImpl });
  assert.equal(second.changed, 0, "copias registradas e idénticas → no-op");
});
