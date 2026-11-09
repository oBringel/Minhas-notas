import { icon } from './icons.js';
// Arquivos: pequeno gerenciador de pastas e documentos de consulta.
import { api } from './api.js';

const $ = (sel) => document.querySelector(sel);

let ctx = { toast: () => {} };
const state = { folders: [], files: [], current: null, search: '', category: '' };

const CATEGORIES = ['INSS', 'Tabelas', 'Legislação', 'Procedimentos', 'Documentos', 'Imagens', 'Outros'];

const iconOf = (file) => {
  const mime = file.mime || '';
  const name = (file.name || '').toLowerCase();
  const size = 17;
  if (mime.startsWith('image/')) return icon('file-image', { size });
  if (mime === 'application/pdf') return icon('file-text', { size });
  if (mime.includes('sheet') || /\.(xlsx?|csv|ods)$/.test(name)) return icon('file-spreadsheet', { size });
  if (mime.startsWith('text/') || /\.(txt|md|rtf)$/.test(name)) return icon('file-text', { size });
  if (/(zip|rar|7z)$/.test(name)) return icon('archive', { size });
  if (/\.(docx?|odt)$/.test(name)) return icon('file-text', { size });
  return icon('file', { size });
};

const sizeLabel = (bytes) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const sameFolder = (a, b) => (a ?? null) === (b ?? null);

const childrenOf = (parent) => state.folders
  .filter((f) => sameFolder(f.parent_id, parent))
  .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

const filesIn = (folder) => state.files.filter((f) => sameFolder(f.folder_id, folder));

function pathOf(id) {
  const path = [];
  let node = state.folders.find((f) => f.id === id);
  const seen = new Set();
  while (node && !seen.has(node.id)) {
    seen.add(node.id);
    path.unshift(node);
    node = state.folders.find((f) => f.id === node.parent_id);
  }
  return path;
}

// ---------- Pastas ----------
function renderTree() {
  const root = $('#folderTree');
  if (!root) return;

  const row = (label, folder, depth, glyph) => {
    const active = sameFolder(state.current, folder?.id ?? null);
    const count = folder ? filesIn(folder.id).length : state.files.length;
    return `
      <div class="folder-node${active ? ' active' : ''}" data-folder="${folder?.id ?? ''}"
           role="button" tabindex="0" style="padding-left:${8 + depth * 14}px">
        <span>${glyph}</span>
        <span class="fname-tree">${label}</span>
        <span class="fcount">${count || ''}</span>
        ${folder ? `<button type="button" class="fdel" data-delfolder title="Excluir pasta">${icon('x', { size: 13 })}</button>` : ''}
      </div>`;
  };

  const branch = (parent, depth) => childrenOf(parent)
    .map((f) => row(f.name, f, depth, icon('folder', { size: 16 })) + branch(f.id, depth + 1))
    .join('');

  root.innerHTML = row('Todos os arquivos', null, 0, icon('folder-tree', { size: 16 })) + branch(null, 1);
}

function renderCrumbs() {
  const root = $('#crumbs');
  if (!root) return;
  const path = pathOf(state.current);
  const parts = [`<button type="button" class="crumb" data-folder="">${icon('folder-tree', { size: 15 })} Arquivos</button>`];
  for (const folder of path) {
    parts.push('<span class="crumb-sep">›</span>');
    parts.push(`<button type="button" class="crumb" data-folder="${folder.id}">${folder.name}</button>`);
  }
  root.innerHTML = parts.join(' ');
}

