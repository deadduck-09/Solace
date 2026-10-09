// Daydream.exe — records & photos in IndexedDB; small prefs in localStorage. Nothing leaves the browser.
const $ = (s) => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const uid = () => crypto.randomUUID();
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const nice = (s) => new Date(s + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const pick = (a, not) => { const b = a.filter((x) => x !== not); const l = b.length ? b : a; return l[Math.floor(Math.random() * l.length)]; };
const pref = (k, d) => localStorage.getItem('dd-' + k) ?? d;

/* ---------- storage ---------- */
const DB = new Promise((res, rej) => {
  const r = indexedDB.open('daydream', 2);
  r.onupgradeneeded = () => { // v2: also upgrades databases created by an earlier build that lacked 'kv'
    const d = r.result, t = r.transaction;
    if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
    if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
    if (d.objectStoreNames.contains('profile')) t.objectStore('profile').get('me').onsuccess = (e) => { if (e.target.result) t.objectStore('kv').put(e.target.result, 'profile'); };
  };
  r.onblocked = () => toast('Another Daydream tab is open and blocking the update. Close all other tabs on this site, then reload.');
  r.onsuccess = () => { const d = r.result; d.onversionchange = () => { d.close(); toast('Daydream was updated in another tab. Please reload this page.'); }; res(d); };
  r.onerror = () => { toast('Could not open storage: ' + (r.error?.message || 'unknown error')); rej(r.error); };
});
async function tx(store, mode, fn) {
  const db = await DB;
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode); const q = fn(t.objectStore(store));
    t.oncomplete = () => res(q && q.result); t.onerror = t.onabort = () => rej(t.error);
  });
}
const dbGet = (s, k) => tx(s, 'readonly', (o) => o.get(k));
const dbAll = (s) => tx(s, 'readonly', (o) => o.getAll());
const dbPut = (s, v, k) => tx(s, 'readwrite', (o) => o.put(v, k));
const dbDel = (s, k) => tx(s, 'readwrite', (o) => o.delete(k));
const dbClear = (s) => tx(s, 'readwrite', (o) => o.clear());

/* ---------- ui helpers ---------- */
function toast(m) { const t = el('div', 'toast', m); $('#toasts').append(t); setTimeout(() => t.remove(), 3000); }
const fail = (e, what) => { console.error(e); toast(e?.name === 'QuotaExceededError' ? 'Storage is full — export a backup and free space.' : `Couldn't ${what}. Your existing data is untouched.`); };
function open(d) { d._from = document.activeElement; d.showModal(); }
document.addEventListener('click', (e) => { if (e.target.matches('[data-close]')) { const d = e.target.closest('dialog'); d.dispatchEvent(new Event('cancel', { cancelable: true })) && d.close(); } });
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('close', () => d._from?.focus?.()));
function confirmBox(msg) {
  return new Promise((res) => {
    const d = $('#confirmDlg'); $('#confirmTxt').textContent = msg; open(d);
    const done = (v) => { d.close(); res(v); };
    $('#confirmYes').onclick = () => done(true); $('#confirmNo').onclick = () => done(false); d.oncancel = () => res(false);
  });
}
const urls = new Map();
const urlFor = (id, blob) => { if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob)); return urls.get(id); };
const dropUrl = (id) => { if (urls.has(id)) URL.revokeObjectURL(urls.get(id)); urls.delete(id); };

async function shrink(file, max, square = false) {
  if (!file.type.startsWith('image/')) throw new Error('Not an image file.');
  if (file.size > 40e6) throw new Error('Image is over 40 MB.');
  let bmp; try { bmp = await createImageBitmap(file); } catch { throw new Error(`"${file.name}" can't be decoded.`); }
  let w = bmp.width, h = bmp.height, sx = 0, sy = 0, sw = w, sh = h;
  if (square) { sw = sh = Math.min(w, h); sx = (w - sw) / 2; sy = (h - sh) / 2; w = h = Math.min(max, sw); }
  else { const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k); }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  c.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h); bmp.close?.();
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image.'))), 'image/jpeg', 0.85));
}

