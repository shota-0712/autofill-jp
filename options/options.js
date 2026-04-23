// options.js

let state = {
  rules: [],
  settings: {},
  searchQuery: ''
};

const RULE_TYPE_OPTIONS = [
  { value: '', label: '自動' },
  { value: 'text', label: 'テキスト' },
  { value: 'select', label: 'ドロップダウン' },
  { value: 'checkbox-radio', label: 'チェック/ラジオ' },
  { value: 'password', label: 'パスワード(非対応)' }
];

function normalizeRuleType(type) {
  if (type === 0 || type === '0') return 'text';
  if (type === 1 || type === '1') return 'password';
  if (type === 2 || type === '2') return 'select';
  if (type === 3 || type === '3') return 'checkbox-radio';
  if (type === 'checkbox' || type === 'radio') return 'checkbox-radio';
  if (type === 'dropdown') return 'select';
  if (type === 'select' || type === 'text' || type === 'password' || type === 'checkbox-radio') {
    return type;
  }
  return '';
}

function normalizeRules(rules) {
  return (rules || []).map(rule => ({
    ...rule,
    type: normalizeRuleType(rule.type)
  }));
}

async function loadRulesFromStorage() {
  const localData = await chrome.storage.local.get('rules');
  if (Array.isArray(localData.rules)) {
    return normalizeRules(localData.rules);
  }

  const syncData = await chrome.storage.sync.get('rules');
  if (Array.isArray(syncData.rules)) {
    const migratedRules = normalizeRules(syncData.rules);
    await chrome.storage.local.set({ rules: migratedRules });
    await chrome.storage.sync.remove('rules');
    return migratedRules;
  }

  return [];
}

async function saveRulesToStorage(rules) {
  await chrome.storage.local.set({ rules: normalizeRules(rules) });
  await chrome.storage.sync.remove('rules');
}

// ========== Load & Save ==========
async function loadData() {
  const data = await chrome.storage.sync.get(['settings']);
  state.rules = await loadRulesFromStorage();
  state.settings = data.settings || {};
}

async function saveRules() {
  await saveRulesToStorage(state.rules);
}

async function saveSettings() {
  await chrome.storage.sync.set({ settings: state.settings });
}

