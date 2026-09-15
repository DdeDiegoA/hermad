"use strict";
const fs = require("fs");
const path = require("path");

const PROMPTS_DIR = path.join(__dirname, "..", "..", "templates", "prompts");

function loadPersonaPrompt(name) {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8").trim();
}

module.exports = { loadPersonaPrompt };
