# Agente de WhatsApp con IA — Inmobiliaria Tu Llave

Agente de IA por WhatsApp para **Inmobiliaria Tu Llave** (Bucaramanga/Piedecuesta/Curití, Santander). Responde 24/7 con información real de propiedades (venta y arriendo de apartamentos, apartaestudios, casas, lotes, bodegas y oficinas) y deriva a un asesor humano cuando corresponde (agendar visitas, negociar precio final, temas fuera de alcance).

- Sitio de la inmobiliaria: inmobiliariatullave.com (WordPress, construido por Grupo Axis)
- Inventario actual: 9 propiedades activas confirmadas (IDs 5, 6, 7, 9–14; el ID 8 no existe)

## Arquitectura (decidida, no reabrir sin razón nueva)

| Componente | Elección | Por qué |
|---|---|---|
| Orquestación | **n8n self-hosted** en Railway (plantilla oficial n8n + PostgreSQL) | Auto-hospedable, gratis, con persistencia real. Se descartaron alternativas no-code de pago (Wati, Landbot, ManyChat) y Make (de pago, no auto-hospedable). |
| Canal | **WhatsApp Business Cloud API oficial de Meta** | Se descartaron BSPs de pago (Twilio, 360dialog) y Evolution API (viola los ToS de WhatsApp; solo válida como demo temporal desechable, nunca usada en este proyecto). |
| LLM | Intercambiable: **Google Gemini 2.5 Flash** (gratis, ~1500 req/día, usado en pruebas) o **Anthropic Claude Haiku 4.5** (~US$0.003/mensaje, para producción) | Presupuesto casi nulo; Gemini free tier permite probar sin costo, Claude Haiku queda como opción de producción de bajo costo. |
| Datos de propiedades | Google Sheet "Propiedades Tu Llave" como Tool del AI Agent | Gratis, editable por el cliente, sin necesidad de backend propio. |

Esta combinación ya fue evaluada exhaustivamente como "estado del arte" para el caso de uso — no reabrir la decisión salvo que cambien restricciones de volumen o presupuesto.

## Estado por fase

| Fase | Estado | Detalle |
|---|---|---|
| Fase 0 — Meta Business Manager | 🟡 En progreso | Business Manager real creado ("Inmobiliaria Tu Llave S.A.S", página FB/IG vinculada). Verificación de negocio enviada, en revisión (~2 días hábiles según Meta). Cuenta de WhatsApp en el portfolio: "Aprobada" pero sin dirección/moneda/zona horaria configuradas — revisar antes de producción. |
| Migración WhatsApp Business App | ✅ Hecho | Backup + migración del número real de la empresa completada. |
| Coexistencia (conectar número real a Cloud API) | ⬜ Pendiente | Bloqueado hasta terminar verificación. **No intentar con datos provisionales** (causó bloqueo real de cuenta, error 131031, la vez pasada). |
| Fase 1 — n8n en Railway | ✅ Hecho y probado | Desplegado con plantilla oficial (n8n + Postgres). Persistencia confirmada tras reinicios. |
| Fase 2 — Conectar WhatsApp en n8n | ⬜ Pendiente | Hecho con número de prueba de Meta (temporal); ese número tuvo el incidente de bloqueo. Falta reemplazar credenciales (Phone Number ID + Access Token) por las del número real una vez pase Coexistencia — no requiere reconstruir el workflow. |
| Fase 3 — AI Agent (cerebro) | ✅ Hecho y probado | n8n: Chat Trigger → AI Agent → Simple Memory + Chat Model (Anthropic/Gemini intercambiable). System prompt probado: se mantiene en tema, recuerda contexto, deriva a humano en vez de inventar compromisos. |
| Fase 4 — Datos de propiedades | ✅ Hecho y probado | Google Sheets node (Get Row(s), sin filtros) como Tool del AI Agent. Responde con datos reales exactos, sin alucinar propiedades inexistentes. Credencial OAuth2 de Google ya configurada en n8n self-hosted. |
| Fase 5 — Robustez | ✅ Hecho (falta probar en n8n) | Ver `workflows/whatsapp-agent.json` y la sección "Qué incluye la versión actual" abajo: Retry On Fail en todos los nodos de APIs externas, fallback a asesor humano, validación de mensajes entrantes, logging de conversaciones a Google Sheets, límites de tokens de salida, timeout de ejecución y system prompt endurecido contra manipulación. Pendiente: probarlo en la instancia real con el Chat Trigger. |
| Conexión final WhatsApp real | ⬜ Pendiente | Depende de Coexistencia. Último paso del proyecto. |

