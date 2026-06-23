// content.js
// AutoFill JP - content script

(function () {
  'use strict';

  let isTopFrame = true;
  try {
    isTopFrame = window.top === window;
  } catch (error) {
    isTopFrame = false;
  }

  // v1 はトップフレームのフォームのみを対象にする。
  if (!isTopFrame) return;

  if (window.__autofilljp_loaded) return;
  window.__autofilljp_loaded = true;

  const UI_HOST_ID = 'autofilljp-ui-host';
  const UI_Z_INDEX = 2147483646;
  const RULE_TYPE_OPTIONS = [
    { value: '', label: '自動' },
    { value: 'text', label: 'テキスト' },
    { value: 'select', label: 'ドロップダウン' },
    { value: 'checkbox-radio', label: 'チェック/ラジオ' },
    { value: 'password', label: 'パスワード(非対応)' },
  ];
  const NOISE_FIELD_NAME_PATTERNS = [
    /^pra$/i,
    /^fwpopup$/i,
    /^redisplay$/i,
    /^(?:_?csrf|csrf_?token|authenticity_?token|nonce|session(?:id)?|requesttoken)$/i,
    /^(?:__viewstate|__eventvalidation|__requestverificationtoken)$/i,
  ];
  const GENERIC_TEXT_FIELD_NAME_PATTERNS = [
    /^(?:note|notes|remark|remarks|comment|comments|memo|message|messages)$/i,
    /^(?:detail|details|description|descriptions|content|contents|body|text)$/i,
    /^(?:other|others|etc|free|free_?text|free_?answer|textarea)$/i,
    /(?:備考|メモ|コメント|連絡|自由|その他|補足|詳細|内容|本文|特記|注意|配慮|障害)/,
  ];
  const LABEL_NOISE_WORDS = [
    '入力',
    '記入',
    '項目',
    '欄',
    '内容',
    '情報',
    '必須',
    '任意',
    'してください',
    '下さい',
    'ありましたら',
    'ある場合',
  ];

  let uiRoot = null;
  let modalKeyHandler = null;
  let fabInjectionTimer = null;
  let floatingButtonObserver = null;

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function ensureUiRoot() {
    if (uiRoot?.host?.isConnected) {
      return uiRoot;
    }

    const existingHost = document.getElementById(UI_HOST_ID);
    if (existingHost && existingHost.shadowRoot) {
      uiRoot = {
        host: existingHost,
        shadow: existingHost.shadowRoot,
        root: existingHost.shadowRoot.querySelector('.ajp-root'),
        toastLayer: existingHost.shadowRoot.querySelector('.ajp-toast-layer'),
        fabLayer: existingHost.shadowRoot.querySelector('.ajp-fab-layer'),
        overlayLayer: existingHost.shadowRoot.querySelector('.ajp-overlay-layer'),
      };
      return uiRoot;
    }

    const host = document.createElement('div');
    host.id = UI_HOST_ID;
    host.style.cssText = `
      all: initial;
      position: fixed;
      inset: 0;
      z-index: ${UI_Z_INDEX};
      pointer-events: none;
    `;

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }

      *, *::before, *::after {
        box-sizing: border-box;
      }

      .ajp-root {
        position: fixed;
        inset: 0;
        pointer-events: none;
        color: #1f2937;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif;
        line-height: 1.4;
      }

      .ajp-toast-layer,
      .ajp-fab-layer,
      .ajp-overlay-layer {
        position: absolute;
        inset: 0;
      }

      .ajp-toast-layer,
      .ajp-overlay-layer {
        pointer-events: none;
      }

      .ajp-fab-layer {
        pointer-events: none;
      }

      .ajp-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        appearance: none;
        border: none;
        border-radius: 999px;
        padding: 10px 18px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.12s ease, box-shadow 0.18s ease, background 0.18s ease;
      }

      .ajp-btn:hover {
        transform: translateY(-1px);
      }

      .ajp-btn:focus-visible,
      .ajp-field:focus-visible,
      .ajp-check:focus-visible {
        outline: 2px solid #0066cc;
        outline-offset: 2px;
      }

      .ajp-btn-primary {
        background: #1d1d1f;
        color: white;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
      }

      .ajp-btn-success {
        background: #0066cc;
        color: white;
        box-shadow: 0 8px 20px rgba(0, 102, 204, 0.28);
      }

      .ajp-btn-secondary {
        background: #f8fafc;
        color: #334155;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        box-shadow: none;
      }

      .ajp-btn-secondary:hover {
        background: #eef2f7;
      }

      .ajp-btn-danger {
        background: #dc2626;
        color: white;
        border-radius: 12px;
      }

      .ajp-toast {
        position: absolute;
        top: 20px;
        right: 20px;
        min-width: 220px;
        max-width: min(420px, calc(100vw - 40px));
        padding: 12px 16px;
        border-radius: 14px;
        color: white;
        font-size: 14px;
        font-weight: 600;
        box-shadow: 0 18px 36px rgba(15, 23, 42, 0.24);
        opacity: 0;
        transform: translateY(-6px);
        transition: opacity 0.18s ease, transform 0.18s ease;
      }

      .ajp-toast.is-visible {
        opacity: 1;
        transform: translateY(0);
      }

      .ajp-toast-info {
        background: #334155;
      }

      .ajp-toast-success {
        background: #15803d;
      }

      .ajp-toast-warn {
        background: #b45309;
      }

      .ajp-toast-error {
        background: #b91c1c;
      }

      .ajp-fab-wrap {
        position: absolute;
        right: 20px;
        bottom: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: flex-end;
        pointer-events: auto;
      }

      .ajp-fab-wrap .ajp-btn {
        min-width: 174px;
      }

      .ajp-modal-overlay {
        position: absolute;
        inset: 0;
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(15, 23, 42, 0.52);
        pointer-events: auto;
      }

      .ajp-modal {
        width: min(980px, calc(100vw - 32px));
        max-height: min(86vh, 940px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 24px;
        box-shadow: 0 28px 72px rgba(15, 23, 42, 0.28);
      }

      .ajp-modal-header {
        padding: 24px 28px 18px;
        border-bottom: 1px solid #eef2f7;
      }

      .ajp-modal-title {
        margin: 0 0 8px;
        font-size: 20px;
        line-height: 1.3;
        color: #0f172a;
      }

      .ajp-modal-desc {
        margin: 0;
        font-size: 14px;
        color: #475569;
      }

      .ajp-modal-note {
        display: block;
        margin-top: 6px;
        font-size: 12px;
        color: #64748b;
      }

      .ajp-modal-alert {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid #fed7aa;
        background: #fff7ed;
        color: #9a3412;
        font-size: 13px;
        line-height: 1.5;
      }

      .ajp-modal-alert strong {
        display: block;
        margin-bottom: 4px;
        color: #7c2d12;
      }

      .ajp-scope-panel {
        display: grid;
        gap: 10px;
        margin-top: 14px;
        padding: 14px;
        border: 1px solid #dbeafe;
        border-radius: 16px;
        background: #eff6ff;
      }

      .ajp-scope-title {
        margin: 0;
        color: #1e3a8a;
        font-size: 13px;
        font-weight: 800;
      }

      .ajp-scope-options {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      .ajp-scope-option {
        display: grid;
        grid-template-columns: 18px minmax(0, 1fr);
        gap: 8px;
        align-items: start;
        padding: 10px 12px;
        border: 1px solid #bfdbfe;
        border-radius: 14px;
        background: rgba(255, 255, 255, 0.82);
        color: #1e293b;
        cursor: pointer;
      }

      .ajp-scope-option:has(input:checked) {
        border-color: #2563eb;
        box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
      }

      .ajp-scope-option input {
        margin-top: 2px;
        accent-color: #2563eb;
      }

      .ajp-scope-label {
        display: block;
        font-size: 13px;
        font-weight: 800;
      }

      .ajp-scope-value {
        display: block;
        margin-top: 2px;
        color: #475569;
        font-size: 11px;
        line-height: 1.4;
        word-break: break-all;
      }

      .ajp-modal-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        padding: 16px 28px 0;
      }

      .ajp-capture-list {
        flex: 1;
        overflow: auto;
        padding: 16px 28px 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #f8fafc;
      }

      .ajp-capture-row {
        display: grid;
        grid-template-columns: 28px minmax(240px, 1.7fr) minmax(180px, 1fr) minmax(180px, 1fr);
        gap: 12px;
        align-items: start;
        padding: 14px 16px;
        border: 1px solid #e5e7eb;
        border-radius: 18px;
        background: white;
      }

      .ajp-check {
        width: 18px;
        height: 18px;
        margin-top: 10px;
        accent-color: #dc2626;
        cursor: pointer;
      }

      .ajp-label-stack {
        min-width: 0;
        display: grid;
        gap: 8px;
      }

      .ajp-field {
        width: 100%;
        min-width: 0;
        appearance: none;
        border: 1px solid #cbd5e1;
        border-radius: 12px;
        padding: 11px 12px;
        background: white;
        color: #0f172a;
        font: inherit;
        font-size: 14px;
      }

      .ajp-field:hover {
        border-color: #94a3b8;
      }

      .ajp-field::placeholder {
        color: #94a3b8;
      }

      .ajp-field-code,
      .ajp-label-meta {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      }

      .ajp-label-meta {
        color: #64748b;
        font-size: 12px;
        word-break: break-all;
      }

      .ajp-modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 20px 28px 24px;
        border-top: 1px solid #eef2f7;
        background: #ffffff;
      }

      @media (max-width: 920px) {
        .ajp-capture-row {
          grid-template-columns: 28px minmax(0, 1fr);
        }

        .ajp-scope-options {
          grid-template-columns: 1fr;
        }

        .ajp-row-name,
        .ajp-row-value {
          grid-column: 2;
        }

        .ajp-modal {
          width: calc(100vw - 24px);
        }
      }

      @media (max-width: 640px) {
        .ajp-toast {
          top: 12px;
          right: 12px;
          max-width: calc(100vw - 24px);
        }

        .ajp-fab-wrap {
          right: 12px;
          bottom: 12px;
        }

        .ajp-fab-wrap .ajp-btn {
          min-width: 150px;
          padding: 10px 14px;
        }

        .ajp-modal-overlay {
          padding: 12px;
        }

        .ajp-modal-header,
        .ajp-modal-toolbar,
        .ajp-capture-list,
        .ajp-modal-footer {
          padding-left: 16px;
          padding-right: 16px;
        }

        .ajp-modal-header {
          padding-top: 18px;
        }

        .ajp-capture-row {
          padding: 12px;
        }

        .ajp-modal-footer {
          flex-direction: column-reverse;
        }

        .ajp-modal-footer .ajp-btn {
          width: 100%;
          justify-content: center;
          border-radius: 14px;
        }
      }
    `;

    const root = document.createElement('div');
    root.className = 'ajp-root';

    const toastLayer = document.createElement('div');
    toastLayer.className = 'ajp-toast-layer';

    const fabLayer = document.createElement('div');
    fabLayer.className = 'ajp-fab-layer';

    const overlayLayer = document.createElement('div');
    overlayLayer.className = 'ajp-overlay-layer';

    root.appendChild(toastLayer);
    root.appendChild(fabLayer);
    root.appendChild(overlayLayer);
    shadow.appendChild(style);
    shadow.appendChild(root);
    document.documentElement.appendChild(host);

    uiRoot = { host, shadow, root, toastLayer, fabLayer, overlayLayer };
    return uiRoot;
  }

  function closeModal() {
    const { overlayLayer } = ensureUiRoot();
    overlayLayer.replaceChildren();

    if (modalKeyHandler) {
      document.removeEventListener('keydown', modalKeyHandler, true);
      modalKeyHandler = null;
    }
  }

  function showToast(message, type = 'info') {
    const { toastLayer } = ensureUiRoot();
    toastLayer.replaceChildren();

    const toast = document.createElement('div');
    toast.className = `ajp-toast ajp-toast-${type}`;
    toast.textContent = message;
    toastLayer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => {
        if (toast.isConnected) toast.remove();
      }, 220);
    }, 2800);
  }

  function reportError(context, error) {
    const message = error?.message || String(error);
    console.error(`[AutoFill JP] ${context}`, error);
    showToast(`${context}: ${message}`, 'error');
  }

  async function loadRulesFromStorage() {
    const localData = await chrome.storage.local.get('rules');
    if (Array.isArray(localData.rules)) {
      return localData.rules.map((rule) => ({
        ...rule,
        type: normalizeRuleType(rule.type),
      }));
    }

    const syncData = await chrome.storage.sync.get('rules');
    if (Array.isArray(syncData.rules)) {
      const migratedRules = syncData.rules.map((rule) => ({
        ...rule,
        type: normalizeRuleType(rule.type),
      }));
      await chrome.storage.local.set({ rules: migratedRules });
      await chrome.storage.sync.remove('rules');
      return migratedRules;
    }

    return [];
  }

  async function saveRulesToStorage(rules) {
    const normalizedRules = (rules || []).map((rule) => ({
      ...rule,
      type: normalizeRuleType(rule.type),
    }));
    await chrome.storage.local.set({ rules: normalizedRules });
    await chrome.storage.sync.remove('rules');
  }

  function getPropertyDescriptorFromChain(element, property) {
    let proto = Object.getPrototypeOf(element);
    while (proto) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, property);
      if (descriptor) return descriptor;
      proto = Object.getPrototypeOf(proto);
    }
    return null;
  }

  function dispatchFormEvents(element, includeBlur = false) {
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    if (includeBlur) {
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    }
  }

  function setNativeValue(element, value) {
    const descriptor = getPropertyDescriptorFromChain(element, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    dispatchFormEvents(element, true);
  }

  function setNativeChecked(element, checked) {
    const descriptor = getPropertyDescriptorFromChain(element, 'checked');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, checked);
    } else {
      element.checked = checked;
    }
    dispatchFormEvents(element, true);
  }

  function setNativeSelectValue(element, value) {
    const descriptor = getPropertyDescriptorFromChain(element, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
    dispatchFormEvents(element, true);
  }

  function normalizeMatchText(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .replace(/\u3000/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function normalizeHostMatchText(value) {
    return String(value ?? '')
      .trim()
      .replace(/^\.+|\.+$/g, '')
      .toLowerCase();
  }

  function normalizeUrlPrefix(value) {
    try {
      const parsed = new URL(String(value ?? '').trim());
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return '';
      }
      return `${parsed.protocol.toLowerCase()}//${parsed.host.toLowerCase()}${parsed.pathname}${parsed.search}`;
    } catch (error) {
      return '';
    }
  }

  function normalizeUrlPrefixWithoutScheme(value) {
    const text = String(value ?? '').trim();
    if (!text) return '';

    if (/^https?:\/\//i.test(text)) {
      const normalized = normalizeUrlPrefix(text);
      return normalized ? normalized.replace(/^https?:\/\//, '') : '';
    }

    const slashIndex = text.indexOf('/');
    if (slashIndex <= 0) return '';

    const host = text.slice(0, slashIndex).trim().toLowerCase();
    const rest = text.slice(slashIndex);
    if (!host || !rest) return '';

    return `${host}${rest}`;
  }

  function siteRuleMatchesCurrentPage(site) {
    const rawSite = String(site ?? '').trim();
    if (!rawSite) return true;

    const absolutePrefix = normalizeUrlPrefix(rawSite);
    if (absolutePrefix) {
      const currentUrl = normalizeUrlPrefix(location.href);
      return Boolean(currentUrl) && currentUrl.startsWith(absolutePrefix);
    }

    const schemelessPrefix = normalizeUrlPrefixWithoutScheme(rawSite);
    if (schemelessPrefix) {
      const currentUrl = normalizeUrlPrefixWithoutScheme(location.href);
      return Boolean(currentUrl) && currentUrl.startsWith(schemelessPrefix);
    }

    const ruleHost = normalizeHostMatchText(rawSite);
    if (!ruleHost) return false;

    const currentHost = normalizeHostMatchText(location.hostname);
    return currentHost === ruleHost || currentHost.endsWith(`.${ruleHost}`);
  }

  function getCurrentHostRuleSite() {
    return normalizeHostMatchText(location.hostname);
  }

  function getCurrentUrlRuleSite() {
    return normalizeUrlPrefix(location.href);
  }

  function getDefaultCaptureScope() {
    return getCurrentHostRuleSite() ? 'host' : 'global';
  }

  function getRuleSiteForScope(scope) {
    if (scope === 'host') return getCurrentHostRuleSite();
    if (scope === 'url') return getCurrentUrlRuleSite();
    return '';
  }

  function getRuleSiteRank(site) {
    const rawSite = String(site ?? '').trim();
    if (!rawSite) return { level: 0, length: 0 };

    const absolutePrefix = normalizeUrlPrefix(rawSite);
    if (absolutePrefix) return { level: 3, length: absolutePrefix.length };

    const schemelessPrefix = normalizeUrlPrefixWithoutScheme(rawSite);
    if (schemelessPrefix) return { level: 3, length: schemelessPrefix.length };

    const host = normalizeHostMatchText(rawSite);
    if (!host) return { level: 0, length: 0 };

    return { level: 2, length: host.length };
  }

  function getRuleNameRank(rule) {
    const name = String(rule?.name ?? '').trim();
    if (!name) return 0;
    if (/^\/(.+)\/([gimsu]*)$/.test(name)) return 1;
    return 2;
  }

  function sortRulesForAutofill(rules) {
    return rules
      .map((rule, index) => ({ rule, index }))
      .sort((a, b) => {
        const aSite = getRuleSiteRank(a.rule.site);
        const bSite = getRuleSiteRank(b.rule.site);
        if (aSite.level !== bSite.level) return bSite.level - aSite.level;
        if (aSite.length !== bSite.length) return bSite.length - aSite.length;

        const aName = getRuleNameRank(a.rule);
        const bName = getRuleNameRank(b.rule);
        if (aName !== bName) return bName - aName;

        const aType = normalizeRuleType(a.rule.type) ? 1 : 0;
        const bType = normalizeRuleType(b.rule.type) ? 1 : 0;
        if (aType !== bType) return bType - aType;

        return a.index - b.index;
      })
      .map((entry) => entry.rule);
  }

  function normalizeLooseText(value) {
    return normalizeMatchText(value)
      .replace(/[年月日]/g, '')
      .replace(/["'`]/g, '')
      .replace(/[\s\-_/.,:;()[\]{}]/g, '');
  }

  function isPlaceholderLikeValue(value) {
    const text = normalizeMatchText(value);
    if (!text) return true;

    if (
      /^(?:-+|ー+|－+|▼+|▽+|v+|＞+|<+|[.\s])+$/i.test(text) ||
      /^[-ー－▼▽v>\s<]+$/i.test(text)
    ) {
      return true;
    }

    return [
      '選択',
      '選択してください',
      '未選択',
      '指定なし',
      'なし',
      'select',
      'please select',
      'choose',
      'choose one',
    ].includes(text);
  }

  function toComparableNumber(value) {
    const loose = normalizeLooseText(value).replace(/^0+(?=\d)/, '');
    if (/^\d+$/.test(loose)) {
      return Number(loose);
    }
    return null;
  }

  function valueEquals(target, candidate) {
    if (target == null || candidate == null) return false;

    const targetRaw = String(target);
    const candidateRaw = String(candidate);
    if (targetRaw === candidateRaw) return true;

    const targetNormalized = normalizeMatchText(targetRaw);
    const candidateNormalized = normalizeMatchText(candidateRaw);
    if (targetNormalized && targetNormalized === candidateNormalized) return true;

    const targetLoose = normalizeLooseText(targetRaw);
    const candidateLoose = normalizeLooseText(candidateRaw);
    if (targetLoose && targetLoose === candidateLoose) return true;

    const targetNumber = toComparableNumber(targetRaw);
    const candidateNumber = toComparableNumber(candidateRaw);
    if (targetNumber !== null && candidateNumber !== null && targetNumber === candidateNumber) {
      return true;
    }

    return false;
  }

  function stripRuleNameSyntax(name) {
    const text = String(name ?? '').trim();
    const exactMatch = text.match(/^"(.+)"$/);
    if (exactMatch) return exactMatch[1];

    const regexMatch = text.match(/^\/(.+)\/([gimsu]*)$/);
    if (regexMatch) return regexMatch[1];

    return text;
  }

  function isRegexRuleName(name) {
    return /^\/(.+)\/([gimsu]*)$/.test(String(name ?? '').trim());
  }

  function isGenericTextFieldIdentifier(identifier) {
    const raw = normalizeMatchText(stripRuleNameSyntax(identifier));
    const loose = normalizeLooseText(stripRuleNameSyntax(identifier));
    if (!raw && !loose) return false;

    return GENERIC_TEXT_FIELD_NAME_PATTERNS.some((pattern) => pattern.test(raw) || pattern.test(loose));
  }

  function isTextEntryElement(element) {
    if (!element) return false;
    if (element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;

    const type = (element.type || 'text').toLowerCase();
    return ![
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'password',
      'radio',
      'range',
      'reset',
      'submit',
    ].includes(type);
  }

  function normalizeLabelForComparison(value) {
    let text = normalizeMatchText(value)
      .replace(/選択肢\s*\d+\s*\/\s*\d+/g, ' ')
      .replace(/[()[\]{}（）［］｛｝【】「」『』"'`]/g, ' ')
      .replace(/[|｜/／\\:：;；,，.。・_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    LABEL_NOISE_WORDS.forEach((word) => {
      text = text.replace(new RegExp(word, 'g'), ' ');
    });

    return text.replace(/\s+/g, ' ').trim();
  }

  function addLabelKey(keys, value) {
    const key = String(value ?? '').replace(/\s+/g, '').trim();
    if (!key) return;

    keys.add(key);

    const suffixes = ['名称', '氏名', '名', '番号', 'コード', '項目'];
    suffixes.forEach((suffix) => {
      if (key.endsWith(suffix) && key.length > suffix.length + 1) {
        keys.add(key.slice(0, -suffix.length));
      }
    });
  }

  function getLabelMatchKeys(label) {
    const normalized = normalizeLabelForComparison(label);
    if (!normalized) return [];

    const keys = new Set();
    addLabelKey(keys, normalized);

    normalized.split(/\s+/).forEach((part) => {
      if (part.length >= 2) {
        addLabelKey(keys, part);
      }
    });

    return Array.from(keys).filter((key) => key.length > 0);
  }

  function labelsAreCompatible(ruleLabel, elementLabel) {
    const ruleKeys = getLabelMatchKeys(ruleLabel);
    const elementKeys = getLabelMatchKeys(elementLabel);

    if (ruleKeys.length === 0 || elementKeys.length === 0) return null;

    return ruleKeys.some((ruleKey) => {
      return elementKeys.some((elementKey) => {
        if (ruleKey === elementKey) return true;
        const minLength = Math.min(ruleKey.length, elementKey.length);
        return minLength >= 3 && (ruleKey.includes(elementKey) || elementKey.includes(ruleKey));
      });
    });
  }

  function fieldContextMatchesRule(rule, element) {
    if (!isTextEntryElement(element)) return true;

    const ruleLabel = String(rule?.label ?? '').trim();
    if (!ruleLabel) return true;

    const elementLabel = getElementLabel(element);
    const usesGenericIdentifier =
      element.tagName === 'TEXTAREA' ||
      isRegexRuleName(rule?.name) ||
      isGenericTextFieldIdentifier(rule?.name) ||
      getRuleMatchCandidates(element).some((candidate) => isGenericTextFieldIdentifier(candidate));

    const labelCompatibility = labelsAreCompatible(ruleLabel, elementLabel);
    if (labelCompatibility === true) return true;
    if (labelCompatibility === false) return !usesGenericIdentifier;

    return !usesGenericIdentifier;
  }

  function getNativeRadioGroup(element) {
    if (element?.type !== 'radio') return [];
    if (!element.name) return [element];

    try {
      const group = Array.from(document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name)}"]`));
      return group.filter((candidate) => candidate.form === element.form);
    } catch (error) {
      return [element];
    }
  }

  function getNativeCheckboxGroup(element) {
    if (element?.type !== 'checkbox') return [];
    if (!element.name) return [element];

    try {
      const group = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(element.name)}"]`));
      return group.filter((candidate) => candidate.form === element.form);
    } catch (error) {
      return [element];
    }
  }

  function getNativeChoiceGroup(element) {
    if (element?.type === 'radio') return getNativeRadioGroup(element);
    if (element?.type === 'checkbox') return getNativeCheckboxGroup(element);
    return [];
  }

  function choiceGroupHasCheckedValue(element) {
    return getNativeChoiceGroup(element).some((candidate) => candidate.checked);
  }

  function getInitiallyCheckedChoiceSet(elements) {
    const checkedSet = new WeakSet();

    elements.forEach((element) => {
      if (element.type !== 'radio' && element.type !== 'checkbox') return;
      if (!choiceGroupHasCheckedValue(element)) return;

      getNativeChoiceGroup(element).forEach((candidate) => {
        checkedSet.add(candidate);
      });
    });

    return checkedSet;
  }

  function getRadioChoiceIndex(element) {
    const group = getNativeRadioGroup(element);
    return group.indexOf(element);
  }

  function getRadioChoiceCount(element) {
    return getNativeRadioGroup(element).length;
  }

  function getRuleChoiceIndex(rule) {
    const index = Number(rule?.choiceIndex);
    return Number.isInteger(index) && index >= 0 ? index : null;
  }

  function hasAmbiguousRadioValue(rule, element) {
    const group = getNativeRadioGroup(element);
    if (group.length <= 1) return false;

    const targetValue = String(rule?.value ?? '').trim();
    if (!targetValue || normalizeMatchText(targetValue) === 'on') return true;

    let matchingValueCount = 0;
    for (const candidate of group) {
      if (valueEquals(targetValue, candidate.value || 'on')) {
        matchingValueCount++;
      }
    }
    return matchingValueCount > 1;
  }

  function shouldApplyRadioByChoiceIndex(rule, element) {
    return getRuleChoiceIndex(rule) !== null && hasAmbiguousRadioValue(rule, element);
  }

  function radioChoiceIndexMatches(rule, element) {
    const targetIndex = getRuleChoiceIndex(rule);
    if (targetIndex === null) return false;

    const group = getNativeRadioGroup(element);
    if (targetIndex >= group.length) return false;

    return group[targetIndex] === element;
  }

  function getRuleMatchCandidates(element) {
    const linkedSelect = getLinkedSelect(element);
    return [...new Set(
      [
        element.name,
        element.id,
        linkedSelect?.name,
        linkedSelect?.id,
      ]
        .map((candidate) => String(candidate ?? '').trim())
        .filter(Boolean)
    )];
  }

  function ruleMatches(rule, element) {
    if (!rule?.name || !element) return false;

    const candidates = getRuleMatchCandidates(element);
    if (candidates.length === 0) return false;

    const regexMatch = rule.name.match(/^\/(.+)\/([gimsu]*)$/);
    if (regexMatch) {
      try {
        const re = new RegExp(regexMatch[1], regexMatch[2]);
        return candidates.some((candidate) => {
          re.lastIndex = 0;
          return re.test(candidate);
        });
      } catch (error) {
        return false;
      }
    }

    const exactMatch = rule.name.match(/^"(.+)"$/);
    const pattern = normalizeMatchText(exactMatch ? exactMatch[1] : rule.name);
    if (!pattern) return false;
    return candidates.some((candidate) => normalizeMatchText(candidate) === pattern);
  }

  function normalizeRuleType(type) {
    if (type === 0 || type === '0') return 'text';
    if (type === 1 || type === '1') return 'password';
    if (type === 2 || type === '2') return 'select';
    if (type === 3 || type === '3') return 'checkbox-radio';
    if (type === 'dropdown') return 'select';
    if (type === 'checkbox' || type === 'radio') return 'checkbox-radio';
    if (type === 'select' || type === 'text' || type === 'password' || type === 'checkbox-radio') {
      return type;
    }
    return '';
  }

  function getElementRuleType(element) {
    if (element.tagName === 'SELECT' || isDropdownLikeElement(element) || isJqTransformWrapper(element)) {
      return 'select';
    }
    if (element.type === 'radio' || element.type === 'checkbox') {
      return 'checkbox-radio';
    }
    if (element.type === 'password') {
      return 'password';
    }
    return 'text';
  }

  function ruleTypeMatchesElement(rule, element) {
    const ruleType = normalizeRuleType(rule?.type);
    if (!ruleType) return true;
    return ruleType === getElementRuleType(element);
  }

  function getCandidateElements() {
    const selectors = [
      'input',
      'select',
      'textarea',
      '[role="combobox"]',
      '[aria-haspopup="listbox"]',
      '.jqTransformSelectWrapper',
    ];

    const seen = new Set();
    return Array.from(document.querySelectorAll(selectors.join(','))).filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      if (element.tagName === 'SELECT' && element.closest('.jqTransformSelectWrapper')) {
        return false;
      }
      return true;
    });
  }

  function hasMeaningfulValue(element) {
    if (isJqTransformWrapper(element)) {
      const select = getLinkedSelect(element);
      if (select) {
        const selectedOption = select.options?.[select.selectedIndex];
        const selectedText = selectedOption?.textContent || selectedOption?.label || '';
        if (Boolean(select.value) && select.selectedIndex > 0 && !isPlaceholderLikeValue(selectedText)) {
          return true;
        }
      }

      const displayText = getJqTransformDisplayText(element);
      return Boolean(displayText) && !isPlaceholderLikeValue(displayText);
    }

    if (element.tagName === 'SELECT') {
      const selectedOption = element.options?.[element.selectedIndex];
      const selectedText = selectedOption?.textContent || selectedOption?.label || '';
      return Boolean(element.value) && element.selectedIndex > 0 && !isPlaceholderLikeValue(selectedText);
    }

    if (element.type === 'radio' || element.type === 'checkbox') {
      return element.checked;
    }

    if (typeof element.value === 'string' && element.value.trim() && !isPlaceholderLikeValue(element.value)) {
      return true;
    }

    const ariaValue = element.getAttribute?.('aria-valuetext');
    if (ariaValue && ariaValue.trim() && !isPlaceholderLikeValue(ariaValue)) return true;

    const dataValue = element.getAttribute?.('data-value');
    if (dataValue && dataValue.trim() && !isPlaceholderLikeValue(dataValue)) return true;

    return false;
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findMatchingOption(select, value) {
    const options = Array.from(select.options || []);
    return options.find((option) => {
      const texts = [option.value, option.textContent, option.label];
      return texts.some((candidate) => valueEquals(value, candidate));
    }) || null;
  }

  function applySelectValue(select, value) {
    const matchedOption = findMatchingOption(select, value);
    if (matchedOption) {
      matchedOption.selected = true;
      select.selectedIndex = Array.from(select.options).indexOf(matchedOption);
      setNativeSelectValue(select, matchedOption.value);
      return true;
    }

    const numericIndex = Number(String(value).trim());
    if (Number.isInteger(numericIndex) && numericIndex >= 0 && numericIndex < select.options.length) {
      const option = select.options[numericIndex];
      option.selected = true;
      select.selectedIndex = numericIndex;
      setNativeSelectValue(select, option.value);
      return true;
    }

    return false;
  }

  function isJqTransformWrapper(element) {
    return Boolean(element?.classList?.contains('jqTransformSelectWrapper'));
  }

  function getLinkedSelect(element) {
    if (!element) return null;
    if (element.tagName === 'SELECT') return element;
    if (isJqTransformWrapper(element)) {
      const nestedSelect = element.querySelector('select');
      if (nestedSelect) return nestedSelect;

      const siblingSteps = [
        element.previousElementSibling,
        element.nextElementSibling,
        element.parentElement?.previousElementSibling,
        element.parentElement?.nextElementSibling,
      ].filter(Boolean);

      for (const sibling of siblingSteps) {
        if (sibling.tagName === 'SELECT') return sibling;
        const descendantSelect = sibling.querySelector?.('select');
        if (descendantSelect) return descendantSelect;
      }

      const localContainer = element.parentElement || element.closest('dd') || element.closest('td') || element.closest('div');
      if (localContainer) {
        const selects = Array.from(localContainer.querySelectorAll('select'));
        if (selects.length === 1) return selects[0];
        const hiddenSelect = selects.find((select) => select.classList.contains('jqTransformHidden'));
        if (hiddenSelect) return hiddenSelect;
      }
    }
    return element.closest?.('.jqTransformSelectWrapper')?.querySelector('select') || null;
  }

  function getFieldIdentifier(element) {
    const linkedSelect = getLinkedSelect(element);
    return element.name || element.id || linkedSelect?.name || linkedSelect?.id || '';
  }

  function getFieldLabelTarget(element) {
    return getLinkedSelect(element) || element;
  }

  function getJqTransformDisplayText(wrapper) {
    return wrapper.querySelector('div > span')?.textContent?.replace(/\s+/g, ' ').trim() || '';
  }

  function findMatchingJqTransformLink(wrapper, value) {
    const links = Array.from(wrapper.querySelectorAll('ul a'));
    const select = getLinkedSelect(wrapper);

    const byText = links.find((link) => valueEquals(value, link.textContent));
    if (byText) return byText;

    const numericIndex = Number(String(value).trim());
    if (Number.isInteger(numericIndex)) {
      const byIndexAttr = links.find((link) => Number(link.getAttribute('index')) === numericIndex);
      if (byIndexAttr) return byIndexAttr;
    }

    if (select) {
      const optionMatch = findMatchingOption(select, value);
      if (optionMatch) {
        const optionIndex = Array.from(select.options).indexOf(optionMatch);
        const byOptionIndex = links.find((link) => Number(link.getAttribute('index')) === optionIndex);
        if (byOptionIndex) return byOptionIndex;
      }
    }

    return null;
  }

  async function applyJqTransformValue(wrapper, value) {
    const select = getLinkedSelect(wrapper);
    const link = findMatchingJqTransformLink(wrapper, value);
    const openButton = wrapper.querySelector('.jqTransformSelectOpen');
    const list = wrapper.querySelector('ul');

    if (!link && !select) {
      return false;
    }

    if (openButton && list && getComputedStyle(list).display === 'none') {
      clickElement(openButton);
      await wait(40);
    }

    if (link) {
      const optionIndex = Number(link.getAttribute('index'));
      if (select && Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < select.options.length) {
        select.selectedIndex = optionIndex;
        setNativeSelectValue(select, select.options[optionIndex].value);
      }

      wrapper.querySelectorAll('ul a.selected').forEach((node) => node.classList.remove('selected'));
      link.classList.add('selected');

      const displaySpan = wrapper.querySelector('div > span');
      if (displaySpan) {
        displaySpan.textContent = link.textContent;
      }

      try {
        clickElement(link);
      } catch (error) {
        // fallback already applied above
      }

      return true;
    }

    if (select) {
      return applySelectValue(select, value);
    }

    return false;
  }

  function isDropdownLikeElement(element) {
    const role = (element?.getAttribute?.('role') || '').toLowerCase();
    const hasPopup = (element?.getAttribute?.('aria-haspopup') || '').toLowerCase();

    return (
      role === 'combobox' ||
      hasPopup === 'listbox' ||
      Boolean(element?.getAttribute?.('list')) ||
      (element?.tagName === 'INPUT' && element.readOnly && (
        element.hasAttribute('aria-controls') ||
        element.hasAttribute('aria-expanded') ||
        element.hasAttribute('aria-owns')
      ))
    );
  }

  function getDropdownContainers(element) {
    const containers = [];
    const popupIds = [
      element.getAttribute?.('aria-controls'),
      element.getAttribute?.('aria-owns'),
    ].filter(Boolean);

    popupIds.forEach((id) => {
      const popup = document.getElementById(id);
      if (popup && isVisible(popup)) {
        containers.push(popup);
      }
    });

    const commonSelectors = [
      '[role="listbox"]',
      '[role="menu"]',
      '.select2-results',
      '.choices__list[role="listbox"]',
      '[id*="listbox"]',
      '[id*="menu"]',
    ];

    Array.from(document.querySelectorAll(commonSelectors.join(','))).forEach((node) => {
      if (isVisible(node) && !containers.includes(node)) {
        containers.push(node);
      }
    });

    return containers;
  }

  function getDropdownOptions(containers) {
    const optionSelectors = [
      '[role="option"]',
      'li',
      'button',
      '[data-value]',
      '.select2-results__option',
      '.choices__item',
    ];

    const seen = new Set();
    const options = [];

    containers.forEach((container) => {
      Array.from(container.querySelectorAll(optionSelectors.join(','))).forEach((option) => {
        if (seen.has(option) || !isVisible(option)) return;
        seen.add(option);
        options.push(option);
      });
    });

    return options;
  }

  function findDropdownOption(containers, value) {
    const options = getDropdownOptions(containers);
    return options.find((option) => {
      const candidates = [
        option.getAttribute('data-value'),
        option.getAttribute('value'),
        option.getAttribute('aria-label'),
        option.textContent,
      ];
      return candidates.some((candidate) => valueEquals(value, candidate));
    }) || null;
  }

  function clickElement(element) {
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    element.click();
  }

  function activateChoiceElement(element) {
    try {
      clickElement(element);
    } catch (error) {
      element.click?.();
    }

    if (!element.checked) {
      setNativeChecked(element, true);
    } else {
      dispatchFormEvents(element, true);
    }
  }

  function isAffirmativeCheckboxValue(value) {
    return ['1', 'true', 'yes', 'on', 'checked', 'check', 'はい', 'あり'].includes(normalizeMatchText(value));
  }

  function isSingleCheckboxInGroup(element) {
    if (element.type !== 'checkbox') return false;
    if (!element.name) return true;

    try {
      const group = Array.from(document.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(element.name)}"]`));
      return group.length <= 1;
    } catch (error) {
      return true;
    }
  }

  async function tryDropdownLikeValue(element, value) {
    if (!isDropdownLikeElement(element)) return false;

    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      element.focus();
    }

    if (typeof element.showPicker === 'function') {
      try {
        element.showPicker();
      } catch (error) {
        // ignore
      }
    }

    clickElement(element);
    await wait(80);

    if (element.tagName === 'INPUT' && !element.readOnly) {
      setNativeValue(element, String(value));
      await wait(60);
    }

    const containers = getDropdownContainers(element);
    const option = findDropdownOption(containers, value);
    if (!option) {
      return typeof element.value === 'string' && valueEquals(element.value, value);
    }

    clickElement(option);
    await wait(60);
    return true;
  }

  async function applyRule(rule, element) {
    if (!element || element.disabled) return false;
    if (element.readOnly && !isDropdownLikeElement(element)) return false;

    if (element.type === 'password' || element.type === 'hidden') return false;

    const value = rule.value;
    const type = element.type;
    const tag = element.tagName;

    if (isJqTransformWrapper(element)) {
      return applyJqTransformValue(element, value);
    }

    if (tag === 'SELECT') {
      return applySelectValue(element, value);
    }

    if (type === 'radio') {
      if (shouldApplyRadioByChoiceIndex(rule, element)) {
        if (!radioChoiceIndexMatches(rule, element)) {
          return false;
        }
        activateChoiceElement(element);
        return true;
      }

      if (valueEquals(value, element.value)) {
        if (!element.checked) {
          activateChoiceElement(element);
        } else {
          dispatchFormEvents(element, true);
        }
        return true;
      }
      return false;
    }

    if (type === 'checkbox') {
      if (valueEquals(value, element.value) || (isSingleCheckboxInGroup(element) && isAffirmativeCheckboxValue(value))) {
        if (!element.checked) {
          activateChoiceElement(element);
        } else {
          dispatchFormEvents(element, true);
        }
        return true;
      }
      return false;
    }

    if (await tryDropdownLikeValue(element, value)) {
      return true;
    }

    setNativeValue(element, String(value));
    return true;
  }

  async function executeAutofill() {
    try {
      const rules = await loadRulesFromStorage();
      if (rules.length === 0) {
        showToast('ルールがまだ登録されていません。設定画面から追加してください。', 'warn');
        return { filled: 0 };
      }

      const activeRules = sortRulesForAutofill(rules.filter((rule) => siteRuleMatchesCurrentPage(rule.site)));

      const elements = getCandidateElements();
      const initiallyCheckedChoices = getInitiallyCheckedChoiceSet(elements);
      let filled = 0;

      for (const element of elements) {
        if (element.type === 'submit' || element.type === 'button') continue;
        if (element.type === 'password') continue;
        if (element.type === 'hidden') continue;

        if (element.type === 'radio' || element.type === 'checkbox') {
          if (initiallyCheckedChoices.has(element)) continue;
        } else if (element.tagName === 'SELECT') {
          if (hasMeaningfulValue(element)) continue;
        } else if (element.type !== 'radio' && element.type !== 'checkbox') {
          if (hasMeaningfulValue(element)) continue;
        }

        for (const rule of activeRules) {
          if (!ruleMatches(rule, element)) continue;
          if (!ruleTypeMatchesElement(rule, element)) continue;
          if (!fieldContextMatchesRule(rule, element)) continue;
          if (await applyRule(rule, element)) {
            filled++;
            break;
          }
        }
      }

      showToast(`${filled}件を自動入力しました`, filled > 0 ? 'success' : 'warn');
      return { filled };
    } catch (error) {
      reportError('自動入力エラー', error);
      return { filled: 0, error: error?.message || String(error) };
    }
  }

  function readElementValue(element) {
    if (isJqTransformWrapper(element)) {
      const select = getLinkedSelect(element);
      if (select) {
        const option = select.options?.[select.selectedIndex];
        if (select.value && !isPlaceholderLikeValue(option?.textContent || option?.label || '')) {
          return select.value;
        }
      }

      const displayText = getJqTransformDisplayText(element);
      if (displayText && !isPlaceholderLikeValue(displayText)) {
        return displayText;
      }
      return null;
    }

    if (element.tagName === 'SELECT') {
      const option = element.options?.[element.selectedIndex];
      if (!element.value || isPlaceholderLikeValue(option?.textContent || option?.label || '')) {
        return null;
      }
      return element.value;
    }

    if (element.type === 'radio' || element.type === 'checkbox') {
      return element.checked ? (element.value || 'on') : null;
    }

    if (typeof element.value === 'string' && element.value !== '' && !isPlaceholderLikeValue(element.value)) {
      return element.value;
    }

    const ariaValue = element.getAttribute?.('aria-valuetext');
    if (ariaValue && ariaValue.trim() && !isPlaceholderLikeValue(ariaValue)) return ariaValue.trim();

    const dataValue = element.getAttribute?.('data-value');
    if (dataValue && dataValue.trim() && !isPlaceholderLikeValue(dataValue)) return dataValue.trim();

    if (isDropdownLikeElement(element)) {
      const text = element.textContent.replace(/\s+/g, ' ').trim();
      if (text && text.length <= 80) {
        return text;
      }
    }

    return null;
  }

  function isNoiseFieldName(name) {
    const normalized = normalizeMatchText(name);
    if (!normalized) return false;
    return NOISE_FIELD_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function isLikelyTransientValue(value) {
    const text = String(value ?? '').trim();
    if (!text) return false;

    // 画面遷移用の一時トークンっぽい値を除外
    if (/^[a-z0-9_-]{12,}$/i.test(text) && /[a-z]/i.test(text) && /\d/.test(text)) {
      return true;
    }

    return false;
  }

  function shouldCaptureField(element, identifier, value, type, label) {
    if (!identifier || value == null || value === '') return false;
    if (element?.type === 'hidden' || element?.type === 'password') return false;

    if (isNoiseFieldName(identifier)) {
      return false;
    }

    if (type === 'text' && isLikelyTransientValue(value) && !label) {
      return false;
    }

    const normalizedLabel = normalizeMatchText(label);
    if (normalizedLabel === '次へ' || normalizedLabel === '戻る') {
      return false;
    }

    return true;
  }

  function captureCurrentForm() {
    const elements = getCandidateElements();
    const captured = [];
    const seenKeys = new Set();

    for (const element of elements) {
      if (element.type === 'submit' || element.type === 'button') continue;
      if (element.type === 'password') continue;
      if (element.type === 'hidden') continue;

      const fieldIdentifier = getFieldIdentifier(element);
      if (!fieldIdentifier) continue;

      const value = readElementValue(element);
      if (value == null || value === '') continue;

      const type = getElementRuleType(element);
      const choiceIndex = getRadioChoiceIndex(element);
      const choiceCount = getRadioChoiceCount(element);
      const choiceSuffix = element.type === 'radio' && choiceIndex >= 0 && choiceCount > 1
        ? `選択肢 ${choiceIndex + 1}/${choiceCount}`
        : '';
      const rawLabel = getElementLabel(element);
      const label = [rawLabel, choiceSuffix].filter(Boolean).join(' / ').slice(0, 80);
      if (!shouldCaptureField(element, fieldIdentifier, value, type, label)) continue;

      const dedupeKey = [
        normalizeMatchText(fieldIdentifier),
        normalizeRuleType(type),
        normalizeMatchText(value),
      ].join('::');
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      captured.push({
        name: fieldIdentifier,
        value,
        type,
        label,
        choiceIndex: choiceSuffix ? choiceIndex : undefined,
        choiceCount: choiceSuffix ? choiceCount : undefined,
      });
    }

    return captured;
  }

  function getElementLabel(element) {
    const labelTarget = getFieldLabelTarget(element);
    const myValue = String(readElementValue(element) || '').trim();

    const extractPureText = (node) => {
      if (!node) return '';
      const clone = node.cloneNode(true);
      clone.querySelectorAll('input, select, textarea, button, option').forEach((n) => n.remove());
      return clone.textContent.replace(/\s+/g, ' ').trim();
    };

    const isGoodLabel = (text) => {
      if (!text) return false;
      if (text.length > 60) return false;
      if (text === myValue) return false;
      if (/^[\d\-\s年月日]+$/.test(text)) return false;
      return true;
    };

    const candidates = [];

    if (labelTarget.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(labelTarget.id)}"]`);
        if (label) {
          const text = extractPureText(label);
          if (isGoodLabel(text)) candidates.push(text);
        }
      } catch (error) {
        // ignore
      }
    }

    const parentLabel = element.closest('label') || labelTarget.closest?.('label');
    if (parentLabel) {
      const text = extractPureText(parentLabel);
      if (isGoodLabel(text)) candidates.push(text);
    }

    let prev = element.previousSibling || labelTarget.previousSibling;
    let hops = 0;
    while (prev && hops < 5) {
      if (prev.nodeType === Node.TEXT_NODE) {
        const text = prev.textContent.replace(/\s+/g, ' ').trim();
        if (isGoodLabel(text) && text.length <= 18) {
          candidates.push(text);
          break;
        }
      } else if (prev.nodeType === Node.ELEMENT_NODE) {
        const hasFormElement = prev.querySelector && prev.querySelector('input, select, textarea, button');
        if (!hasFormElement && ['SPAN', 'LABEL', 'B', 'STRONG', 'SMALL', 'DIV'].includes(prev.tagName)) {
          const text = extractPureText(prev);
          if (isGoodLabel(text) && text.length <= 24) {
            candidates.push(text);
            break;
          }
        }
      }
      prev = prev.previousSibling;
      hops++;
    }

    const row = element.closest('tr') || labelTarget.closest?.('tr');
    if (row) {
      const headerCell = Array.from(row.children).find((cell) => !cell.contains(element));
      if (headerCell) {
        const text = extractPureText(headerCell);
        if (isGoodLabel(text)) candidates.push(text);
      }
    }

    const dd = element.closest('dd') || labelTarget.closest?.('dd');
    if (dd) {
      const dt = dd.previousElementSibling;
      if (dt && dt.tagName === 'DT') {
        const text = extractPureText(dt);
        if (isGoodLabel(text)) candidates.push(text);
      }
    }

    if (candidates.length === 0) {
      const fallbacks = [
        element.getAttribute('aria-label'),
        element.placeholder,
        element.title,
        labelTarget.getAttribute?.('aria-label'),
        labelTarget.placeholder,
        labelTarget.title,
      ].filter(Boolean);

      fallbacks.forEach((candidate) => {
        const text = candidate.trim();
        if (isGoodLabel(text)) candidates.push(text);
      });
    }

    if (candidates.length === 0) return '';
    return [...new Set(candidates)].join(' / ').slice(0, 60);
  }

  function makeButton(text, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ajp-btn ${className}`;
    button.textContent = text;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      Promise.resolve(onClick()).catch((error) => {
        reportError('操作エラー', error);
      });
    });
    return button;
  }

  async function injectFloatingButton() {
    const { settings = {} } = await chrome.storage.sync.get('settings');
    const { fabLayer } = ensureUiRoot();
    if (settings.hideFloatingButton) {
      fabLayer.replaceChildren();
      return;
    }

    const formElements = getCandidateElements().filter((element) => {
      if (element.tagName === 'INPUT') {
        return !['hidden', 'submit', 'button', 'password'].includes(element.type);
      }
      return true;
    });

    if (formElements.length < 5) return;

    if (fabLayer.querySelector('.ajp-fab-wrap')) return;

    const wrap = document.createElement('div');
    wrap.className = 'ajp-fab-wrap';
    wrap.appendChild(makeButton('🪄 自動入力', 'ajp-btn-primary', () => {
      executeAutofill();
    }));
    wrap.appendChild(makeButton('📝 入力内容を学習', 'ajp-btn-success', () => {
      saveCurrentFormAsRules();
    }));

    fabLayer.appendChild(wrap);
  }

  function scheduleFloatingButtonInjection(delay = 250) {
    clearTimeout(fabInjectionTimer);
    fabInjectionTimer = setTimeout(() => {
      Promise.resolve(injectFloatingButton()).catch((error) => {
        console.warn('[AutoFill JP] Floating button injection skipped', error);
      });
    }, delay);
  }

  function startFloatingButtonObserver() {
    if (floatingButtonObserver || !document.documentElement) return;

    floatingButtonObserver = new MutationObserver((mutations) => {
      const hasRelevantMutation = mutations.some((mutation) => {
        if (mutation.target instanceof Element && mutation.target.closest(`#${UI_HOST_ID}`)) {
          return false;
        }

        return Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false;
          if (node.id === UI_HOST_ID || node.closest(`#${UI_HOST_ID}`)) return false;
          return Boolean(node.matches?.('input, select, textarea, form') || node.querySelector?.('input, select, textarea, form'));
        });
      });

      if (hasRelevantMutation) {
        scheduleFloatingButtonInjection();
      }
    });

    floatingButtonObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  function initFloatingButton() {
    scheduleFloatingButtonInjection(500);
    startFloatingButtonObserver();
  }

  async function saveCurrentFormAsRules() {
    try {
      const captured = captureCurrentForm();
      if (captured.length === 0) {
        showToast('入力されているフィールドがありません', 'warn');
        return;
      }

      showCaptureModal(captured);
    } catch (error) {
      reportError('学習エラー', error);
    }
  }

  function createScopePanel() {
    const panel = document.createElement('div');
    panel.className = 'ajp-scope-panel';

    const title = document.createElement('p');
    title.className = 'ajp-scope-title';
    title.textContent = '保存したルールを使う範囲';

    const options = document.createElement('div');
    options.className = 'ajp-scope-options';

    const hostSite = getCurrentHostRuleSite();
    const urlSite = getCurrentUrlRuleSite();
    const defaultScope = getDefaultCaptureScope();
    const scopeOptions = [
      {
        value: 'host',
        label: 'このサイトだけ',
        detail: hostSite || 'このページでは選べません',
        disabled: !hostSite,
      },
      {
        value: 'url',
        label: 'このURL配下',
        detail: urlSite || 'このページでは選べません',
        disabled: !urlSite,
      },
      {
        value: 'global',
        label: '全サイト',
        detail: 'サイト欄を空欄で保存',
        disabled: false,
      },
    ];

    scopeOptions.forEach((option) => {
      const label = document.createElement('label');
      label.className = 'ajp-scope-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'autofilljp-capture-scope';
      input.value = option.value;
      input.checked = option.value === defaultScope;
      input.disabled = option.disabled;

      const text = document.createElement('span');
      const labelText = document.createElement('span');
      labelText.className = 'ajp-scope-label';
      labelText.textContent = option.label;

      const valueText = document.createElement('span');
      valueText.className = 'ajp-scope-value';
      valueText.textContent = option.detail;

      text.appendChild(labelText);
      text.appendChild(valueText);
      label.appendChild(input);
      label.appendChild(text);
      options.appendChild(label);
    });

    panel.appendChild(title);
    panel.appendChild(options);
    return panel;
  }

  function createCaptureRow(item, idx) {
    const row = document.createElement('div');
    row.className = 'ajp-capture-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'ajp-check';
    checkbox.dataset.idx = String(idx);
    checkbox.checked = true;

    const labelStack = document.createElement('div');
    labelStack.className = 'ajp-label-stack';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'ajp-field ajp-type ajp-row-type';
    typeSelect.dataset.idx = String(idx);
    typeSelect.title = 'フィールド種別';
    RULE_TYPE_OPTIONS.forEach((option) => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      if (normalizeRuleType(item.type) === option.value) {
        node.selected = true;
      }
      typeSelect.appendChild(node);
    });

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'ajp-field ajp-label';
    labelInput.dataset.idx = String(idx);
    labelInput.placeholder = 'ラベル(メモ)';
    labelInput.title = '後で識別するためのメモ';
    labelInput.value = item.label || '';

    const meta = document.createElement('div');
    meta.className = 'ajp-label-meta';
    meta.textContent = item.name;

    labelStack.appendChild(typeSelect);
    labelStack.appendChild(labelInput);
    labelStack.appendChild(meta);

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'ajp-field ajp-field-code ajp-name ajp-row-name';
    nameInput.dataset.idx = String(idx);
    nameInput.title = 'name属性マッチ条件';
    nameInput.value = `"${item.name}"`;

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'ajp-field ajp-value ajp-row-value';
    valueInput.dataset.idx = String(idx);
    valueInput.title = '入力される値';
    valueInput.value = String(item.value ?? '');

    row.appendChild(checkbox);
    row.appendChild(labelStack);
    row.appendChild(nameInput);
    row.appendChild(valueInput);
    return row;
  }

  function showCaptureModal(captured) {
    closeModal();

    const { overlayLayer } = ensureUiRoot();

    const overlay = document.createElement('div');
    overlay.className = 'ajp-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'ajp-modal';

    const header = document.createElement('div');
    header.className = 'ajp-modal-header';

    const title = document.createElement('h2');
    title.className = 'ajp-modal-title';
    title.textContent = '入力内容をルールとして保存';

    const desc = document.createElement('p');
    desc.className = 'ajp-modal-desc';
    desc.textContent = `${captured.length}件のフィールドが検出されました。保存したい項目にチェックを入れてください。`;

    const note = document.createElement('span');
    note.className = 'ajp-modal-note';
    note.textContent = 'ラベルは識別用のメモです。name と value が実際のルールに使われます。';

    const scopePanel = createScopePanel();

    desc.appendChild(note);
    header.appendChild(title);
    header.appendChild(desc);
    header.appendChild(scopePanel);

    const toolbar = document.createElement('div');
    toolbar.className = 'ajp-modal-toolbar';

    const list = document.createElement('div');
    list.className = 'ajp-capture-list';

    captured.forEach((item, idx) => {
      list.appendChild(createCaptureRow(item, idx));
    });

    const footer = document.createElement('div');
    footer.className = 'ajp-modal-footer';

    const selectAllBtn = makeButton('すべて選択', 'ajp-btn-secondary', () => {
      list.querySelectorAll('.ajp-check').forEach((checkbox) => {
        checkbox.checked = true;
      });
    });

    const deselectAllBtn = makeButton('すべて解除', 'ajp-btn-secondary', () => {
      list.querySelectorAll('.ajp-check').forEach((checkbox) => {
        checkbox.checked = false;
      });
    });

    const cancelBtn = makeButton('キャンセル', 'ajp-btn-secondary', () => {
      closeModal();
    });

    const saveBtn = makeButton('保存', 'ajp-btn-success', async () => {
      const selectedItems = Array.from(list.querySelectorAll('.ajp-check'))
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => {
          const idx = Number(checkbox.dataset.idx);
          if (Number.isNaN(idx)) return null;

          const capturedItem = captured[idx] || {};
          const typeInput = list.querySelector(`.ajp-type[data-idx="${idx}"]`);
          const nameInput = list.querySelector(`.ajp-name[data-idx="${idx}"]`);
          const valueInput = list.querySelector(`.ajp-value[data-idx="${idx}"]`);
          const labelInput = list.querySelector(`.ajp-label[data-idx="${idx}"]`);

          const type = normalizeRuleType(typeInput?.value);
          const name = nameInput?.value.trim();
          if (!name) return null;

          return {
            idx,
            type,
            name,
            value: valueInput?.value ?? '',
            label: labelInput?.value.trim() || '',
            choiceIndex: Number.isInteger(capturedItem.choiceIndex) ? capturedItem.choiceIndex : undefined,
            choiceCount: Number.isInteger(capturedItem.choiceCount) ? capturedItem.choiceCount : undefined,
          };
        })
        .filter(Boolean);

      if (selectedItems.length === 0) {
        showToast('保存する項目を選択してください', 'warn');
        return;
      }

      const scopeInput = modal.querySelector('input[name="autofilljp-capture-scope"]:checked');
      const site = getRuleSiteForScope(scopeInput?.value || getDefaultCaptureScope());

      const rules = await loadRulesFromStorage();
      let addedCount = 0;
      let updatedCount = 0;

      const getChoiceMetadata = (item) => {
        const metadata = {};
        if (Number.isInteger(item.choiceIndex)) metadata.choiceIndex = item.choiceIndex;
        if (Number.isInteger(item.choiceCount)) metadata.choiceCount = item.choiceCount;
        return metadata;
      };

      selectedItems.forEach((item) => {
        const { idx, type, name, value, label } = item;
        const choiceMetadata = getChoiceMetadata(item);

        const existingIdx = rules.findIndex((rule) => {
          return (
            rule.name === name &&
            normalizeRuleType(rule.type) === type &&
            String(rule.site ?? '').trim() === site
          );
        });
        if (existingIdx >= 0) {
          rules[existingIdx] = {
            ...rules[existingIdx],
            type,
            value,
            label: label || rules[existingIdx].label || '',
            site,
            ...choiceMetadata,
          };
          updatedCount++;
          return;
        }

        rules.push({
          id: `r_${Date.now()}_${idx}`,
          type,
          name,
          value,
          label,
          site,
          ...choiceMetadata,
          createdAt: new Date().toISOString(),
        });
        addedCount++;
      });

      await saveRulesToStorage(rules);
      closeModal();
      const scopeLabel = site || '全サイト';
      showToast(`${addedCount}件追加 / ${updatedCount}件更新しました (${scopeLabel})`, 'success');
    });

    toolbar.appendChild(selectAllBtn);
    toolbar.appendChild(deselectAllBtn);
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(list);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    overlayLayer.appendChild(overlay);

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });

    modalKeyHandler = (event) => {
      if (event.key === 'Escape') {
        closeModal();
      }
    };
    document.addEventListener('keydown', modalKeyHandler, true);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'EXECUTE_AUTOFILL') {
      executeAutofill()
        .then((result) => sendResponse(result))
        .catch((error) => {
          reportError('自動入力エラー', error);
          sendResponse({ filled: 0, error: error?.message || String(error) });
        });
      return true;
    }

    if (message.type === 'CAPTURE_FORM') {
      Promise.resolve(saveCurrentFormAsRules())
        .then(() => sendResponse({ ok: true }))
        .catch((error) => {
          reportError('学習エラー', error);
          sendResponse({ ok: false, error: error?.message || String(error) });
        });
      return true;
    }

    if (message.type === 'GET_FORM_FIELDS') {
      try {
        sendResponse({ fields: captureCurrentForm() });
      } catch (error) {
        reportError('フィールド取得エラー', error);
        sendResponse({ fields: [], error: error?.message || String(error) });
      }
      return true;
    }

    return false;
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFloatingButton, { once: true });
  } else {
    initFloatingButton();
  }
})();
