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

// ---------- Modelo de rescisão ----------
// Itens fixos de cima (obrigatórios em todas as rescisões)
const RESCISSION_TOP = [
  'Checar data base - sindicato',
  'Checar período de experiência',
  'Solicitar extrato para fins rescisórios',
  'Consignado importado',
  'Aviso (indenizado, trabalhado, pedido de demissão)',
];

// Itens fixos de baixo, depois dos que mudam conforme o tipo. O último ganha uma carinha feliz.
const RESCISSION_BOTTOM = [
  'Enviado pro eSocial',
  'Arquivo bancário',
  'Enviada prévia de rescisão',
  'Enviado via Conecta',
];

// Itens que mudam conforme o tipo de rescisão (justa causa fica de fora por enquanto)
const RESCISSION_TYPES = {
  sem_justa_causa: [
    'Termo de rescisão', 'Carta de recomendação', 'Ficha de registro',
    'Seguro desemprego', 'Extrato simples de FGTS', 'Multa de 40% FGTS',
  ],
  pedido_demissao: [
    'Termo de rescisão', 'Extrato de FGTS', 'Ficha de registro',
  ],
  antecipacao_empregador: [
    'Termo de rescisão', 'Extrato de FGTS', 'Ficha de registro',
    'Carta de recomendação', 'Comunicado de ant. de período de exp.', 'Seguro Desemprego',
  ],
  antecipacao_empregado: [
    'Termo de rescisão', 'Extrato de FGTS', 'Ficha de registro',
  ],
};

const firstWord = (text) => String(text ?? '').trim().split(/\s+/)[0] || '';
const rescissionTitle = (company, employee) => {
  const parts = [firstWord(company), firstWord(employee)].filter(Boolean);
  return parts.length ? `Rescisão ${parts.join(' ')}` : 'Nova rescisão';
};

// Linhas de checklist de uma nova rescisão: fixos de cima, do tipo, fixos de baixo
function rescissionRows(type) {
  const rows = [];
  RESCISSION_TOP.forEach((text, i) => rows.push({ text, key: 'r:top', order: i }));
  (RESCISSION_TYPES[type] ?? []).forEach((text, i) => rows.push({ text, key: 'r:var', order: i }));
  RESCISSION_BOTTOM.forEach((text, i) => rows.push({
    text, key: i === RESCISSION_BOTTOM.length - 1 ? 'r:final' : 'r:bottom', order: i,
  }));
  return rows;
}

const day = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : null);

