const { ipcRenderer } = require('electron');

// pureForced: null = 自动(在观看页自动进入纯净模式)，true/false = 当前页用户手动覆盖
let pureForced = null;

// --------------------------------------------------------------------------
// 注入样式
//   .ypp-clean  始终生效：去掉部分干扰元素（评论 / 推荐弹层 / 片尾卡片等）
//   .ypp-pure   纯净模式：只保留视频画面，隐藏所有按钮和文字
// --------------------------------------------------------------------------
const CSS = `
/* ===== 始终生效的轻度清理（浏览/登录仍可正常使用）===== */
.ytp-pause-overlay,                 /* 暂停时的推荐视频遮罩 */
.ytp-ce-element,                    /* 片尾卡片 */
ytd-merch-shelf-renderer,          /* 商品货架 */
#clarify-box,
ytmusic-mealbar-promo-renderer,
ytd-popup-container tp-yt-paper-dialog:has(ytd-enforcement-message-view-model) {
  display: none !important;
}

/* ===== 广告：隐藏各种版面 / 信息流 / 播放器内广告位（受“去广告”开关控制）===== */
html.ypp-adblock #masthead-ad,                                   /* 首页顶部横幅广告 */
html.ypp-adblock ytd-display-ad-renderer,                        /* 信息流展示广告 */
html.ypp-adblock ytd-promoted-sparkles-web-renderer,
html.ypp-adblock ytd-promoted-video-renderer,
html.ypp-adblock ytd-ad-slot-renderer,
html.ypp-adblock ytd-in-feed-ad-layout-renderer,
html.ypp-adblock ytd-banner-promo-renderer,
html.ypp-adblock ytd-statement-banner-renderer,
html.ypp-adblock ytd-companion-slot-renderer,
html.ypp-adblock ytd-action-companion-ad-renderer,
html.ypp-adblock ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
html.ypp-adblock #player-ads,                                    /* 播放器下方广告 */
html.ypp-adblock #panels ytd-ads-engagement-panel-content-renderer,
html.ypp-adblock .ytp-ad-overlay-slot,                           /* 播放器内悬浮广告 */
html.ypp-adblock .ytp-ad-overlay-container,
html.ypp-adblock .ytp-ad-message-container,
html.ypp-adblock .ytp-suggested-action,
html.ypp-adblock ytmusic-statement-banner-renderer {
  display: none !important;
}

/* ===== 纯净模式：只看视频 ===== */
html.ypp-pure,
html.ypp-pure body {
  background: #000 !important;
  overflow: hidden !important;
}

/* 隐藏一切页面框架（顶栏、侧栏、标题、简介、评论、推荐等） */
html.ypp-pure ytd-masthead,
html.ypp-pure #masthead-container,
html.ypp-pure #secondary,
html.ypp-pure #secondary-inner,
html.ypp-pure #below,
html.ypp-pure #comments,
html.ypp-pure ytd-watch-metadata,
html.ypp-pure #chat,
html.ypp-pure #related,
html.ypp-pure tp-yt-app-drawer,
html.ypp-pure #guide,
html.ypp-pure ytd-mini-guide-renderer,
html.ypp-pure .ytp-chrome-top,
html.ypp-pure .ytp-gradient-top,
html.ypp-pure .ytp-watermark,
html.ypp-pure .iv-branding,
html.ypp-pure .annotation {
  display: none !important;
}

/* ===== 普通视频页（/watch）：播放器铺满整个窗口 =====
   注意：仅限 watch 页，避免影响 Shorts 的竖屏播放器布局 */
html.ypp-pure.ypp-watch #movie_player,
html.ypp-pure.ypp-watch .html5-video-player {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483000 !important;
  background: #000 !important;
}
html.ypp-pure.ypp-watch .html5-video-container {
  width: 100% !important;
  height: 100% !important;
}
html.ypp-pure.ypp-watch video.video-stream,
html.ypp-pure.ypp-watch video.html5-main-video {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 100% !important;
  height: 100% !important;
  object-fit: contain !important;
}
/* 画面填充模式：cover=填满裁剪，fill=拉伸铺满（默认 contain 保留比例） */
html.ypp-pure.ypp-watch.ypp-fit-cover video.video-stream,
html.ypp-pure.ypp-watch.ypp-fit-cover video.html5-main-video {
  object-fit: cover !important;
}
html.ypp-pure.ypp-watch.ypp-fit-fill video.video-stream,
html.ypp-pure.ypp-watch.ypp-fit-fill video.html5-main-video {
  object-fit: fill !important;
}

/* 纯净模式(watch)：底部只保留进度条。隐藏那一排控制按钮和时间文字，
   进度条沿用 YouTube 原生的自动隐藏：鼠标移动时出现、静止几秒后淡出，
   可直接拖动跳转进度。 */
html.ypp-pure.ypp-watch .ytp-chrome-controls,
html.ypp-pure.ypp-watch .ytp-gradient-bottom {
  display: none !important;
}
html.ypp-pure.ypp-watch .ytp-chrome-bottom {
  z-index: 2147483001 !important;
}
/* Shorts 页：仍然隐藏整条底部控制栏，保持竖屏原生体验 */
html.ypp-pure.ypp-shorts .ytp-chrome-bottom,
html.ypp-pure.ypp-shorts .ytp-gradient-bottom {
  display: none !important;
}

/* ===== Shorts 页（/shorts/...）：保留竖屏播放器原生布局，只隐藏页面框架 =====
   不要强制 #shorts-player 全屏，否则会把竖屏视频挤到角落变成“白屏/黑屏” */
html.ypp-pure.ypp-shorts ytd-masthead,
html.ypp-pure.ypp-shorts #masthead-container,
html.ypp-pure.ypp-shorts #guide,
html.ypp-pure.ypp-shorts ytd-mini-guide-renderer,
html.ypp-pure.ypp-shorts tp-yt-app-drawer {
  display: none !important;
}
/* 让 Shorts 内容区占满窗口高度并居中 */
html.ypp-pure.ypp-shorts ytd-page-manager,
html.ypp-pure.ypp-shorts ytd-shorts {
  margin: 0 !important;
  top: 0 !important;
  height: 100vh !important;
}

/* 隐藏右侧滚动条（不影响滚轮滚动）；打开 Ctrl+L 面板时才显示 */
html:not(.ypp-omni-open) {
  scrollbar-width: none !important;
  -ms-overflow-style: none !important;
}
html:not(.ypp-omni-open)::-webkit-scrollbar {
  width: 0 !important;
  height: 0 !important;
  display: none !important;
}

/* 右上角窗口控制（最小化 / 最大化 / 关闭）：平时透明且不可点击，
   鼠标移到右上角才整体淡入显示，不影响观看。 */
#ypp-wincontrols {
  position: fixed;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  z-index: 2147483647;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease;
  -webkit-app-region: no-drag;
}
#ypp-wincontrols.show {
  opacity: 1;
  pointer-events: auto;
}
#ypp-wincontrols button {
  width: 42px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(40,40,40,0.88);
  border: 1px solid rgba(255,255,255,0.28);
  border-radius: 8px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
#ypp-wincontrols button:hover { background: #4a4a4a; }
#ypp-wincontrols button.ypp-close:hover {
  background: #c0392b;
  border-color: #c0392b;
}
#ypp-wincontrols button.ypp-on {
  background: #c0392b;
  border-color: #e74c3c;
}

/* 左下角音量控制：平时透明且不可点击，鼠标移到左下角才淡入。 */
#ypp-volctrl {
  position: fixed;
  left: 10px;
  bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(30,30,30,0.9);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 10px;
  z-index: 2147483647;
  opacity: 0;
  pointer-events: none;
  transition: opacity .18s ease;
  -webkit-app-region: no-drag;
}
#ypp-volctrl.show {
  opacity: 1;
  pointer-events: auto;
}
#ypp-volctrl button {
  width: 32px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: transparent;
  border: none;
  font-size: 17px;
  line-height: 1;
  cursor: pointer;
}
#ypp-volctrl input[type="range"] {
  width: 110px;
  height: 4px;
  cursor: pointer;
  accent-color: #c0392b;
}
#ypp-volctrl .ypp-vol-num {
  min-width: 30px;
  color: #fff;
  font: 13px/1 system-ui, "Microsoft YaHei", sans-serif;
  text-align: right;
}

/* 无边框窗口的拖动区域：顶部中间一条透明条，可拖动/双击最大化。
   只占中间 50%，两侧（YouTube logo / 登录头像）仍可点击。 */
#ypp-drag {
  position: fixed;
  top: 0;
  left: 25%;
  right: 25%;
  height: 30px;
  -webkit-app-region: drag;
  z-index: 2147483646;
  pointer-events: auto;
}

/* 地址框（Ctrl+L 呼出） */
#ypp-omnibox, #ypp-omnibox * { -webkit-app-region: no-drag; }
#ypp-omnibox {
  position: fixed;
  top: 0; left: 0; right: 0;
  display: none;
  justify-content: center;
  padding: 14px;
  background: linear-gradient(rgba(0,0,0,0.85), rgba(0,0,0,0));
  z-index: 2147483647;
}
#ypp-omnibox.show { display: flex; }
#ypp-panel {
  width: 100%;
  max-width: 720px;
  background: #1f1f1f;
  border: 1px solid #6a6a6a;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 10px 36px rgba(0,0,0,0.7);
}
#ypp-omnibox input#ypp-url {
  width: 100%;
  box-sizing: border-box;
  font: 16px/1.4 system-ui, "Microsoft YaHei", sans-serif;
  color: #fff;
  background: rgba(30,30,30,0.95);
  border: 1px solid #555;
  border-radius: 10px;
  padding: 12px 16px;
  outline: none;
  box-shadow: 0 6px 24px rgba(0,0,0,0.5);
}
#ypp-omnibox input#ypp-url::placeholder { color: #aaa; }
#ypp-omnibox .ypp-devices {
  display: flex;
  gap: 10px;
  margin-top: 10px;
}
#ypp-omnibox .ypp-devices label {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #ffffff;
  font: 13px/1.4 system-ui, "Microsoft YaHei", sans-serif;
}
#ypp-omnibox .ypp-devices select {
  width: 100%;
  box-sizing: border-box;
  color: #ffffff;
  background: #3a3a3a;
  border: 1px solid #8a8a8a;
  border-radius: 8px;
  padding: 9px 10px;
  font-size: 14px;
  outline: none;
}
#ypp-omnibox .ypp-devices select:focus { border-color: #cccccc; }
#ypp-omnibox .ypp-devices select option {
  color: #ffffff;
  background: #2b2b2b;
}
#ypp-omnibox .ypp-toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  color: #ffffff;
  font: 14px/1.4 system-ui, "Microsoft YaHei", sans-serif;
  cursor: pointer;
  user-select: none;
}
#ypp-omnibox .ypp-toggle input {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: #c0392b;
}
#ypp-omnibox .ypp-guide-link {
  display: block;
  width: 100%;
  margin-top: 12px;
  padding: 10px 12px;
  background: #333;
  color: #fff;
  border: 1px solid #6a6a6a;
  border-radius: 8px;
  font: 14px/1.4 system-ui, "Microsoft YaHei", sans-serif;
  cursor: pointer;
  text-align: center;
}
#ypp-omnibox .ypp-guide-link:hover { background: #444; }

/* 定时片段播放（从 A 到 B 后暂停 / 关闭） */
#ypp-omnibox .ypp-clip {
  margin-top: 12px;
  color: #fff;
  font: 13px/1.4 system-ui, "Microsoft YaHei", sans-serif;
}
#ypp-omnibox .ypp-clip-title {
  display: block;
  margin-bottom: 8px;
  color: #ddd;
}
#ypp-omnibox .ypp-clip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
#ypp-omnibox .ypp-clip input[type="text"] {
  width: 76px;
  box-sizing: border-box;
  color: #fff;
  background: #3a3a3a;
  border: 1px solid #8a8a8a;
  border-radius: 8px;
  padding: 8px;
  font-size: 14px;
  outline: none;
  text-align: center;
}
#ypp-omnibox .ypp-clip input[type="text"]:focus { border-color: #ccc; }
#ypp-omnibox .ypp-clip select {
  color: #fff;
  background: #3a3a3a;
  border: 1px solid #8a8a8a;
  border-radius: 8px;
  padding: 8px;
  font-size: 14px;
  outline: none;
}
#ypp-omnibox .ypp-clip select option { color: #fff; background: #2b2b2b; }
#ypp-omnibox .ypp-clip button {
  color: #fff;
  background: #333;
  border: 1px solid #6a6a6a;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
}
#ypp-omnibox .ypp-clip button.ypp-clip-go {
  background: #c0392b;
  border-color: #c0392b;
}
#ypp-omnibox .ypp-clip button:hover { filter: brightness(1.15); }

/* 提示气泡 */
#ypp-toast {
  position: fixed;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.82);
  color: #fff;
  font: 14px/1.5 system-ui, "Microsoft YaHei", sans-serif;
  padding: 10px 16px;
  border-radius: 8px;
  z-index: 2147483647;
  pointer-events: none;
  opacity: 0;
  transition: opacity .35s ease;
  white-space: nowrap;
}
#ypp-toast.show { opacity: 1; }

/* 新手指引遮罩 */
#ypp-guide {
  position: fixed;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.78);
  z-index: 2147483647;
  -webkit-app-region: no-drag;
}
#ypp-guide.show { display: flex; }
#ypp-guide * { -webkit-app-region: no-drag; }
#ypp-guide .ypp-guide-card {
  width: 100%;
  max-width: 560px;
  max-height: 86vh;
  overflow: auto;
  margin: 16px;
  background: #1f1f1f;
  border: 1px solid #6a6a6a;
  border-radius: 16px;
  padding: 26px 26px 22px;
  box-shadow: 0 14px 50px rgba(0,0,0,0.75);
  color: #fff;
  font: 15px/1.6 system-ui, "Microsoft YaHei", sans-serif;
}
#ypp-guide h2 {
  margin: 0 0 16px;
  font-size: 22px;
  font-weight: 700;
  text-align: center;
}
#ypp-guide ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
#ypp-guide li {
  padding: 9px 0;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
#ypp-guide li:last-child { border-bottom: none; }
#ypp-guide .ypp-guide-btn {
  display: block;
  width: 100%;
  position: sticky;
  bottom: -2px;
  margin-top: 20px;
  padding: 13px 16px;
  border: none;
  border-radius: 10px;
  background: #c0392b;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}
#ypp-guide .ypp-guide-btn:hover { background: #d8472f; }
`;