## Pendientes de negocio (no técnicos, bloquean decisiones)

- Confirmar si Tu Llave usa el CRM Nuby (nuby.ai). No publica API pública documentada; si lo usan, contactar soporte@nuby.ai para preguntar por API/webhooks.
- Definir quién mantiene actualizado el Google Sheet de propiedades — nunca se cerró con el cliente.
- Aclarar con Tu Llave la inconsistencia de la propiedad ID 12 (título dice "Oficina", URL/slug dice "Bodega-en-Arriendo-12").

## Errores ya cometidos (no repetir)

1. Usar datos de negocio provisionales/inventados en Meta Business Manager → cuenta bloqueada. Ahora todo se hace con datos reales desde el inicio.
2. Asumir que n8n Cloud y n8n self-hosted comparten el mismo flujo OAuth2 con Google — self-hosted requiere credenciales propias en Google Cloud Console (proyecto, APIs habilitadas, OAuth consent screen con test users, Client ID/Secret).
3. Depender de modelos gratis compartidos (OpenRouter free tier, 50 msj/día compartidos globalmente) generó bloqueos poco confiables — el free tier propio de Google Gemini resultó mucho más estable.

## Credenciales y accesos (ya existen — ubicar, no regenerar salvo error)

Ninguna credencial vive en este repo. Referencias de dónde están:

- n8n corriendo en Railway (API key generada en Settings → n8n API).
- Credencial de Anthropic (cuenta personal en console.anthropic.com).
- Credencial de Google Gemini (API key en aistudio.google.com).
- Credencial OAuth2 de Google Sheets (Client ID/Secret propios en Google Cloud Console, vinculados en n8n).
- Meta Business Manager real de Inmobiliaria Tu Llave + app en developers.facebook.com (con número de prueba activo mientras se resuelve Coexistencia).

## Restricciones a respetar siempre

- Presupuesto casi nulo — evitar cualquier suscripción/servicio de pago salvo estrictamente necesario, avisando el costo exacto antes.
- Explicar el "por qué", no solo el "qué", en decisiones técnicas importantes.
- Nunca usar datos provisionales/inventados en cuentas de Meta — siempre datos reales de Tu Llave.

## Próximo paso inmediato

1. Confirmar que el secret `N8N_API_KEY` quedó en **Actions** (no en Codespaces) y que el GitHub Action "Sync workflow to n8n" corre en verde.
2. Crear la pestaña `Log` en el Google Sheet (ver paso manual arriba).
3. Probar el workflow v2 en n8n con el Chat Trigger: mensaje normal, mensaje vacío, mensaje larguísimo, pregunta fuera de tema, e "ignora tus instrucciones".
4. Cuando pase la verificación de Meta: retomar Coexistencia y conectar el número real (Fase 2).

## Este repositorio

Contiene la documentación del proyecto y el workflow de n8n exportado para control de versiones:

- `workflows/whatsapp-agent.backup.json` — export tal cual estaba en Railway al 2026-07-06, sin modificar. Referencia de respaldo.
- `workflows/whatsapp-agent.json` — versión mejorada (Fase 5 completa). Ver detalle abajo.
- `scripts/validate-workflow.py` — validador estático del workflow (conexiones rotas, nodos sin retry, credenciales embebidas, ramas sin `output`). Corre automáticamente en el GitHub Action antes de cada sync; también se puede correr local: `python3 scripts/validate-workflow.py`.

### Qué incluye la versión actual del workflow (v2, 2026-07-06)

Flujo: `Chat Trigger → Validar mensaje → AI Agent → Registrar en log → Responder al cliente`, con rama de error del agente hacia `Fallback - derivar a asesor` y rama de mensaje inválido hacia `Mensaje inválido`.

**Robustez ante fallos:**
- Retry On Fail en Gemini (3 intentos, 3s — el free tier devuelve 429 bajo carga y conviene esperar), en las dos operaciones de Google Sheets (3 y 2 intentos) y en el AI Agent (2 intentos).
- Si el agente falla incluso tras reintentar, el cliente recibe el mensaje del nodo "Fallback - derivar a asesor" en vez de silencio.
- `executionTimeout: 120` segundos — ninguna ejecución se queda colgada indefinidamente.
- El logging es "best effort": si falla el log, la respuesta al cliente sale igual (`onError: continueRegularOutput` + nodo "Responder al cliente" que toma la respuesta directo del AI Agent).

