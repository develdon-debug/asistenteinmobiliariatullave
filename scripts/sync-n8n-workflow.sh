#!/usr/bin/env bash
set -euo pipefail

WORKFLOW_FILE="workflows/whatsapp-agent.json"
WORKFLOW_ID="HspgxfwUvvbvdZM5"
N8N_BASE_URL="https://n8n-production-e595.up.railway.app"

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: falta la variable de entorno N8N_API_KEY." >&2
  exit 1
fi

# La API de n8n solo acepta name/nodes/connections/settings en el body del
# update; cualquier otro campo (id, active, tags, meta, versionId...) hace
# que rechace la petición con 400.
payload=$(jq '{name, nodes, connections, settings}' "$WORKFLOW_FILE")

response_file="$(mktemp)"
http_code=$(curl -sS -o "$response_file" -w "%{http_code}" \
  -X PUT \
  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "${N8N_BASE_URL}/api/v1/workflows/${WORKFLOW_ID}")

echo "n8n respondió con HTTP ${http_code}"
cat "$response_file"
echo

if [[ "$http_code" -lt 200 || "$http_code" -ge 300 ]]; then
  echo "Fallo al sincronizar el workflow con n8n." >&2
  exit 1
fi

echo "Workflow sincronizado correctamente."
