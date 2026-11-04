require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const { pool, initDb } = require('./db');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const VERSION = Date.now().toString(36); // muda a cada reinício: força atualizar o CSS em cache

const app = express();

// Compressão das páginas (instale com "npm install")
let compression = null;
try { compression = require('compression'); }
catch { console.warn('Dica: rode "npm install" para ativar a compressão das páginas.'); }
if (compression) app.use(compression());
app.use(express.json({ limit: '1mb' }));

const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const clean = (value, max) => String(value ?? '').trim().slice(0, max);

// ---------- Modelo de admissão ----------
// Itens fixos: nascem em toda admissão e não podem ser removidos.
const FIXED_TASKS = [
  'Admissão preliminar',
  'Envio p/ eSocial',
  'Envio de documentação admissional',
  'Doc. Pessoais na pasta',
];

// "Tem VT? Sim" / "Tem VR? Sim" adicionam um item de evento ao checklist.
const BENEFITS = {
  vt: { column: 'has_vt', event: 'event_vt', label: 'Evento VT' },
  vr: { column: 'has_vr', event: 'event_vr', label: 'Evento VR' },
};

const admissionTitle = (name) => (name ? `Admissão · ${name}` : 'Nova admissão');

// ---------- Consulta base das notas ----------
const NOTE_SELECT = `
  SELECT n.id, n.kind, n.title, n.body, n.updated_at,
         n.employee_name, n.company,
         to_char(n.admission_date, 'YYYY-MM-DD') AS admission_date,
         n.has_vt, n.has_vr, n.event_vt, n.event_vr,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'text', t.text, 'done', t.done,
                               'locked', t.locked, 'key', t.task_key)
             ORDER BY t.locked DESC,
                      CASE t.task_key WHEN 'vt' THEN 1 WHEN 'vr' THEN 2 ELSE 0 END,
                      t.position
           ) FILTER (WHERE t.id IS NOT NULL),
           '[]'
         ) AS tasks
    FROM notes n
    LEFT JOIN tasks t ON t.note_id = n.id`;

async function getNote(db, id) {
  const { rows } = await db.query(`${NOTE_SELECT} WHERE n.id = $1 GROUP BY n.id`, [id]);
  return rows[0];
}

async function listNotes(db) {
  const { rows } = await db.query(`${NOTE_SELECT} GROUP BY n.id ORDER BY n.updated_at DESC`);
  return rows;
}

// ---------- Pontuação do mês ----------
const APP_TZ = process.env.APP_TZ || 'America/Fortaleza';
const MILESTONES = [30, 50, 75, 100];   // % da meta que disparam a mensagem
const DEFAULT_GOAL = 100;               // pontos (1 ponto = 1 item concluído)

function parseRewards(raw) {
  let saved = {};
  try { saved = raw ? JSON.parse(raw) : {}; } catch { saved = {}; }
  // Recompensas: o texto é digitado por ela (nada vem pré-definido).
  return Object.fromEntries(
    MILESTONES.map((m) => [m, typeof saved[m] === 'string' ? saved[m] : ''])
  );
}

// Pontos = itens concluídos neste mês. Desmarcar um item tira o ponto.
// Tudo é lido numa única consulta. Com celebrate=true, registra os marcos novos
// (cada marco só é comemorado uma vez por mês).
async function getScore(db, { celebrate = false } = {}) {
  const { rows } = await db.query(
    `WITH m AS (
       SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS month,
              date_trunc('month', now() AT TIME ZONE $1) AT TIME ZONE $1 AS starts,
              (date_trunc('month', now() AT TIME ZONE $1) + interval '1 month') AT TIME ZONE $1 AS ends
     )
     SELECT m.month,
            (SELECT count(*)::int FROM tasks
              WHERE done AND done_at >= m.starts AND done_at < m.ends) AS points,
            (SELECT value FROM settings WHERE key = 'monthly_goal') AS goal,
            (SELECT value FROM settings WHERE key = 'rewards') AS rewards,
            COALESCE((SELECT array_agg(pct ORDER BY pct) FROM milestones WHERE month = m.month),
                     '{}'::int[]) AS reached
       FROM m`,
    [APP_TZ]
  );
  const row = rows[0];
  const parsedGoal = Number.parseInt(row.goal, 10);
  const goal = parsedGoal >= 1 ? parsedGoal : DEFAULT_GOAL;
  const percent = Math.floor((row.points * 100) / goal);

  let reached = row.reached;
  const newlyReached = [];
  if (celebrate) {
    const fresh = MILESTONES.filter((m) => percent >= m && !reached.includes(m));
    if (fresh.length) {
      const ins = await db.query(
        `INSERT INTO milestones (month, pct)
         SELECT $1::text, unnest($2::int[])
         ON CONFLICT DO NOTHING RETURNING pct`,
        [row.month, fresh]
      );
      newlyReached.push(...ins.rows.map((r) => r.pct));
      reached = [...new Set([...reached, ...fresh])].sort((a, b) => a - b);
    }
  }

  return {
    month: row.month, points: row.points, goal, percent,
    milestones: MILESTONES, rewards: parseRewards(row.rewards), reached, newlyReached,
  };
}