// ---------- Consulta base das notas ----------
const NOTE_SELECT = `
  SELECT n.id, n.kind, n.title, n.body, n.updated_at, n.deleted_at,
         n.employee_name, n.company,
         to_char(n.admission_date, 'YYYY-MM-DD') AS admission_date,
         n.has_vt, n.has_vr, n.event_vt, n.event_vr,
         n.rescission_type,
         to_char(n.last_day, 'YYYY-MM-DD') AS last_day,
         to_char(n.pay_limit, 'YYYY-MM-DD') AS pay_limit,
         to_char(n.send_limit, 'YYYY-MM-DD') AS send_limit,
         n.has_preview,
         to_char(n.preview_date, 'YYYY-MM-DD') AS preview_date,
         COALESCE(
           json_agg(
             json_build_object('id', t.id, 'text', t.text, 'done', t.done,
                               'locked', t.locked, 'key', t.task_key)
             ORDER BY CASE
                        WHEN t.task_key = 'r:var' THEN 1
                        WHEN t.task_key IN ('r:bottom', 'r:final') THEN 3
                        WHEN t.locked THEN 0
                        ELSE 2
                      END,
                      CASE t.task_key WHEN 'vt' THEN 1 WHEN 'vr' THEN 2 ELSE 0 END,
                      t.sort_order, t.position
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
  const { rows } = await db.query(
    `${NOTE_SELECT} WHERE n.deleted_at IS NULL GROUP BY n.id ORDER BY n.updated_at DESC`
  );
  return rows;
}

// Lixeira: o que saiu da tela e ainda não foi "excluído para sempre"
async function listTrash(db) {
  const { rows } = await db.query(
    `${NOTE_SELECT} WHERE n.deleted_at IS NOT NULL AND n.purged_at IS NULL
      GROUP BY n.id ORDER BY n.deleted_at DESC`
  );
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

app.get('/api/trash', wrap(async (_req, res) => {
  res.json(await listTrash(pool));
}));

app.post('/api/notes', wrap(async (req, res) => {
  const kind = ['admissao', 'rescisao'].includes(req.body.kind) ? req.body.kind : 'nota';
  const company = clean(req.body.company, 200);
  const employee = clean(req.body.employee_name, 200);
  const type = Object.hasOwn(RESCISSION_TYPES, req.body.rescission_type) ? req.body.rescission_type : '';

  let title;
  let rows = [];
  if (kind === 'admissao') {
    title = admissionTitle('');
    rows = FIXED_TASKS.map((text, i) => ({ text, key: null, order: i }));
  } else if (kind === 'rescisao') {
    title = rescissionTitle(company, employee);
    rows = rescissionRows(type);
  } else {
    title = clean(req.body.title, 200) || 'Nova nota';
  }

  // Nota + itens do checklist numa única instrução (atômica, uma ida ao banco)
  const { rows: created } = await pool.query(
    `WITH n AS (
       INSERT INTO notes (kind, title, body, company, employee_name, rescission_type)
       VALUES ($1, $2, '', $3, $4, $5) RETURNING id
     ), t AS (
       INSERT INTO tasks (note_id, text, locked, task_key, sort_order)
       SELECT n.id, u.txt, TRUE, u.tkey, u.ord
         FROM n, unnest($6::text[], $7::text[], $8::int[], $9::int[]) AS u(txt, tkey, ord, seq)
        ORDER BY u.seq
       RETURNING 1
     )
     SELECT id FROM n`,
    [
      kind, title, kind === 'nota' ? '' : company, kind === 'nota' ? '' : employee, type,
      rows.map((r) => r.text), rows.map((r) => r.key), rows.map((r) => r.order), rows.map((_, i) => i),
    ]
  );
  res.status(201).json(await getNote(pool, created[0].id));
}));

// Atualiza nota comum, admissão ou rescisão com um único UPDATE
app.put('/api/notes/:id', wrap(async (req, res) => {
  const b = req.body;
  const name = clean(b.employee_name, 200);
  const company = clean(b.company, 200);

  const { rows } = await pool.query(
    `UPDATE notes SET
        title          = CASE kind WHEN 'admissao' THEN $1::text
                                   WHEN 'rescisao' THEN $2::text
                                   ELSE $3::text END,
        body           = $4::text,
        employee_name  = CASE WHEN kind IN ('admissao', 'rescisao') THEN $5::text ELSE employee_name END,
        company        = CASE WHEN kind IN ('admissao', 'rescisao') THEN $6::text ELSE company END,
        admission_date = CASE WHEN kind = 'admissao' THEN $7::date ELSE admission_date END,
        event_vt       = CASE WHEN kind = 'admissao' THEN $8::text ELSE event_vt END,
        event_vr       = CASE WHEN kind = 'admissao' THEN $9::text ELSE event_vr END,
        last_day       = CASE WHEN kind = 'rescisao' THEN $10::date ELSE last_day END,
        pay_limit      = CASE WHEN kind = 'rescisao' THEN $11::date ELSE pay_limit END,
        send_limit     = CASE WHEN kind = 'rescisao' THEN $12::date ELSE send_limit END,
        has_preview    = CASE WHEN kind = 'rescisao' THEN $13::boolean ELSE has_preview END,
        preview_date   = CASE WHEN kind = 'rescisao' THEN $14::date ELSE preview_date END,
        updated_at     = now()
      WHERE id = $15
      RETURNING id, title, updated_at`,
    [
      admissionTitle(name), rescissionTitle(company, name), String(b.title ?? '').slice(0, 200),
      String(b.body ?? ''), name, company,
      day(b.admission_date), clean(b.event_vt, 300), clean(b.event_vr, 300),
      day(b.last_day), day(b.pay_limit), day(b.send_limit), Boolean(b.has_preview), day(b.preview_date),
      req.params.id,
    ]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Nota não encontrada.' });
  res.json(rows[0]);
}));

// Excluir = mandar para a lixeira. Em vez de apagar as linhas, só marca a data,
// então dá para voltar atrás (e o conteúdo continua no banco).
app.delete('/api/notes/:id', wrap(async (req, res) => {
  await pool.query(
    'UPDATE notes SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [req.params.id]
  );
  res.status(204).end();
}));

app.post('/api/notes/:id/restore', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE notes SET deleted_at = NULL, purged_at = NULL
      WHERE id = $1 AND deleted_at IS NOT NULL RETURNING id`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Nota não encontrada na lixeira.' });
  res.json(await getNote(pool, req.params.id));
}));

