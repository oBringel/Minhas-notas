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

-- Rescisão: tipo, prazos e prévia
ALTER TABLE notes ADD COLUMN IF NOT EXISTS rescission_type TEXT    NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN IF NOT EXISTS last_day        DATE;     -- último dia trabalhado
ALTER TABLE notes ADD COLUMN IF NOT EXISTS pay_limit       DATE;     -- dia limite de pagamento
ALTER TABLE notes ADD COLUMN IF NOT EXISTS send_limit      DATE;     -- dia limite para envio
ALTER TABLE notes ADD COLUMN IF NOT EXISTS has_preview     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS preview_date    DATE;     -- data de enviar a prévia

-- Ordem dos itens dentro de cada grupo do checklist
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Lixeira: nada é apagado de verdade. A nota sai da tela, mas continua guardada.
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;  -- foi para a lixeira
ALTER TABLE notes ADD COLUMN IF NOT EXISTS purged_at  TIMESTAMPTZ;  -- "excluída para sempre" (sai da lixeira, conteúdo fica no banco)
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted_at) WHERE deleted_at IS NOT NULL;

-- =====================================================================
--  Painel de RH (Dashboard, Arquivos, Calendário, Férias)
-- =====================================================================

-- Quadro de Pendências: as digitadas à mão.
-- As que vêm dos módulos (rescisão, admissão, férias) são calculadas na hora,
-- então não precisam ser cadastradas de novo aqui.
CREATE TABLE IF NOT EXISTS pendencias (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  due_date    DATE,
  priority    TEXT        NOT NULL DEFAULT 'media',  -- alta | media | baixa
  module      TEXT        NOT NULL DEFAULT 'geral',  -- admissao | rescisao | ferias | geral
  done        BOOLEAN     NOT NULL DEFAULT FALSE,
  done_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pendencias_due ON pendencias(due_date);

-- Checklist rápido do dia a dia
CREATE TABLE IF NOT EXISTS checklist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text       TEXT        NOT NULL,
  done       BOOLEAN     NOT NULL DEFAULT FALSE,
  position   SERIAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arquivos: pastas (com subpastas) e os documentos guardados dentro delas.
-- O conteúdo fica no próprio banco (BYTEA), então nada se perde ao reiniciar.
CREATE TABLE IF NOT EXISTS folders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  parent_id  UUID        REFERENCES folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS files (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id  UUID        REFERENCES folders(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  mime       TEXT        NOT NULL DEFAULT 'application/octet-stream',
  size       INTEGER     NOT NULL DEFAULT 0,
  category   TEXT        NOT NULL DEFAULT '',
  data       BYTEA       NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);

-- Férias: quem sai, de quando até quando
CREATE TABLE IF NOT EXISTS vacations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_name TEXT        NOT NULL DEFAULT '',
  company       TEXT        NOT NULL DEFAULT '',
  start_date    DATE,
  end_date      DATE,
  note          TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vacations_start ON vacations(start_date);

-- Eventos e compromissos do calendário
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  day         DATE        NOT NULL,
  category    TEXT        NOT NULL DEFAULT 'geral',  -- prazo | admissao | ferias | documento | feriado | geral
  module      TEXT        NOT NULL DEFAULT '',       -- admissao | rescisao | ferias | geral
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_day ON events(day);