/* ---------- audio (synthesized, quiet) ---------- */
let ac, soundOn = pref('sound', '1') === '1';
function beep(f, d = 0.12, type = 'square', at = 0, v = 0.05) {
  if (!soundOn) return;
  try {
    ac ||= new AudioContext(); const t = ac.currentTime + at, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + d);
  } catch { /* audio unavailable */ }
}

/* ---------- content (original) ---------- */
const THOUGHTS = ['Every tab I close is a tiny act of forgiveness.', 'Somewhere a loading bar is believing in itself.', 'The moon is just the sky\'s night-light.', 'My to-do list and I have an understanding: it grows, I admire it.', 'Nobody knows what they\'re doing; some just type confidently.', 'A good day is mostly snacks and small wins.', 'Programs are just very patient to-do lists.', 'Rain is the sky doing a cache refresh.', 'You are the main character of a very slow-paced show.', 'Staring out the window counts as research.'];
const QUOTES = {
  funny: ['I\'m not procrastinating, I\'m buffering my motivation.', 'My code works and I do not know why; my code fails and I know exactly why.', 'Adulting is just Googling things with a straight face.', 'Sleep is the ultimate software update.', 'I came, I saw, I forgot why.', 'Ctrl+Z works on documents but sadly not on texts sent.'],
  motivational: ['Slow progress is still progress.', 'Curiosity is a muscle — go use it today.', 'You don\'t need the whole staircase, just the next step.', 'Small habits quietly build big things.', 'Being a beginner is just being brave in public.', 'Rest is part of the work, not a break from it.']
};

/* ---------- state ---------- */
let profile = { name: 'Dreamer', hobbies: 'Daydreaming, doodling', goal: 'Figure out what I love', bio: '', avatar: null };
let notes = [], photos = [], editing = null, playing = null, quoteCat = pref('qcat', 'funny'), lastQuote = '';
const DEFAULT_AVATAR = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#FFD2DF"/><circle cx="50" cy="40" r="18" fill="#fffdf5" stroke="#27253B" stroke-width="3"/><path d="M15 100q35-55 70 0z" fill="#C7F1DC" stroke="#27253B" stroke-width="3"/><circle cx="43" cy="39" r="2.5"/><circle cx="57" cy="39" r="2.5"/></svg>');

