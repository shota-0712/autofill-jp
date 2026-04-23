// popup.js

const fillBtn = document.getElementById('fill');
const learnBtn = document.getElementById('learn');
const countEl = document.getElementById('count');
const statusEl = document.getElementById('status');
const optsLink = document.getElementById('opts');

async function loadRulesFromStorage() {
  const localData = await chrome.storage.local.get('rules');
  if (Array.isArray(localData.rules)) {
    return localData.rules;
  }

  const syncData = await chrome.storage.sync.get('rules');
  if (Array.isArray(syncData.rules)) {
    await chrome.storage.local.set({ rules: syncData.rules });
    await chrome.storage.sync.remove('rules');
    return syncData.rules;
  }

  return [];
}

async function init() {
  const rules = await loadRulesFromStorage();
  countEl.textContent = `ルール: ${rules.length}件登録済み`;
}

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'status visible ' + type;
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

fillBtn.addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab?.id) { setStatus('タブが取得できません', 'error'); return; }
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_AUTOFILL' });
    if (result && typeof result.filled === 'number') {
      setStatus(`${result.filled}件を入力しました`, 'success');
    } else {
      setStatus('実行できませんでした', 'error');
    }
  } catch (e) {
    setStatus('ページにアクセスできません。リロードしてみてください。', 'error');
  }
});

learnBtn.addEventListener('click', async () => {
  const tab = await getTab();
  if (!tab?.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_FORM' });
    window.close(); // ポップアップ閉じる(モーダルがページ上に出るので)
  } catch (e) {
    setStatus('ページにアクセスできません', 'error');
  }
});

optsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

init();
