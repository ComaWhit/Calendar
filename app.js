/* =============================================
   Acts Calendar — main application script
   ============================================= */

'use strict';

/* =============================================
   AUTH MODULE
   ============================================= */

const AUTH = {
  PASSWORDS: {
    admin:    'Tarasova',
    employee: 'exurlaw',
  },
  SESSION_KEY: 'acts_role',

  getRole() {
    return localStorage.getItem(this.SESSION_KEY) || null;
  },
  login(role, password) {
    if (this.PASSWORDS[role] && this.PASSWORDS[role] === password) {
      localStorage.setItem(this.SESSION_KEY, role);
      return true;
    }
    return false;
  },
  logout() {
    localStorage.removeItem(this.SESSION_KEY);
  },
  isAdmin() {
    return this.getRole() === 'admin';
  },
  isLoggedIn() {
    return this.getRole() !== null;
  },
};

// ── Login screen logic ─────────────────────────
(function initLogin() {
  const overlay   = document.getElementById('login-overlay');
  const form      = document.getElementById('form-login');
  const errorEl   = document.getElementById('login-error');
  const eyeBtn    = document.getElementById('login-eye');
  const pwdInput  = document.getElementById('login-password');
  const roleBtns  = document.querySelectorAll('.role-btn');
  let selectedRole = 'admin';

  // Если уже залогинен — скрыть экран входа
  if (AUTH.isLoggedIn()) {
    overlay.style.display = 'none';
    applyRole(AUTH.getRole());
  }

  // Переключение роли
  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedRole = btn.dataset.role;
      errorEl.classList.add('hidden');
    });
  });

  // Показать/скрыть пароль
  eyeBtn.addEventListener('click', () => {
    const isText = pwdInput.type === 'text';
    pwdInput.type = isText ? 'password' : 'text';
    eyeBtn.querySelector('i').className = isText ? 'fa fa-eye' : 'fa fa-eye-slash';
  });

  // Сабмит формы
  form.addEventListener('submit', e => {
    e.preventDefault();
    const pwd = pwdInput.value;
    if (AUTH.login(selectedRole, pwd)) {
      overlay.classList.add('login-fade-out');
      overlay.addEventListener('animationend', () => {
        overlay.style.display = 'none';
      }, { once: true });
      applyRole(selectedRole);
      loadActs();
    } else {
      errorEl.classList.remove('hidden');
      pwdInput.value = '';
      pwdInput.focus();
    }
  });

  // Выход
  document.getElementById('btn-logout').addEventListener('click', () => {
    AUTH.logout();
    location.reload();
  });
})();

// ── Apply role restrictions ────────────────────
function applyRole(role) {
  const isAdmin = role === 'admin';

  // Вкладки: для сотрудника скрыть Отчёты и Сотрудники
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const tab = btn.dataset.tab;
    if (!isAdmin && (tab === 'report' || tab === 'persons')) {
      btn.classList.add('hidden');
    }
  });

  // Показать информацию о роли в шапке
  const info = document.getElementById('header-user-info');
  info.innerHTML = isAdmin
    ? `<span class="user-role-badge role-admin"><i class="fa fa-shield-halved"></i> Администратор</span>`
    : `<span class="user-role-badge role-employee"><i class="fa fa-user"></i> Сотрудник</span>`;
}

// ── Supabase config ────────────────────────────
const SB_URL = 'https://qubsidfyphundmhtsfkq.supabase.co';
const SB_KEY = 'sb_publishable_wM0D_q_KjXwri9pgCzT-tQ_l-zglLhR';
const SB_HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Prefer':        'return=representation',
};

// Базовый fetch для Supabase
async function sbFetch(path, options = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...options,
    headers: { ...SB_HEADERS, ...(options.headers || {}) },
  });
  if (!r.ok) {
    let msg = `Ошибка ${r.status}`;
    try { const e = await r.json(); msg = e.message || e.error || msg; } catch {}
    throw new Error(msg);
  }
  // DELETE возвращает 204 без тела
  if (r.status === 204) return null;
  return r.json();
}

// ── Persons API ────────────────────────────────
const PAPI = {
  async list() {
    const data = await sbFetch('persons?select=*&order=name.asc&limit=500');
    return data || [];
  },
  async create(data) {
    const rows = await sbFetch('persons', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async update(id, data) {
    const rows = await sbFetch(`persons?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async remove(id) {
    await sbFetch(`persons?id=eq.${id}`, { method: 'DELETE' });
  },
};

// ── API helpers ────────────────────────────────
const API = {
  async list() {
    const data = await sbFetch('acts?select=*&order=created_date.desc&limit=500');
    return data || [];
  },
  async create(data) {
    const rows = await sbFetch('acts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async update(id, data) {
    const rows = await sbFetch(`acts?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return Array.isArray(rows) ? rows[0] : rows;
  },
  async remove(id) {
    await sbFetch(`acts?id=eq.${id}`, { method: 'DELETE' });
  },
};

// ── State ──────────────────────────────────────
const state = {
  acts:         [],
  persons:      [],
  currentYear:  new Date().getFullYear(),
  currentMonth: new Date().getMonth(),
  selectedDate: null,
  signSearchAct: null,
  calPersonFilter: '',   // фильтр по сотруднику в календаре
  rptPersonFilter: '',   // фильтр по сотруднику в отчётах
};

// ── DOM refs ───────────────────────────────────
const $grid       = document.getElementById('calendar-grid');
const $title      = document.getElementById('calendar-title');
const $panelTitle = document.getElementById('day-panel-title');
const $panelBody  = document.getElementById('day-panel-body');
const $toasts     = document.getElementById('toast-container');

// ── Locale helpers ─────────────────────────────
const MONTHS = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
];
const MONTHS_GEN = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];

function toLocale(dateStr) {
  if (!dateStr) return '—';
  const s = toDateKey(dateStr); // безопасно обрабатываем любой формат
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}.${m}.${y}`;
}

function formatAmount(val) {
  if (!val && val !== 0) return '—';
  return Number(val).toLocaleString('ru-RU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ₽';
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function todayKey() { return dateKey(new Date()); }

// Универсальная функция: из любого формата (ISO, timestamp, YYYY-MM-DD) возвращает 'YYYY-MM-DD'
// Если значение пустое/невалидное — возвращает ''
function toDateKey(val) {
  if (!val) return '';
  // Уже YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  // ISO строка или timestamp
  const d = new Date(typeof val === 'number' ? val : val);
  if (isNaN(d.getTime())) return '';
  return dateKey(d);
}

function todayDisplay() {
  const now = new Date();
  return `${now.getDate()} ${MONTHS_GEN[now.getMonth()]} ${now.getFullYear()}`;
}

// ── Toast ──────────────────────────────────────
function toast(msg, type = 'info') {
  const icons = { success:'fa-circle-check', error:'fa-circle-xmark', info:'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="fa ${icons[type]||icons.info}"></i> ${msg}`;
  $toasts.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-hide');
    el.addEventListener('animationend', () => el.remove());
  }, 3200);
}

// ── Modal helpers ──────────────────────────────
function openModal(id)  {
  const m = document.getElementById(id);
  m.setAttribute('aria-hidden','false');
  m.classList.add('active');
}
function closeModal(id) {
  const m = document.getElementById(id);
  m.setAttribute('aria-hidden','true');
  m.classList.remove('active');
}

