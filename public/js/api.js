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
  listTrash: () => request('GET', '/api/trash'),
  restoreNote: (id) => request('POST', `/api/notes/${id}/restore`),
  purgeNote: (id) => request('DELETE', `/api/notes/${id}/permanent`),
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

  // ---------- Pendências ----------
  listPendencias: () => request('GET', '/api/pendencias'),
  createPendencia: (data) => request('POST', '/api/pendencias', data),
  updatePendencia: (id, data) => request('PUT', `/api/pendencias/${id}`, data),
  setPendenciaDone: (id, done) => request('PATCH', `/api/pendencias/${id}/done`, { done }),
  deletePendencia: (id) => request('DELETE', `/api/pendencias/${id}`),

  // ---------- Checklist ----------
  listChecklist: () => request('GET', '/api/checklist'),
  addCheckItem: (text) => request('POST', '/api/checklist', { text }),
  updateCheckItem: (id, data) => request('PUT', `/api/checklist/${id}`, data),
  deleteCheckItem: (id) => request('DELETE', `/api/checklist/${id}`),

  // ---------- Observações e rodapé ----------
  getPanel: () => request('GET', '/api/panel'),
  setPanelPart: (part, text) => request('PUT', `/api/panel/${part}`, { text }),

  // ---------- Arquivos ----------
  listFiles: () => request('GET', '/api/files'),
  createFolder: (data) => request('POST', '/api/folders', data),
  renameFolder: (id, name) => request('PUT', `/api/folders/${id}`, { name }),
  deleteFolder: (id) => request('DELETE', `/api/folders/${id}`),
  uploadFile: (data) => request('POST', '/api/files', data),
  renameFile: (id, data) => request('PUT', `/api/files/${id}`, data),
  deleteFile: (id) => request('DELETE', `/api/files/${id}`),

  // ---------- Férias ----------
  listVacations: () => request('GET', '/api/vacations'),
  createVacation: (data) => request('POST', '/api/vacations', data),
  updateVacation: (id, data) => request('PUT', `/api/vacations/${id}`, data),
  deleteVacation: (id) => request('DELETE', `/api/vacations/${id}`),

  // ---------- Calendário ----------
  listCustomDates: () => request('GET', '/api/custom-dates'),
  createCustomDate: (data) => request('POST', '/api/custom-dates', data),
  updateCustomDate: (id, data) => request('PUT', `/api/custom-dates/${id}`, data),
  deleteCustomDate: (id) => request('DELETE', `/api/custom-dates/${id}`),
  listEvents: () => request('GET', '/api/events'),
  createEvent: (data) => request('POST', '/api/events', data),
  updateEvent: (id, data) => request('PUT', `/api/events/${id}`, data),
  deleteEvent: (id) => request('DELETE', `/api/events/${id}`),
};
