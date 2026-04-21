/**
 * FlashGuard - content.js v1.2 (包含背景同步平滑淡出功能)
 *
 * 核心功能：
 * 1. 网页开始加载时：立刻铺上顶层纯色遮罩 (Layer 1) 和底层基础色 (Layer 2)，防止白屏。
 * 2. 网页加载完成后：使顶层遮罩和底层基础色同步执行淡出动画，平滑显露目标网页。
 * 3. 支持白名单、切页重新触发动画。
 */

(function () {
  'use strict';

  // 默认设置参数
  const DEFAULTS = {
    enabled:         true,
    overlayColor:    '#111111',
    fadeDuration:    600,        // 默认淡出动画时长 (毫秒)
    fadeDelay:       0,
    tabFadeEnabled:  true,
    whitelist:       []
  };

  // 存放当前实际生效的设置
  let settings    = { ...DEFAULTS }; 
  let overlayEl   = null;        // 顶层 <div> 遮罩元素
  let styleEl     = null;        // 底层基础色的 <style> 标签元素
  let fadeScheduled = false;     // 记录是否已安排淡出，防止重复

  // 获取域名，用于白名单比对
  const currentHost = window.location.hostname;

  // ══════════════════════════════════════════════════════════
  // 底层基础色标签 (Layer 2 - 动态注入，用于拦截 HTML 底色)
  // ══════════════════════════════════════════════════════════

  // 生成一段 CSS 代码，初始激活时让 HTML 基础色立刻变深
  function buildActivateCSS(color) {
    return `html.__fg_active__ {
      background-color: ${color} !important;
      /* 初始激活时必须为 0s，确保加载前立刻变深不拖延 */
      transition: background-color 0s !important;
    }`;
  }

  // 将 CSS 代码注入到网页中
  function injectStyleTag(color) {
    if (styleEl) { styleEl.textContent = buildActivateCSS(color); return; }
    
    styleEl = document.createElement('style');
    styleEl.id = '__fg_style__';
    styleEl.textContent = buildActivateCSS(color);
    
    const target = document.head || document.documentElement;
    if (target) target.insertBefore(styleEl, target.firstChild);
  }

  // 激活底色：贴上标签，激活 Layer 2 和 flash-guard-early.css 的拦截
  function activateStyleTag() {
    document.documentElement?.classList.remove('__fg_loaded__');
    document.documentElement?.classList.add('__fg_active__');
  }

  // 彻底撤销底色状态：移除标签和代码 (这是最终清理工作)
  function deactivateStyleTag() {
    document.documentElement?.classList.remove('__fg_active__');
    // 瞬间 neutralize flash-guard-early.css
    document.documentElement?.classList.add('__fg_loaded__');
    
    styleEl?.remove();
    styleEl = null;
  }

  // ══════════════════════════════════════════════════════════
  // Overlay 顶层遮罩 (Layer 1 - 全屏 <div>)
  // ══════════════════════════════════════════════════════════

  function createOverlay(color) {
    if (document.getElementById('__fg_overlay__')) {
      overlayEl = document.getElementById('__fg_overlay__');
      overlayEl.style.opacity = '1';
      overlayEl.style.transition = 'none';
      overlayEl.style.backgroundColor = color;
      return;
    }

    const el = document.createElement('div');
    el.id = '__fg_overlay__';
    
    Object.assign(el.style, {
      position:        'fixed',
      top:             '0', left: '0',
      width:           '100%', height: '100%',
      backgroundColor: color,
      zIndex:          '2147483647',
      opacity:         '1',
      transition:      'none',
      pointerEvents:   'none', 
      userSelect:      'none',
      border:          'none',
      margin:          '0', padding: '0',
      borderRadius:    '0', boxShadow: 'none',
    });
    
    const root = document.documentElement || document.body;
    root?.appendChild(el);
    overlayEl = el;
  }

  function removeOverlay() {
    overlayEl?.remove();
    overlayEl = null;
  }

  // ══════════════════════════════════════════════════════════
  // 淡出逻辑（同步、平滑显露网页）
  // ══════════════════════════════════════════════════════════

  function scheduleFadeOut() {
    if (fadeScheduled) return;
    fadeScheduled = true;

    const delay    = settings.fadeDelay    ?? DEFAULTS.fadeDelay;
    const duration = settings.fadeDuration ?? DEFAULTS.fadeDuration;

    // 用 setTimeout 设定一个定时任务
    setTimeout(() => {
      // (1) 淡出顶层遮罩 Overlay <div>
      if (overlayEl) {
        // 让遮罩的透明度慢慢变成 0（完全透明）
        overlayEl.style.transition = `opacity ${duration}ms ease-out`;
        overlayEl.style.opacity    = '0';
      }

      // (2) 【新增核心逻辑】：同步淡出底色 Layer 2 (<style> 标签)
      // 我们通过重新动态更新 styleEl 标签中的 CSS 内容，给它加上 transition 并把背景色设为 transparent。
      // 因为 html 此时仍然带有 __fg_active__ 类名，所以它会从初始的黑色平滑地淡出到透明（露白）。
      if (document.documentElement && styleEl) {
        styleEl.textContent = `html.__fg_active__ {
          background-color: transparent !important;
          transition: background-color ${duration}ms ease-out !important;
        }`;
      }

      // 动画结束后的清理工作：删掉所有多余元素
      const cleanup = () => { 
        removeOverlay(); 
        deactivateStyleTag(); 
      };
      
      // 监听 Overlay 的 transitionend 事件作为主要清理器
      if (overlayEl) {
          overlayEl.addEventListener('transitionend', cleanup, { once: true });
      } else {
          // 如果没有 Overlay (例如在白名单中激活了设置)，则使用一个简单的定时任务来清理
          setTimeout(cleanup, duration);
      }
      
      // 兜底措施：万一 transitionend 不触发，多等 300 毫秒后强行清理
      setTimeout(cleanup, duration + 300);
      
    }, delay); // delay 是延迟开始淡出的时间
  }

  // ══════════════════════════════════════════════════════════
  // 加载检测、切页路由跳转、设置监听 (保持不变)
  // ══════════════════════════════════════════════════════════

  function waitForPageReady() {
    if (document.readyState === 'complete') { scheduleFadeOut(); return; }
    document.addEventListener('readystatechange', () => {
      if (document.readyState === 'complete') scheduleFadeOut();
    });
    window.addEventListener('load', scheduleFadeOut, { once: true });
    setTimeout(scheduleFadeOut, 12000); 
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== 'visible') return;
    if (!settings.tabFadeEnabled || !settings.enabled) return;
    fadeScheduled = false;
    const color = settings.overlayColor ?? DEFAULTS.overlayColor;
    injectStyleTag(color);
    activateStyleTag();
    createOverlay(color);
    scheduleFadeOut();
  }
  document.addEventListener('visibilitychange', handleVisibilityChange);

  function handleSPANavigation() {
    fadeScheduled = false;
    removeOverlay();
    const color = settings.overlayColor ?? DEFAULTS.overlayColor;
    injectStyleTag(color);
    activateStyleTag();
    createOverlay(color);
    waitForPageReady();
  }
  const _origPush    = history.pushState.bind(history);
  const _origReplace = history.replaceState.bind(history);
  history.pushState    = (...a) => { _origPush(...a);    handleSPANavigation(); };
  history.replaceState = (...a) => { _origReplace(...a); handleSPANavigation(); };
  window.addEventListener('popstate',    handleSPANavigation);
  window.addEventListener('hashchange',  handleSPANavigation);
  window.addEventListener('pageshow', (e) => { if (e.persisted) handleSPANavigation(); });

  function isWhitelisted(whitelist) {
    if (!whitelist || whitelist.length === 0) return false;
    return whitelist.some(entry => currentHost === entry || currentHost.endsWith('.' + entry));
  }

  // ══════════════════════════════════════════════════════════
  // 初始化 (核心逻辑保持不变)
  // ══════════════════════════════════════════════════════════

  injectStyleTag(DEFAULTS.overlayColor);
  activateStyleTag();
  createOverlay(DEFAULTS.overlayColor);

  chrome.storage.sync.get(DEFAULTS, (saved) => {
    settings = { ...DEFAULTS, ...saved };
    if (!settings.enabled || isWhitelisted(settings.whitelist)) {
      removeOverlay();
      deactivateStyleTag();
      return;
    }
    injectStyleTag(settings.overlayColor);
    if (overlayEl) overlayEl.style.backgroundColor = settings.overlayColor;
  });

  waitForPageReady();

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.overlayColor) {
      settings.overlayColor = changes.overlayColor.newValue;
      injectStyleTag(settings.overlayColor);
      if (overlayEl) overlayEl.style.backgroundColor = settings.overlayColor;
    }
    if (changes.fadeDuration)   settings.fadeDuration   = changes.fadeDuration.newValue;
    if (changes.fadeDelay)      settings.fadeDelay       = changes.fadeDelay.newValue;
    if (changes.tabFadeEnabled) settings.tabFadeEnabled  = changes.tabFadeEnabled.newValue;
    if (changes.whitelist)      settings.whitelist       = changes.whitelist.newValue;
    if (changes.enabled) {
      settings.enabled = changes.enabled.newValue;
      if (!settings.enabled || isWhitelisted(settings.whitelist)) {
        removeOverlay();
        deactivateStyleTag();
      }
    }
  });

})();