// "Excluir permanentemente" também não apaga: tira da lixeira e o conteúdo segue guardado
// no banco, fora da interface.
app.delete('/api/notes/:id/permanent', wrap(async (req, res) => {
  await pool.query(
    `UPDATE notes SET purged_at = now()
      WHERE id = $1 AND deleted_at IS NOT NULL AND purged_at IS NULL`,
    [req.params.id]
  );
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

// ---------- Tipo da rescisão ----------
// Troca os itens "variáveis" do checklist. Itens que continuam no novo tipo mantêm o que já foi marcado.
app.put('/api/notes/:id/rescission-type', wrap(async (req, res) => {
  const type = String(req.body.type ?? '');
  if (type !== '' && !Object.hasOwn(RESCISSION_TYPES, type)) {
    return res.status(400).json({ error: 'Tipo de rescisão desconhecido.' });
  }
  const items = RESCISSION_TYPES[type] ?? [];
  const id = req.params.id;

  const { rows } = await pool.query(
    `WITH upd AS (
       UPDATE notes SET rescission_type = $2::text, updated_at = now()
        WHERE id = $1 AND kind = 'rescisao' RETURNING id
     ), del AS (
       DELETE FROM tasks
        WHERE note_id = $1 AND task_key = 'r:var' AND NOT (text = ANY($3::text[]))
          AND EXISTS (SELECT 1 FROM upd)
        RETURNING 1
     ), reorder AS (
       UPDATE tasks t SET sort_order = u.ord::int
         FROM unnest($3::text[]) WITH ORDINALITY AS u(txt, ord)
        WHERE t.note_id = $1 AND t.task_key = 'r:var' AND t.text = u.txt
          AND EXISTS (SELECT 1 FROM upd)
        RETURNING 1
     ), ins AS (
       INSERT INTO tasks (note_id, text, locked, task_key, sort_order)
       SELECT $1::uuid, u.txt, TRUE, 'r:var', u.ord::int
         FROM unnest($3::text[]) WITH ORDINALITY AS u(txt, ord)
        WHERE EXISTS (SELECT 1 FROM upd)
          AND NOT EXISTS (SELECT 1 FROM tasks x
                           WHERE x.note_id = $1 AND x.task_key = 'r:var' AND x.text = u.txt)
       RETURNING 1
     )
     SELECT (SELECT count(*) FROM upd)::int AS found`,
    [id, type, items]
  );
  if (!rows[0].found) return res.status(404).json({ error: 'Rescisão não encontrada.' });
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
initDb()
  .then(() => app.listen(PORT, () => console.log(`🌸 Notas rodando em http://localhost:${PORT}`)))
  .catch((err) => {
    console.error('Não foi possível conectar ao Postgres:', err.message);
    console.error('Confira o DATABASE_URL no arquivo .env e se o banco está ligado.');
    process.exit(1);
  });