function injectStyle() {
  if (document.getElementById('ypp-style')) return;
  const target = document.head || document.documentElement;
  if (!target) return; // 文档尚未就绪，稍后由 DOMContentLoaded 再次注入
  const style = document.createElement('style');
  style.id = 'ypp-style';
  style.textContent = CSS;
  target.appendChild(style);
}

function ensureDragBar() {
  if (!document.body || document.getElementById('ypp-drag')) return;
  const bar = document.createElement('div');
  bar.id = 'ypp-drag';
  document.body.appendChild(bar);
}

function ensureWinControls() {
  if (!document.body || document.getElementById('ypp-wincontrols')) return;
  const wrap = document.createElement('div');
  wrap.id = 'ypp-wincontrols';
  const mk = (label, action, cls) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', () => ipcRenderer.send(action));
    return b;
  };
  const pure = document.createElement('button');
  pure.textContent = '🎬';
  pure.title = t('pureTitle');
  pure.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePure();
  });
  wrap.appendChild(pure);

  const fit = document.createElement('button');
  fit.textContent = '⛶';
  fit.title = t('fitTitle');
  fit.addEventListener('click', (e) => {
    e.stopPropagation();
    cycleFit();
  });
  wrap.appendChild(fit);

  const closeOnEnd = document.createElement('button');
  closeOnEnd.id = 'ypp-close-on-end-btn';
  closeOnEnd.textContent = '⏹';
  closeOnEnd.title = t('closeOnEndTitle');
  if (closeOnEndEnabled()) closeOnEnd.classList.add('ypp-on');
  closeOnEnd.addEventListener('click', (e) => {
    e.stopPropagation();
    const on = !closeOnEndEnabled();
    setCloseOnEnd(on);
    toast(on ? t('closeOnEndOn') : t('closeOnEndOff'));
  });
  wrap.appendChild(closeOnEnd);

  const settings = document.createElement('button');
  settings.textContent = '⚙';
  settings.title = '设置 (Ctrl+L)';
  settings.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleOmnibox();
  });
  wrap.appendChild(settings);
  wrap.appendChild(mk('—', 'win-minimize'));
  wrap.appendChild(mk('▢', 'win-maximize-toggle'));
  wrap.appendChild(mk('✕', 'win-close', 'ypp-close'));
  document.body.appendChild(wrap);
}

// --------------------------------------------------------------------------
// 左下角音量控制（纯净模式下也能调音量，平时隐藏，鼠标移到左下角才显示）
// --------------------------------------------------------------------------
function ytPlayer() {
  return document.getElementById('movie_player') || document.querySelector('.html5-video-player');
}

function setVolume(v) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  const p = ytPlayer();
  if (p && typeof p.setVolume === 'function') {
    try {
      if (v === 0) {
        if (typeof p.mute === 'function') p.mute();
      } else {
        if (typeof p.unMute === 'function') p.unMute();
        p.setVolume(v);
      }
    } catch (_) {}
  }
  const vid = document.querySelector('video');
  if (vid) {
    vid.volume = v / 100;
    vid.muted = v === 0;
  }
  localStorage.setItem('ypp-vol', String(v));
}

function savedVolume() {
  const v = parseInt(localStorage.getItem('ypp-vol'), 10);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
}

function volIcon(v) {
  if (v <= 0) return '🔇';
  if (v < 50) return '🔉';
  return '🔊';
}

function syncVolUI(v) {
  const slider = document.getElementById('ypp-vol-range');
  const num = document.getElementById('ypp-vol-num');
  const btn = document.getElementById('ypp-vol-btn');
  if (slider) slider.value = String(v);
  if (num) num.textContent = String(v);
  if (btn) btn.textContent = volIcon(v);
}

let lastNonZeroVol = 50;
function ensureVolControls() {
  if (!document.body || document.getElementById('ypp-volctrl')) return;
  const init = savedVolume();
  const wrap = document.createElement('div');
  wrap.id = 'ypp-volctrl';

  const btn = document.createElement('button');
  btn.id = 'ypp-vol-btn';
  btn.title = t('volTitle');
  wrap.appendChild(btn);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = 'ypp-vol-range';
  slider.min = '0';
  slider.max = '100';
  slider.step = '1';
  slider.value = String(init == null ? 50 : init);
  wrap.appendChild(slider);

  const num = document.createElement('span');
  num.id = 'ypp-vol-num';
  num.className = 'ypp-vol-num';
  num.textContent = slider.value;
  wrap.appendChild(num);

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value, 10) || 0;
    if (v > 0) lastNonZeroVol = v;
    setVolume(v);
    syncVolUI(v);
  });
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cur = parseInt(slider.value, 10) || 0;
    const v = cur > 0 ? 0 : (lastNonZeroVol || 50);
    setVolume(v);
    syncVolUI(v);
  });

  document.body.appendChild(wrap);
  syncVolUI(init == null ? 50 : init);
}

// 启动时把保存的音量同步给当前播放器（播放器可能稍后才就绪）
let volRestored = false;
function restoreVolume() {
  const v = savedVolume();
  if (v == null) return;
  if (v > 0) lastNonZeroVol = v;
  const p = ytPlayer();
  const vid = document.querySelector('video');
  if (p || vid) {
    setVolume(v);
    syncVolUI(v);
    volRestored = true;
  }
}

