// service-worker.js

function createContextMenus() {
  chrome.contextMenus.create({
    id: 'autofilljp-execute',
    title: '🪄 自動入力を実行',
    contexts: ['page', 'editable']
  });

  chrome.contextMenus.create({
    id: 'autofilljp-capture',
    title: '📝 このページの入力内容を学習',
    contexts: ['page', 'editable']
  });

  chrome.contextMenus.create({
    id: 'autofilljp-options',
    title: '⚙️ 設定を開く',
    contexts: ['page']
  });
}

// 右クリックメニューの登録と初回導線
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    createContextMenus();

    if (details.reason === 'install') {
      chrome.runtime.openOptionsPage();
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'autofilljp-execute') {
    chrome.tabs.sendMessage(tab.id, { type: 'EXECUTE_AUTOFILL' });
  } else if (info.menuItemId === 'autofilljp-capture') {
    chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_FORM' });
  } else if (info.menuItemId === 'autofilljp-options') {
    chrome.runtime.openOptionsPage();
  }
});