/* ---------- render ---------- */
function renderProfile() {
  $('#pName').textContent = profile.name; $('#pHob').textContent = profile.hobbies || '—'; $('#pGoal').textContent = profile.goal || '—'; $('#pBio').textContent = profile.bio;
  $('#avatar').src = profile.avatar ? urlFor('avatar', profile.avatar) : DEFAULT_AVATAR;
}
function renderStats() {
  $('#sNotes').textContent = notes.length; $('#sPhotos').textContent = photos.length;
  $('#sDays').textContent = new Set([...notes.map((n) => n.date), ...photos.map((p) => p.date)]).size;
}
const COLORS = ['var(--pink)', 'var(--mint)', 'var(--lav)', 'var(--yel)'];
const rot = (id) => ((parseInt(id.slice(0, 4), 16) % 7) - 3) + 'deg';
const colorOf = (id) => COLORS[parseInt(id.slice(4, 8), 16) % 4];
function renderNotes() {
  const q = $('#search').value.trim().toLowerCase().replace(/^#/, ''), d = $('#noteDate').value, box = $('#tapes'); box.replaceChildren();
  const list = notes.filter((n) => (!d || n.date === d) && (!q || `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(q))).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  if (!list.length) box.append(el('div', 'empty', notes.length ? 'No cassettes match.' : '📼 Nothing recorded yet. Press “Add a cassette” to record your first thought.'));
  for (const n of list) {
    const w = el('div', 'tapewrap'), c = el('button', 'cas'); c.style.setProperty('--r', rot(n.id)); c.style.setProperty('--c', colorOf(n.id));
    c.setAttribute('aria-label', `Play memory: ${n.title}`);
    const win = el('div', 'win'); win.append(el('i', 'reel'), el('i', 'reel'));
    c.append(el('span', 'lbl', n.title), win, el('span', 'dt mono', `▶ ${nice(n.date)}${n.tags.length ? ' · #' + n.tags.join(' #') : ''}`));
    c.onclick = () => play(n);
    const b = el('div', 'tapeBtns'), e = el('button', 'btn', 'Edit'), x = el('button', 'btn', 'Delete');
    e.onclick = () => openNote(n); x.onclick = () => removeNote(n);
    b.append(e, x); w.append(c, b); box.append(w);
  }
}
function renderPhotos() {
  const d = $('#photoDate').value, box = $('#photos'); box.replaceChildren();
  const list = photos.filter((p) => !d || p.date === d).sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  if (!list.length) box.append(el('div', 'empty', photos.length ? 'No photos on that date.' : '📷 No pictures yet. Press “Add pic”.'));
  for (const p of list) {
    const b = el('button', 'pol'), i = el('img'); i.loading = 'lazy'; i.src = urlFor(p.id, p.blob); i.alt = p.caption || `Photo from ${nice(p.date)}`;
    b.style.setProperty('--r', rot(p.id)); b.append(i, el('span', null, p.caption || '(no caption)'), el('span', 'mono muted', nice(p.date))); b.onclick = () => viewPhoto(p); box.append(b);
  }
}
const renderAll = () => { renderProfile(); renderStats(); renderNotes(); renderPhotos(); };

/* ---------- to-do list ---------- */
let todos = [];
async function saveTodos() { try { await dbPut('kv', todos, 'todos'); } catch (e) { toast('Could not save your to-do list: ' + e.message); } }
function renderTodos() {
  const ul = $('#todoList'); ul.replaceChildren();
  if (!todos.length) ul.append(el('li', 'muted', 'Nothing yet. Add a task ✦'));
  for (const t of todos) {
    const li = el('li', t.done ? 'done' : ''); const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!t.done; cb.id = 'td-' + t.id;
    const lab = el('label', '', t.text); lab.htmlFor = cb.id;
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Delete task: ' + t.text);
    cb.onchange = async () => { t.done = cb.checked; renderTodos(); await saveTodos(); };
    x.onclick = async () => { todos = todos.filter((o) => o.id !== t.id); renderTodos(); await saveTodos(); };
    li.append(cb, lab, x); ul.append(li);
  }
}
async function loadTodos() { const t = await dbGet('kv', 'todos'); todos = Array.isArray(t) ? t : []; renderTodos(); }
$('#todoForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const inp = $('#todoIn'), text = inp.value.trim().slice(0, 80); if (!text) return;
  if (todos.length >= 50) { toast('That is a lot of tasks! Finish or clear a few first.'); return; }
  todos.unshift({ id: uid(), text, done: false }); inp.value = ''; renderTodos(); await saveTodos();
});
$('#todoClear').onclick = async () => { if (!todos.some((t) => t.done)) { toast('No finished tasks to clear'); return; } todos = todos.filter((t) => !t.done); renderTodos(); await saveTodos(); toast('Cleared finished tasks'); };

/* ---------- thought & quote ---------- */
async function loadThought(force) {
  let t = await dbGet('kv', 'thought');
  if (force || !t || t.date !== ymd()) { t = { date: ymd(), text: pick(THOUGHTS, t?.text), custom: false }; await dbPut('kv', t, 'thought'); }
  $('#thoughtTxt').textContent = (t.custom ? '✎ ' : '') + t.text;
}
function showQuote(newOne = true) {
  if (newOne) lastQuote = pick(QUOTES[quoteCat], lastQuote);
  $('#quoteTxt').textContent = lastQuote; $('#quoteCat').textContent = quoteCat.toUpperCase() + ' QUOTE';
  document.querySelectorAll('.cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === quoteCat));
  const q = $('#quoteTxt'); q.style.animation = 'none'; void q.offsetWidth; q.style.animation = '';
}

/* ---------- notes ---------- */
let noteSnap = '';
const noteState = () => JSON.stringify([...new FormData($('#noteForm')).entries()]);
function openNote(n) {
  editing = n || null; const f = $('#noteForm'); f.reset(); $('#noteErr').textContent = '';
  $('#noteH').textContent = n ? 'Edit cassette' : 'New cassette';
  f.title.value = n?.title || ''; f.body.value = n?.body || ''; f.date.value = n?.date || ymd(); f.tags.value = n?.tags.join(', ') || '';
  noteSnap = noteState(); open($('#noteDlg'));
}
$('#addNote').onclick = () => openNote();
$('#noteDlg').addEventListener('cancel', async (e) => {
  if (noteState() === noteSnap) return;
  e.preventDefault(); if (await confirmBox('Discard your unsaved changes?')) { noteSnap = noteState(); $('#noteDlg').close(); } else open($('#noteDlg'));
});
$('#noteForm').addEventListener('submit', async (e) => {
  const f = e.target, title = f.title.value.trim(), body = f.body.value.trim();
  if (!title || !body) { e.preventDefault(); $('#noteErr').textContent = 'Please add a title and some text.'; return; }
  const now = new Date().toISOString();
  const n = { id: editing?.id || uid(), title, body, date: f.date.value, created: editing?.created || now, modified: now, tags: [...new Set(f.tags.value.split(',').map((t) => t.trim().replace(/^#/, '').slice(0, 20)).filter(Boolean))].slice(0, 8) };
  noteSnap = noteState();
  try {
    await dbPut('notes', n); const i = notes.findIndex((x) => x.id === n.id); i >= 0 ? (notes[i] = n) : notes.push(n);
    renderNotes(); renderStats(); toast('Cassette saved'); if (playing?.id === n.id) { playing = n; fillTV(n); }
  } catch (err) { fail(err, 'save the cassette'); }
});
async function removeNote(n) {
  if (!(await confirmBox(`Delete “${n.title}”? This can't be undone.`))) return;
  try { await dbDel('notes', n.id); notes = notes.filter((x) => x.id !== n.id); renderNotes(); renderStats(); toast('Deleted'); } catch (e) { fail(e, 'delete'); }
}

/* ---------- playback scene ---------- */
const scene = $('#scene');
function fillTV(n) { $('#tvTitle').textContent = n.title; $('#tvMeta').textContent = `▶ PLAYING · ${nice(n.date)}`; $('#tvBody').textContent = n.body; }
function play(n) {
  playing = n; fillTV(n); scene._from = document.activeElement; scene.hidden = false;
  document.querySelectorAll('.flycas,.tv,.crt,.crt-in,.sceneBtns').forEach((x) => { x.style.animation = 'none'; void x.offsetWidth; x.style.animation = ''; });
  requestAnimationFrame(() => { scene.classList.add('on'); $('#tvClose').focus(); });
  scene.classList.remove('max', 'big'); document.querySelectorAll('.knob').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  beep(200, 0.08, 'square', 0.3); beep(300, 0.05, 'square', 1.7); beep(180, 0.08, 'square', 1.8); beep(90, 0.5, 'sawtooth', 2.0, 0.03); beep(660, 0.25, 'sine', 2.6); beep(880, 0.35, 'sine', 2.75);
  document.body.style.overflow = 'hidden';
}
function eject() {
  if (scene.hidden) return; beep(220, 0.1, 'square'); scene.classList.remove('on'); playing = null; document.body.style.overflow = '';
  setTimeout(() => { if (!scene.classList.contains('on')) { scene.hidden = true; scene._from?.focus?.(); } }, 500);
}
const knob = (id, cls) => { const b = $(id); b.onclick = () => { const on = scene.classList.toggle(cls); b.setAttribute('aria-pressed', on); beep(on ? 520 : 380, 0.05, 'square'); }; };
knob('#kMax', 'max'); knob('#kBig', 'big');
$('#tvClose').onclick = eject; $('#tvEdit').onclick = () => playing && openNote(playing);
$('.crt').addEventListener('click', () => { if (!getSelection().toString() && playing) openNote(playing); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !scene.hidden && !document.querySelector('dialog[open]')) eject(); });
scene.addEventListener('keydown', (e) => { // focus trap
  if (e.key !== 'Tab') return; const f = [...scene.querySelectorAll('button')]; const i = f.indexOf(document.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f.at(-1).focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});

/* ---------- profile ---------- */
$('#editProfile').onclick = () => { const f = $('#profForm'); f.reset(); $('#profErr').textContent = ''; for (const k of ['name', 'hobbies', 'goal', 'bio']) f[k].value = profile[k] || ''; open($('#profDlg')); };
$('#profForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try {
    const next = { name: f.name.value.trim() || 'Dreamer', hobbies: f.hobbies.value.trim(), goal: f.goal.value.trim(), bio: f.bio.value.trim(), avatar: profile.avatar };
    if (f.rmAvatar.checked) next.avatar = null;
    if (f.avatar.files[0]) next.avatar = await shrink(f.avatar.files[0], 320, true);
    await dbPut('kv', next, 'profile'); dropUrl('avatar'); profile = next; renderProfile(); $('#profDlg').close(); toast('Profile saved');
  } catch (err) { $('#profErr').textContent = err.message || 'Could not save profile.'; console.error(err); }
});

/* ---------- photos ---------- */
$('#addPic').onclick = () => { $('#picForm').reset(); $('#picForm').date.value = ymd(); $('#picErr').textContent = ''; open($('#picDlg')); };
$('#picForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target, files = [...f.files.files], errs = []; let ok = 0; const btn = f.querySelector('.pri'); btn.disabled = true;
  for (const [i, file] of files.entries()) {
    $('#picErr').textContent = `Processing ${i + 1}/${files.length}…`;
    try {
      const blob = await shrink(file, 1600), now = new Date().toISOString();
      const p = { id: uid(), blob, caption: f.caption.value.trim(), date: f.date.value, created: now, modified: now };
      await dbPut('photos', p); photos.push(p); ok++;
    } catch (err) { errs.push(err.name === 'QuotaExceededError' ? 'Storage full.' : err.message); }
  }
  btn.disabled = false; renderPhotos(); renderStats();
  if (errs.length) $('#picErr').textContent = errs.join(' '); else $('#picDlg').close();
  if (ok) toast(`Added ${ok} photo${ok > 1 ? 's' : ''}`);
});
let viewing = null;
function viewPhoto(p) { viewing = p; $('#viewImg').src = urlFor(p.id, p.blob); $('#viewImg').alt = p.caption || 'Photo'; $('#viewCap').value = p.caption; open($('#viewDlg')); }
$('#viewSave').onclick = async () => { try { viewing.caption = $('#viewCap').value.trim(); viewing.modified = new Date().toISOString(); await dbPut('photos', viewing); renderPhotos(); toast('Caption saved'); } catch (e) { fail(e, 'save caption'); } };
$('#viewDel').onclick = async () => {
  const p = viewing; $('#viewDlg').close(); if (!(await confirmBox('Delete this photo?'))) return;
  try { await dbDel('photos', p.id); photos = photos.filter((x) => x.id !== p.id); dropUrl(p.id); renderPhotos(); renderStats(); toast('Photo deleted'); } catch (e) { fail(e, 'delete photo'); }
};