let volHoverBound = false;
function bindVolHover() {
  if (volHoverBound) return;
  volHoverBound = true;
  document.addEventListener('mousemove', (e) => {
    const wrap = document.getElementById('ypp-volctrl');
    if (!wrap) return;
    const inCorner = e.clientX <= 320 && e.clientY >= window.innerHeight - 70;
    if (inCorner) wrap.classList.add('show');
    else wrap.classList.remove('show');
  });
}

// --------------------------------------------------------------------------
// 定时片段播放：从 A 秒播到 B 秒，到点后暂停或关闭软件
// --------------------------------------------------------------------------
let clipTimer = null;

// 解析 "mm:ss" / "hh:mm:ss" / 纯秒数；空字符串返回 null，非法返回 NaN
function parseClipTime(str) {
  str = (str || '').trim();
  if (!str) return null;
  if (/^\d+$/.test(str)) return parseInt(str, 10);
  const parts = str.split(':').map((s) => s.trim());
  if (parts.length < 2 || parts.some((p) => !/^\d+$/.test(p))) return NaN;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + parseInt(p, 10);
  return sec;
}

function clearClip() {
  if (clipTimer) {
    clearInterval(clipTimer);
    clipTimer = null;
  }
}

function startClip(fromSec, toSec, action) {
  clearClip();
  const vid = document.querySelector('video');
  const player = ytPlayer();
  if (!vid) {
    toast(t('clipInvalid'));
    return;
  }
  if (fromSec != null) {
    try { vid.currentTime = fromSec; } catch (_) {}
  }
  try {
    if (player && typeof player.playVideo === 'function') player.playVideo();
    else vid.play();
  } catch (_) {}
  toast(t('clipSet'));
  if (toSec == null) return; // 只设了起点，不自动停止

  clipTimer = setInterval(() => {
    const v = document.querySelector('video');
    if (!v) return;
    if (v.currentTime >= toSec) {
      clearClip();
      if (action === 'close') {
        ipcRenderer.send('win-close');
      } else {
        const p = ytPlayer();
        try {
          if (p && typeof p.pauseVideo === 'function') p.pauseVideo();
          else v.pause();
        } catch (_) {
          try { v.pause(); } catch (_) {}
        }
        toast(t('clipDonePause'));
      }
    }
  }, 250);
}

// --------------------------------------------------------------------------
// 画面填充方式：contain(保留比例) → cover(填满裁剪) → fill(拉伸铺满)
// --------------------------------------------------------------------------
const FIT_MODES = ['contain', 'cover', 'fill'];

function currentFit() {
  const v = localStorage.getItem('ypp-fit');
  return FIT_MODES.includes(v) ? v : 'contain';
}

function applyFit() {
  const html = document.documentElement;
  const fit = currentFit();
  html.classList.remove('ypp-fit-cover', 'ypp-fit-fill');
  if (fit === 'cover') html.classList.add('ypp-fit-cover');
  else if (fit === 'fill') html.classList.add('ypp-fit-fill');
}

function cycleFit() {
  const idx = FIT_MODES.indexOf(currentFit());
  const next = FIT_MODES[(idx + 1) % FIT_MODES.length];
  localStorage.setItem('ypp-fit', next);
  applyFit();
  toast(t('fit' + next.charAt(0).toUpperCase() + next.slice(1)));
}

// 点击面板以外的空白处，关闭设置面板
let outsideCloseBound = false;
function bindOutsideClose() {
  if (outsideCloseBound) return;
  outsideCloseBound = true;
  document.addEventListener(
    'mousedown',
    (e) => {
      const box = document.getElementById('ypp-omnibox');
      if (!box || !box.classList.contains('show')) return;
      const panel = document.getElementById('ypp-panel');
      const controls = document.getElementById('ypp-wincontrols');
      const inside =
        (panel && panel.contains(e.target)) ||
        (controls && controls.contains(e.target));
      if (!inside) {
        hideOmnibox();
      }
    },
    true
  );
}

// 鼠标移到右上角才显示关闭按钮，其余时间隐藏且不拦截点击
let closeMoveBound = false;
function bindCloseHover() {
  if (closeMoveBound) return;
  closeMoveBound = true;
  document.addEventListener('mousemove', (e) => {
    const wrap = document.getElementById('ypp-wincontrols');
    if (!wrap) return;
    const inCorner = e.clientX >= window.innerWidth - 390 && e.clientY <= 60;
    if (inCorner) wrap.classList.add('show');
    else wrap.classList.remove('show');
  });
}

// --------------------------------------------------------------------------
// 多语言（软件界面文字）
// --------------------------------------------------------------------------
const LANGS = [
  ['zh', '中文'],
  ['en', 'English'],
  ['ru', 'Русский'],
  ['fr', 'Français'],
  ['es', 'Español'],
  ['uk', 'Українська'],
  ['ka', 'ქართული'],
  ['hy', 'Հայերեն'],
  ['mg', 'Malagasy'],
];

