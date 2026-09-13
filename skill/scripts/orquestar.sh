#!/usr/bin/env bash
set -euo pipefail

# herdr-bmad bootstrap v3: workspace + orquestador + departamentos (tabs) + agentes en grid.
# Uso: ./orquestar.sh "intent del proyecto"

INTENT="${1:?Uso: $0 "intent del proyecto"}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/personas.env"

command -v herdr >/dev/null || { echo "herdr no instalado: brew install herdr"; exit 1; }
command -v jq    >/dev/null || { echo "jq requerido"; exit 1; }

spec_of() { for s in "${PERSONAS[@]}"; do [[ "${s%%|*}" == "$1" ]] && { printf '%s\n' "$s"; return; }; done; }

# --- 1. workspace + orquestador (root pane, tab default) ---
created=$(herdr workspace create --cwd "$PROJECT_DIR" --label "$LABEL" --no-focus)
ws=$(printf '%s\n' "$created" | jq -r '.result.workspace.workspace_id')
orch_pane=$(printf '%s\n' "$created" | jq -r '.result.root_pane.pane_id')

IFS='|' read -r _n okind ovargs orole <<< "$(spec_of orquestador)"
echo "[+] orquestador ($okind) en $orch_pane — $orole"
# shellcheck disable=SC2086
herdr agent start orquestador --kind "$okind" --pane "$orch_pane" -- $ovargs

# --- 2. departamentos: tab + grid (hasta 4 col × 2 filas) ---
WORKERS=""
for dept in "${DEPARTAMENTOS[@]}"; do
  IFS='|' read -r tab_label names_csv <<< "$dept"
  IFS=',' read -ra names <<< "$names_csv"

  tab=$(herdr tab create --workspace "$ws" --cwd "$PROJECT_DIR" --label "$tab_label" --no-focus)
  tab_root=$(printf '%s\n' "$tab" | jq -r '.result.root_pane.pane_id')

  col_panes=()
  for i in "${!names[@]}"; do
    name="${names[$i]}"
    if [[ $i -eq 0 ]]; then
      pane="$tab_root"
    elif [[ $i -lt 4 ]]; then
      sp=$(herdr pane split "${col_panes[$((i-1))]}" --direction right --no-focus)
      pane=$(printf '%s\n' "$sp" | jq -r '.result.pane.pane_id')
    else
      sp=$(herdr pane split "${col_panes[$((i-4))]}" --direction down --no-focus)
      pane=$(printf '%s\n' "$sp" | jq -r '.result.pane.pane_id')
    fi
    col_panes+=("$pane")

    IFS='|' read -r _n kind vargs role <<< "$(spec_of "$name")"
    [[ -z "$kind" ]] && { echo "[!] persona '$name' no definida en PERSONAS"; exit 1; }
    echo "[+] $name ($kind) en $pane [$tab_label] — $role"
    # shellcheck disable=SC2086
    herdr agent start "$name" --kind "$kind" --pane "$pane" -- $vargs
    WORKERS="$WORKERS $name"
  done
done

# --- 3. briefing del orquestador ---
briefing=$(cat <<EOF
Sos Hermad, el orquestador de este workspace Herdr. Proyecto: $PROJECT_DIR (BMad instalado).
Agentes: orquestador $WORKERS (en tabs por departamento). Usá 'herdr agent list' para el roster vivo.
Rutá la ruta épica de BMad por las personas y respondé las aprobaciones según la política:
auto-aprueba salvo auth/dinero/DB/seguridad (ahí dejá bloqueado y notificá a Diego).
Los agentes pueden hablarse directo entre sí (peer-to-peer); vos coordinás el top.
Intent: $INTENT
Reportá DONE cuando la épica esté completa.
EOF
)
herdr agent prompt orquestador "$briefing"

echo "[+] Workspace: $ws | Orquestador arrancado. Mirá el tablero con: herdr"