/* ---------- backup ---------- */
const toData = (b) => new Promise((r, j) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = j; f.readAsDataURL(b); });
const toBlob = async (u) => { if (!/^data:image\/(jpeg|png|webp|gif);base64,/.test(u)) throw new Error('Bad image data'); return (await fetch(u)).blob(); };
$('#exportBtn').onclick = async () => {
  try {
    const out = { app: 'daydream.exe', version: 1, exported: new Date().toISOString(),
      profile: { ...profile, avatar: profile.avatar ? await toData(profile.avatar) : null }, notes, photos: await Promise.all(photos.map(async (p) => ({ ...p, blob: await toData(p.blob) }))) };
    const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' })); a.download = `daydream-backup-${ymd()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); toast('Backup exported');
  } catch (e) { fail(e, 'export'); }
};
let pending = null;
const isStr = (v, m) => typeof v === 'string' && v.length <= m;
function validate(d) {
  if (!d || d.app !== 'daydream.exe' || !Array.isArray(d.notes) || !Array.isArray(d.photos)) throw new Error('Not a Daydream.exe backup.');
  const dt = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  for (const n of d.notes) if (!isStr(n.id, 80) || !isStr(n.title, 80) || !isStr(n.body, 5000) || !dt(n.date) || !Array.isArray(n.tags)) throw new Error('A note in the backup is malformed.');
  for (const p of d.photos) if (!isStr(p.id, 80) || !isStr(p.blob, 2e7) || !dt(p.date) || typeof p.caption !== 'string') throw new Error('A photo in the backup is malformed.');
}
$('#dataBtn').onclick = () => { $('#importInfo').textContent = ''; $('#importAct').hidden = true; pending = null; open($('#dataDlg')); };
$('#importFile').onchange = async (e) => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try {
    if (file.size > 500e6) throw new Error('File too large.'); const d = JSON.parse(await file.text()); validate(d); pending = d;
    const dup = d.notes.filter((n) => notes.some((x) => x.id === n.id)).length + d.photos.filter((p) => photos.some((x) => x.id === p.id)).length;
    $('#importInfo').textContent = `Found ${d.notes.length} cassettes and ${d.photos.length} photos (${dup} already exist). Merge keeps your existing copies; Replace wipes current data first.`; $('#importAct').hidden = false;
  } catch (err) { pending = null; $('#importAct').hidden = true; $('#importInfo').textContent = 'Import failed: ' + (err.message || 'unreadable file') + ' Nothing was changed.'; }
};
async function doImport(replace) {
  if (replace) { $('#dataDlg').close(); if (!(await confirmBox('Replace ALL current memories with the backup?'))) { open($('#dataDlg')); return; } }
  try {
    const d = pending; // decode everything first so a bad file can't leave a half-import
    const ph = await Promise.all(d.photos.map(async (p) => ({ ...p, blob: await toBlob(p.blob) }))), av = d.profile?.avatar ? await toBlob(d.profile.avatar) : null;
    const have = new Set(replace ? [] : [...notes.map((n) => n.id), ...photos.map((p) => p.id)]);
    if (replace) { await dbClear('notes'); await dbClear('photos'); photos.forEach((p) => dropUrl(p.id)); }
    for (const n of d.notes) if (!have.has(n.id)) { const c = n.created || new Date().toISOString(); await dbPut('notes', { ...n, tags: n.tags.map(String).slice(0, 8), created: c, modified: n.modified || c }); }
    for (const p of ph) if (!have.has(p.id)) await dbPut('photos', { ...p, created: p.created || new Date().toISOString() });
    if (replace && d.profile) { profile = { name: String(d.profile.name || 'Dreamer').slice(0, 40), hobbies: String(d.profile.hobbies || '').slice(0, 120), goal: String(d.profile.goal || '').slice(0, 120), bio: String(d.profile.bio || '').slice(0, 240), avatar: av }; await dbPut('kv', profile, 'profile'); dropUrl('avatar'); }
    notes = await dbAll('notes'); photos = await dbAll('photos'); renderAll(); if ($('#dataDlg').open) $('#dataDlg').close(); toast('Import complete');
  } catch (e) { fail(e, 'import'); }
}
$('#doMerge').onclick = () => doImport(false); $('#doReplace').onclick = () => doImport(true);