const I18N = {
  zh: {
    language: '语言（界面 + YouTube）',
    out: '输出设备（声音）',
    in: '输入设备（麦克风）',
    adblock: '去广告（屏蔽广告）',
    adblockOn: '去广告：已开启',
    adblockOff: '去广告：已关闭',
    closeOnEnd: '播放完后关闭软件',
    closeOnEndOn: '播放完后关闭：已开启',
    closeOnEndOff: '播放完后关闭：已关闭',
    closeOnEndTitle: '播放完后关闭软件',
    ph: '粘贴 YouTube 链接 / 视频ID / 搜索词，回车打开 · Esc 取消',
    hint: 'Ctrl+L 输入链接 · Ctrl+H 切换纯净模式 · F11 全屏',
    pureOn: '纯净模式：开',
    pureOff: '纯净模式：关（可浏览/搜索/登录）',
    exitPure: '已退出纯净模式',
    volTitle: '音量（点击静音/取消静音）',
    clipTitle: '定时片段（从 A 播到 B，到点后暂停/关闭）',
    clipFrom: '从',
    clipTo: '到',
    clipThen: '到点后',
    clipPause: '暂停',
    clipClose: '关闭软件',
    clipGo: '开始',
    clipClear: '清除',
    clipSet: '已设置定时片段',
    clipCleared: '已清除定时片段',
    clipInvalid: '时间格式无效（请用 mm:ss 或秒数）',
    clipDonePause: '已到结束时间，已暂停',
    guideOpen: '📖 查看新手指引',
    guideTitle: '欢迎使用 YouTube Pure Player',
    guideBtn: '知道了，开始使用',
    guideBody: [
      '【Ctrl + L】打开设置面板：输入 YouTube 链接 / 视频ID / 搜索词，还能选择界面语言、音频输入/输出设备、去广告开关。',
      '【Ctrl + H】切换“纯净观影模式”：只保留视频画面，隐藏所有按钮和文字（适合录屏 / 共享时不暴露 YouTube）。',
      '【鼠标移到右上角】会浮出一排隐藏按钮：🎬 纯净模式 · ⛶ 画面填充 · ⚙ 设置 · — 最小化 · ▢ 最大化 · ✕ 关闭。',
      '【自动适配】打开视频自动进入纯净模式，并把窗口调成视频比例；缩放窗口时画面会等比缩放，不留黑边也不裁切。',
      '【F11】全屏 / 退出全屏；【Esc】退出纯净模式。',
      '【去广告】默认开启（版面广告 + 贴片广告自动跳过），可在设置面板里随时关闭。',
      '【自动保存】你的设置、语言、窗口大小和位置都会自动保存，下次打开自动恢复。',
    ],
    pureTitle: '纯净观影模式开关 (Ctrl+H)',
    fitTitle: '画面填充方式',
    fitContain: '画面：保留比例（有黑边）',
    fitCover: '画面：填满裁剪',
    fitFill: '画面：拉伸铺满',
  },
  en: {
    language: 'Language (app + YouTube)',
    out: 'Output device (sound)',
    in: 'Input device (microphone)',
    adblock: 'Block ads',
    adblockOn: 'Ad blocking: ON',
    adblockOff: 'Ad blocking: OFF',
    closeOnEnd: 'Close app when video ends',
    closeOnEndOn: 'Close when ended: ON',
    closeOnEndOff: 'Close when ended: OFF',
    closeOnEndTitle: 'Close app when video ends',
    ph: 'Paste a YouTube link / video ID / search term, Enter to open · Esc to cancel',
    hint: 'Ctrl+L address bar · Ctrl+H toggle clean mode · F11 fullscreen',
    pureOn: 'Clean mode: ON',
    pureOff: 'Clean mode: OFF (browse / search / sign in)',
    exitPure: 'Exited clean mode',
    volTitle: 'Volume (click to mute / unmute)',
    clipTitle: 'Timed clip (play A→B, then pause/close)',
    clipFrom: 'From',
    clipTo: 'To',
    clipThen: 'Then',
    clipPause: 'Pause',
    clipClose: 'Close app',
    clipGo: 'Start',
    clipClear: 'Clear',
    clipSet: 'Timed clip set',
    clipCleared: 'Timed clip cleared',
    clipInvalid: 'Invalid time (use mm:ss or seconds)',
    clipDonePause: 'Reached end time, paused',
    guideOpen: '📖 Open guide',
    guideTitle: 'Welcome to YouTube Pure Player',
    guideBtn: 'Got it, let’s go',
    guideBody: [
      '[Ctrl + L] Open the settings panel: paste a YouTube link / video ID / search term, and choose UI language, audio input/output devices, and the ad-block toggle.',
      '[Ctrl + H] Toggle "clean viewing mode": keep only the video, hiding all buttons and text (great for screen sharing without exposing YouTube).',
      '[Move mouse to the top-right corner] a hidden button row appears: 🎬 Clean mode · ⛶ Picture fill · ⚙ Settings · — Minimize · ▢ Maximize · ✕ Close.',
      '[Auto-fit] Opening a video auto-enters clean mode and resizes the window to the video ratio; resizing scales the picture with no black bars or cropping.',
      '[F11] Fullscreen on/off; [Esc] exit clean mode.',
      '[Ad blocking] On by default (layout ads + auto-skip video ads); can be turned off in the settings panel.',
      '[Auto-save] Your settings, language, window size and position are saved automatically and restored next time.',
    ],
    pureTitle: 'Toggle clean viewing mode (Ctrl+H)',
    fitTitle: 'Picture fill mode',
    fitContain: 'Picture: keep ratio (black bars)',
    fitCover: 'Picture: fill & crop',
    fitFill: 'Picture: stretch to fill',
  },
  ru: {
    language: 'Язык (приложение + YouTube)',
    out: 'Устройство вывода (звук)',
    in: 'Устройство ввода (микрофон)',
    ph: 'Вставьте ссылку YouTube / ID видео / запрос, Enter — открыть · Esc — отмена',
    hint: 'Ctrl+L — адрес · Ctrl+H — чистый режим · F11 — полный экран',
    pureOn: 'Чистый режим: ВКЛ',
    pureOff: 'Чистый режим: ВЫКЛ (просмотр / поиск / вход)',
    exitPure: 'Выход из чистого режима',
    adblock: 'Блокировка рекламы',
    adblockOn: 'Блокировка рекламы: ВКЛ',
    adblockOff: 'Блокировка рекламы: ВЫКЛ',
    closeOnEnd: 'Закрыть приложение после воспроизведения',
    closeOnEndOn: 'Закрытие после воспроизведения: ВКЛ',
    closeOnEndOff: 'Закрытие после воспроизведения: ВЫКЛ',
    closeOnEndTitle: 'Закрыть приложение после воспроизведения',
    volTitle: 'Громкость (нажмите, чтобы выкл./вкл. звук)',
    clipTitle: 'Таймер фрагмента (с A до B, затем пауза/закрытие)',
    clipFrom: 'С',
    clipTo: 'До',
    clipThen: 'Затем',
    clipPause: 'Пауза',
    clipClose: 'Закрыть приложение',
    clipGo: 'Старт',
    clipClear: 'Сбросить',
    clipSet: 'Таймер фрагмента задан',
    clipCleared: 'Таймер фрагмента сброшен',
    clipInvalid: 'Неверный формат времени (мм:сс или секунды)',
    clipDonePause: 'Достигнуто время окончания, пауза',
    pureTitle: 'Переключить чистый режим (Ctrl+H)',
    fitTitle: 'Режим заполнения картинки',
    fitContain: 'Картинка: сохранять пропорции (с полосами)',
    fitCover: 'Картинка: заполнить с обрезкой',
    fitFill: 'Картинка: растянуть на весь экран',
    guideOpen: '📖 Открыть руководство',
    guideTitle: 'Добро пожаловать в YouTube Pure Player',
    guideBtn: 'Понятно, начать',
    guideBody: [
      '[Ctrl + L] Открыть панель настроек: вставьте ссылку YouTube / ID видео / запрос, выберите язык интерфейса, устройства ввода/вывода звука и переключатель блокировки рекламы.',
      '[Ctrl + H] Переключить «чистый режим»: остаётся только видео, все кнопки и текст скрыты (удобно для демонстрации экрана без раскрытия YouTube).',
      '[Наведите мышь в правый верхний угол] появится скрытый ряд кнопок: 🎬 Чистый режим · ⛶ Заполнение · ⚙ Настройки · — Свернуть · ▢ Развернуть · ✕ Закрыть.',
      '[Авто-подгон] При открытии видео включается чистый режим, окно подгоняется под пропорции видео; при изменении размера картинка масштабируется без полос и обрезки.',
      '[F11] Полный экран вкл/выкл; [Esc] выйти из чистого режима.',
      '[Блокировка рекламы] Включена по умолчанию (баннеры + авто-пропуск видеорекламы); можно отключить в настройках.',
      '[Авто-сохранение] Ваши настройки, язык, размер и положение окна сохраняются автоматически и восстанавливаются при следующем запуске.',
    ],
  },
  fr: {
    language: 'Langue (app + YouTube)',
    out: 'Périphérique de sortie (son)',
    in: "Périphérique d'entrée (microphone)",
    ph: 'Collez un lien YouTube / ID vidéo / recherche, Entrée pour ouvrir · Échap pour annuler',
    hint: 'Ctrl+L barre d’adresse · Ctrl+H mode épuré · F11 plein écran',
    pureOn: 'Mode épuré : ACTIVÉ',
    pureOff: 'Mode épuré : DÉSACTIVÉ (naviguer / rechercher / se connecter)',
    exitPure: 'Mode épuré quitté',
    adblock: 'Bloquer les pubs',
    adblockOn: 'Blocage des pubs : ACTIVÉ',
    adblockOff: 'Blocage des pubs : DÉSACTIVÉ',
    closeOnEnd: 'Fermer l’appli à la fin de la vidéo',
    closeOnEndOn: 'Fermer à la fin : ACTIVÉ',
    closeOnEndOff: 'Fermer à la fin : DÉSACTIVÉ',
    closeOnEndTitle: 'Fermer l’appli à la fin de la vidéo',
    volTitle: 'Volume (cliquer pour couper / rétablir)',
    clipTitle: 'Extrait chronométré (de A à B, puis pause/fermeture)',
    clipFrom: 'De',
    clipTo: 'À',
    clipThen: 'Ensuite',
    clipPause: 'Pause',
    clipClose: 'Fermer l’appli',
    clipGo: 'Démarrer',
    clipClear: 'Effacer',
    clipSet: 'Extrait chronométré défini',
    clipCleared: 'Extrait chronométré effacé',
    clipInvalid: 'Format d’heure invalide (mm:ss ou secondes)',
    clipDonePause: 'Fin atteinte, en pause',
    pureTitle: 'Basculer le mode épuré (Ctrl+H)',
    fitTitle: 'Mode de remplissage de l’image',
    fitContain: 'Image : garder les proportions (bandes noires)',
    fitCover: 'Image : remplir et rogner',
    fitFill: 'Image : étirer pour remplir',
    guideOpen: '📖 Ouvrir le guide',
    guideTitle: 'Bienvenue dans YouTube Pure Player',
    guideBtn: 'Compris, c’est parti',
    guideBody: [
      '[Ctrl + L] Ouvrir le panneau des réglages : collez un lien YouTube / ID vidéo / recherche, et choisissez la langue, les périphériques audio entrée/sortie et l’interrupteur anti-pub.',
      '[Ctrl + H] Basculer le « mode épuré » : ne garder que la vidéo, en masquant tous les boutons et textes (idéal pour partager l’écran sans révéler YouTube).',
      '[Déplacez la souris dans le coin supérieur droit] une rangée de boutons cachés apparaît : 🎬 Mode épuré · ⛶ Remplissage · ⚙ Réglages · — Réduire · ▢ Agrandir · ✕ Fermer.',
      '[Ajustement auto] Ouvrir une vidéo active le mode épuré et adapte la fenêtre au ratio de la vidéo ; le redimensionnement met l’image à l’échelle sans bandes ni rognage.',
      '[F11] Plein écran activé/désactivé ; [Esc] quitter le mode épuré.',
      '[Anti-pub] Activé par défaut (pubs d’interface + saut automatique des pubs vidéo) ; désactivable dans les réglages.',
      '[Sauvegarde auto] Vos réglages, la langue, la taille et la position de la fenêtre sont enregistrés automatiquement et restaurés au prochain lancement.',
    ],
  },
  es: {
    language: 'Idioma (app + YouTube)',
    out: 'Dispositivo de salida (sonido)',
    in: 'Dispositivo de entrada (micrófono)',
    ph: 'Pega un enlace de YouTube / ID de vídeo / búsqueda, Enter para abrir · Esc para cancelar',
    hint: 'Ctrl+L barra de direcciones · Ctrl+H modo limpio · F11 pantalla completa',
    pureOn: 'Modo limpio: ACTIVADO',
    pureOff: 'Modo limpio: DESACTIVADO (navegar / buscar / iniciar sesión)',
    exitPure: 'Modo limpio cerrado',
    adblock: 'Bloquear anuncios',
    adblockOn: 'Bloqueo de anuncios: ACTIVADO',
    adblockOff: 'Bloqueo de anuncios: DESACTIVADO',
    closeOnEnd: 'Cerrar la app al terminar el vídeo',
    closeOnEndOn: 'Cerrar al terminar: ACTIVADO',
    closeOnEndOff: 'Cerrar al terminar: DESACTIVADO',
    closeOnEndTitle: 'Cerrar la app al terminar el vídeo',
    volTitle: 'Volumen (clic para silenciar / reactivar)',
    clipTitle: 'Fragmento temporizado (de A a B, luego pausa/cerrar)',
    clipFrom: 'Desde',
    clipTo: 'Hasta',
    clipThen: 'Luego',
    clipPause: 'Pausa',
    clipClose: 'Cerrar la app',
    clipGo: 'Iniciar',
    clipClear: 'Borrar',
    clipSet: 'Fragmento temporizado establecido',
    clipCleared: 'Fragmento temporizado borrado',
    clipInvalid: 'Formato de tiempo inválido (mm:ss o segundos)',
    clipDonePause: 'Se alcanzó el final, en pausa',
    pureTitle: 'Alternar modo limpio (Ctrl+H)',
    fitTitle: 'Modo de relleno de imagen',
    fitContain: 'Imagen: mantener proporción (con bordes)',
    fitCover: 'Imagen: rellenar y recortar',
    fitFill: 'Imagen: estirar para rellenar',
    guideOpen: '📖 Abrir la guía',
    guideTitle: 'Bienvenido a YouTube Pure Player',
    guideBtn: 'Entendido, empezar',
    guideBody: [
      '[Ctrl + L] Abrir el panel de ajustes: pega un enlace de YouTube / ID de vídeo / búsqueda, y elige el idioma, los dispositivos de audio de entrada/salida y el interruptor antianuncios.',
      '[Ctrl + H] Alternar el «modo limpio»: deja solo el vídeo, ocultando todos los botones y textos (ideal para compartir pantalla sin mostrar YouTube).',
      '[Mueve el ratón a la esquina superior derecha] aparece una fila de botones ocultos: 🎬 Modo limpio · ⛶ Relleno · ⚙ Ajustes · — Minimizar · ▢ Maximizar · ✕ Cerrar.',
      '[Ajuste automático] Abrir un vídeo activa el modo limpio y ajusta la ventana a la proporción del vídeo; al redimensionar, la imagen se escala sin bordes ni recortes.',
      '[F11] Pantalla completa activar/desactivar; [Esc] salir del modo limpio.',
      '[Antianuncios] Activado por defecto (anuncios de interfaz + salto automático de anuncios de vídeo); se puede desactivar en los ajustes.',
      '[Guardado automático] Tus ajustes, el idioma, el tamaño y la posición de la ventana se guardan automáticamente y se restauran la próxima vez.',
    ],
  },
  uk: {
    language: 'Мова (додаток + YouTube)',
    out: 'Пристрій виводу (звук)',
    in: 'Пристрій вводу (мікрофон)',
    ph: 'Вставте посилання YouTube / ID відео / запит, Enter — відкрити · Esc — скасувати',
    hint: 'Ctrl+L — адреса · Ctrl+H — чистий режим · F11 — повний екран',
    pureOn: 'Чистий режим: УВІМК',
    pureOff: 'Чистий режим: ВИМК (перегляд / пошук / вхід)',
    exitPure: 'Вихід із чистого режиму',
    adblock: 'Блокування реклами',
    adblockOn: 'Блокування реклами: УВІМК',
    adblockOff: 'Блокування реклами: ВИМК',
    closeOnEnd: 'Закрити програму після відтворення',
    closeOnEndOn: 'Закриття після відтворення: УВІМК',
    closeOnEndOff: 'Закриття після відтворення: ВИМК',
    closeOnEndTitle: 'Закрити програму після відтворення',
    volTitle: 'Гучність (натисніть, щоб вимк./увімк. звук)',
    clipTitle: 'Таймер фрагмента (з A до B, потім пауза/закриття)',
    clipFrom: 'З',
    clipTo: 'До',
    clipThen: 'Потім',
    clipPause: 'Пауза',
    clipClose: 'Закрити програму',
    clipGo: 'Старт',
    clipClear: 'Скинути',
    clipSet: 'Таймер фрагмента задано',
    clipCleared: 'Таймер фрагмента скинуто',
    clipInvalid: 'Невірний формат часу (хх:сс або секунди)',
    clipDonePause: 'Досягнуто кінцевого часу, пауза',
    pureTitle: 'Перемкнути чистий режим (Ctrl+H)',
    fitTitle: 'Режим заповнення зображення',
    fitContain: 'Зображення: зберігати пропорції (зі смугами)',
    fitCover: 'Зображення: заповнити з обрізанням',
    fitFill: 'Зображення: розтягнути на весь екран',
    guideOpen: '📖 Відкрити посібник',
    guideTitle: 'Ласкаво просимо до YouTube Pure Player',
    guideBtn: 'Зрозуміло, почати',
    guideBody: [
      '[Ctrl + L] Відкрити панель налаштувань: вставте посилання YouTube / ID відео / запит, оберіть мову інтерфейсу, пристрої вводу/виводу звуку та перемикач блокування реклами.',
      '[Ctrl + H] Перемкнути «чистий режим»: залишається лише відео, усі кнопки й текст приховані (зручно для демонстрації екрана без показу YouTube).',
      '[Наведіть мишу у правий верхній кут] зʼявиться прихований ряд кнопок: 🎬 Чистий режим · ⛶ Заповнення · ⚙ Налаштування · — Згорнути · ▢ Розгорнути · ✕ Закрити.',
      '[Авто-підлаштування] Відкриття відео вмикає чистий режим і підлаштовує вікно під співвідношення відео; під час зміни розміру зображення масштабується без смуг і обрізання.',
      '[F11] Повний екран увімк/вимк; [Esc] вийти з чистого режиму.',
      '[Блокування реклами] Увімкнено за замовчуванням (банери + авто-пропуск відеореклами); можна вимкнути в налаштуваннях.',
      '[Авто-збереження] Ваші налаштування, мова, розмір і положення вікна зберігаються автоматично та відновлюються наступного разу.',
    ],
  },
  ka: {
    language: 'ენა (აპი + YouTube)',
    out: 'გამოყვანის მოწყობილობა (ხმა)',
    in: 'შეყვანის მოწყობილობა (მიკროფონი)',
    ph: 'ჩასვით YouTube ბმული / ვიდეოს ID / საძიებო სიტყვა, Enter — გასახსნელად · Esc — გასაუქმებლად',
    hint: 'Ctrl+L მისამართის ზოლი · Ctrl+H სუფთა რეჟიმი · F11 სრული ეკრანი',
    pureOn: 'სუფთა რეჟიმი: ჩართ.',
    pureOff: 'სუფთა რეჟიმი: გამორთ. (დათვალიერება / ძებნა / შესვლა)',
    exitPure: 'სუფთა რეჟიმი დაიხურა',
    adblock: 'რეკლამის დაბლოკვა',
    adblockOn: 'რეკლამის დაბლოკვა: ჩართ.',
    adblockOff: 'რეკლამის დაბლოკვა: გამორთ.',
    closeOnEnd: 'დახურვა ვიდეოს დასრულებისას',
    closeOnEndOn: 'დასრულებისას დახურვა: ჩართ.',
    closeOnEndOff: 'დასრულებისას დახურვა: გამორთ.',
    closeOnEndTitle: 'დახურვა ვიდეოს დასრულებისას',
    volTitle: 'ხმა (დააჭირეთ ჩასახშობად / ჩასართავად)',
    clipTitle: 'დროის ფрагმენტი (A-დან B-მდე, შემდეგ პაუზა/დახურვა)',
    clipFrom: 'დან',
    clipTo: 'მდე',
    clipThen: 'შემდეგ',
    clipPause: 'პაუზა',
    clipClose: 'აპის დახურვა',
    clipGo: 'დაწყება',
    clipClear: 'გასუფთავება',
    clipSet: 'დროის ფрагმენტი დაყენებულია',
    clipCleared: 'დროის ფრაგმენტი გასუფთავდა',
    clipInvalid: 'დროის არასწორი ფორმატი (წთ:წმ ან წამები)',
    clipDonePause: 'დასრულების დრომდე მივედით, პაუზა',
    pureTitle: 'სუფთა რეჟიმის გადართვა (Ctrl+H)',
    fitTitle: 'სურათის შევსების რეჟიმი',
    fitContain: 'სურათი: პროპორციის შენარჩუნება (ზოლებით)',
    fitCover: 'სურათი: შევსება ჭრით',
    fitFill: 'სურათი: გაჭიმვა შესავსებად',
    guideOpen: '📖 სახელმძღვანელოს გახსნა',
    guideTitle: 'კეთილი იყოს თქვენი მობრძანება — YouTube Pure Player',
    guideBtn: 'გასაგებია, დაწყება',
    guideBody: [
      '[Ctrl + L] პარამეტრების პანელის გახსნა: ჩასვით YouTube ბმული / ვიდეოს ID / საძიებო სიტყვა, აირჩიეთ ინტერფეისის ენა, ხმის შეყვანის/გამოყვანის მოწყობილობები და რეკლამის დაბლოკვის ჩამრთველი.',
      '[Ctrl + H] „სუფთა რეჟიმის“ გადართვა: რჩება მხოლოდ ვიდეო, ყველა ღილაკი და ტექსტი იმალება (მოსახერხებელია ეკრანის გაზიარებისას YouTube-ის დაუმალავად).',
      '[გადაიტანეთ მაუსი ზედა მარჯვენა კუთხეში] გამოჩნდება დამალული ღილაკები: 🎬 სუფთა რეჟიმი · ⛶ შევსება · ⚙ პარამეტრები · — ჩაკეცვა · ▢ გაშლა · ✕ დახურვა.',
      '[ავტო-მორგება] ვიდეოს გახსნა ჩართავს სუფთა რეჟიმს და მოარგებს ფანჯარას ვიდეოს პროპორციას; ზომის შეცვლისას სურათი მასშტაბირდება ზოლებისა და ჭრის გარეშე.',
      '[F11] სრული ეკრანი ჩა/გამორთვა; [Esc] სუფთა რეჟიმიდან გასვლა.',
      '[რეკლამის დაბლოკვა] ნაგულისხმევად ჩართულია (ბანერები + ვიდეორეკლამის ავტო-გამოტოვება); შეგიძლიათ გამორთოთ პარამეტრებში.',
      '[ავტო-შენახვა] თქვენი პარამეტრები, ენა, ფანჯრის ზომა და მდებარეობა ავტომატურად ინახება და აღდგება შემდეგ ჯერზე.',
    ],
  },
  hy: {
    language: 'Լեզու (հավելված + YouTube)',
    out: 'Ելքային սարք (ձայն)',
    in: 'Մուտքային սարք (խոսափող)',
    ph: 'Տեղադրեք YouTube հղումը / տեսանյութի ID / որոնում, Enter՝ բացելու · Esc՝ չեղարկելու',
    hint: 'Ctrl+L հասցեագոտի · Ctrl+H մաքուր ռեժիմ · F11 լիէկրան',
    pureOn: 'Մաքուր ռեժիմ՝ ՄԻԱՑ.',
    pureOff: 'Մաքուր ռեժիմ՝ ԱՆՋ. (դիտել / որոնել / մուտք)',
    exitPure: 'Ելք մաքուր ռեժիմից',
    adblock: 'Գովազդի արգելափակում',
    adblockOn: 'Գովազդի արգելափակում՝ ՄԻԱՑ.',
    adblockOff: 'Գովազդի արգելափակում՝ ԱՆՋ.',
    closeOnEnd: 'Փակել հավելվածը տեսանյութից հետո',
    closeOnEndOn: 'Ավարտից հետո փակում՝ ՄԻԱՑ.',
    closeOnEndOff: 'Ավարտից հետո փակում՝ ԱՆՋ.',
    closeOnEndTitle: 'Փակել հավելվածը տեսանյութից հետո',
    volTitle: 'Ձայն (սեղմեք խլացնելու / վերականգնելու համար)',
    clipTitle: 'Ժամանակային հատված (A-ից B, ապա դադար/փակում)',
    clipFrom: 'Սկսած',
    clipTo: 'Մինչև',
    clipThen: 'Ապա',
    clipPause: 'Դադար',
    clipClose: 'Փակել հավելվածը',
    clipGo: 'Սկսել',
    clipClear: 'Մաքրել',
    clipSet: 'Ժամանակային հատվածը սահմանված է',
    clipCleared: 'Ժամանակային հատվածը մաքրված է',
    clipInvalid: 'Անվավեր ժամանակի ձևաչափ (րոպե:վայրկյան կամ վայրկյան)',
    clipDonePause: 'Հասել է ավարտի ժամանակին, դադար',
    pureTitle: 'Փոխարկել մաքուր ռեժիմը (Ctrl+H)',
    fitTitle: 'Պատկերի լցման ռեժիմ',
    fitContain: 'Պատկեր՝ պահպանել համամասնությունը (շերտերով)',
    fitCover: 'Պատկեր՝ լցնել կտրումով',
    fitFill: 'Պատկեր՝ ձգել ամբողջ էկրանով',
    guideOpen: '📖 Բացել ուղեցույցը',
    guideTitle: 'Բարի գալուստ YouTube Pure Player',
    guideBtn: 'Հասկանալի է, սկսել',
    guideBody: [
      '[Ctrl + L] Բացել կարգավորումների վահանակը՝ տեղադրեք YouTube հղում / տեսանյութի ID / որոնում, ընտրեք ինտերֆեյսի լեզուն, ձայնի մուտքի/ելքի սարքերը և գովազդի արգելափակման անջատիչը։',
      '[Ctrl + H] Փոխարկել «մաքուր ռեժիմը»՝ մնում է միայն տեսանյութը, բոլոր կոճակներն ու տեքստը թաքնված են (հարմար է էկրանը ցուցադրելիս՝ առանց YouTube-ը բացահայտելու)։',
      '[Մկնիկը տարեք վերևի աջ անկյուն]՝ կհայտնվի թաքնված կոճակների շարք՝ 🎬 Մաքուր ռեժիմ · ⛶ Լցում · ⚙ Կարգավորումներ · — Ծալել · ▢ Մեծացնել · ✕ Փակել։',
      '[Ինքնահարմարում] Տեսանյութ բացելը միացնում է մաքուր ռեժիմը և հարմարեցնում պատուհանը տեսանյութի համամասնությանը. չափը փոխելիս պատկերը մասշտաբվում է առանց շերտերի և կտրման։',
      '[F11] Լիէկրան միաց/անջատ. [Esc] դուրս գալ մաքուր ռեժիմից։',
      '[Գովազդի արգելափակում] Միացված է լռելյայն (ինտերֆեյսի գովազդ + տեսագովազդի ավտոմատ բացթողում). կարելի է անջատել կարգավորումներում։',
      '[Ինքնապահպանում] Ձեր կարգավորումները, լեզուն, պատուհանի չափն ու դիրքը պահվում են ավտոմատ և վերականգնվում հաջորդ անգամ։',
    ],
  },
  mg: {
    language: 'Fiteny (app + YouTube)',
    out: 'Fitaovana famoahana (feo)',
    in: 'Fitaovana fampidirana (mikrôfaonina)',
    ph: 'Apetaho ny rohy YouTube / ID horonan-tsary / fikarohana, Enter hanokafana · Esc hanafoanana',
    hint: 'Ctrl+L anjan’adiresy · Ctrl+H fomba madio · F11 efijery feno',
    pureOn: 'Fomba madio: MISOKATRA',
    pureOff: 'Fomba madio: MIKATONA (mitsidika / mikaroka / miditra)',
    exitPure: 'Niala tamin’ny fomba madio',
    adblock: 'Sakana dokambarotra',
    adblockOn: 'Sakana dokambarotra: MISOKATRA',
    adblockOff: 'Sakana dokambarotra: MIKATONA',
    closeOnEnd: 'Hidio ny app aorian’ny fampisehoana',
    closeOnEndOn: 'Hidio aorian’ny farany: MISOKATRA',
    closeOnEndOff: 'Hidio aorian’ny farany: MIKATONA',
    closeOnEndTitle: 'Hidio ny app aorian’ny fampisehoana',
    volTitle: 'Volume (tsindrio hanampiana / hamerenana feo)',
    clipTitle: 'Ampahany voafetra fotoana (A → B, avy eo miato/hidio)',
    clipFrom: 'Avy amin’ny',
    clipTo: 'Hatramin’ny',
    clipThen: 'Avy eo',
    clipPause: 'Miato',
    clipClose: 'Hidio ny app',
    clipGo: 'Atombohy',
    clipClear: 'Fafao',
    clipSet: 'Ampahany voafetra fotoana voapetraka',
    clipCleared: 'Ampahany voafetra fotoana voafafa',
    clipInvalid: 'Endrika ora diso (mm:ss na segondra)',
    clipDonePause: 'Tonga tamin’ny farany, miato',
    pureTitle: 'Ovay ny fomba madio (Ctrl+H)',
    fitTitle: 'Fomba famenoana sary',
    fitContain: 'Sary: tehirizo ny refy (misy mainty)',
    fitCover: 'Sary: fenoy sy tapaho',
    fitFill: 'Sary: tariho hameno',
    guideOpen: '📖 Sokafy ny torolalana',
    guideTitle: 'Tongasoa eto amin’ny YouTube Pure Player',
    guideBtn: 'Azoko, andao',
    guideBody: [
      '[Ctrl + L] Sokafy ny efitra fanovana: apetaho ny rohy YouTube / ID horonan-tsary / fikarohana, safidio ny fitenin’ny interface, ny fitaovana feo fidirana/fivoahana ary ny mpanindry sakana dokambarotra.',
      '[Ctrl + H] Ovay ny “fomba madio”: ny horonan-tsary ihany no mijanona, miafina ny bokotra sy soratra rehetra (mahasoa rehefa mizara efijery tsy maneho YouTube).',
      '[Afindrao any amin’ny zoro ambony havanana ny totozy] hiseho ny andalana bokotra miafina: 🎬 Fomba madio · ⛶ Fameno · ⚙ Fanovana · — Akelezo · ▢ Lehibe · ✕ Hidio.',
      '[Fampifanarahana] Ny fanokafana horonan-tsary dia mampandeha ny fomba madio sy mampifanaraka ny fikandrana amin’ny refin’ny horonan-tsary; rehefa ovaina ny habe dia mihalehibe ny sary tsy misy mainty na tapaka.',
      '[F11] Efijery feno on/off; [Esc] hiala amin’ny fomba madio.',
      '[Sakana dokambarotra] Misokatra avy hatrany (dokambarotra interface + fandingana dokambarotra horonan-tsary); azo atsahatra ao amin’ny fanovana.',
      '[Fitehirizana mandeha ho azy] Voatahiry mandeha ho azy ny safidinao, ny fiteny, ny habe sy toeran’ny fikandrana, ka averina amin’ny manaraka.',
    ],
  },
};