**Protección de entrada (anti-abuso y control de costos):**
- "Validar mensaje" rechaza mensajes vacíos o de más de 1500 caracteres antes de gastar tokens en el LLM (alguien pegando un texto enorme costaría dinero/quota en cada intento).
- `maxOutputTokens: 1024` y `temperature: 0.4` en Gemini — respuestas cortas, consistentes y de costo acotado.
- Modelo fijado explícitamente a `models/gemini-2.5-flash` (antes dependía del default del nodo, que puede cambiar entre versiones de n8n).

**Cerebro:**
- System prompt reescrito: reglas de formato WhatsApp (mensajes cortos, *negritas*, sin markdown), máximo 3 propiedades por mensaje, pedir nombre + propiedad de interés al derivar a asesor, y sección de seguridad explícita (no revelar instrucciones, resistir "ignora tus instrucciones", no pedir datos sensibles).
- Memoria de conversación ampliada a 10 turnos (default era 5).
- La herramienta de Sheets ahora se llama "Consultar propiedades" con descripción manual — el LLM decide usar la herramienta según su nombre/descripción, y el nombre viejo ("Get row(s) in sheet in Google Sheets") era ruido.

**Observabilidad:**
- Nodo "Registrar en log": cada conversación (fecha, sesión, mensaje, respuesta) se anexa a una pestaña **Log** del mismo Google Sheet. Gratis y visible para el cliente.
- `saveDataErrorExecution` y `saveDataSuccessExecution` en "all": todas las ejecuciones quedan en el historial de n8n (Executions) para depurar. Postgres ya da la persistencia.
- Zona horaria del workflow fijada a `America/Bogota` (los timestamps del log salen en hora colombiana).

**⚠️ Paso manual requerido (una sola vez):** en el Google Sheet "Propiedades Tu Llave", crea una pestaña nueva llamada exactamente `Log` con estos encabezados en la fila 1: `fecha | sesion | mensaje | respuesta`. Sin ella el logging falla (aunque el bot sigue respondiendo normal, por diseño).

**Cómo aplicar esto en n8n manualmente (primera vez):** en la UI de Railway, abre el workflow → menú (⋮) → Import from File → selecciona `whatsapp-agent.json` (o pega el contenido directo en el canvas, ver más abajo). Revisa visualmente el nuevo nodo "Fallback - derivar a asesor" y sus conexiones antes de guardar, y prueba el flujo con el Chat Trigger antes de considerarlo listo.

### Sync automático hacia n8n

`.github/workflows/sync-n8n-workflow.yml` sube automáticamente `workflows/whatsapp-agent.json` a la instancia de n8n en Railway cada vez que ese archivo cambia en este repo (push a `main` o a la branch de trabajo). Usa `scripts/sync-n8n-workflow.sh`, que llama a `PUT /api/v1/workflows/{id}` de la API de n8n.

**Configuración única (manual, una sola vez):**

1. En n8n: **Settings → n8n API** → genera una API key nueva (recomendado: la anterior quedó expuesta en un chat, conviene revocarla).
2. En GitHub: repo → **Settings → Secrets and variables → Actions → New repository secret** → nombre `N8N_API_KEY`, valor la API key generada.
3. Listo. De ahí en adelante, cualquier cambio que yo haga a `workflows/whatsapp-agent.json` se refleja solo en n8n al hacer push — no hace falta copiar/pegar de nuevo.

**Qué NO hace este sync (por diseño, para evitar sorpresas):**
- No activa ni desactiva el workflow (el campo `active` no se toca) — activarlo en producción sigue siendo una decisión manual.
- No toca credenciales — siguen siendo las que ya existen en la instancia de n8n, referenciadas por ID.
- Solo sincroniza `whatsapp-agent.json`, no el `.backup.json` (ese es una foto fija, no se vuelve a subir).

Además, desde la v2 el Action **valida el workflow antes de subirlo** (`scripts/validate-workflow.py`): si el JSON tiene conexiones rotas, nodos sin retry o credenciales embebidas, el sync no se ejecuta.