document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape')
    document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
});

// ── Persons list ─────────────────────────────────────
function collectPersons() {
  // Берём из справочника если есть, иначе из актов
  if (state.persons && state.persons.length) {
    return state.persons.map(p => p.name).sort((a, b) => a.localeCompare(b, 'ru'));
  }
  const set = new Set();
  for (const a of state.acts) {
    if (a.created_by) set.add(a.created_by.trim());
    if (a.signed_by)  set.add(a.signed_by.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
}

function fillPersonSelect(selectId, persons) {
  const sel = document.getElementById(selectId);
  const cur = sel.value;
  sel.innerHTML = '<option value="">— выбрать из списка —</option>';
  for (const p of persons) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = p;
    sel.appendChild(opt);
  }
  sel.value = cur;
}

// ── Fill person filter selects ────────────────────
function fillPersonFilterSelects() {
  const persons = collectPersons();

  // ── Calendar filter
  const calSel = document.getElementById('cal-person-filter');
  const calCur = calSel.value;
  calSel.innerHTML = '<option value="">Все сотрудники</option>';
  for (const p of persons) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = p;
    calSel.appendChild(opt);
  }
  calSel.value = persons.includes(calCur) ? calCur : '';
  state.calPersonFilter = calSel.value;
  document.getElementById('cal-filter-clear').classList.toggle('hidden', !calSel.value);

  // ── Report filter
  const rptSel = document.getElementById('rpt-person-filter');
  const rptCur = rptSel.value;
  rptSel.innerHTML = '<option value="">Все сотрудники</option>';
  for (const p of persons) {
    const opt = document.createElement('option');
    opt.value = opt.textContent = p;
    rptSel.appendChild(opt);
  }
  rptSel.value = persons.includes(rptCur) ? rptCur : '';
  state.rptPersonFilter = rptSel.value;
  document.getElementById('rpt-filter-clear').classList.toggle('hidden', !rptSel.value);
}

// Calendar person filter events
document.getElementById('cal-person-filter').addEventListener('change', function () {
  state.calPersonFilter = this.value;
  document.getElementById('cal-filter-clear').classList.toggle('hidden', !this.value);
  renderCalendar();
  if (state.selectedDate) renderDayPanel(state.selectedDate);
});
document.getElementById('cal-filter-clear').addEventListener('click', () => {
  state.calPersonFilter = '';
  document.getElementById('cal-person-filter').value = '';
  document.getElementById('cal-filter-clear').classList.add('hidden');
  renderCalendar();
  if (state.selectedDate) renderDayPanel(state.selectedDate);
});

// Report person filter events
document.getElementById('rpt-person-filter').addEventListener('change', function () {
  state.rptPersonFilter = this.value;
  document.getElementById('rpt-filter-clear').classList.toggle('hidden', !this.value);
  renderReport();
});
document.getElementById('rpt-filter-clear').addEventListener('click', () => {
  state.rptPersonFilter = '';
  document.getElementById('rpt-person-filter').value = '';
  document.getElementById('rpt-filter-clear').classList.add('hidden');
  renderReport();
});

// ── Build acts map by date ──────────────────────
// Каждый акт попадает:
//   • в created[created_date] — если status = created ИЛИ signed (всегда отображаем дату создания)
//   • в signed[signed_date]   — только если status = signed
function buildActsByDate(acts, personFilter) {
  let filtered = acts;
  if (personFilter) {
    filtered = acts.filter(a =>
      (a.created_by || '') === personFilter ||
      (a.signed_by  || '') === personFilter
    );
  }
  const map = {};
  const add = (k, bucket, act) => {
    if (!map[k]) map[k] = { created:[], signed:[] };
    map[k][bucket].push(act);
  };
  for (const act of filtered) {
    if (act.created_date) add(toDateKey(act.created_date), 'created', act);
    if (act.status === 'signed' && act.signed_date)
      add(toDateKey(act.signed_date), 'signed', act);
  }
  return map;
}

// ── Render calendar ────────────────────────────
function renderCalendar() {
  const { currentYear, currentMonth, selectedDate, calPersonFilter } = state;
  $title.textContent = `${MONTHS[currentMonth]} ${currentYear}`;

  const byDate = buildActsByDate(state.acts, calPersonFilter);
  const today  = todayKey();

  const firstDay   = new Date(currentYear, currentMonth, 1);
  let startDow     = firstDay.getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;

  const daysInMonth     = new Date(currentYear, currentMonth+1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  const cells = [];
  for (let i = startDow-1; i >= 0; i--) {
    const mm = currentMonth === 0 ? 11 : currentMonth-1;
    const yy = currentMonth === 0 ? currentYear-1 : currentYear;
    cells.push({ day: daysInPrevMonth-i, month: mm, year: yy, other: true });
  }
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, month: currentMonth, year: currentYear, other: false });
  const rem = cells.length % 7;
  if (rem) {
    const mm = currentMonth === 11 ? 0 : currentMonth+1;
    const yy = currentMonth === 11 ? currentYear+1 : currentYear;
    for (let d = 1; d <= 7-rem; d++)
      cells.push({ day: d, month: mm, year: yy, other: true });
  }

  $grid.innerHTML = '';

  for (const cell of cells) {
    const key  = `${cell.year}-${String(cell.month+1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`;
    const info = byDate[key] || { created:[], signed:[] };

    const hasCreated = info.created.length > 0;
    const hasSigned  = info.signed.length  > 0;

    const div = document.createElement('div');
    div.className = 'calendar-day'
      + (cell.other ? ' other-month' : '')
      + (key === today ? ' today' : '')
      + (key === selectedDate ? ' selected' : '')
      + (hasCreated && hasSigned ? ' has-both' : hasCreated ? ' has-created' : hasSigned ? ' has-signed' : '');
    div.dataset.date = key;

    // Номер дня
    const numEl = document.createElement('div');
    numEl.className = 'day-number';
    numEl.textContent = cell.day;
    div.appendChild(numEl);

    // Счётчики-точки
    if (hasCreated || hasSigned) {
      const counters = document.createElement('div');
      counters.className = 'day-counters';
      if (hasCreated) {
        const c = document.createElement('span');
        c.className = 'day-counter counter-created';
        c.title = `Создано: ${info.created.length}`;
        c.innerHTML = `<i class="fa fa-file-pen"></i> ${info.created.length}`;
        counters.appendChild(c);
      }
      if (hasSigned) {
        const c = document.createElement('span');
        c.className = 'day-counter counter-signed';
        c.title = `Подписано: ${info.signed.length}`;
        c.innerHTML = `<i class="fa fa-check"></i> ${info.signed.length}`;
        counters.appendChild(c);
      }
      div.appendChild(counters);
    }

    // Плашки актов
    const badgesEl = document.createElement('div');
    badgesEl.className = 'day-badges';
    const MAX = 2;
    let shown = 0;

    for (const act of info.created.slice(0, MAX)) {
      const b = document.createElement('div');
      b.className = 'day-badge badge-created';
      b.textContent = act.act_number || act.title || 'Акт';
      badgesEl.appendChild(b);
      shown++;
    }
    for (const act of info.signed.slice(0, MAX - shown)) {
      const b = document.createElement('div');
      b.className = 'day-badge badge-signed';
      b.textContent = act.act_number || act.title || 'Акт';
      badgesEl.appendChild(b);
    }
    const total = info.created.length + info.signed.length;
    if (total > MAX) {
      const more = document.createElement('div');
      more.className = 'day-more';
      more.textContent = `+${total - MAX}`;
      badgesEl.appendChild(more);
    }
    div.appendChild(badgesEl);

    div.addEventListener('click', () => selectDay(key));
    $grid.appendChild(div);
  }
}