// ---------- Lista de arquivos ----------
function renderList() {
  const root = $('#filesMain');
  if (!root) return;

  const term = state.search.trim().toLowerCase();
  const folders = childrenOf(state.current)
    .filter((f) => !term || f.name.toLowerCase().includes(term));
  const files = filesIn(state.current)
    .filter((f) => !term || f.name.toLowerCase().includes(term))
    .filter((f) => !state.category || f.category === state.category);

  if (!folders.length && !files.length) {
    root.innerHTML = `<p class="empty">${term || state.category
      ? 'Nenhum arquivo encontrado com esse filtro.'
      : 'Esta pasta está vazia. Crie uma subpasta ou envie um arquivo.'}</p>`;
    return;
  }

  const folderRows = folders.map((f) => `
    <div class="file-row" data-folder="${f.id}">
      <span class="ficon">${icon('folder', { size: 17 })}</span>
      <span class="fname" role="button" tabindex="0" data-openfolder>${f.name}</span>
      <span class="fmeta">${filesIn(f.id).length} arquivo(s)</span>
      <span></span><span class="fmeta">pasta</span>
      <span class="file-actions">
        <button type="button" class="icon-btn" data-renamefolder title="Renomear">${icon('pencil', { size: 15 })}</button>
        <button type="button" class="icon-btn" data-delfolder title="Excluir">${icon('trash-2', { size: 15 })}</button>
      </span>
    </div>`).join('');

  const fileRows = files.map((f) => `
    <div class="file-row" data-file="${f.id}">
      <span class="ficon">${iconOf(f)}</span>
      <a class="fname" href="/api/files/${f.id}/download" target="_blank" rel="noopener"
         title="${f.name}">${f.name}</a>
      <span class="fmeta">${new Date(f.created_at).toLocaleDateString('pt-BR')} · ${sizeLabel(f.size)}</span>
      <input class="fcat-select" data-category value="${f.category || ''}" list="fileCategories"
             placeholder="Categoria" aria-label="Categoria de ${f.name}">
      <span class="fmeta"></span>
      <span class="file-actions">
        <a class="file-open" href="/api/files/${f.id}/download" target="_blank" rel="noopener"
           title="Abrir ou baixar">abrir</a>
        <button type="button" class="icon-btn" data-rename title="Renomear">${icon('pencil', { size: 15 })}</button>
        <button type="button" class="icon-btn" data-del title="Excluir">${icon('trash-2', { size: 15 })}</button>
      </span>
    </div>`).join('');

  root.innerHTML = folderRows + fileRows;
}

