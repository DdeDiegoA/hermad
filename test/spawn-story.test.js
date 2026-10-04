"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { test } = require("node:test");
const { assignStory, currentBranch } = require("../src/commands/spawn");
const daemon = require("../src/lib/daemon");

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hermad-spawn-story-"));
}

test("assignStory registra la story con el formato de plan-devs + source spawn", () => {
  const state = {};
  const entry = assignStory(state, { storyId: "HPT-X", dev: "dev-1", branch: "hermad/HPT-X" });
  assert.deepEqual(entry, { dev: "dev-1", branch: "hermad/HPT-X", status: "assigned", source: "spawn" });
  assert.deepEqual(state.stories["HPT-X"], entry);
});

test("assignStory sin branch lo deja null", () => {
  const state = { stories: {} };
  assignStory(state, { storyId: "S1", dev: "dev" });
  assert.equal(state.stories.S1.branch, null);
});

test("assignStory falla si la story ya es de otro dev y no pisa el ownership", () => {
  const state = { stories: { S1: { dev: "dev-2", branch: "hermad/S1", status: "assigned", source: "plan-devs" } } };
  assert.throws(() => assignStory(state, { storyId: "S1", dev: "dev-1", branch: "hermad/S1" }), (err) => {
    assert.equal(err.code, "story_owned");
    assert.match(err.message, /dev-2/);
    return true;
  });
  assert.equal(state.stories.S1.dev, "dev-2", "el ownership queda intacto");
});

test("assignStory idempotente para el mismo dev", () => {
  const state = { stories: { S1: { dev: "dev-1", branch: "vieja", status: "assigned" } } };
  const entry = assignStory(state, { storyId: "S1", dev: "dev-1", branch: "hermad/S1" });
  assert.equal(entry.branch, "hermad/S1");
  assert.equal(entry.source, "spawn");
});

test("assignStory persiste vía updateState (la guarda de maybeClose la verá)", () => {
  const projectDir = tmpDir();
  daemon.updateState(projectDir, (st) => assignStory(st, { storyId: "S2", dev: "dev-3", branch: "hermad/S2" }));
  const st = daemon.loadState(projectDir);
  assert.equal(st.stories.S2.dev, "dev-3");
  assert.equal(st.stories.S2.status, "assigned");
  assert.equal(st.stories.S2.source, "spawn");
});

test("currentBranch devuelve null fuera de un repo git", () => {
  assert.equal(currentBranch(tmpDir()), null);
});