// ── Select a day ───────────────────────────────
function selectDay(key) {
  state.selectedDate = key;
  renderCalendar();
  const [y, m, d] = key.split('-');
  $panelTitle.textContent = `${parseInt(d)} ${MONTHS_GEN[parseInt(m)-1]} ${y}`;
  renderDayPanel(key);
}

// ── Day panel ──────────────────────────────────
function renderDayPanel(key) {
  const byDate    = buildActsByDate(state.acts, state.calPersonFilter);
  const freshInfo = byDate[key] || { created:[], signed:[] };

  $panelBody.innerHTML = '';

  if (!freshInfo.created.length && !freshInfo.signed.length) {
    $panelBody.innerHTML = '<p class="empty-state">Нет актов на этот день.</p>';
  }

  if (freshInfo.created.length) {
    const h = document.createElement('div');
    h.className = 'acts-group-title';
    h.innerHTML = `<i class="fa fa-file-circle-plus" style="color:var(--clr-created)"></i> Создано (${freshInfo.created.length})`;
    $panelBody.appendChild(h);
    freshInfo.created.forEach(act => $panelBody.appendChild(buildActCard(act, 'created')));
  }

  if (freshInfo.signed.length) {
    const h = document.createElement('div');
    h.className = 'acts-group-title';
    h.innerHTML = `<i class="fa fa-signature" style="color:var(--clr-signed)"></i> Подписано (${freshInfo.signed.length})`;
    $panelBody.appendChild(h);
    freshInfo.signed.forEach(act => $panelBody.appendChild(buildActCard(act, 'signed')));
  }

  // Кнопка «Добавить» в низу панели
  let wrap = document.getElementById('panel-add-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'panel-add-wrap';
    wrap.className = 'day-panel-add';
    wrap.innerHTML = `<button id="panel-add-btn" class="btn btn-primary btn-sm" style="width:100%">
      <i class="fa fa-plus"></i> Создать акт на этот день
    </button>`;
    document.getElementById('day-panel').appendChild(wrap);
  }
  document.getElementById('panel-add-btn').onclick = () => openCreateModal(key);
}

// ── Act card ────────────────────────────────────
function buildActCard(act, role) {
  const card = document.createElement('div');
  card.className = `act-card act-${role}`;

  const chip = role === 'created'
    ? `<span class="status-chip chip-created"><i class="fa fa-file-pen"></i> Создан</span>`
    : `<span class="status-chip chip-signed"><i class="fa fa-check-circle"></i> Подписан</span>`;

  let meta = '';
  if (role === 'created') {
    meta += `<span><i class="fa fa-user" style="color:var(--clr-created)"></i> <strong>${act.created_by || '—'}</strong></span>`;
    if (act.signatory) meta += `<span><i class="fa fa-user-pen" style="color:var(--clr-primary)"></i> Подписант: <strong>${act.signatory}</strong></span>`;
    meta += `<span><i class="fa fa-calendar"></i> Создан ${toLocale(act.created_date)}</span>`;
    if (act.amount) meta += `<span><i class="fa fa-ruble-sign" style="color:var(--clr-primary)"></i> ${formatAmount(act.amount)}</span>`;
    if (act.act_url)
      meta += `<span><i class="fa fa-link" style="color:var(--clr-primary)"></i> <a href="${act.act_url}" target="_blank" rel="noopener" class="act-url-link-inline">Открыть акт</a></span>`;
    if (act.status === 'signed')
      meta += `<span style="color:var(--clr-signed)"><i class="fa fa-check-circle"></i> Подписан ${toLocale(act.signed_date)}</span>`;
  } else {
    meta += `<span><i class="fa fa-user-check" style="color:var(--clr-signed)"></i> Принял: <strong>${act.signed_by || '—'}</strong></span>`;
    meta += `<span><i class="fa fa-calendar-check"></i> Подписан ${toLocale(act.signed_date)}</span>`;
    if (act.amount) meta += `<span><i class="fa fa-ruble-sign" style="color:var(--clr-primary)"></i> ${formatAmount(act.amount)}</span>`;
    meta += `<span><i class="fa fa-user" style="color:var(--clr-muted)"></i> Создал: ${act.created_by || '—'} (${toLocale(act.created_date)})</span>`;
    if (act.signatory) meta += `<span><i class="fa fa-user-pen" style="color:var(--clr-primary)"></i> Подписант: ${act.signatory}</span>`;
    if (act.act_url)
      meta += `<span><i class="fa fa-file-lines" style="color:var(--clr-primary)"></i> <a href="${act.act_url}" target="_blank" rel="noopener" class="act-url-link-inline">Открыть акт</a></span>`;
    if (act.signed_url)
      meta += `<span><i class="fa fa-link" style="color:var(--clr-signed)"></i> <a href="${act.signed_url}" target="_blank" rel="noopener" class="act-url-link-inline" style="color:var(--clr-signed)">Подписанный документ</a></span>`;
  }

  card.innerHTML = `
    <div class="act-card-header">
      <div class="act-card-info">
        ${act.act_number ? `<div class="act-card-num">${act.act_number}</div>` : ''}
        <div class="act-card-title">${act.signatory || '<span class="act-no-signatory">Подписант не указан</span>'}</div>
      </div>
      ${chip}
    </div>
    <div class="act-card-meta">${meta}</div>
    <div class="act-card-actions">
      <button class="btn btn-outline btn-sm" data-action="detail">
        <i class="fa fa-eye"></i> Подробнее
      </button>
      ${act.status !== 'signed' ? `<button class="btn btn-success btn-sm" data-action="sign">
        <i class="fa fa-pen-nib"></i> Подписать
      </button>` : ''}
      <button class="btn btn-ghost btn-sm del-btn" data-action="delete">
        <i class="fa fa-trash"></i>
      </button>
    </div>
  `;

  card.querySelector('[data-action="detail"]').addEventListener('click', e => { e.stopPropagation(); openDetailModal(act); });
  const signBtn = card.querySelector('[data-action="sign"]');
  if (signBtn) signBtn.addEventListener('click', e => { e.stopPropagation(); openSignModalWithAct(act); });
  card.querySelector('[data-action="delete"]').addEventListener('click', e => { e.stopPropagation(); confirmDelete(act); });

  return card;
}

