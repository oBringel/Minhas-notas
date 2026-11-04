-- Executado automaticamente quando o servidor inicia (é seguro rodar várias vezes)

CREATE TABLE IF NOT EXISTS notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL DEFAULT 'Nova nota',
  body        TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id     UUID        NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  text        TEXT        NOT NULL,
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  position    SERIAL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admissões: tipo da nota, dados do colaborador e benefícios
ALTER TABLE notes ADD COLUMN IF NOT EXISTS kind          TEXT    NOT NULL DEFAULT 'nota';  -- 'nota' ou 'admissao'
ALTER TABLE notes ADD COLUMN IF NOT EXISTS employee_name TEXT    NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS company       TEXT    NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS admission_date DATE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS has_vt        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS has_vr        BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS event_vt       TEXT    NOT NULL DEFAULT '';  -- evento a cadastrar na adm
ALTER TABLE notes ADD COLUMN IF NOT EXISTS event_vr       TEXT    NOT NULL DEFAULT '';

-- Itens fixos (não podem ser removidos) e identificação dos itens de VT/VR
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS locked   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS task_key TEXT;

CREATE INDEX IF NOT EXISTS idx_tasks_note_id ON tasks(note_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);

-- Pontuação do mês: quando cada item foi concluído, meta e marcos já comemorados
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS milestones (
  month       TEXT        NOT NULL,           -- ex.: '2026-11'
  pct         INTEGER     NOT NULL,           -- ex.: 30
  reached_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, pct)
);

-- Deixa a pontuação do mês rápida
CREATE INDEX IF NOT EXISTS idx_tasks_done_at ON tasks(done_at) WHERE done;
