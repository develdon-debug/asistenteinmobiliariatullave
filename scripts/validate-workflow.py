#!/usr/bin/env python3
"""Validador estático del workflow de n8n antes de sincronizarlo.

Revisa lo que más se ha roto históricamente en este proyecto:
- JSON válido y campos que exige la API de n8n (name, nodes, connections, settings).
- Que toda conexión apunte a un nodo que existe (renombrar nodos rompe esto).
- Que todo nodo que llama APIs externas tenga Retry On Fail.
- Que el AI Agent tenga salida de error conectada (fallback a asesor).
- Que los nodos finales de cada rama produzcan el campo `output` (lo que el
  Chat Trigger devuelve al cliente).
- Que ninguna credencial tenga valores embebidos (solo referencias por ID).

Uso: python3 scripts/validate-workflow.py [ruta-al-json]
Sale con código 1 si hay errores (para usarlo en CI).
"""
import json
import sys

EXTERNAL_API_TYPES = {
    "@n8n/n8n-nodes-langchain.lmChatGoogleGemini",
    "@n8n/n8n-nodes-langchain.lmChatAnthropic",
    "n8n-nodes-base.googleSheets",
    "n8n-nodes-base.googleSheetsTool",
    "n8n-nodes-base.httpRequest",
    "n8n-nodes-base.whatsApp",
}

path = sys.argv[1] if len(sys.argv) > 1 else "workflows/whatsapp-agent.json"
errors, warnings = [], []

with open(path) as f:
    wf = json.load(f)

for field in ("name", "nodes", "connections", "settings"):
    if field not in wf:
        errors.append(f"Falta el campo obligatorio '{field}'")

nodes = {n["name"]: n for n in wf.get("nodes", [])}

# IDs de nodo duplicados rompen el import
ids = [n["id"] for n in wf.get("nodes", [])]
for dup in {i for i in ids if ids.count(i) > 1}:
    errors.append(f"ID de nodo duplicado: {dup}")

# Conexiones consistentes
for src, kinds in wf.get("connections", {}).items():
    if src not in nodes:
        errors.append(f"Conexión desde nodo inexistente: '{src}'")
    for kind, branches in kinds.items():
        for branch in branches:
            for conn in branch or []:
                if conn["node"] not in nodes:
                    errors.append(
                        f"'{src}' conecta a nodo inexistente: '{conn['node']}'"
                    )

# Retry en nodos de APIs externas
for name, n in nodes.items():
    if n["type"] in EXTERNAL_API_TYPES and not n.get("retryOnFail"):
        errors.append(f"Nodo de API externa sin Retry On Fail: '{name}'")

# AI Agent con rama de error conectada
agent = next((n for n in nodes.values() if n["type"].endswith(".agent")), None)
if agent:
    if agent.get("onError") != "continueErrorOutput":
        errors.append("AI Agent sin onError=continueErrorOutput (sin fallback)")
    branches = wf["connections"].get(agent["name"], {}).get("main", [])
    if len(branches) < 2 or not branches[1]:
        errors.append("La salida de error del AI Agent no está conectada a nada")
else:
    warnings.append("No se encontró ningún nodo AI Agent")

# Credenciales solo por referencia (id + name), nunca valores
for name, n in nodes.items():
    for cred in (n.get("credentials") or {}).values():
        extra = set(cred.keys()) - {"id", "name"}
        if extra:
            errors.append(f"'{name}' tiene datos de credencial embebidos: {extra}")

# Nodos Set finales deben producir el campo 'output'
targets = {c["node"] for kinds in wf.get("connections", {}).values()
           for branches in kinds.values() for b in branches for c in (b or [])}
for name, n in nodes.items():
    is_final = name not in wf.get("connections", {}) or not any(
        b for b in wf["connections"][name].get("main", [])
    )
    if is_final and n["type"] == "n8n-nodes-base.set":
        fields = [a["name"] for a in n["parameters"]["assignments"]["assignments"]]
        if "output" not in fields:
            errors.append(f"Nodo final '{name}' no produce el campo 'output'")

for w in warnings:
    print(f"  AVISO: {w}")
if errors:
    print(f"✗ {path}: {len(errors)} error(es)")
    for e in errors:
        print(f"  ERROR: {e}")
    sys.exit(1)
print(f"✓ {path}: workflow válido ({len(nodes)} nodos)")