function currentLang() {
  return localStorage.getItem('ypp-lang') || 'zh';
}

function t(key) {
  const pack = I18N[currentLang()] || I18N.zh;
  return pack[key] || I18N.zh[key] || key;
}

function applyAppLang() {
  const box = document.getElementById('ypp-omnibox');
  if (!box) return;
  box.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  box.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
}

// --------------------------------------------------------------------------
// 提示气泡
// --------------------------------------------------------------------------
let toastTimer = null;
function toast(msg) {
  let el = document.getElementById('ypp-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'ypp-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// --------------------------------------------------------------------------
// 新手指引
// --------------------------------------------------------------------------
function buildGuide() {
  if (document.getElementById('ypp-guide')) return;
  const mask = document.createElement('div');
  mask.id = 'ypp-guide';

  const card = document.createElement('div');
  card.className = 'ypp-guide-card';

  const h = document.createElement('h2');
  h.textContent = t('guideTitle');
  card.appendChild(h);

  const ul = document.createElement('ul');
  const body = t('guideBody');
  (Array.isArray(body) ? body : []).forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    ul.appendChild(li);
  });
  card.appendChild(ul);

  const btn = document.createElement('button');
  btn.className = 'ypp-guide-btn';
  btn.textContent = t('guideBtn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    hideGuide();
  });
  card.appendChild(btn);

  // 点击遮罩空白处也可关闭
  mask.addEventListener('click', (e) => {
    if (e.target === mask) hideGuide();
  });

  mask.appendChild(card);
  document.body.appendChild(mask);
}

