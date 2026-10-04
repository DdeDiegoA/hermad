"use strict";

// Completion de PowerShell via Register-ArgumentCompleter (nativo, sin modulo).
// Texto puro desde COMMANDS (FR-6.1/6.3). El perfil lo dot-sourcea (FR-6.5).
function head(commands) {
  const names = commands.map((c) => `'${c.name}'`).join(",");
  const flags = [...new Set(commands.flatMap((c) => c.flags))].join(" ");
  return [`# PowerShell completion for hermad`, `# Flags: ${flags}`, ""].join("\n");
}

function cases(commands) {
  return commands
    .map((c) => {
      const words = [...c.sub.flatMap((s) => s.split(" ")), ...c.flags].map((w) => `'${w}'`).join(",");
      return `        '${c.name}' { @(${words}) }`;
    })
    .join("\n");
}

function generate(commands) {
  const top = commands.map((c) => `'${c.name}'`).join(",");
  return `${head(commands)}Register-ArgumentCompleter -Native -CommandName hermad -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    $sub = ''
    if ($commandAst.CommandElements.Count -gt 1) { $sub = $commandAst.CommandElements[1].Value }
    $candidates = switch ($sub) {
${cases(commands)}
        default { @(${top}) }
    }
    $candidates | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
    }
}
`;
}

module.exports = { generate };
