// Comunicação com o servidor (que conversa com o Postgres)
async function request(method, url, data, { keepalive = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: data ? { 'Content-Type': 'application/json' } : undefined,
    body: data ? JSON.stringify(data) : undefined,
    keepalive, // deixa o salvamento terminar mesmo se a janela fechar
  });
  if (!res.ok) {
    let msg = 'Algo deu errado. Tente de novo.';
    try { msg = (await res.json()).error || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  listNotes: () => request('GET', '/api/notes'),
  createNote: (data = {}) => request('POST', '/api/notes', data),
  updateNote: (id, data) => request('PUT', `/api/notes/${id}`, data, { keepalive: true }),
  deleteNote: (id) => request('DELETE', `/api/notes/${id}`),
  setBenefit: (id, key, enabled) => request('PUT', `/api/notes/${id}/benefits/${key}`, { enabled }),
  setRescissionType: (id, type) => request('PUT', `/api/notes/${id}/rescission-type`, { type }),
  addTask: (noteId, text) => request('POST', `/api/notes/${noteId}/tasks`, { text }),
  setTaskDone: (id, done) => request('PATCH', `/api/tasks/${id}`, { done }),
  deleteTask: (id) => request('DELETE', `/api/tasks/${id}`),
  getScore: () => request('GET', '/api/score'),
  setGoal: (goal) => request('PUT', '/api/goal', { goal }),
  setRewards: (rewards) => request('PUT', '/api/rewards', { rewards }),
};
