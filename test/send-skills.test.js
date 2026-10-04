"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const send = require("../src/commands/send");

function makeSkill(dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: x\n---\nbody\n`);
}

test("send --skills adjunta rutas absolutas de SKILL.md y omite inexistentes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hermad-send-skills-"));
  makeSkill(path.join(dir, ".claude", "skills", "tdd"), "tdd");

  const { block, missing } = send.taskSkillsBlockFor(["tdd", "nope"], dir);
  assert.match(block, /## Task skills — read these SKILL\.md/);
  assert.ok(block.includes(path.join(dir, ".claude", "skills", "tdd", "SKILL.md")), "ruta absoluta del SKILL.md");
  assert.deepEqual(missing, ["nope"], "una skill inexistente solo se reporta, no aborta");
  assert.equal(send.taskSkillsBlockFor([], dir).block, "");
});