// ── Detail modal ───────────────────────────────
function openDetailModal(act) {
  const body = document.getElementById('modal-detail-body');
  body.innerHTML = `
    ${act.act_number ? `<div class="detail-section"><div class="detail-label">Номер акта</div><div class="detail-value">${act.act_number}</div></div>` : ''}
    ${act.signatory ? `<div class="detail-section"><div class="detail-label"><i class="fa fa-user-pen"></i> ФИО подписанта</div><div class="detail-value" style="color:var(--clr-primary);font-weight:700">${act.signatory}</div></div>` : ''}
    ${act.description ? `<div class="detail-section"><div class="detail-label">Описание</div><div class="detail-value">${act.description}</div></div>` : ''}
    ${act.amount ? `<div class="detail-section"><div class="detail-label"><i class="fa fa-ruble-sign"></i> Сумма акта</div><div class="detail-value detail-amount">${formatAmount(act.amount)}</div></div>` : ''}
    ${act.act_url ? `<div class="detail-section">
      <div class="detail-label"><i class="fa fa-file-lines" style="color:var(--clr-primary)"></i> Акт (документ)</div>
      <div class="detail-value">
        <a href="${act.act_url}" target="_blank" rel="noopener" class="act-url-link">
          <i class="fa fa-arrow-up-right-from-square"></i> Открыть акт
        </a>
        <span class="act-url-text">${act.act_url}</span>
      </div>
    </div>` : ''}
    <div class="detail-section">
      <div class="detail-label">Создан кем</div>
      <div class="detail-value"><i class="fa fa-user" style="color:var(--clr-created)"></i> ${act.created_by||'—'}</div>
    </div>
    <div class="detail-section"><div class="detail-label">Дата создания</div><div class="detail-value">${toLocale(act.created_date)}</div></div>
    <div class="detail-section">
      <div class="detail-label">Статус</div>
      <div class="detail-value">
        ${act.status === 'signed'
          ? '<span class="status-chip chip-signed"><i class="fa fa-check-circle"></i> Подписан</span>'
          : '<span class="status-chip chip-created"><i class="fa fa-file-pen"></i> Создан (не подписан)</span>'}
      </div>
    </div>
    ${act.status === 'signed' ? `
    <div class="detail-section">
      <div class="detail-label">Принят кем</div>
      <div class="detail-value"><i class="fa fa-user-check" style="color:var(--clr-signed)"></i> ${act.signed_by||'—'}</div>
    </div>
    <div class="detail-section"><div class="detail-label">Дата подписания</div><div class="detail-value">${toLocale(act.signed_date)}</div></div>
    ${act.signed_url ? `
    <div class="detail-section">
      <div class="detail-label"><i class="fa fa-link" style="color:var(--clr-primary)"></i> Подписанный документ</div>
      <div class="detail-value">
        <a href="${act.signed_url}" target="_blank" rel="noopener" class="act-url-link">
          <i class="fa fa-arrow-up-right-from-square"></i> Открыть ссылку
        </a>
        <span class="act-url-text">${act.signed_url}</span>
      </div>
    </div>` : ''}
    ` : `<div style="margin-top:1rem">
      <button class="btn btn-success" style="width:100%" id="detail-sign-btn">
        <i class="fa fa-pen-nib"></i> Подписать этот акт
      </button>
    </div>`}
  `;
  const sb = body.querySelector('#detail-sign-btn');
  if (sb) sb.addEventListener('click', () => { closeModal('modal-detail'); openSignModalWithAct(act); });
  openModal('modal-detail');
}

// ── Create modal ───────────────────────────────
function openCreateModal(prefillDate) {
  document.getElementById('form-create').reset();
  document.getElementById('f-created-date').value = prefillDate || todayKey();

  // Справочник только для поля «Создан кем»
  fillPersonSelect('f-created-by-select', collectPersons());
  const selC = document.getElementById('f-created-by-select');
  const inpC = document.getElementById('f-created-by');
  selC.onchange = () => { if (selC.value) inpC.value = selC.value; };

  openModal('modal-create');
}

document.getElementById('btn-add-act').addEventListener('click', () => openCreateModal());

// Кнопка «Открыть ссылку» рядом с полем URL акта (форма создания)
document.getElementById('btn-check-act-url').addEventListener('click', () => {
  const url = document.getElementById('f-act-url').value.trim();
  if (url) window.open(url, '_blank', 'noopener');
  else toast('Введите ссылку для проверки', 'error');
});

document.getElementById('form-create').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Сохранение...';
  try {
    await API.create({
      act_number:   document.getElementById('f-act-number').value.trim(),
      signatory:    document.getElementById('f-signatory').value.trim(),
      description:  document.getElementById('f-description').value.trim(),
      created_by:   document.getElementById('f-created-by').value.trim(),
      created_date: document.getElementById('f-created-date').value,
      amount:       parseFloat(document.getElementById('f-amount').value) || 0,
      act_url:      document.getElementById('f-act-url').value.trim(),
      status:       'created',
    });
    toast('Акт создан!', 'success');
    closeModal('modal-create');
    await loadActs();
    if (state.selectedDate) renderDayPanel(state.selectedDate);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-save"></i> Создать';
  }
});

// ── Sign modal ─────────────────────────────────
function openSignModal() {
  // Открываем форму подписания без конкретного акта — нужно выбрать
  state.signSearchAct = null;
  document.getElementById('form-sign').reset();
  document.getElementById('f-sign-act-id').value = '';
  document.getElementById('f-signed-date').value = todayKey();
  document.getElementById('f-signed-date-display').textContent = todayDisplay();
  document.getElementById('selected-act-card').style.display = 'none';
  document.getElementById('selected-act-card').innerHTML = '';
  document.getElementById('act-dropdown').innerHTML = '';
  document.getElementById('act-dropdown').style.display = 'none';
  document.getElementById('f-sign-search').value = '';
  document.getElementById('f-signed-url').value = '';
  document.getElementById('btn-submit-sign').disabled = true;

  fillPersonSelect('f-signed-by-select', collectPersons());
  const sel = document.getElementById('f-signed-by-select');
  const inp = document.getElementById('f-signed-by');
  sel.onchange = () => { if (sel.value) inp.value = sel.value; };

  openModal('modal-sign');
}

// Открыть форму подписания с уже выбранным актом
function openSignModalWithAct(act) {
  openSignModal();
  selectActForSigning(act);
  document.getElementById('f-sign-search').value = `${act.act_number || ''} ${act.signatory || ''}`.trim();
  // Приоритет: уже сохранённый signed_url, иначе подставляем act_url как ссылку на акт
  const urlField = document.getElementById('f-signed-url');
  if (act.signed_url) urlField.value = act.signed_url;
  else if (act.act_url) urlField.value = act.act_url;
}

document.getElementById('btn-sign-act').addEventListener('click', openSignModal);

// Кнопка «Открыть ссылку» рядом с полем URL
document.getElementById('btn-check-url').addEventListener('click', () => {
  const url = document.getElementById('f-signed-url').value.trim();
  if (url) window.open(url, '_blank', 'noopener');
  else toast('Введите ссылку для проверки', 'error');
});

// Поиск акта для подписания
const $signSearch   = document.getElementById('f-sign-search');
const $actDropdown  = document.getElementById('act-dropdown');