function showGuide() {
  buildGuide();
  // 重新填充文案（语言可能已切换）
  const card = document.querySelector('#ypp-guide .ypp-guide-card');
  if (card) {
    const h = card.querySelector('h2');
    if (h) h.textContent = t('guideTitle');
    const ul = card.querySelector('ul');
    if (ul) {
      ul.textContent = '';
      const body = t('guideBody');
      (Array.isArray(body) ? body : []).forEach((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        ul.appendChild(li);
      });
    }
    const btn = card.querySelector('.ypp-guide-btn');
    if (btn) btn.textContent = t('guideBtn');
  }
  const mask = document.getElementById('ypp-guide');
  if (mask) mask.classList.add('show');
}

function hideGuide() {
  const mask = document.getElementById('ypp-guide');
  if (mask) mask.classList.remove('show');
  localStorage.setItem('ypp-guide-seen', '1');
}

// --------------------------------------------------------------------------
// 地址框：直接输入链接 / 视频ID / 搜索词 打开
// --------------------------------------------------------------------------
function normalizeToUrl(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^[\w-]{11}$/.test(raw)) return 'https://www.youtube.com/watch?v=' + raw;
  if (/(^|\.)youtube\.com|youtu\.be/i.test(raw)) {
    return 'https://' + raw.replace(/^\/+/, '');
  }
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(raw);
}

