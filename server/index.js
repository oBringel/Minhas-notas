require('dotenv').config();
const path = require('path');
const express = require('express');
const { pool, initDb } = require('./db');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// ---------- Pontuação do mês ----------
const APP_TZ = process.env.APP_TZ || 'America/Fortaleza';
const MILESTONES = [30, 50, 75, 100];   // % da meta que disparam a mensagem
const DEFAULT_GOAL = 100;               // pontos (1 ponto = 1 item concluído)

async function getGoal(db) {
  const { rows } = await db.query("SELECT value FROM settings WHERE key = 'monthly_goal'");
  const goal = rows[0] ? Number.parseInt(rows[0].value, 10) : DEFAULT_GOAL;
  return goal >= 1 ? goal : DEFAULT_GOAL;
}

// Pontos = itens concluídos neste mês. Desmarcar um item tira o ponto.
// Com celebrate=true, registra os marcos novos (cada marco só é comemorado uma vez por mês).
async function getScore(db, { celebrate = false } = {}) {
  const month = (await db.query(
    `SELECT to_char(now() AT TIME ZONE $1, 'YYYY-MM') AS m`, [APP_TZ]
  )).rows[0].m;

  const points = (await db.query(
    `SELECT count(*)::int AS n FROM tasks
      WHERE done = TRUE AND done_at IS NOT NULL
        AND to_char(done_at AT TIME ZONE $1, 'YYYY-MM') = $2`,
    [APP_TZ, month]
  )).rows[0].n;

  const goal = await getGoal(db);
  const percent = Math.floor((points * 100) / goal);

  const newlyReached = [];
  if (celebrate) {
    for (const pct of MILESTONES.filter((m) => percent >= m)) {
      const r = await db.query(
        `INSERT INTO milestones (month, pct) VALUES ($1, $2)
         ON CONFLICT DO NOTHING RETURNING pct`, [month, pct]
      );
      if (r.rowCount) newlyReached.push(pct);
    }
  }

  const reached = (await db.query(
    'SELECT pct FROM milestones WHERE month = $1 ORDER BY pct', [month]
  )).rows.map((r) => r.pct);

  return { month, points, goal, percent, milestones: MILESTONES, reached, newlyReached };
}

// ---------- Consulta base ----------
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

// ---------- Notas ----------
app.get('/api/notes', wrap(async (_req, res) => {
  const { rows } = await pool.query(`${NOTE_SELECT} GROUP BY n.id ORDER BY n.updated_at DESC`);
  res.json(rows);
}));

app.post('/api/notes', wrap(async (req, res) => {
  const kind = req.body.kind === 'admissao' ? 'admissao' : 'nota';
  const title = kind === 'admissao'
    ? admissionTitle('')
    : clean(req.body.title, 200) || 'Nova nota';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO notes (kind, title, body) VALUES ($1, $2, '') RETURNING id`,
      [kind, title]
    );
    const id = rows[0].id;
    if (kind === 'admissao') {
      for (const text of FIXED_TASKS) {
        await client.query(
          'INSERT INTO tasks (note_id, text, locked) VALUES ($1, $2, TRUE)', [id, text]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(await getNote(client, id));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

app.put('/api/notes/:id', wrap(async (req, res) => {
  const found = await pool.query('SELECT kind FROM notes WHERE id = $1', [req.params.id]);
  if (!found.rows[0]) return res.status(404).json({ error: 'Nota não encontrada.' });

  const body = String(req.body.body ?? '');
  let result;

  if (found.rows[0].kind === 'admissao') {
    const name = clean(req.body.employee_name, 200);
    const company = clean(req.body.company, 200);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.body.admission_date ?? '')
      ? req.body.admission_date : null;
    const eventVt = clean(req.body.event_vt, 300);
    const eventVr = clean(req.body.event_vr, 300);
    result = await pool.query(
      `UPDATE notes
          SET title = $1, employee_name = $2, company = $3, admission_date = $4,
              body = $5, event_vt = $6, event_vr = $7, updated_at = now()
        WHERE id = $8 RETURNING id, title, updated_at`,
      [admissionTitle(name), name, company, date, body, eventVt, eventVr, req.params.id]
    );
  } else {
    result = await pool.query(
      `UPDATE notes SET title = $1, body = $2, updated_at = now()
        WHERE id = $3 RETURNING id, title, updated_at`,
      [String(req.body.title ?? '').slice(0, 200), body, req.params.id]
    );
  }
  res.json(result.rows[0]);
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
  const { id, key } = { id: req.params.id, key: req.params.key };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE notes
          SET ${benefit.column} = $1::boolean,
              ${benefit.event} = CASE WHEN $1::boolean THEN ${benefit.event} ELSE '' END,
              updated_at = now()
        WHERE id = $2 AND kind = 'admissao'`,
      [enabled, id]
    );
    if (!upd.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Admissão não encontrada.' });
    }
    if (enabled) {
      const exists = await client.query(
        'SELECT 1 FROM tasks WHERE note_id = $1 AND task_key = $2', [id, key]
      );
      if (!exists.rowCount) {
        await client.query(
          'INSERT INTO tasks (note_id, text, locked, task_key) VALUES ($1, $2, TRUE, $3)',
          [id, benefit.label, key]
        );
      }
    } else {
      await client.query('DELETE FROM tasks WHERE note_id = $1 AND task_key = $2', [id, key]);
    }
    await client.query('COMMIT');
    const note = await getNote(client, id);
    res.json(note.tasks);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}));

