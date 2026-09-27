"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const memory = require("../src/lib/memory");

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermad-mem-"));
}

test("append + slice: AGENTS.md + entradas de la persona/story, sin filtrar de más", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "# AGENTS\ncontenido");
  memory.append(dir, { agent: "dev", text: "built S1", story: "S1" });
  memory.append(dir, { agent: "pm", text: "prd done" });
  memory.append(dir, { agent: "dev", text: "para reviewer", forPersona: "reviewer" });

  const dev = memory.slice(dir, { persona: "dev", story: "S1" });
  assert.match(dev, /AGENTS/);
  assert.match(dev, /built S1/);
  assert.match(dev, /prd done/);
  assert.doesNotMatch(dev, /para reviewer/);

  const devOnly = memory.slice(dir, { persona: "dev" });
  assert.doesNotMatch(devOnly, /built S1/, "sin story no ve entradas de story");

  const rev = memory.slice(dir, { persona: "reviewer" });
  assert.match(rev, /para reviewer/);
  assert.match(rev, /prd done/);
  assert.doesNotMatch(rev, /built S1/);
});

test("append colapsa multilínea en una sola entrada", () => {
  const dir = tmp();
  memory.append(dir, { agent: "dev", text: "linea1\nlinea2", story: "S9" });
  const entries = memory.relevant(dir, { story: "S9" });
  assert.equal(entries.length, 1);
});