/* ---------- wiring & boot ---------- */
$('#themeBtn').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; localStorage.setItem('dd-theme', t); };
$('#sndBtn').onclick = (e) => { soundOn = !soundOn; localStorage.setItem('dd-sound', soundOn ? '1' : '0'); e.currentTarget.setAttribute('aria-pressed', soundOn); e.currentTarget.textContent = soundOn ? '🔊 Sound' : '🔇 Muted'; if (soundOn) beep(660, 0.1, 'sine'); };
$('#sndBtn').setAttribute('aria-pressed', soundOn); if (!soundOn) $('#sndBtn').textContent = '🔇 Muted';
$('#quoteCard').onclick = () => open($('#quoteDlg'));
document.querySelectorAll('.cat').forEach((b) => (b.onclick = () => { quoteCat = b.dataset.cat; localStorage.setItem('dd-qcat', quoteCat); showQuote(); }));
$('#shuffleQuote').onclick = () => showQuote();
$('#search').oninput = renderNotes; $('#noteDate').onchange = renderNotes; $('#photoDate').onchange = renderPhotos;
$('#clearDates').onclick = () => { $('#photoDate').value = ''; $('#noteDate').value = ''; $('#search').value = ''; renderAll(); };

(async function boot() {
  $('#today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  try {
    profile = { ...profile, ...((await dbGet('kv', 'profile')) || {}) }; notes = await dbAll('notes'); photos = await dbAll('photos');
    renderAll(); showQuote(); await loadTodos();
  } catch (e) { console.error(e); toast('Could not open local storage. Is private browsing on?'); renderAll(); showQuote(); }
})();