// ---------- Notas ----------
app.get('/api/notes', wrap(async (_req, res) => {
  res.json(await listNotes(pool));
}));

app.post('/api/notes', wrap(async (req, res) => {
  const kind = req.body.kind === 'admissao' ? 'admissao' : 'nota';
  const title = kind === 'admissao' ? admissionTitle('') : clean(req.body.title, 200) || 'Nova nota';
  const fixed = kind === 'admissao' ? FIXED_TASKS : [];

  // Nota + itens fixos numa única instrução (atômica, uma ida ao banco)
  const { rows } = await pool.query(
    `WITH n AS (
       INSERT INTO notes (kind, title, body) VALUES ($1, $2, '') RETURNING id
     ), t AS (
       INSERT INTO tasks (note_id, text, locked)
       SELECT n.id, u.txt, TRUE
         FROM n, unnest($3::text[]) WITH ORDINALITY AS u(txt, ord)
        ORDER BY u.ord
       RETURNING 1
     )
     SELECT id FROM n`,
    [kind, title, fixed]
  );
  res.status(201).json(await getNote(pool, rows[0].id));
}));

// Atualiza nota comum ou admissão com um único UPDATE
app.put('/api/notes/:id', wrap(async (req, res) => {
  const b = req.body;
  const name = clean(b.employee_name, 200);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.admission_date ?? '') ? b.admission_date : null;

  const { rows } = await pool.query(
    `UPDATE notes SET
        title          = CASE WHEN kind = 'admissao' THEN $1::text ELSE $2::text END,
        body           = $3::text,
        employee_name  = CASE WHEN kind = 'admissao' THEN $4::text ELSE employee_name END,
        company        = CASE WHEN kind = 'admissao' THEN $5::text ELSE company END,
        admission_date = CASE WHEN kind = 'admissao' THEN $6::date ELSE admission_date END,
        event_vt       = CASE WHEN kind = 'admissao' THEN $7::text ELSE event_vt END,
        event_vr       = CASE WHEN kind = 'admissao' THEN $8::text ELSE event_vr END,
        updated_at     = now()
      WHERE id = $9
      RETURNING id, title, updated_at`,
    [
      admissionTitle(name), String(b.title ?? '').slice(0, 200), String(b.body ?? ''),
      name, clean(b.company, 200), date, clean(b.event_vt, 300), clean(b.event_vr, 300),
      req.params.id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.json(rows[0]);
}));

app.delete('/api/notes/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM notes WHERE id = $1', [req.params.id]);
  res.status(204).end();
}));