function buildOmnibox() {
  if (document.getElementById('ypp-omnibox')) return;

  const box = document.createElement('div');
  box.id = 'ypp-omnibox';

  const panel = document.createElement('div');
  panel.id = 'ypp-panel';

  const input = document.createElement('input');
  input.id = 'ypp-url';
  input.type = 'text';
  input.dataset.i18nPh = 'ph';
  input.placeholder = t('ph');

  const makeField = (i18nKey, selectId) => {
    const label = document.createElement('label');
    const span = document.createElement('span');
    span.dataset.i18n = i18nKey;
    span.textContent = t(i18nKey);
    const select = document.createElement('select');
    select.id = selectId;
    label.appendChild(span);
    label.appendChild(select);
    return label;
  };

  // 语言选择行（一次切换：界面文字 + YouTube 页面语言）
  const langs = document.createElement('div');
  langs.className = 'ypp-devices';
  langs.appendChild(makeField('language', 'ypp-lang-sel'));

  // 设备选择行
  const devices = document.createElement('div');
  devices.className = 'ypp-devices';
  devices.appendChild(makeField('out', 'ypp-out'));
  devices.appendChild(makeField('in', 'ypp-in'));

  // 去广告开关行
  const adRow = document.createElement('label');
  adRow.className = 'ypp-toggle';
  const adChk = document.createElement('input');
  adChk.type = 'checkbox';
  adChk.id = 'ypp-adblock-chk';
  adChk.checked = adblockEnabled();
  const adSpan = document.createElement('span');
  adSpan.dataset.i18n = 'adblock';
  adSpan.textContent = t('adblock');
  adRow.appendChild(adChk);
  adRow.appendChild(adSpan);

  // 播放完后关闭软件
  const endRow = document.createElement('label');
  endRow.className = 'ypp-toggle';
  const endChk = document.createElement('input');
  endChk.type = 'checkbox';
  endChk.id = 'ypp-close-on-end-chk';
  endChk.checked = closeOnEndEnabled();
  const endSpan = document.createElement('span');
  endSpan.dataset.i18n = 'closeOnEnd';
  endSpan.textContent = t('closeOnEnd');
  endRow.appendChild(endChk);
  endRow.appendChild(endSpan);

  panel.appendChild(input);
  panel.appendChild(langs);
  panel.appendChild(devices);
  panel.appendChild(adRow);
  panel.appendChild(endRow);
  box.appendChild(panel);
  document.body.appendChild(box);

  adChk.addEventListener('change', (e) => {
    localStorage.setItem('ypp-adblock', e.target.checked ? '1' : '0');
    applyAdblock();
    toast(e.target.checked ? t('adblockOn') : t('adblockOff'));
  });
  endChk.addEventListener('change', (e) => {
    setCloseOnEnd(!!e.target.checked);
    toast(e.target.checked ? t('closeOnEndOn') : t('closeOnEndOff'));
  });

  // 定时片段播放：从 A 到 B，到点后暂停 / 关闭软件
  const clip = document.createElement('div');
  clip.className = 'ypp-clip';
  const clipTitle = document.createElement('span');
  clipTitle.className = 'ypp-clip-title';
  clipTitle.dataset.i18n = 'clipTitle';
  clipTitle.textContent = t('clipTitle');
  clip.appendChild(clipTitle);

  const clipRow = document.createElement('div');
  clipRow.className = 'ypp-clip-row';

  const fromLab = document.createElement('span');
  fromLab.dataset.i18n = 'clipFrom';
  fromLab.textContent = t('clipFrom');
  const fromIn = document.createElement('input');
  fromIn.type = 'text';
  fromIn.id = 'ypp-clip-from';
  fromIn.placeholder = '00:00';
  fromIn.value = localStorage.getItem('ypp-clip-from') || '';

  const toLab = document.createElement('span');
  toLab.dataset.i18n = 'clipTo';
  toLab.textContent = t('clipTo');
  const toIn = document.createElement('input');
  toIn.type = 'text';
  toIn.id = 'ypp-clip-to';
  toIn.placeholder = '00:00';
  toIn.value = localStorage.getItem('ypp-clip-to') || '';

  const thenLab = document.createElement('span');
  thenLab.dataset.i18n = 'clipThen';
  thenLab.textContent = t('clipThen');
  const actSel = document.createElement('select');
  actSel.id = 'ypp-clip-act';
  const optPause = document.createElement('option');
  optPause.value = 'pause';
  optPause.dataset.i18n = 'clipPause';
  optPause.textContent = t('clipPause');
  const optClose = document.createElement('option');
  optClose.value = 'close';
  optClose.dataset.i18n = 'clipClose';
  optClose.textContent = t('clipClose');
  actSel.appendChild(optPause);
  actSel.appendChild(optClose);
  actSel.value = localStorage.getItem('ypp-clip-act') || 'pause';

  const clipGo = document.createElement('button');
  clipGo.className = 'ypp-clip-go';
  clipGo.dataset.i18n = 'clipGo';
  clipGo.textContent = t('clipGo');
  const clipClr = document.createElement('button');
  clipClr.dataset.i18n = 'clipClear';
  clipClr.textContent = t('clipClear');

  clipRow.appendChild(fromLab);
  clipRow.appendChild(fromIn);
  clipRow.appendChild(toLab);
  clipRow.appendChild(toIn);
  clipRow.appendChild(thenLab);
  clipRow.appendChild(actSel);
  clipRow.appendChild(clipGo);
  clipRow.appendChild(clipClr);
  clip.appendChild(clipRow);
  panel.appendChild(clip);

  [fromIn, toIn].forEach((inp) =>
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') clipGo.click();
      else if (e.key === 'Escape') hideOmnibox();
    })
  );
  clipGo.addEventListener('click', (e) => {
    e.stopPropagation();
    const fromSec = parseClipTime(fromIn.value);
    const toSec = parseClipTime(toIn.value);
    if (Number.isNaN(fromSec) || Number.isNaN(toSec)) {
      toast(t('clipInvalid'));
      return;
    }
    localStorage.setItem('ypp-clip-from', fromIn.value.trim());
    localStorage.setItem('ypp-clip-to', toIn.value.trim());
    localStorage.setItem('ypp-clip-act', actSel.value);
    hideOmnibox();
    startClip(fromSec, toSec, actSel.value);
  });
  clipClr.addEventListener('click', (e) => {
    e.stopPropagation();
    clearClip();
    toast(t('clipCleared'));
  });

  // 新手指引入口
  const guideLink = document.createElement('button');
  guideLink.className = 'ypp-guide-link';
  guideLink.dataset.i18n = 'guideOpen';
  guideLink.textContent = t('guideOpen');
  guideLink.addEventListener('click', (e) => {
    e.stopPropagation();
    hideOmnibox();
    showGuide();
  });
  panel.appendChild(guideLink);

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const url = normalizeToUrl(input.value);
      hideOmnibox();
      if (url) location.assign(url);
    } else if (e.key === 'Escape') {
      hideOmnibox();
    }
  });

  // 填充语言下拉
  fillLangSelect(box.querySelector('#ypp-lang-sel'), localStorage.getItem('ypp-lang') || 'zh');

  box.querySelector('#ypp-lang-sel').addEventListener('change', (e) => {
    const lang = e.target.value;
    // 同时切换界面语言与 YouTube 页面语言
    localStorage.setItem('ypp-lang', lang);
    localStorage.setItem('ypp-ytlang', lang);
    applyAppLang(); // 界面文字立即变化
    ipcRenderer.send('set-yt-lang', lang); // YouTube 语言（会刷新页面）
  });

  box.querySelector('#ypp-out').addEventListener('change', (e) => {
    localStorage.setItem('ypp-out', e.target.value);
    applySink();
  });
  box.querySelector('#ypp-in').addEventListener('change', (e) => {
    localStorage.setItem('ypp-in', e.target.value);
  });
}

function fillLangSelect(sel, savedId) {
  if (!sel) return;
  sel.textContent = '';
  LANGS.forEach(([value, label]) => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    sel.appendChild(opt);
  });
  if (savedId) sel.value = savedId;
}

function showOmnibox() {
  buildOmnibox();
  const box = document.getElementById('ypp-omnibox');
  const input = box.querySelector('#ypp-url');
  box.classList.add('show');
  document.documentElement.classList.add('ypp-omni-open');
  input.value = '';
  input.focus();
  populateDevices();
}

function hideOmnibox() {
  const box = document.getElementById('ypp-omnibox');
  if (box) {
    box.classList.remove('show');
    document.documentElement.classList.remove('ypp-omni-open');
    const input = box.querySelector('#ypp-url');
    if (input) input.blur();
  }
}

// --------------------------------------------------------------------------
// 音频输入 / 输出设备选择
// --------------------------------------------------------------------------
async function ensureDeviceLabels() {
  try {
    let devs = await navigator.mediaDevices.enumerateDevices();
    if (devs.some((d) => d.label)) return devs;
    // 没有标签时，临时获取一次麦克风权限以解锁设备名称，随后立即关闭
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch (_) {}
    return await navigator.mediaDevices.enumerateDevices();
  } catch (_) {
    return [];
  }
}

function fillSelect(sel, list, savedId, fallbackPrefix) {
  if (!sel) return;
  sel.textContent = '';
  list.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || fallbackPrefix + ' ' + (i + 1);
    sel.appendChild(opt);
  });
  if (savedId && list.some((d) => d.deviceId === savedId)) {
    sel.value = savedId;
  }
}

async function populateDevices() {
  const devs = await ensureDeviceLabels();
  fillSelect(
    document.getElementById('ypp-out'),
    devs.filter((d) => d.kind === 'audiooutput'),
    localStorage.getItem('ypp-out'),
    '输出设备'
  );
  fillSelect(
    document.getElementById('ypp-in'),
    devs.filter((d) => d.kind === 'audioinput'),
    localStorage.getItem('ypp-in'),
    '麦克风'
  );
}

