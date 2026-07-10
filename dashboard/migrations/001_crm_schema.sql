-- Esquema CRM para el agente de WhatsApp de Tu Llave.
-- Vive en el mismo Postgres de Railway que usa n8n, pero en un esquema
-- separado para no tocar las tablas internas de n8n.

CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.clients (
  id            SERIAL PRIMARY KEY,
  phone         TEXT UNIQUE NOT NULL,
  name          TEXT,
  stage         TEXT NOT NULL DEFAULT 'nuevo'
                CHECK (stage IN ('nuevo','calificado','visita','negociacion','cerrado','perdido')),

  -- Calificación del lead
  operation     TEXT,      -- venta | arriendo
  property_type TEXT,      -- apartamento | apartaestudio | casa | lote | bodega | oficina
  zone          TEXT,      -- Bucaramanga / Piedecuesta / Curití / barrio
  budget_min    NUMERIC,
  budget_max    NUMERIC,
  payment_method TEXT,     -- credito | leasing | recursos_propios | subsidio
  credit_preapproved BOOLEAN,
  urgency       TEXT,      -- inmediata | 1_3_meses | 3_6_meses | explorando
  purpose       TEXT,      -- vivienda | inversion
  household     TEXT,      -- quiénes habitarían: familia, mascotas, ocupantes
  current_situation TEXT,  -- arrienda | propietario | debe_vender_primero
  source        TEXT,      -- cómo nos conoció
  contact_pref  TEXT,      -- horario/medio preferido de contacto
  interested_property_ids TEXT,  -- IDs de propiedades que le interesaron (ej: "5,12")

  is_hot        BOOLEAN NOT NULL DEFAULT false,  -- intención real detectada
  bot_paused    BOOLEAN NOT NULL DEFAULT false,  -- asesor tomó la conversación
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS crm.messages (
  id         SERIAL PRIMARY KEY,
  client_id  INT NOT NULL REFERENCES crm.clients(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('cliente','bot','asesor')),
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm.events (
  id         SERIAL PRIMARY KEY,
  client_id  INT REFERENCES crm.clients(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- lead_caliente | cambio_etapa | bot_pausado | bot_reanudado | nota
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_client_created ON crm.messages (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_clients_stage   ON crm.clients (stage);
CREATE INDEX IF NOT EXISTS idx_clients_last_msg ON crm.clients (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_created  ON crm.events (created_at DESC);