function renderCategories() {
  const select = $('#fileCategory');
  if (!select) return;
  const used = [...new Set(state.files.map((f) => f.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const all = [...new Set([...CATEGORIES, ...used])];
  const current = state.category;
  select.innerHTML = '<option value="">Todas as categorias</option>'
    + all.map((c) => `<option value="${c}"${c === current ? ' selected' : ''}>${c}</option>`).join('');

  let datalist = document.getElementById('fileCategories');
  if (!datalist) {
    datalist = document.createElement('datalist');
    datalist.id = 'fileCategories';
    document.body.append(datalist);
  }
  datalist.innerHTML = all.map((c) => `<option value="${c}"></option>`).join('');
}

function renderAll() {
  renderTree();
  renderCrumbs();
  renderCategories();
  renderList();
}

async function load() {
  try {
    const data = await api.listFiles();
    state.folders = data.folders;
    state.files = data.files;
    // Se a pasta aberta foi apagada em outra aba, volta para a raiz
    if (state.current && !state.folders.some((f) => f.id === state.current)) state.current = null;
    renderAll();
  } catch (err) { ctx.toast(err.message); }
}

// ---------- Upload ----------
const readBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
  reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
  reader.readAsDataURL(file);
});

async function upload(files) {
  if (!files.length) return;
  const status = $('#filesStatus');
  const list = [...files];
  let ok = 0;
  for (const [index, file] of list.entries()) {
    status.textContent = `Enviando ${index + 1} de ${list.length}: ${file.name}...`;
    try {
      if (file.size > 12 * 1024 * 1024) throw new Error(`${file.name} passa de 12 MB.`);
      const data = await readBase64(file);
      await api.uploadFile({
        folder_id: state.current, name: file.name,
        mime: file.type || 'application/octet-stream', data,
      });
      ok += 1;
    } catch (err) {
      ctx.toast(`${file.name}: ${err.message}`);
    }
  }
  status.textContent = ok
    ? `${ok} arquivo(s) enviado(s). Os arquivos ficam guardados no banco de dados.`
    : 'Nenhum arquivo foi enviado.';
  await load();
}

// ---------- Ações ----------
async function newFolder() {
  const name = window.prompt('Nome da pasta:');
  if (!name?.trim()) return;
  try {
    await api.createFolder({ name: name.trim(), parent_id: state.current });
    ctx.toast('Pasta criada.');
    await load();
  } catch (err) { ctx.toast(err.message); }
}

async function renameFolder(id) {
  const folder = state.folders.find((f) => f.id === id);
  if (!folder) return;
  const name = window.prompt('Novo nome da pasta:', folder.name);
  if (!name?.trim() || name.trim() === folder.name) return;
  try {
    await api.renameFolder(id, name.trim());
    await load();
    ctx.toast('Pasta renomeada.');
  } catch (err) { ctx.toast(err.message); }
}

async function deleteFolder(id) {
  const folder = state.folders.find((f) => f.id === id);
  if (!folder) return;
  const ok = window.confirm(`Excluir a pasta "${folder.name}"?\n\nAs subpastas e os arquivos dentro dela também saem.`);
  if (!ok) return;
  try {
    await api.deleteFolder(id);
    if (state.current === id) state.current = folder.parent_id ?? null;
    await load();
    ctx.toast('Pasta excluída.');
  } catch (err) { ctx.toast(err.message); }
}

async function renameFile(id) {
  const file = state.files.find((f) => f.id === id);
  if (!file) return;
  const name = window.prompt('Novo nome do arquivo:', file.name);
  if (!name?.trim() || name.trim() === file.name) return;
  try {
    await api.renameFile(id, { name: name.trim(), category: file.category });
    await load();
    ctx.toast('Arquivo renomeado.');
  } catch (err) { ctx.toast(err.message); }
}

async function deleteFile(id) {
  const file = state.files.find((f) => f.id === id);
  if (!file) return;
  if (!window.confirm(`Excluir o arquivo "${file.name}"?`)) return;
  try {
    await api.deleteFile(id);
    await load();
    ctx.toast('Arquivo excluído.');
  } catch (err) { ctx.toast(err.message); }
}

function openFolder(id) {
  state.current = id || null;
  renderAll();
}

// ---------- Início ----------
export function refreshFiles() {
  renderAll();
  load(); // são poucas linhas: vale buscar de novo a cada visita
}

export function initFiles(options) {
  ctx = { ...ctx, ...options };

  $('#newFolder').onclick = newFolder;
  $('#fileInput').onchange = async (ev) => {
    await upload(ev.target.files);
    ev.target.value = '';
  };

  $('#fileSearch').oninput = (ev) => {
    state.search = ev.target.value;
    renderList();
  };
  $('#fileCategory').onchange = (ev) => {
    state.category = ev.target.value;
    renderList();
  };

  $('#folderTree').onclick = (ev) => {
    const del = ev.target.closest('[data-delfolder]');
    if (del) { deleteFolder(del.closest('.folder-node').dataset.folder); return; }
    const node = ev.target.closest('.folder-node');
    if (node) openFolder(node.dataset.folder);
  };
  $('#folderTree').onkeydown = (ev) => {
    const node = ev.target.closest('.folder-node');
    if (node && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openFolder(node.dataset.folder); }
  };

  $('#crumbs').onclick = (ev) => {
    const crumb = ev.target.closest('[data-folder]');
    if (crumb) openFolder(crumb.dataset.folder);
  };

  $('#filesMain').onclick = (ev) => {
    const row = ev.target.closest('.file-row');
    if (!row) return;

    if (ev.target.closest('[data-delfolder]')) { deleteFolder(row.dataset.folder); return; }
    if (ev.target.closest('[data-renamefolder]')) { renameFolder(row.dataset.folder); return; }
    if (ev.target.closest('[data-openfolder]') || (row.dataset.folder && ev.target.closest('.ficon'))) {
      openFolder(row.dataset.folder);
      return;
    }
    if (ev.target.closest('[data-rename]')) { renameFile(row.dataset.file); return; }
    if (ev.target.closest('[data-del]')) { deleteFile(row.dataset.file); return; }
  };
  $('#filesMain').onkeydown = (ev) => {
    const name = ev.target.closest('[data-openfolder]');
    if (name && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      openFolder(name.closest('.file-row').dataset.folder);
    }
  };
  $('#filesMain').addEventListener('change', async (ev) => {
    const input = ev.target.closest('[data-category]');
    if (!input) return;
    const row = input.closest('.file-row');
    const file = state.files.find((f) => f.id === row.dataset.file);
    if (!file) return;
    try {
      const updated = await api.renameFile(file.id, { name: file.name, category: input.value.trim() });
      state.files = state.files.map((f) => (f.id === file.id ? updated : f));
      renderCategories();
      ctx.toast('Categoria salva.');
    } catch (err) { ctx.toast(err.message); }
  });
}
