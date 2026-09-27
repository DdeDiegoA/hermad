"use strict";
const assert = require("assert");
const { test } = require("node:test");
const { allocateDevs } = require("../src/commands/plan-devs");

test("allocateDevs salta los nombres de devs vivos (no pisa a un dev de otra story)", () => {
  assert.deepEqual(allocateDevs([], 3), ["dev-1", "dev-2", "dev-3"]);
  assert.deepEqual(allocateDevs(["dev-1"], 2), ["dev-2", "dev-3"]);
  assert.deepEqual(allocateDevs(["dev-1", "dev-3"], 3), ["dev-2", "dev-4", "dev-5"]);
});