$signSearch.addEventListener('input', () => {
  const q = $signSearch.value.trim().toLowerCase();
  if (!q) { $actDropdown.style.display = 'none'; return; }

  // Только неподписанные акты, поиск в т.ч. по ФИО подписанта
  const matches = state.acts.filter(a =>
    a.status !== 'signed' &&
    ((a.act_number  || '').toLowerCase().includes(q) ||
     (a.signatory   || '').toLowerCase().includes(q) ||
     (a.created_by  || '').toLowerCase().includes(q))
  );

  $actDropdown.innerHTML = '';
  if (!matches.length) {
    $actDropdown.innerHTML = '<div class="dropdown-empty">Ничего не найдено</div>';
    $actDropdown.style.display = 'block';
    return;
  }

  for (const act of matches.slice(0, 10)) {
    const item = document.createElement('div');
    item.className = 'dropdown-item';
    item.innerHTML = `
      <span class="dropdown-num">${act.act_number || '—'}</span>
      <span class="dropdown-title">${act.signatory || '<em style="color:var(--clr-muted)">подписант не указан</em>'}</span>
      <span class="dropdown-meta">Создал: ${act.created_by||'—'} · ${toLocale(act.created_date)}</span>
    `;
    item.addEventListener('mousedown', e => {
      e.preventDefault();
      selectActForSigning(act);
      $signSearch.value = `${act.act_number||''} ${act.signatory||''}`.trim();
      $actDropdown.style.display = 'none';
    });
    $actDropdown.appendChild(item);
  }
  $actDropdown.style.display = 'block';
});

$signSearch.addEventListener('blur', () => {
  setTimeout(() => { $actDropdown.style.display = 'none'; }, 200);
});

function selectActForSigning(act) {
  state.signSearchAct = act;
  document.getElementById('f-sign-act-id').value = act.id;
  document.getElementById('btn-submit-sign').disabled = false;

  // Подставляем ссылку: приоритет — уже сохранённый signed_url, иначе act_url из акта
  const urlField = document.getElementById('f-signed-url');
  if (!urlField.value.trim()) {
    if (act.signed_url) urlField.value = act.signed_url;
    else if (act.act_url) urlField.value = act.act_url;
  }

  const card = document.getElementById('selected-act-card');
  card.style.display = 'block';
  card.innerHTML = `
    <div class="selected-act-inner">
      <div>
        ${act.act_number ? `<div class="act-card-num">${act.act_number}</div>` : ''}
        <div class="act-card-title">${act.signatory || '<span style="color:var(--clr-muted);font-style:italic">Подписант не указан</span>'}</div>
        <div class="act-card-meta">
          <span><i class="fa fa-user" style="color:var(--clr-created)"></i> Создал: <strong>${act.created_by||'—'}</strong></span>
          <span><i class="fa fa-calendar"></i> ${toLocale(act.created_date)}</span>
          ${act.act_url ? `<span><i class="fa fa-link" style="color:var(--clr-primary)"></i> <a href="${act.act_url}" target="_blank" rel="noopener" class="act-url-link-inline">Открыть акт</a></span>` : ''}
        </div>
      </div>
      <button type="button" class="close-btn" id="deselect-act"><i class="fa fa-xmark"></i></button>
    </div>
  `;
  document.getElementById('deselect-act').addEventListener('click', () => {
    state.signSearchAct = null;
    document.getElementById('f-sign-act-id').value = '';
    document.getElementById('btn-submit-sign').disabled = true;
    card.style.display = 'none';
    card.innerHTML = '';
    $signSearch.value = '';
    urlField.value = '';
  });
}

document.getElementById('form-sign').addEventListener('submit', async e => {
  e.preventDefault();
  const id = document.getElementById('f-sign-act-id').value;
  if (!id) { toast('Выберите акт для подписания', 'error'); return; }

  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Подписание...';
  try {
    const signedUrl = document.getElementById('f-signed-url').value.trim();
    await API.update(id, {
      status:      'signed',
      signed_by:   document.getElementById('f-signed-by').value.trim(),
      signed_date: document.getElementById('f-signed-date').value,
      signed_url:  signedUrl || '',
    });
    toast('Акт подписан!', 'success');
    closeModal('modal-sign');
    await loadActs();
    if (state.selectedDate) renderDayPanel(state.selectedDate);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-check"></i> Подписать';
  }
});

// ── Delete ─────────────────────────────────────
function confirmDelete(act) {
  if (!confirm(`Удалить акт «${act.act_number || act.title}»?`)) return;
  API.remove(act.id).then(async () => {
    toast('Акт удалён.', 'info');
    await loadActs();
    if (state.selectedDate) renderDayPanel(state.selectedDate);
  }).catch(err => toast(err.message, 'error'));
}

// ── Panel close ─────────────────────────────────
document.getElementById('day-panel-close').addEventListener('click', () => {
  state.selectedDate = null;
  renderCalendar();
  $panelTitle.textContent = 'Выберите день';
  $panelBody.innerHTML = '<p class="empty-state">Нажмите на любой день, чтобы увидеть акты.</p>';
  const wrap = document.getElementById('panel-add-wrap');
  if (wrap) wrap.remove();
});

// ── Navigation ─────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', () => {
  if (state.currentMonth === 0) { state.currentMonth = 11; state.currentYear--; }
  else state.currentMonth--;
  renderCalendar();
});
document.getElementById('btn-next').addEventListener('click', () => {
  if (state.currentMonth === 11) { state.currentMonth = 0; state.currentYear++; }
  else state.currentMonth++;
  renderCalendar();
});
document.getElementById('btn-today').addEventListener('click', () => {
  const now = new Date();
  state.currentYear  = now.getFullYear();
  state.currentMonth = now.getMonth();
  renderCalendar();
});

// ── Load acts ───────────────────────────────────
async function loadActs() {
  try {
    [state.acts, state.persons] = await Promise.all([
      API.list(),
      PAPI.list(),
    ]);
    fillPersonFilterSelects();
    renderCalendar();
    // Если открыта вкладка отчётов — перерисовать после загрузки данных
    if (!document.getElementById('view-report').classList.contains('hidden')) {
      renderReport();
    }
  } catch (err) {
    toast('Не удалось загрузить данные: ' + err.message, 'error');
  }
}

// loadActs() вызывается после успешного входа (см. initLogin)
if (AUTH.isLoggedIn()) loadActs();

/* =============================================
   REPORTS MODULE
   ============================================= */

// ── Report state ────────────────────────────────
const rpt = {
  period:   'week',
  offset:   0,
  dateFrom: null,
  dateTo:   null,
};

// ── Tab switching ───────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('view-calendar').classList.toggle('hidden', tab !== 'calendar');
    document.getElementById('view-report').classList.toggle('hidden',   tab !== 'report');
    document.getElementById('view-persons').classList.toggle('hidden',   tab !== 'persons');
    if (tab === 'report')  renderReport();
    if (tab === 'persons') loadPersons();
  });
});

// ── Period tab buttons ──────────────────────────
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    rpt.period = btn.dataset.period;
    rpt.offset = 0;
    const isCustom = rpt.period === 'custom';
    document.getElementById('report-nav-week').classList.toggle('hidden', isCustom);
    document.getElementById('report-custom-range').classList.toggle('hidden', !isCustom);
    if (!isCustom) renderReport();
  });
});

// ── Navigation prev/next ────────────────────────
document.getElementById('rpt-prev').addEventListener('click',   () => { rpt.offset--; renderReport(); });
document.getElementById('rpt-next').addEventListener('click',   () => { rpt.offset++; renderReport(); });
document.getElementById('rpt-today').addEventListener('click',  () => { rpt.offset = 0; renderReport(); });