// ---------- Itens do checklist ----------
app.post('/api/notes/:id/tasks', wrap(async (req, res) => {
  const text = clean(req.body.text, 500);
  if (!text) return res.status(400).json({ error: 'O item está vazio.' });
  const { rows } = await pool.query(
    `INSERT INTO tasks (note_id, text) VALUES ($1, $2)
     RETURNING id, text, done, locked, task_key AS key`,
    [req.params.id, text]
  );
  await pool.query('UPDATE notes SET updated_at = now() WHERE id = $1', [req.params.id]);
  res.status(201).json(rows[0]);
}));

app.patch('/api/tasks/:id', wrap(async (req, res) => {
  const done = Boolean(req.body.done);
  const { rows } = await pool.query(
    `UPDATE tasks
        SET done = $1::boolean,
            done_at = CASE WHEN $1::boolean THEN COALESCE(done_at, now()) ELSE NULL END
      WHERE id = $2
      RETURNING id, note_id, text, done, locked, task_key AS key`,
    [done, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Item não encontrado.' });
  await pool.query('UPDATE notes SET updated_at = now() WHERE id = $1', [rows[0].note_id]);
  const score = await getScore(pool, { celebrate: done });
  const { note_id, ...task } = rows[0];
  res.json({ ...task, score });
}));

app.delete('/api/tasks/:id', wrap(async (req, res) => {
  const removed = await pool.query(
    'DELETE FROM tasks WHERE id = $1 AND locked = FALSE RETURNING note_id', [req.params.id]
  );
  if (removed.rows[0]) {
    await pool.query('UPDATE notes SET updated_at = now() WHERE id = $1', [removed.rows[0].note_id]);
    return res.status(204).end();
  }
  const stillThere = await pool.query('SELECT 1 FROM tasks WHERE id = $1', [req.params.id]);
  if (stillThere.rowCount) {
    return res.status(403).json({ error: 'Este item é fixo e não pode ser removido.' });
  }
  res.status(204).end();
}));

// ---------- Pontuação e meta ----------
app.get('/api/score', wrap(async (_req, res) => {
  res.json(await getScore(pool));
}));

app.put('/api/goal', wrap(async (req, res) => {
  const goal = Number.parseInt(req.body.goal, 10);
  if (!Number.isInteger(goal) || goal < 1 || goal > 9999) {
    return res.status(400).json({ error: 'A meta precisa ser um número entre 1 e 9999.' });
  }
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('monthly_goal', $1)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [String(goal)]
  );
  res.json(await getScore(pool));
}));

// ---------- Erros ----------
app.use((err, _req, res, _next) => {
  if (err.code === '22P02') return res.status(400).json({ error: 'Identificador inválido.' });
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