// ========== Render ==========
function render() {
  const tbody = document.getElementById('rules-body');
  const emptyState = document.getElementById('empty-state');
  const countEl = document.getElementById('total-count');

  tbody.innerHTML = '';

  const q = state.searchQuery.toLowerCase();
  const filtered = q
    ? state.rules.filter(r =>
        (r.label || '').toLowerCase().includes(q) ||
        (r.name || '').toLowerCase().includes(q) ||
        (String(r.value) || '').toLowerCase().includes(q))
    : state.rules;

  countEl.textContent = state.rules.length;

  if (state.rules.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  filtered.forEach((rule, displayIdx) => {
    const realIdx = state.rules.indexOf(rule);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <select class="type-select" data-idx="${realIdx}" data-prop="type">
          ${RULE_TYPE_OPTIONS.map(option => `
            <option value="${escapeAttr(option.value)}" ${normalizeRuleType(rule.type) === option.value ? 'selected' : ''}>
              ${escapeHtml(option.label)}
            </option>
          `).join('')}
        </select>
      </td>
      <td><input type="text" class="label-input" data-idx="${realIdx}" data-prop="label" value="${escapeAttr(rule.label ?? '')}" placeholder="メモ(例: 漢字姓)"></td>
      <td><input type="text" class="name-input" data-idx="${realIdx}" data-prop="name" value="${escapeAttr(rule.name ?? '')}" placeholder='"name1" / name1 / /regex/'></td>
      <td><input type="text" class="value-input" data-idx="${realIdx}" data-prop="value" value="${escapeAttr(rule.value ?? '')}" placeholder="入力する値"></td>
      <td><input type="text" class="site-input" data-idx="${realIdx}" data-prop="site" value="${escapeAttr(rule.site ?? '')}" placeholder="空欄=全サイト / 例: example.com"></td>
      <td style="text-align:center;"><button class="btn-remove" data-idx="${realIdx}" title="削除">×</button></td>
    `;
    tbody.appendChild(tr);
  });

  // バインド
  tbody.querySelectorAll('input, select').forEach(field => {
    if (field.tagName === 'SELECT') {
      field.addEventListener('change', handleRuleEdit);
      return;
    }
    field.addEventListener('input', debounce(handleRuleEdit, 400));
    field.addEventListener('change', handleRuleEdit);
  });

  tbody.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', handleRemove);
  });
}

function handleRuleEdit(e) {
  const el = e.target;
  const idx = Number(el.dataset.idx);
  const prop = el.dataset.prop;
  if (isNaN(idx) || !state.rules[idx]) return;
  state.rules[idx][prop] = prop === 'type' ? normalizeRuleType(el.value) : el.value;
  saveRules();
}

function handleRemove(e) {
  const idx = Number(e.target.dataset.idx);
  if (isNaN(idx)) return;
  if (!confirm(`ルールを削除しますか?\n「${state.rules[idx].label || state.rules[idx].name}」`)) return;
  state.rules.splice(idx, 1);
  saveRules();
  render();
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ========== Actions ==========
document.getElementById('add-rule').addEventListener('click', () => {
  state.rules.push({
    id: 'r_' + Date.now(),
    type: '',
    name: '',
    value: '',
    label: '',
    site: '',
    createdAt: new Date().toISOString()
  });
  saveRules();
  render();
  // 新しい行のlabel inputにフォーカス
  setTimeout(() => {
    const rows = document.querySelectorAll('#rules-body tr');
    const lastRow = rows[rows.length - 1];
    if (lastRow) lastRow.querySelector('input').focus();
  }, 50);
});

document.getElementById('search').addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  render();
});

document.getElementById('export').addEventListener('click', () => {
  const data = {
    rules: state.rules,
    settings: state.settings,
    exportedAt: new Date().toISOString(),
    version: '0.1.0'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `autofill-jp-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import').addEventListener('click', () => {
  document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data.rules)) {
      alert('ファイル形式が不正です');
      return;
    }
    const mode = confirm(`${data.rules.length}件のルールが含まれています。\n\nOK = 既存ルールに追加(マージ)\nキャンセル = 現在のルールを上書き`);
    if (mode) {
      // マージ: 同じnameのルールは上書き、なければ追加
      for (const newRule of data.rules) {
        const normalizedType = normalizeRuleType(newRule.type);
        const idx = state.rules.findIndex(r => r.name === newRule.name && normalizeRuleType(r.type) === normalizedType);
        if (idx >= 0) {
          state.rules[idx] = { ...state.rules[idx], ...newRule, type: normalizedType };
        } else {
          state.rules.push({ ...newRule, type: normalizedType });
        }
      }
    } else {
      state.rules = data.rules.map(rule => ({
        ...rule,
        type: normalizeRuleType(rule.type)
      }));
    }
    await saveRules();
    render();
    alert(`インポート完了: ${state.rules.length}件のルールが登録されています`);
  } catch (err) {
    alert('インポートに失敗: ' + err.message);
  }
  e.target.value = '';
});

document.getElementById('reset').addEventListener('click', async () => {
  if (!confirm('本当にすべてのルールを削除しますか?')) return;
  if (!confirm('最終確認: 元に戻せません。本当に削除しますか?')) return;
  state.rules = [];
  await saveRules();
  render();
});

// Help toggle
document.getElementById('toggle-help').addEventListener('click', () => {
  const content = document.querySelector('.help-content');
  const btn = document.getElementById('toggle-help');
  content.classList.toggle('hidden');
  btn.textContent = content.classList.contains('hidden') ? '表示' : '隠す';
});

// Settings
document.getElementById('hide-fab').addEventListener('change', async (e) => {
  state.settings.hideFloatingButton = e.target.checked;
  await saveSettings();
});

// ========== Init ==========
(async function init() {
  await loadData();
  render();
  document.getElementById('hide-fab').checked = !!state.settings.hideFloatingButton;
})();
