/**
 * FlashGuard - popup.js v1.2
 * 白名单支持：当前站一键添加、手动输入域名、列表内行内编辑、删除
 */

// ── DOM 引用 ──────────────────────────────────────────────────
const enabledToggle  = document.getElementById('enabled-toggle');
const masterLabel    = document.getElementById('master-label');
const mainBody       = document.getElementById('main-body');
const overlayColor   = document.getElementById('overlay-color');
const colorHex       = document.getElementById('color-hex');
const fadeDuration   = document.getElementById('fade-duration');
const durationVal    = document.getElementById('duration-val');
const fadeDelay      = document.getElementById('fade-delay');
const delayVal       = document.getElementById('delay-val');
const tabFadeToggle  = document.getElementById('tab-fade-toggle');
const siteHost       = document.getElementById('site-host');
const siteFavicon    = document.getElementById('site-favicon');
const wlToggleBtn    = document.getElementById('wl-toggle-btn');
const wlList         = document.getElementById('wl-list');
const wlManualInput  = document.getElementById('wl-manual-input');
const wlManualAdd    = document.getElementById('wl-manual-add');
const inputError     = document.getElementById('input-error');
const toast          = document.getElementById('toast');

const DEFAULTS = {
  enabled: true, overlayColor: '#111111',
  fadeDuration: 600, fadeDelay: 0,
  tabFadeEnabled: true, whitelist: []
};

let currentHostname = '';
let whitelist = [];

// ── 工具：保存提示 ────────────────────────────────────────────
let toastTimer = null;
function showToast() {
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── 工具：保存设置 ────────────────────────────────────────────
function save() {
  chrome.storage.sync.set({
    enabled:        enabledToggle.checked,
    overlayColor:   overlayColor.value,
    fadeDuration:   Number(fadeDuration.value),
    fadeDelay:      Number(fadeDelay.value),
    tabFadeEnabled: tabFadeToggle.checked,
    whitelist,
  }, showToast);
}

// ══════════════════════════════════════════════════════════════
// 域名校验
//
// 合法域名格式示例：
//   github.com  sub.example.co.uk  localhost
// 不合法：包含协议头、路径、空格等
// ══════════════════════════════════════════════════════════════
function parseHostname(raw) {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return { ok: false, msg: '请输入域名' };

  // 如果用户粘贴了完整 URL，尝试自动提取 hostname
  let host = trimmed;
  if (host.includes('://')) {
    try { host = new URL(host).hostname; } catch { /* 继续原始值 */ }
  } else if (host.startsWith('www.')) {
    // 保留 www 前缀，由用户决定是否保留
  }

  // 基本格式校验：只允许字母、数字、连字符、点
  const valid = /^[a-z0-9]([a-z0-9\-\.]*[a-z0-9])?$/.test(host);
  if (!valid) return { ok: false, msg: '格式不正确，请输入如 example.com 的域名' };

  return { ok: true, host };
}

// ── 显示输入框错误状态 ────────────────────────────────────────
function showInputError(msg, inputEl = wlManualInput) {
  inputError.textContent = msg;
  inputEl.classList.add('error');
  setTimeout(() => inputEl.classList.remove('error'), 500);
}

function clearInputError() {
  inputError.textContent = '';
  wlManualInput.classList.remove('error');
}

// ══════════════════════════════════════════════════════════════
// 白名单渲染（含行内编辑逻辑）
// ══════════════════════════════════════════════════════════════

function renderWhitelist() {
  // 更新当前网站按钮状态
  const inList = whitelist.includes(currentHostname);
  wlToggleBtn.textContent = inList ? '✕ 移出白名单' : '+ 加入白名单';
  wlToggleBtn.className   = inList ? 'wl-btn remove' : 'wl-btn add';

  if (whitelist.length === 0) {
    wlList.innerHTML = '<div class="wl-empty">暂无白名单网站</div>';
    return;
  }

  // 渲染每一项（普通展示模式）
  wlList.innerHTML = whitelist.map((host, i) => `
    <div class="wl-item" data-index="${i}">
      <span class="wl-item-host" title="点击编辑">${escapeHtml(host)}</span>
      <button class="wl-edit" data-index="${i}" title="编辑">✎</button>
      <button class="wl-del"  data-index="${i}" title="删除">×</button>
    </div>
  `).join('');

  // 绑定删除按钮
  wlList.querySelectorAll('.wl-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.index);
      whitelist.splice(i, 1);
      renderWhitelist();
      save();
    });
  });

  // 绑定编辑按钮（✎图标）和 hostname 文字（点击也可以编辑）
  const enterEdit = (i) => {
    const item    = wlList.querySelector(`.wl-item[data-index="${i}"]`);
    const hostEl  = item.querySelector('.wl-item-host');
    const editBtn = item.querySelector('.wl-edit');
    const delBtn  = item.querySelector('.wl-del');
    const origVal = whitelist[i];

    // 把 hostname 文字替换为 input
    const input = document.createElement('input');
    input.className = 'wl-item-input';
    input.value = origVal;
    input.spellcheck = false;
    input.autocomplete = 'off';

    // 确认按钮
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'wl-confirm';
    confirmBtn.title = '确认';
    confirmBtn.textContent = '✓';

    // 取消按钮
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'wl-cancel';
    cancelBtn.title = '取消';
    cancelBtn.textContent = '✗';

    // 隐藏原来的编辑和删除按钮，插入新元素
    hostEl.replaceWith(input);
    editBtn.replaceWith(confirmBtn);
    delBtn.replaceWith(cancelBtn);

    input.focus();
    input.select();

    // ── 确认编辑 ──────────────────────────────────────────
    const confirmEdit = () => {
      const result = parseHostname(input.value);
      if (!result.ok) {
        input.classList.add('error');
        setTimeout(() => input.classList.remove('error'), 500);
        input.focus();
        return;
      }
      // 检查是否与其他项重复
      if (whitelist.some((h, idx) => h === result.host && idx !== i)) {
        input.classList.add('error');
        input.focus();
        return;
      }
      whitelist[i] = result.host;
      renderWhitelist();
      save();
    };

    // ── 取消编辑 ──────────────────────────────────────────
    const cancelEdit = () => renderWhitelist();

    confirmBtn.addEventListener('click', confirmEdit);
    cancelBtn.addEventListener('click', cancelEdit);

    // Enter 确认，Escape 取消
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); confirmEdit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
    });
  };

  wlList.querySelectorAll('.wl-edit').forEach(btn => {
    btn.addEventListener('click', () => enterEdit(Number(btn.dataset.index)));
  });

  wlList.querySelectorAll('.wl-item-host').forEach(el => {
    el.addEventListener('click', () => {
      const i = Number(el.closest('.wl-item').dataset.index);
      enterEdit(i);
    });
  });
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ══════════════════════════════════════════════════════════════
// 手动添加域名
// ══════════════════════════════════════════════════════════════

