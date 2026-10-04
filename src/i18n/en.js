"use strict";
// English copy of the wizard (docs/hermad-para-todos-ux.md). Same key set as es.js
// (test/i18n.test.js enforces parity). {x} = interpolation.
module.exports = {
  // Step 1 — Language
  "language.title": "Language",
  "language.note":
    "This language is used in this wizard, for your agents to talk to you, and for BMad documents. The personas' internal prompts stay in English.",

  // Step 2 — Prerequisites
  "prereqs.title": "Checking your environment…",
  "prereqs.node.ok": "Node {v} (needs ≥ 20.12)",
  "prereqs.herdr.ok": "herdr {v}",
  "prereqs.vendors.ok": "Detected vendors: {list}",
  "prereqs.vendors.exp": "{n} (experimental: not tested live)",
  "prereqs.herdr.missing.title": "herdr not found",
  "prereqs.herdr.missing.body":
    "herdr is the panel where your agents live. Without it, hermad can't open the team (start-team). You can continue the setup and install it later.",
  "prereqs.herdr.cmd": "Command for your system:",
  "prereqs.herdr.ask": "Run that command now to install it?",
  "prereqs.herdr.yes": "Yes, install",
  "prereqs.herdr.no": "No, I'll do it myself",
  "prereqs.herdr.error":
    "Error: herdr install failed (code {n}). Output saved to {log}. Install it manually and re-run hermad setup.",
  "prereqs.herdr.skip": "Continuing without herdr. Before start-team, run: {cmd}",

  // Step 3 — Vendors and model
  "vendors.single":
    "I only found {vendor}, so every persona will use it. (A persona is a role on your team: orchestrator, dev, reviewer…)",
  "vendors.split.title": "Proposed assignment",
  "vendors.split.ask": "Use this assignment?",
  "vendors.split.yes": "Yes, use it",
  "vendors.split.edit": "I want to change it",
  "vendors.split.edit.persona": "Vendor for {persona}",
  "model.ask": "Model for {vendor}",
  "model.other": "Other (type it)…",
  "model.default": "Keep {vendor}'s own default model",
  "model.same": "Use the same model for every {vendor} persona?",
  "model.same.no": "No, choose per persona",
  "model.note": "hermad never picks models for you: what you choose here is what gets used.",
  "model.fetching": "Fetching {vendor} models…",
  "model.listfail": "Warning: couldn't list {vendor} models; type one or keep the default.",
  "model.hermes": "Model flag for hermes (can be empty)",

  // Step 4 — Skills
  "skills.intro":
    "I can look for the skills you already have installed and suggest which ones to enable for your team. I don't install or download anything.",
  "skills.go": "Search and suggest",
  "skills.skip": "Skip this step",
  "skills.scanning": "Indexing installed skills…",
  "skills.none": "I found no installed skills. We'll continue without them; your team works the same.",
  "skills.consent.title": "Before we go on: send descriptions to a model?",
  "skills.consent.body": "To recommend better I can ask {vendor} ({model}) to read your skills.",
  "skills.consent.sent": "Would be sent: each skill's name and short description ({n} skills)",
  "skills.consent.notsent": "NOT sent: the skills' contents, your files or your projects",
  "skills.consent.dest": "Destination: {vendor}, using the {model} model you chose in the previous step",
  "skills.consent.local":
    "If you say no, I use a local matcher: suggestions are less precise, but nothing leaves your machine.",
  "skills.consent.ask": "Send names and descriptions to {vendor}?",
  "skills.consent.yes": "Yes, send",
  "skills.consent.no": "No, use the local matcher",
  "skills.consent.unavailable": "With {vendor} I don't make remote suggestions; using the local matcher.",
  "skills.global.title": "Skills for the whole team (space = toggle, enter = confirm)",
  "skills.persona.title": "Skills only for {persona}",
  "skills.source.llm": "Suggested by {vendor}",
  "skills.source.local": "Suggested by the local matcher",
  "skills.hint.skip": "Enter with nothing checked = none",
  "skills.showing": "Showing 15 of {n}. Adjust later with hermad skills global add/rm.",
  "skills.nonative": "(not native: loaded by path)",

  // Step 5 — Permissions
  "perm.title": "Agent permissions — important decision",
  "perm.intro": "Your agents can work in two ways:",
  "perm.prompt.head": "A) Permission-prompt mode (recommended)",
  "perm.prompt.body":
    "Every time an agent wants to run a command or edit a file, it stops and asks you. This is the safest option.",
  "perm.prompt.cost":
    'Cost: the team slows down. A waiting agent shows as "blocked" and doesn\'t move until you answer in its pane. With several agents working, you\'ll need to keep checking the panes.',
  "perm.bypass.head": "B) No-permission mode (bypass)",
  "perm.bypass.body":
    "Agents run commands and modify files WITHOUT asking you. It's fast and never stops, but an agent that makes a mistake, or follows malicious instructions hidden in a file or web page it reads, can delete or change files or run commands on your machine, and you won't know until afterward. In this mode hermad does not protect you. Use it only on a machine or folder where losing work is acceptable.",
  "perm.change": "You can change it any time with: hermad settings permissions",
  "perm.ask": "Which mode do you want?",
  "perm.opt.prompt": "With permissions — agents ask me (recommended)",
  "perm.opt.bypass": "No permissions (bypass) — agents don't ask",
  "perm.confirm.title": "Confirm you understand the risk",
  "perm.confirm.body":
    "You chose the NO-permissions mode. Agents will be able to run commands and modify files on your computer without asking you.",
  "perm.confirm.ask": "Do you accept that risk?",
  "perm.confirm.yes": "Yes, I accept",
  "perm.confirm.no": "No, I prefer permission-prompt mode",
  "perm.kept": "You're in permission-prompt mode. Change it later with hermad settings permissions.",

  // Step 6 — BMad
  "bmad.title": "BMad (optional)",
  "bmad.body":
    "BMad is a method with skills and templates that enriches your agents. Your team works without it. If you like, I'll install it in every new project you create with hermad create-project (in {language}).",
  "bmad.yes": "Yes, install in new projects",
  "bmad.no": "Not for now",
  "bmad.later": "You can install it any time with create-project --run-bmad-install.",
  "bmad.detected": "Detected BMad in this folder; using it.",

  // Step 7 — Summary
  "summary.title": "This is what I'm about to do",
  "summary.config": "Configuration",
  "summary.files": "Files I'll create or update",
  "summary.untouched": "I won't touch: {list}",
  "summary.link": "(link)",
  "summary.copy": "(copy)",
  "summary.relink.replace": "replaces an old link that pointed to {path}",
  "summary.skipped.foreign": "Leaving {path} untouched: it exists and isn't hermad's",
  "summary.ask": "Apply these changes?",
  "summary.yes": "Yes, apply",
  "summary.no": "No, exit without changes",
  "summary.nochange": "Nothing to change: your installation is already up to date.",

  // Step 8 — Apply
  "apply.pack": "Copying the base pack…",
  "apply.pack.done": "Base pack copied to {path}",
  "apply.links": "Creating links…",
  "apply.links.done": "Links created ({n})",
  "apply.config": "Saving configuration…",
  "apply.config.done": "Configuration saved",
  "apply.nochange": "No changes",

  // Step 9 — Completion + next steps
  "completion.title": "Tab-complete commands",
  "completion.body": "I can enable hermad tab-completion in your shell ({shell}). I would:",
  "completion.create": "create {path}",
  "completion.block": "add a marked block (# >>> hermad >>>) to {path}",
  "completion.undo": "Undo with: hermad completion uninstall",
  "completion.yes": "Yes, enable it",
  "completion.no": "No, thanks",
  "completion.reload": "Open a new terminal (or run: {cmd}) for it to take effect.",
  "completion.ps.restricted":
    "PowerShell's ExecutionPolicy is Restricted: I didn't touch your profile. Once you change it, run hermad completion install.",
  "completion.noshell": "I didn't recognize your shell. Use: hermad completion <zsh|bash|fish|powershell>",
  "done.outro": "Done. hermad is set up.",
  "done.next.title": "Next steps",
  "done.next.1": "Create a project: hermad create-project my-app",
  "done.next.2": "Open your team: cd mi-app && hermad start-team",
  "done.next.3": "Ask the team for something: /hermad <what you need>",
  "done.perm.prompt":
    'Permissions: permission-prompt mode (agents will ask you; watch for "blocked" panes). Change with: hermad settings permissions',
  "done.perm.bypass": "Permissions: NO permissions (bypass), accepted on {date}. Change with: hermad settings permissions prompt",
  "done.herdr.pending": "Before start-team, install herdr: {cmd}",
  "done.help": "More help: hermad --help",
  "done.bmad": "New projects will install BMad in {language}.",

  // update
  "update.method": "Detected installation: {method}",
  "update.current": "Current version: {v}",
  "update.available": "Available version: {v}",
  "update.uptodate": "You already have the latest version ({v}). Checking the pack for missing links…",
  "update.ask": "Update now?",
  "update.yes": "Yes, update",
  "update.no": "No",
  "update.git.will": "I'll run: git pull --ff-only and npm install --omit=dev in {path}.",
  "update.npm.will": "I'll run: npm install -g {repo}",
  "update.relink": "Base pack updated and links checked",
  "update.done": "Done. Everything is up to date.",
  "update.warn.version": "Warning: couldn't check the available version. Update anyway?",
  "update.unknown.title": "I couldn't tell how you installed hermad.",
  "update.unknown.body": "Update manually with one of these two commands:",
  "update.unknown.next": "Then run: hermad setup --relink-only",
  "update.error.noGit":
    "Error: npm needs git to install from GitHub and I can't find it. Install git and run hermad update again.",
  "update.error.pull":
    "Error: git pull --ff-only failed (local changes or diverged branches). I changed nothing. Resolve it in {path} and run hermad update again.",
  "update.nochange": "No changes.",
  "update.interrupted": "Update interrupted. Check with hermad --version and run hermad update again if needed.",

  // settings permissions
  "settings.perm.warn":
    "Agents that are already open keep the previous mode. Close and reopen the team (start-team) for the change to apply.",
  "settings.perm.project": "Applied to this project only.",

  // errors and setup
  "err.novendor.title": "I found no AI vendor installed",
  "err.novendor.body": "hermad needs at least one to run your agents. I looked for: {list}.",
  "err.novendor.next": "Install one and run again: hermad setup",
  "err.node":
    "Error: hermad needs Node 20.12 or newer (you have {v}).\n       Update Node (https://nodejs.org) and run again: hermad setup",
  "err.apply.title": "Error while {action}",
  "err.apply.body": "I couldn't write {path}: {reason}.",
  "err.apply.state.safe": "State: your previous pack and configuration are intact.",
  "err.apply.state.partial": "State: the new pack is copied, but your configuration wasn't saved.",
  "err.apply.next": "Next: fix that folder's permissions and run hermad setup again (safe to repeat: nothing gets duplicated).",
  "err.needsinput":
    "Error: missing information to continue without a terminal: {key}. Pass it with {flag} or run hermad setup in an interactive terminal.",
  "setup.cancel": "Setup cancelled. I changed nothing. Resume any time with hermad setup.",
  "setup.cancel.apply":
    "Setup interrupted while applying. Your previous pack and configuration are intact; run hermad setup again to finish.",
  "setup.cancel.completion":
    "Setup finished. I didn't enable tab-completion; you can with hermad completion install.",
  "setup.existing":
    "You already have a configuration (language: {l}, permissions: {m}). Each step starts with your current values; enter keeps them.",
  "setup.nochange": "Nothing to change",

  // UI adapter
  "wizard.clack.fallback": "Warning: couldn't load the modern interface (npm install is missing). Continuing in simple mode.",
};