// ── Custom range ────────────────────────────────
document.getElementById('rpt-apply').addEventListener('click', () => {
  const from = document.getElementById('rpt-date-from').value;
  const to   = document.getElementById('rpt-date-to').value;
  if (!from || !to) { toast('Укажите обе даты периода', 'error'); return; }
  if (from > to)    { toast('Дата «С» должна быть раньше «По»', 'error'); return; }
  rpt.dateFrom = from;
  rpt.dateTo   = to;
  renderReport();
});

// ── Compute date range ──────────────────────────
function getReportRange() {
  const now = new Date();
  if (rpt.period === 'week') {
    const day = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + rpt.offset * 7);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    return { from: dateKey(mon), to: dateKey(sun) };
  }
  if (rpt.period === 'month') {
    let y = now.getFullYear();
    let m = now.getMonth() + rpt.offset;
    while (m < 0)  { m += 12; y--; }
    while (m > 11) { m -= 12; y++; }
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);
    return { from: dateKey(first), to: dateKey(last) };
  }
  return { from: rpt.dateFrom || dateKey(now), to: rpt.dateTo || dateKey(now) };
}

// ── Format range label ──────────────────────────
function formatRangeLabel(from, to) {
  const [fy, fm, fd] = from.split('-');
  const [ty, tm, td] = to.split('-');
  if (from === to)
    return `${parseInt(fd)} ${MONTHS_GEN[parseInt(fm)-1]} ${fy}`;
  if (fy === ty && fm === tm)
    return `${parseInt(fd)}–${parseInt(td)} ${MONTHS_GEN[parseInt(fm)-1]} ${fy}`;
  if (fy === ty)
    return `${parseInt(fd)} ${MONTHS_GEN[parseInt(fm)-1]} — ${parseInt(td)} ${MONTHS_GEN[parseInt(tm)-1]} ${fy}`;
  return `${parseInt(fd)} ${MONTHS_GEN[parseInt(fm)-1]} ${fy} — ${parseInt(td)} ${MONTHS_GEN[parseInt(tm)-1]} ${ty}`;
}

// ── Main render ─────────────────────────────────
function renderReport() {
  const { from, to } = getReportRange();
  const pf = state.rptPersonFilter;

  document.getElementById('report-range-label').textContent = formatRangeLabel(from, to);

  // Базовая выборка актов с учётом фильтра по сотруднику
  const baseActs = pf
    ? state.acts.filter(a =>
        (a.created_by || '') === pf ||
        (a.signed_by  || '') === pf
      )
    : state.acts;

  const createdActs = baseActs.filter(a => {
    const cd = toDateKey(a.created_date);
    return cd && cd >= from && cd <= to;
  });
  // Подписанные акты — попадают в выборку если дата создания ИЛИ дата подписания входит в период
  const signedActs = baseActs.filter(a => {
    if (a.status !== 'signed') return false;
    const sd = toDateKey(a.signed_date);
    const cd = toDateKey(a.created_date);
    return (sd && sd >= from && sd <= to) || (cd && cd >= from && cd <= to);
  });
  const pendingActs = createdActs.filter(a => a.status !== 'signed');

  document.getElementById('s-created').textContent = createdActs.length;
  document.getElementById('s-signed').textContent  = signedActs.length;
  document.getElementById('s-pending').textContent = pendingActs.length;
  document.getElementById('s-total').textContent   =
    new Set([...createdActs, ...signedActs].map(a => a.id)).size;

  document.getElementById('count-created').textContent = createdActs.length;
  document.getElementById('count-signed').textContent  = signedActs.length;

  // Суммы
  const totalCreatedAmount = createdActs.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);
  const totalSignedAmount  = signedActs.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0);

  // Таблица созданных
  const tbodyC = document.getElementById('tbody-created');
  const emptyC = document.getElementById('empty-created');
  tbodyC.innerHTML = '';
  if (!createdActs.length) {
    emptyC.classList.remove('hidden');
    document.getElementById('table-created').classList.add('hidden');
  } else {
    emptyC.classList.add('hidden');
    document.getElementById('table-created').classList.remove('hidden');
    [...createdActs]
      .sort((a, b) => (a.created_date||'').localeCompare(b.created_date||''))
      .forEach(act => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="td-num">${act.act_number || '—'}</td>
          <td class="td-title">${act.signatory || '<span style="color:var(--clr-muted)">—</span>'}</td>
          <td>${act.created_by || '—'}</td>
          <td class="td-date">${toLocale(act.created_date)}</td>
          <td class="td-amount">${act.amount ? formatAmount(act.amount) : '<span class="td-no-url">—</span>'}</td>
          <td>${act.status === 'signed'
            ? '<span class="status-chip chip-signed"><i class="fa fa-check-circle"></i> Подписан</span>'
            : '<span class="status-chip chip-created"><i class="fa fa-clock"></i> Не подписан</span>'}</td>
          <td class="td-url">${act.act_url
            ? `<a href="${act.act_url}" target="_blank" rel="noopener" class="table-url-link" title="${act.act_url}">
                <i class="fa fa-file-lines"></i> Открыть
               </a>`
            : '<span class="td-no-url">—</span>'}
          </td>
        `;
        tr.style.cursor = 'pointer';
        tr.title = 'Нажмите для просмотра';
        tr.addEventListener('click', () => openDetailModal(act));
        tbodyC.appendChild(tr);
      });
    if (totalCreatedAmount > 0) {
      const tfoot = document.createElement('tfoot');
      tfoot.innerHTML = `
        <tr class="tfoot-sum">
          <td colspan="4" class="tfoot-label">ИТОГО СУММА:</td>
          <td class="td-amount tfoot-amount">${formatAmount(totalCreatedAmount)}</td>
          <td colspan="2"></td>
        </tr>`;
      document.getElementById('table-created').appendChild(tfoot);
    }
  }

  // Таблица подписанных
  const tbodyS = document.getElementById('tbody-signed');
  const emptyS = document.getElementById('empty-signed');
  tbodyS.innerHTML = '';
  if (!signedActs.length) {
    emptyS.classList.remove('hidden');
    document.getElementById('table-signed').classList.add('hidden');
  } else {
    emptyS.classList.add('hidden');
    document.getElementById('table-signed').classList.remove('hidden');
    [...signedActs]
      .sort((a, b) => (a.signed_date||'').localeCompare(b.signed_date||''))
      .forEach(act => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="td-num">${act.act_number || '—'}</td>
          <td class="td-title">${act.signatory || '<span style="color:var(--clr-muted)">—</span>'}</td>
          <td>${act.created_by || '—'}</td>
          <td class="td-date">${toLocale(act.created_date)}</td>
          <td class="td-amount">${act.amount ? formatAmount(act.amount) : '<span class="td-no-url">—</span>'}</td>
          <td><strong>${act.signed_by || '—'}</strong></td>
          <td class="td-date">${toLocale(act.signed_date)}</td>
          <td class="td-url">${act.signed_url
            ? `<a href="${act.signed_url}" target="_blank" rel="noopener" class="table-url-link" title="${act.signed_url}">
                <i class="fa fa-link"></i> Открыть
               </a>`
            : '<span class="td-no-url">—</span>'}
          </td>
        `;
        tr.style.cursor = 'pointer';
        tr.title = 'Нажмите для просмотра';
        tr.addEventListener('click', () => openDetailModal(act));
        tbodyS.appendChild(tr);
      });
    if (totalSignedAmount > 0) {
      const tfoot = document.createElement('tfoot');
      tfoot.innerHTML = `
        <tr class="tfoot-sum">
          <td colspan="4" class="tfoot-label">ИТОГО СУММА:</td>
          <td class="td-amount tfoot-amount">${formatAmount(totalSignedAmount)}</td>
          <td colspan="3"></td>
        </tr>`;
      document.getElementById('table-signed').appendChild(tfoot);
    }
  }
}