function addManual() {
  clearInputError();
  const result = parseHostname(wlManualInput.value);
  if (!result.ok) { showInputError(result.msg); return; }

  if (whitelist.includes(result.host)) {
    showInputError('该域名已在白名单中');
    return;
  }

  whitelist.push(result.host);
  wlManualInput.value = '';
  renderWhitelist();
  save();
}

wlManualAdd.addEventListener('click', addManual);

wlManualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); addManual(); }
});

wlManualInput.addEventListener('input', clearInputError);

// ══════════════════════════════════════════════════════════════
// 当前网站一键加入/移出
// ══════════════════════════════════════════════════════════════

wlToggleBtn.addEventListener('click', () => {
  if (!currentHostname) return;
  const idx = whitelist.indexOf(currentHostname);
  if (idx === -1) whitelist.push(currentHostname);
  else whitelist.splice(idx, 1);
  renderWhitelist();
  save();
});

// ══════════════════════════════════════════════════════════════
// 获取当前标签页 hostname
// ══════════════════════════════════════════════════════════════

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (!tabs?.length) return;
  try {
    const url = new URL(tabs[0].url);
    currentHostname = url.hostname;
    siteHost.textContent = currentHostname || '（无法识别）';
    if (tabs[0].favIconUrl) {
      siteFavicon.innerHTML =
        `<img src="${tabs[0].favIconUrl}" width="16" height="16"
          style="border-radius:3px;" onerror="this.remove()">`;
    }
  } catch {
    siteHost.textContent = '（特殊页面，不支持）';
    wlToggleBtn.disabled = true;
    wlToggleBtn.style.opacity = '0.3';
  }
  renderWhitelist();
});

// ══════════════════════════════════════════════════════════════
// 初始化：读取 storage
// ══════════════════════════════════════════════════════════════

chrome.storage.sync.get(DEFAULTS, (s) => {
  enabledToggle.checked   = s.enabled;
  masterLabel.textContent = s.enabled ? '启用' : '禁用';
  mainBody.classList.toggle('disabled', !s.enabled);

  overlayColor.value      = s.overlayColor;
  colorHex.textContent    = s.overlayColor;

  fadeDuration.value      = s.fadeDuration;
  durationVal.textContent = `${s.fadeDuration}ms`;

  fadeDelay.value         = s.fadeDelay;
  delayVal.textContent    = `${s.fadeDelay}ms`;

  tabFadeToggle.checked   = s.tabFadeEnabled;

  whitelist = Array.isArray(s.whitelist) ? s.whitelist : [];
  renderWhitelist();
});

// ── 常规设置事件 ──────────────────────────────────────────────

enabledToggle.addEventListener('change', () => {
  const on = enabledToggle.checked;
  masterLabel.textContent = on ? '启用' : '禁用';
  mainBody.classList.toggle('disabled', !on);
  save();
});

overlayColor.addEventListener('input', () => {
  colorHex.textContent = overlayColor.value;
  save();
});

fadeDuration.addEventListener('input', () => {
  durationVal.textContent = `${fadeDuration.value}ms`;
  save();
});

fadeDelay.addEventListener('input', () => {
  delayVal.textContent = `${fadeDelay.value}ms`;
  save();
});

tabFadeToggle.addEventListener('change', save);