// ---------- VT / VR da admissão ----------
app.put('/api/notes/:id/benefits/:key', wrap(async (req, res) => {
  const benefit = BENEFITS[req.params.key];
  if (!benefit) return res.status(400).json({ error: 'Benefício desconhecido.' });
  const enabled = Boolean(req.body.enabled);
  const { id, key } = req.params;

  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE notes
          SET ${benefit.column} = $1::boolean,
              ${benefit.event} = CASE WHEN $1::boolean THEN ${benefit.event} ELSE '' END,
              updated_at = now()
        WHERE id = $2 AND kind = 'admissao'
        RETURNING id
     ), del AS (
       DELETE FROM tasks
        WHERE note_id = $2 AND task_key = $3::text AND NOT $1::boolean
          AND EXISTS (SELECT 1 FROM upd)
        RETURNING 1
     ), ins AS (
       INSERT INTO tasks (note_id, text, locked, task_key)
       SELECT $2::uuid, $4::text, TRUE, $3::text
        WHERE $1::boolean AND EXISTS (SELECT 1 FROM upd)
          AND NOT EXISTS (SELECT 1 FROM tasks WHERE note_id = $2 AND task_key = $3::text)
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM upd)::int AS found`,
    [enabled, id, key, benefit.label]
  );
  if (!rows[0].found) return res.status(404).json({ error: 'Admissão não encontrada.' });
  res.json((await getNote(pool, id)).tasks);
}));

// ---------- Itens do checklist ----------
app.post('/api/notes/:id/tasks', wrap(async (req, res) => {
  const text = clean(req.body.text, 500);
  if (!text) return res.status(400).json({ error: 'O item está vazio.' });
  const { rows } = await pool.query(
    `WITH t AS (
       INSERT INTO tasks (note_id, text) VALUES ($1, $2)
       RETURNING id, text, done, locked, task_key AS key
     ), n AS (
       UPDATE notes SET updated_at = now() WHERE id = $1
     )
     SELECT id, text, done, locked, key FROM t`,
    [req.params.id, text]
  );
  res.status(201).json(rows[0]);
}));

app.patch('/api/tasks/:id', wrap(async (req, res) => {
  const done = Boolean(req.body.done);
  const { rows } = await pool.query(
    `WITH t AS (
       UPDATE tasks
          SET done = $1::boolean,
              done_at = CASE WHEN $1::boolean THEN COALESCE(done_at, now()) ELSE NULL END
        WHERE id = $2
        RETURNING id, note_id, text, done, locked, task_key AS key
     ), n AS (
       UPDATE notes SET updated_at = now() WHERE id IN (SELECT note_id FROM t)
     )
     SELECT id, text, done, locked, key FROM t`,
    [done, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Item não encontrado.' });
  const score = await getScore(pool, { celebrate: done });
  res.json({ ...rows[0], score });
}));

app.delete('/api/tasks/:id', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `WITH d AS (
       DELETE FROM tasks WHERE id = $1 AND locked = FALSE RETURNING note_id
     ), n AS (
       UPDATE notes SET updated_at = now() WHERE id IN (SELECT note_id FROM d)
     )
     SELECT (SELECT count(*) FROM d)::int AS removed,
            EXISTS (SELECT 1 FROM tasks WHERE id = $1 AND locked) AS is_locked`,
    [req.params.id]
  );
  if (!rows[0].removed && rows[0].is_locked) {
    return res.status(403).json({ error: 'Este item é fixo e não pode ser removido.' });
  }
  res.status(204).end();
}));

// ---------- Pontuação, meta e recompensas ----------
const upsertSetting = (key, value) => pool.query(
  `INSERT INTO settings (key, value) VALUES ($1, $2)
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]
);

app.get('/api/score', wrap(async (_req, res) => {
  res.json(await getScore(pool));
}));

app.put('/api/goal', wrap(async (req, res) => {
  const goal = Number.parseInt(req.body.goal, 10);
  if (!Number.isInteger(goal) || goal < 1 || goal > 9999) {
    return res.status(400).json({ error: 'A meta precisa ser um número entre 1 e 9999.' });
  }
  await upsertSetting('monthly_goal', String(goal));
  res.json(await getScore(pool));
}));

app.put('/api/rewards', wrap(async (req, res) => {
  const input = req.body.rewards && typeof req.body.rewards === 'object' ? req.body.rewards : {};
  const rewards = Object.fromEntries(MILESTONES.map((m) => [m, clean(input[m], 80)]));
  await upsertSetting('rewards', JSON.stringify(rewards));
  res.json(await getScore(pool));
}));

// ---------- Página inicial ----------
// Já entrega as notas e a pontuação dentro do HTML: a tela aparece pronta,
// sem esperar mais idas e vindas ao servidor depois de carregar o JavaScript.
let indexTemplate = null;
const template = () => {
  indexTemplate ??= fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')
    .replaceAll('__V__', VERSION);
  return indexTemplate;
};

app.get(['/', '/index.html'], wrap(async (_req, res) => {
  let boot = 'null';
  try {
    const [notes, score] = await Promise.all([listNotes(pool), getScore(pool)]);
    boot = JSON.stringify({ notes, score }).replace(/</g, '\\u003c');
  } catch (err) {
    console.error('Não consegui pré-carregar as notas:', err.message);
  }
  res.set('Cache-Control', 'no-store').type('html').send(template().replace('__BOOT__', () => boot));
}));

// ---------- Arquivos do site ----------
app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  setHeaders(res, filePath) {
    // CSS tem versão na URL (?v=...): pode ficar em cache por muito tempo.
    // JS é conferido rapidamente a cada visita (resposta 304, sem baixar de novo).
    res.setHeader('Cache-Control',
      filePath.endsWith('.css') ? 'public, max-age=31536000, immutable' : 'no-cache');
  },
}));

// ---------- Erros ----------
app.use((err, _req, res, _next) => {
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador inválido.' });
  if (err.code === '23503') return res.status(404).json({ error: 'Nota não encontrada.' });
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor.' });
});

const PORT = process.env.PORT || 3000;

// Suas rotas (app.get, app.post, etc) vêm aqui...

async function ligarServidor() {
  try {
    // 1. Conecta no Neon e cria as tabelas do schema.sql se não existirem
    await initDb();
    console.log("Banco de dados sincronizado com sucesso!");

    // 2. Só então liga o servidor
    app.listen(PORT, () => {
      console.log(`Servidor rodando na porta ${PORT}`);
    });
  } catch (error) {
    console.error("Erro ao iniciar o servidor:", error);
  }
}

ligarServidor();
