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
| Fase 5 — Robustez | ⬜ **Próximo paso inmediato** | Falta: manejo de errores general, "Retry On Fail" en todos los nodos que llaman APIs externas (parcialmente activado en el Chat Model de Gemini), logging básico, pulir el fallback a humano, límites de costo/rate. |
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

Avanzar la **Fase 5 (robustez)** en el workflow de n8n: revisar todos los nodos que llaman APIs externas (Chat Model, Google Sheets) y confirmar Retry On Fail configurado, agregar manejo de errores explícito, y pulir el mensaje de fallback a humano. No depende de la verificación de Meta y se puede avanzar en paralelo.

## Este repositorio

Por ahora contiene la documentación del proyecto. El workflow de n8n vive en la instancia de Railway; cuando se exporte para control de versiones, el JSON se guardará en `workflows/`.
