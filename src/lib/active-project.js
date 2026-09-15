"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

const ACTIVE_PROJECT_PATH = path.join(os.homedir(), ".hermad", "active-project.json");

function loadActiveProject() {
  if (!fs.existsSync(ACTIVE_PROJECT_PATH)) return null;
  return JSON.parse(fs.readFileSync(ACTIVE_PROJECT_PATH, "utf8"));
}

function saveActiveProject(project) {
  fs.mkdirSync(path.dirname(ACTIVE_PROJECT_PATH), { recursive: true });
  fs.writeFileSync(ACTIVE_PROJECT_PATH, JSON.stringify(project, null, 2) + "\n");
}

module.exports = { ACTIVE_PROJECT_PATH, loadActiveProject, saveActiveProject };
