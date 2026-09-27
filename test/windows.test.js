"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { parseFrontmatter } = require("../src/lib/prompts");
const { parseStories } = require("../src/lib/stories");

test("frontmatter con CRLF (checkout en Windows) conserva skills y readonly", () => {
  const { meta, body } = parseFrontmatter("---\r\nname: reader\r\nskills: [herdr-bmad, graphify]\r\nreadonly: true\r\n---\r\nYou are the Reader.\r\n");
  assert.deepEqual(meta.skills, ["herdr-bmad", "graphify"]);
  assert.equal(meta.readonly, true);
  assert.equal(body, "You are the Reader.");
});

test("stories.yaml con CRLF se parsea igual", () => {
  const [s] = parseStories("- id: S1\r\n  depends_on: [S0]\r\n  files: [src/a.js]\r\n");
  assert.equal(s.id, "S1");
  assert.deepEqual(s.depends_on, ["S0"]);
  assert.deepEqual(s.files, ["src/a.js"]);
});