/* =============================================
   PERSONS MODULE — справочник сотрудников
   ============================================= */

// ── Render persons grid ─────────────────────────
function renderPersonsGrid(persons) {
  const grid  = document.getElementById('persons-grid');
  const badge = document.getElementById('persons-count');
  badge.textContent = persons.length;
  grid.innerHTML = '';

  if (!persons.length) {
    grid.innerHTML = `
      <div class="persons-empty">
        <i class="fa fa-users-slash"></i>
        <p>Сотрудники не найдены</p>
        <button class="btn btn-primary btn-sm" id="persons-empty-add">
          <i class="fa fa-user-plus"></i> Добавить первого
        </button>
      </div>`;
    document.getElementById('persons-empty-add')
      .addEventListener('click', () => openPersonModal());
    return;
  }

  for (const p of persons) {
    const card = document.createElement('div');
    card.className = 'person-card';
    const initials = p.name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    card.innerHTML = `
      <div class="person-avatar">${initials}</div>
      <div class="person-info">
        <div class="person-name">${p.name}</div>
        ${p.position   ? `<div class="person-meta"><i class="fa fa-briefcase"></i> ${p.position}</div>`   : ''}
        ${p.department ? `<div class="person-meta"><i class="fa fa-building"></i> ${p.department}</div>` : ''}
      </div>
      <div class="person-actions">
        <button class="btn-icon" title="Редактировать" data-edit="${p.id}">
          <i class="fa fa-pen"></i>
        </button>
        <button class="btn-icon btn-icon-danger" title="Удалить" data-del="${p.id}">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    `;
    card.querySelector('[data-edit]').addEventListener('click', () => openPersonModal(p));
    card.querySelector('[data-del]').addEventListener('click',  () => confirmDeletePerson(p));
    grid.appendChild(card);
  }
}

// ── Load persons ────────────────────────────────
async function loadPersons() {
  try {
    state.persons = await PAPI.list();
    applyPersonsSearch();
    fillPersonFilterSelects();
  } catch (err) {
    toast('Ошибка загрузки сотрудников: ' + err.message, 'error');
  }
}

// ── Search filter ───────────────────────────────
function applyPersonsSearch() {
  const q = (document.getElementById('persons-search').value || '').trim().toLowerCase();
  const filtered = q
    ? state.persons.filter(p =>
        (p.name       || '').toLowerCase().includes(q) ||
        (p.position   || '').toLowerCase().includes(q) ||
        (p.department || '').toLowerCase().includes(q))
    : state.persons;
  renderPersonsGrid(filtered);
}

document.getElementById('persons-search').addEventListener('input', applyPersonsSearch);
document.getElementById('btn-add-person').addEventListener('click', () => openPersonModal());

// ── Person modal ────────────────────────────────
function openPersonModal(person = null) {
  const title = document.getElementById('modal-person-title');
  title.innerHTML = person
    ? '<i class="fa fa-user-pen"></i> Редактировать сотрудника'
    : '<i class="fa fa-user-plus"></i> Добавить сотрудника';

  document.getElementById('fp-id').value         = person ? person.id         : '';
  document.getElementById('fp-name').value       = person ? person.name       : '';
  document.getElementById('fp-position').value   = person ? (person.position   || '') : '';
  document.getElementById('fp-department').value = person ? (person.department || '') : '';
  openModal('modal-person');
}

document.getElementById('form-person').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';

  const id   = document.getElementById('fp-id').value;
  const data = {
    name:       document.getElementById('fp-name').value.trim(),
    position:   document.getElementById('fp-position').value.trim(),
    department: document.getElementById('fp-department').value.trim(),
  };

  try {
    if (id) {
      await PAPI.update(id, data);
      toast('Данные сотрудника обновлены', 'success');
    } else {
      await PAPI.create(data);
      toast('Сотрудник добавлен', 'success');
    }
    closeModal('modal-person');
    await loadPersons();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-save"></i> Сохранить';
  }
});

// ── Delete person ───────────────────────────────
function confirmDeletePerson(p) {
  if (!confirm(`Удалить сотрудника «${p.name}»?\nОн будет убран из выпадающих списков.`)) return;
  PAPI.remove(p.id).then(async () => {
    toast('Сотрудник удалён', 'info');
    await loadPersons();
  }).catch(err => toast(err.message, 'error'));
}

/* =============================================
   PDF EXPORT
   ============================================= */

document.getElementById('btn-export-pdf').addEventListener('click', exportReportPdf);

