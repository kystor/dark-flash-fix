// =====================================
// 目标：尽量消灭首帧白闪，然后平滑淡出
// 改进点：
// 1. 预加载时强制深色，防白闪
// 2. 淡出开始时，立刻释放网页原本背景
// 3. 遮罩只负责过渡，不永久压住白底页面
// 适合在 document_start 时机运行
// =====================================

// 你可以调这个值：越大越慢，越丝滑
const FADE_DURATION = 1600;

// 等页面稳定一点再开始淡出
const START_DELAY = 250;

// 1) 先给 <html> 写入深色背景，防止首帧白闪
document.documentElement.style.backgroundColor = '#121212';
document.documentElement.style.colorScheme = 'dark';

// 2) 创建一段临时样式，先锁住 html / body 的深色背景
// 注意：这个样式只在遮罩显示期间存在，淡出时会移除
const style = document.createElement('style');
style.textContent = `
    html, body {
        background-color: #121212 !important;
        margin: 0 !important;
        min-height: 100% !important;
    }

    /* 防止一些常见容器首屏露白 */
    body, #app, #root, main, .app, .container {
        background-color: #121212 !important;
    }
`;
document.documentElement.appendChild(style);

// 3) 创建全屏深色遮罩层
const overlay = document.createElement('div');
overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: #121212;
    z-index: 2147483647;
    opacity: 1;
    pointer-events: none;
    will-change: opacity;
    transition: opacity ${FADE_DURATION}ms cubic-bezier(0.22, 1, 0.36, 1);
`;
document.documentElement.appendChild(overlay);

// 4) 开始淡出
function fadeOutOverlay() {
    // 关键：先把我们自己加的深色背景释放掉
    // 这样遮罩变透明时，网页原本的白底才能慢慢露出来
    style.remove();
    document.documentElement.style.backgroundColor = '';
    document.documentElement.style.colorScheme = '';
    if (document.body) {
        document.body.style.backgroundColor = '';
    }

    // 强制重排，确保上面的样式释放后再开始透明动画
    void overlay.offsetHeight;

    // 开始淡出遮罩
    overlay.style.opacity = '0';

    // 动画结束后移除遮罩
    overlay.addEventListener('transitionend', () => {
        overlay.remove();

        // 再补一层保险：不要继续强行压背景
        document.documentElement.style.backgroundColor = '';
        document.documentElement.style.colorScheme = '';
        if (document.body) {
            document.body.style.backgroundColor = '';
        }
    }, { once: true });
}

// 5) 选择更稳的淡出时机
function scheduleFade() {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(fadeOutOverlay, START_DELAY);
        });
    });
}

// 6) 根据页面状态启动
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scheduleFade();
} else {
    window.addEventListener('DOMContentLoaded', scheduleFade, { once: true });
    window.addEventListener('load', scheduleFade, { once: true });
}