// 把视频声音切换到所选输出设备
function applySink() {
  const id = localStorage.getItem('ypp-out');
  if (!id) return;
  document.querySelectorAll('video').forEach((v) => {
    if (typeof v.setSinkId === 'function' && v.sinkId !== id) {
      v.setSinkId(id).catch(() => {});
    }
  });
}

function toggleOmnibox() {
  const box = document.getElementById('ypp-omnibox');
  if (box && box.classList.contains('show')) {
    hideOmnibox();
  } else {
    showOmnibox();
  }
}

// --------------------------------------------------------------------------
// 视频广告：自动跳过贴片广告（片头/中插）
//   YouTube 的贴片广告与正片同源，无法靠纯网络拦截只屏蔽广告，
//   因此在页面里检测“正在播放广告”，自动点击“跳过”并把广告快进到结尾。
// --------------------------------------------------------------------------
function adblockEnabled() {
  return localStorage.getItem('ypp-adblock') !== '0'; // 默认开启
}

// 应用“去广告”开关：切换页面 CSS 类，并通知主进程开关网络层拦截
function applyAdblock() {
  const on = adblockEnabled();
  document.documentElement.classList.toggle('ypp-adblock', on);
  ipcRenderer.send('set-adblock', on);
}

// --------------------------------------------------------------------------
// 播放完后关闭软件（设置面板开关 / 右上角 ⏹ 按钮，状态会记住）
// --------------------------------------------------------------------------
function closeOnEndEnabled() {
  return localStorage.getItem('ypp-close-on-end') === '1';
}

function setCloseOnEnd(on) {
  localStorage.setItem('ypp-close-on-end', on ? '1' : '0');
  const btn = document.getElementById('ypp-close-on-end-btn');
  if (btn) {
    btn.classList.toggle('ypp-on', on);
    btn.title = t('closeOnEndTitle');
  }
  const chk = document.getElementById('ypp-close-on-end-chk');
  if (chk) chk.checked = on;
}

let closeOnEndStarted = false;
function setupCloseOnEnd() {
  if (closeOnEndStarted) return;
  closeOnEndStarted = true;
  document.addEventListener(
    'ended',
    (e) => {
      if (!closeOnEndEnabled()) return;
      const v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      // 广告结束不要关软件，只在正片播完时关闭
      const player = v.closest('.html5-video-player');
      if (
        player &&
        (player.classList.contains('ad-showing') ||
          player.classList.contains('ad-interrupting'))
      ) {
        return;
      }
      ipcRenderer.send('win-close');
    },
    true
  );
}

let adSkipperStarted = false;
function setupAdSkipper() {
  if (adSkipperStarted) return;
  adSkipperStarted = true;

  let adActive = false; // 标记是我们因广告临时改了静音/倍速，结束后好还原
  let observed = null; // 已挂监听的播放器元素

  const isAdShowing = (player) =>
    !!player &&
    (player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting'));

  const handle = () => {
    try {
      const player = document.querySelector('.html5-video-player');
      const video = player ? player.querySelector('video') : null;

      // 关闭去广告时：还原我们改过的倍速/静音后退出
      if (!adblockEnabled()) {
        if (adActive && video) {
          video.playbackRate = 1;
          video.muted = false;
        }
        adActive = false;
        return;
      }

      if (isAdShowing(player)) {
        // 第一时间静音，尽量不让广告发出声音
        if (video) {
          video.muted = true;
          video.playbackRate = 16;
          if (isFinite(video.duration) && video.duration > 0) {
            video.currentTime = video.duration; // 直接快进到广告结尾
          }
          adActive = true;
        }
        // 点击各种“跳过广告”按钮
        document
          .querySelectorAll(
            '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button, .ytp-ad-survey-questions button'
          )
          .forEach((b) => b.click());
      } else {
        // 关闭播放器内悬浮广告
        document
          .querySelectorAll('.ytp-ad-overlay-close-button, .ytp-ad-overlay-close-container')
          .forEach((b) => b.click());
        // 广告结束：还原倍速/静音，避免正片被加速或静音
        if (adActive && video) {
          video.playbackRate = 1;
          video.muted = false;
          adActive = false;
        }
      }

      // 给播放器挂一个 class 变化监听：广告类一出现就立刻处理（毫秒级）
      if (player && observed !== player) {
        observed = player;
        new MutationObserver(handle).observe(player, {
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    } catch (_) {}
  };

  // 捕获所有媒体的 play 事件：广告一开始播放就立刻静音/跳过，消除“1 秒广告声”
  document.addEventListener(
    'play',
    (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        const player = e.target.closest('.html5-video-player');
        if (adblockEnabled() && isAdShowing(player)) {
          e.target.muted = true; // 同步静音，先于音频输出
        }
        handle();
      }
    },
    true
  );

  setInterval(handle, 100);
  handle();
}

// --------------------------------------------------------------------------
// 纯净模式逻辑
// --------------------------------------------------------------------------
function isWatchPage() {
  return location.pathname === '/watch';
}

function isShortsPage() {
  return location.pathname.startsWith('/shorts');
}

function shouldBePure() {
  if (pureForced !== null) return pureForced;
  return isWatchPage() || isShortsPage(); // 默认：视频页 / Shorts 自动纯净
}

function bumpResize() {
  // 让 YouTube 播放器重新计算尺寸，避免出现黑边
  [50, 200, 500, 1000].forEach((d) =>
    setTimeout(() => window.dispatchEvent(new Event('resize')), d)
  );
}

// 把当前视频的宽高比上报给主进程：纯净模式 + 普通视频页时锁定窗口比例，
// 这样缩放窗口画面会等比缩放，既不裁切也不留黑边。其它情况解除锁定。
let lastAspectSent = -1;
function reportAspect() {
  let ratio = 0;
  if (shouldBePure() && isWatchPage()) {
    const player = document.querySelector('#movie_player');
    const v = (player || document).querySelector('video');
    if (v && v.videoWidth > 0 && v.videoHeight > 0) {
      ratio = v.videoWidth / v.videoHeight;
    }
  }
  const r = ratio ? Math.round(ratio * 1000) / 1000 : 0;
  if (r !== lastAspectSent) {
    lastAspectSent = r;
    ipcRenderer.send('set-aspect', r);
  }
}

function apply() {
  applySink();
  applyFit();
  const html = document.documentElement;
  // 标记当前页面类型，供 CSS 区分 watch / shorts 的不同布局
  html.classList.toggle('ypp-watch', isWatchPage());
  html.classList.toggle('ypp-shorts', isShortsPage());
  reportAspect();
  if (shouldBePure()) {
    if (!html.classList.contains('ypp-pure')) {
      html.classList.add('ypp-pure');
      bumpResize();
    }
  } else {
    html.classList.remove('ypp-pure');
    bumpResize();
  }
}

// 每次切换页面时，重置为“自动”，以便新页面按规则处理
function onNavigate() {
  pureForced = null;
  injectStyle();
  apply();
  // 切换视频时取消上一个定时片段，避免影响新视频
  clearClip();
  // 切换到新视频后，把用户设置的音量重新应用一次
  const v = savedVolume();
  if (v != null) setTimeout(() => { setVolume(v); syncVolUI(v); }, 600);
}

// --------------------------------------------------------------------------
// IPC（来自主进程的快捷键）
// --------------------------------------------------------------------------
function togglePure() {
  pureForced = !shouldBePure();
  apply();
  toast(shouldBePure() ? t('pureOn') : t('pureOff'));
}

ipcRenderer.on('toggle-pure', () => {
  togglePure();
});

ipcRenderer.on('show-omnibox', () => {
  toggleOmnibox();
});

ipcRenderer.on('exit-pure', () => {
  if (shouldBePure()) {
    pureForced = false;
    apply();
    toast(t('exitPure'));
  }
});

// --------------------------------------------------------------------------
// 启动 & 监听 YouTube 单页应用导航
// --------------------------------------------------------------------------
injectStyle();

document.addEventListener('DOMContentLoaded', () => {
  // 一次性迁移：旧版“填满裁剪”在缩放窗口时会裁切画面，统一恢复为“保留比例”。
  // 现在窗口会自动锁定视频比例，保留比例即可铺满又不裁切。
  if (!localStorage.getItem('ypp-fit-mig')) {
    localStorage.setItem('ypp-fit', 'contain');
    localStorage.setItem('ypp-fit-mig', '1');
  }
  injectStyle();
  ensureDragBar();
  ensureWinControls();
  ensureVolControls();
  bindCloseHover();
  bindVolHover();
  bindOutsideClose();
  applyAdblock();
  setupAdSkipper();
  setupCloseOnEnd();
  apply();
  // 持续上报视频比例（不同视频比例不同 / 播放器可能被重建）
  setInterval(reportAspect, 700);
  // 启动后尝试恢复上次音量（播放器就绪前会重试）
  const volTimer = setInterval(() => {
    if (!volRestored) restoreVolume();
    else clearInterval(volTimer);
  }, 500);

  // 首次使用：自动弹出新手指引；之后只在首页弹出输入框
  if (!localStorage.getItem('ypp-guide-seen')) {
    setTimeout(showGuide, 800);
  } else {
    if (location.pathname === '/' || location.pathname === '') {
      setTimeout(showOmnibox, 600);
    }
  }
});

// YouTube SPA 导航事件
window.addEventListener('yt-navigate-finish', onNavigate);
window.addEventListener('yt-page-data-updated', apply);
window.addEventListener('popstate', onNavigate);

// 兜底：DOM 变化时确保样式生效
const mo = new MutationObserver(() => {
  if (!document.getElementById('ypp-style')) injectStyle();
  ensureDragBar();
  ensureWinControls();
  ensureVolControls();
  apply();
});
document.addEventListener('DOMContentLoaded', () => {
  mo.observe(document.documentElement, { childList: true, subtree: false });
});