function exportReportPdf() {
  const btn = document.getElementById('btn-export-pdf');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Формирование...';

  const { from, to } = getReportRange();
  const pf = state.rptPersonFilter;

  const baseActs = pf
    ? state.acts.filter(a =>
        (a.created_by || '') === pf ||
        (a.signed_by  || '') === pf)
    : state.acts;

  const createdActs = baseActs.filter(a => {
    const cd = toDateKey(a.created_date);
    return cd && cd >= from && cd <= to;
  });
  const signedActs = baseActs.filter(a => {
    if (a.status !== 'signed') return false;
    const sd = toDateKey(a.signed_date);
    const cd = toDateKey(a.created_date);
    return (sd && sd >= from && sd <= to) || (cd && cd >= from && cd <= to);
  });
  const pendingCount = createdActs.filter(a => a.status !== 'signed').length;
  const totalCount   = new Set([...createdActs, ...signedActs].map(a => a.id)).size;

  const totalCreatedAmt = createdActs.reduce((s, a) => s + (parseFloat(a.amount)||0), 0);
  const totalSignedAmt  = signedActs.reduce((s, a)  => s + (parseFloat(a.amount)||0), 0);

  // Строим HTML для рендера
  const periodLabel = formatRangeLabel(from, to);
  const employeeLabel = pf ? `<span style="float:right;font-size:11px;opacity:.8">Сотрудник: <b>${pf}</b></span>` : '';
  const nowLabel = new Date().toLocaleDateString('ru-RU', {day:'2-digit',month:'long',year:'numeric'});

  const createdRows = [...createdActs]
    .sort((a,b) => (a.created_date||'').localeCompare(b.created_date||''))
    .map(a => `<tr>
      <td style="font-weight:700;color:#3b82f6">${a.act_number||'—'}</td>
      <td>${a.signatory||'—'}</td>
      <td>${a.created_by||'—'}</td>
      <td style="color:#64748b">${toLocale(a.created_date)}</td>
      <td style="text-align:right;font-weight:600;color:#3b82f6">${a.amount ? formatAmount(a.amount) : '—'}</td>
      <td>${a.status==='signed'
        ? '<span style="color:#16a34a;font-weight:600">✓ Подписан</span>'
        : '<span style="color:#d97706;font-weight:600">⏳ Не подписан</span>'}</td>
      <td style="color:#3b82f6;font-size:11px;word-break:break-all">${a.act_url
        ? `<a href="${a.act_url}" style="color:#3b82f6">Открыть</a>`
        : '—'}</td>
    </tr>`).join('');

  const signedRows = [...signedActs]
    .sort((a,b) => (a.signed_date||'').localeCompare(b.signed_date||''))
    .map(a => `<tr>
      <td style="font-weight:700;color:#3b82f6">${a.act_number||'—'}</td>
      <td>${a.signatory||'—'}</td>
      <td>${a.created_by||'—'}</td>
      <td style="color:#64748b">${toLocale(a.created_date)}</td>
      <td style="text-align:right;font-weight:600;color:#3b82f6">${a.amount ? formatAmount(a.amount) : '—'}</td>
      <td style="font-weight:700;color:#166534">${a.signed_by||'—'}</td>
      <td style="color:#64748b">${toLocale(a.signed_date)}</td>
      <td style="color:#3b82f6;font-size:11px;word-break:break-all">${a.signed_url||'—'}</td>
    </tr>`).join('');

  const html = `
  <div id="pdf-render-root" style="
    font-family:'Inter','Arial',sans-serif;
    font-size:12px;
    color:#1e293b;
    background:#fff;
    padding:24px;
    width:1050px;
  ">
    <!-- Шапка -->
    <div style="background:linear-gradient(135deg,#3b82f6,#6366f1);color:#fff;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;">Отчёт по актам</div>
      <div style="font-size:13px;opacity:.9">Период: <b>${periodLabel}</b>${employeeLabel}</div>
      <div style="font-size:11px;opacity:.7;margin-top:4px;">Сформирован: ${nowLabel}</div>
    </div>

    <!-- Счётчики -->
    <div style="display:flex;gap:12px;margin-bottom:20px;">
      ${[
        {label:'Создано актов',     val:createdActs.length, clr:'#3b82f6'},
        {label:'Подписано актов',   val:signedActs.length,  clr:'#16a34a'},
        {label:'Ожидают подписания',val:pendingCount,       clr:'#d97706'},
        {label:'Всего за период',   val:totalCount,         clr:'#9333ea'},
      ].map(c=>`
        <div style="flex:1;background:#f8fafc;border-radius:8px;padding:14px 16px;border-left:4px solid ${c.clr}">
          <div style="font-size:26px;font-weight:800;color:${c.clr}">${c.val}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px">${c.label}</div>
        </div>`).join('')}
    </div>

    <!-- Таблица созданных -->
    ${createdActs.length ? `
    <div style="margin-bottom:20px;">
      <div style="background:#3b82f6;color:#fff;border-radius:6px 6px 0 0;padding:8px 14px;font-weight:700;font-size:13px;">
        Созданные акты (${createdActs.length})
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;font-size:11px;color:#64748b;">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">№ Акта</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">ФИО подписанта</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Создан кем</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Дата создания</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0">Сумма</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Статус</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Документ</th>
          </tr>
        </thead>
        <tbody>${createdRows}</tbody>
        ${totalCreatedAmt > 0 ? `
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:700;">
            <td colspan="4" style="padding:8px 10px;border-top:2px solid #e2e8f0;color:#64748b">ИТОГО СУММА:</td>
            <td style="padding:8px 10px;border-top:2px solid #e2e8f0;text-align:right;color:#3b82f6">${formatAmount(totalCreatedAmt)}</td>
            <td colspan="2" style="border-top:2px solid #e2e8f0"></td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>` : ''}

    <!-- Таблица подписанных -->
    ${signedActs.length ? `
    <div style="margin-bottom:20px;">
      <div style="background:#16a34a;color:#fff;border-radius:6px 6px 0 0;padding:8px 14px;font-weight:700;font-size:13px;">
        Подписанные акты (${signedActs.length})
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f1f5f9;font-size:11px;color:#64748b;">
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">№ Акта</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">ФИО подписанта</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Создан кем</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Дата создания</th>
            <th style="padding:8px 10px;text-align:right;border-bottom:1px solid #e2e8f0">Сумма</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Принят кем</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Дата подписания</th>
            <th style="padding:8px 10px;text-align:left;border-bottom:1px solid #e2e8f0">Документ</th>
          </tr>
        </thead>
        <tbody>${signedRows}</tbody>
        ${totalSignedAmt > 0 ? `
        <tfoot>
          <tr style="background:#f1f5f9;font-weight:700;">
            <td colspan="4" style="padding:8px 10px;border-top:2px solid #e2e8f0;color:#64748b">ИТОГО СУММА:</td>
            <td style="padding:8px 10px;border-top:2px solid #e2e8f0;text-align:right;color:#3b82f6">${formatAmount(totalSignedAmt)}</td>
            <td colspan="3" style="border-top:2px solid #e2e8f0"></td>
          </tr>
        </tfoot>` : ''}
      </table>
    </div>` : ''}

    ${!createdActs.length && !signedActs.length ? `
    <div style="text-align:center;padding:40px;color:#94a3b8;font-size:14px;">
      Нет данных за выбранный период
    </div>` : ''}

    <!-- Подвал -->
    <div style="margin-top:16px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#94a3b8;font-size:10px;">
      <span>Акты Эксперт Юрист</span>
      <span>${nowLabel}</span>
    </div>
  </div>`;

  // Вставляем скрытый контейнер в DOM
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;z-index:-1;background:#fff;';
  container.innerHTML = html;
  document.body.appendChild(container);

  const root = container.querySelector('#pdf-render-root');

  html2canvas(root, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  }).then(canvas => {
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const { jsPDF } = window.jspdf;
    const imgW = canvas.width;
    const imgH = canvas.height;

    // A4: 210×297 мм, landscape: 297×210 мм
    // Подбираем ориентацию
    const pdfW = 297;
    const pdfH = 210;
    const ratio = Math.min(pdfW / (imgW / 2), pdfH / (imgH / 2));
    const finalW = (imgW / 2) * ratio;
    const finalH = (imgH / 2) * ratio;

    // Если контент высокий — используем несколько страниц
    const pageHeightPx = (pdfH / ratio) * 2; // пикселей на страницу
    const totalPages = Math.ceil(imgH / pageHeightPx);

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();

      const srcY = page * pageHeightPx;
      const srcH = Math.min(pageHeightPx, imgH - srcY);
      const pageH = (srcH / 2) * ratio;

      // Создаём временный canvas для страницы
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width  = imgW;
      pageCanvas.height = srcH;
      const ctx = pageCanvas.getContext('2d');
      ctx.drawImage(canvas, 0, srcY, imgW, srcH, 0, 0, imgW, srcH);
      const pageImg = pageCanvas.toDataURL('image/jpeg', 0.95);

      doc.addImage(pageImg, 'JPEG', 0, 0, pdfW, pageH);
    }

    // Имя файла
    const fname = periodLabel.replace(/\s+/g,'_').replace(/[^а-яёА-ЯЁa-zA-Z0-9_\-]/g,'') || 'otchet';
    doc.save(`Otchet_${fname}.pdf`);

    document.body.removeChild(container);
    toast('PDF сформирован и скачан!', 'success');
  }).catch(err => {
    console.error(err);
    document.body.removeChild(container);
    toast('Ошибка формирования PDF: ' + err.message, 'error');
  }).finally(() => {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-file-pdf"></i> Скачать PDF';
  });
}

