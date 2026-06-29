const { app, BrowserWindow, session, ipcMain, Menu, screen } = require('electron');
const path = require('path');

// 广告屏蔽器在向部分广告/沙箱 iframe 注入隐藏脚本时会偶发被拒，
// 属于正常现象，这里静默处理，避免控制台噪音。
process.on('unhandledRejection', () => {});

// 广告屏蔽器会按 iframe 数量添加监听器，适当提高上限避免警告。
require('events').EventEmitter.defaultMaxListeners = 50;

// 持久化登录使用的 partition（cookie / 登录状态会保存在本地，下次打开仍然登录）
const PARTITION = 'persist:youtube';

let mainWindow = null;

// 去广告开关（网络层）：默认开启，由渲染进程的设置面板同步
let adblockEnabled = true;

// ---------------------------------------------------------------------------
// 应用级设置持久化（窗口大小/位置、YouTube 语言等），存到 userData/app-settings.json
// 关闭后再打开会自动恢复。
// ---------------------------------------------------------------------------
const fs = require('fs');
let appSettings = {};
function settingsFile() {
  return path.join(app.getPath('userData'), 'app-settings.json');
}
function loadAppSettings() {
  try {
    appSettings = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) || {};
  } catch (_) {
    appSettings = {};
  }
}
function saveAppSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(appSettings));
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// 广告屏蔽：使用 Ghostery 广告/追踪过滤列表，在网络层拦截广告请求
// ---------------------------------------------------------------------------
async function setupAdBlocker(ses) {
  try {
    const {
      ElectronBlocker,
      adsAndTrackingLists,
      fromElectronDetails,
    } = require('@ghostery/adblocker-electron');
    // Node 18+ / Electron 自带全局 fetch
    const fetchFn = global.fetch ? global.fetch.bind(global) : require('cross-fetch');

    // 只加载网络过滤规则，不加载任何需要注入脚本/样式的部分
    const engine = await ElectronBlocker.fromLists(
      fetchFn,
      adsAndTrackingLists,
      {
        loadNetworkFilters: true,
        loadCSPFilters: false,
        loadCosmeticFilters: false,
        loadGenericCosmeticsFilters: false,
        enableHtmlFiltering: false,
        enableMutationObserver: false,
        enablePushInjectionsOnNavigationEvents: false,
      },
      {
        path: path.join(app.getPath('userData'), 'adblocker-engine.bin'),
        read: require('fs').promises.readFile,
        write: require('fs').promises.writeFile,
      }
    );

    // 放行 YouTube / Google 视频自身的第一方请求，避免误杀核心脚本与遥测端点
    try {
      await engine.updateFromDiff({
        added: [
          '@@||youtube.com^$~third-party',
          '@@||googlevideo.com^$~third-party',
          '@@||ytimg.com^$~third-party',
          '@@||ggpht.com^$~third-party',
        ],
      });
    } catch (e) {
      console.error('[AdBlocker] 白名单设置失败：', e);
    }

    // 关键：自己挂 webRequest，只用引擎判断“是否拦截”，绝不向页面注入任何脚本/样式，
    // 从而不会破坏 YouTube 的单页导航。
    ses.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
      try {
        if (!adblockEnabled) return callback({}); // 关闭去广告：放行所有请求
        const request = fromElectronDetails(details);
        if (request === null) return callback({});
        const { match } = engine.match(request);
        return callback({ cancel: !!match });
      } catch (_) {
        return callback({});
      }
    });

    console.log('[AdBlocker] 已启用（纯网络层，无注入）');
  } catch (err) {
    console.error('[AdBlocker] 启动失败：', err);
  }
}

function createWindow() {
  const ses = session.fromPartition(PARTITION);

  // 恢复上次窗口大小/位置（位置若已不在任何显示器内则忽略，避免开到屏幕外）
  const b = appSettings.bounds || {};
  const posVisible =
    typeof b.x === 'number' &&
    typeof b.y === 'number' &&
    screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return (
        b.x < wa.x + wa.width &&
        b.x + (b.width || 0) > wa.x &&
        b.y < wa.y + wa.height &&
        b.y + (b.height || 0) > wa.y
      );
    });
  mainWindow = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 800,
    x: posVisible ? b.x : undefined,
    y: posVisible ? b.y : undefined,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    frame: false, // 无标题栏：共享窗口时不会暴露 “YouTube” 文字和图标
    icon: path.join(__dirname, 'build', 'icon.ico'),
    title: 'YouTube Pure Player',
    webPreferences: {
      partition: PARTITION,
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (appSettings.maximized) mainWindow.maximize();

  // 记住窗口大小/位置（防抖保存）
  const persistBounds = () => {
    clearTimeout(persistBounds._t);
    persistBounds._t = setTimeout(() => {
      if (!mainWindow) return;
      if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
        appSettings.bounds = mainWindow.getBounds();
      }
      appSettings.maximized = mainWindow.isMaximized();
      saveAppSettings();
    }, 400);
  };
  mainWindow.on('resize', persistBounds);
  mainWindow.on('move', persistBounds);

  // 去掉系统菜单栏，界面更干净
  Menu.setApplicationMenu(null);

  // 阻止页面标题修改窗口/任务栏标题，避免显示 “YouTube”
  mainWindow.on('page-title-updated', (e) => e.preventDefault());

  setupAdBlocker(ses);

  // 允许读取音视频设备列表 / 选择设备（用于切换输入输出设备）
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(true));
  ses.setPermissionCheckHandler(() => true);
  if (ses.setDevicePermissionHandler) {
    ses.setDevicePermissionHandler(() => true);
  }

  // 启动时若有上次保存的 YouTube 语言，先写好 cookie 再加载（保证内容语言恢复）
  (async () => {
    if (appSettings.ytLang) {
      try {
        await applyYtLang(appSettings.ytLang);
      } catch (_) {}
    }
    mainWindow.loadURL('https://www.youtube.com');
  })();

  // -------------------------------------------------------------------------
  // 快捷键
  //   Ctrl+H  切换“纯净模式”（只看视频画面 / 浏览模式）
  //   Esc     退出纯净模式
  //   F11     全屏 / 退出全屏
  //   Ctrl+R  刷新
  //   Alt+←   后退       Alt+→  前进
  // -------------------------------------------------------------------------
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const ctrl = input.control || input.meta;

    if (ctrl && input.key.toLowerCase() === 'h') {
      mainWindow.webContents.send('toggle-pure');
      event.preventDefault();
    } else if (ctrl && input.key.toLowerCase() === 'l') {
      mainWindow.webContents.send('show-omnibox');
      event.preventDefault();
    } else if (input.key === 'Escape') {
      mainWindow.webContents.send('exit-pure');
    } else if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    } else if (ctrl && input.key.toLowerCase() === 'r') {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (ctrl && input.key.toLowerCase() === 'q') {
      mainWindow.close();
      event.preventDefault();
    } else if (ctrl && input.key.toLowerCase() === 'm') {
      mainWindow.minimize();
      event.preventDefault();
    } else if (input.alt && input.key === 'ArrowLeft') {
      if (mainWindow.webContents.canGoBack()) mainWindow.webContents.goBack();
      event.preventDefault();
    } else if (input.alt && input.key === 'ArrowRight') {
      if (mainWindow.webContents.canGoForward()) mainWindow.webContents.goForward();
      event.preventDefault();
    }
  });

  // 让 YouTube 弹出的窗口（如登录）在当前窗口内导航，而不是新开窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // 谷歌登录有时需要弹窗，允许其打开
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 600,
          height: 700,
          autoHideMenuBar: true,
          webPreferences: { partition: PARTITION },
        },
      };
    }
    mainWindow.loadURL(url);
    return { action: 'deny' };
  });

  // 关闭前同步保存一次窗口状态
  mainWindow.on('close', () => {
    if (!mainWindow) return;
    if (!mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      appSettings.bounds = mainWindow.getBounds();
    }
    appSettings.maximized = mainWindow.isMaximized();
    saveAppSettings();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 来自地址框里窗口控制按钮的指令
ipcMain.on('win-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('win-maximize-toggle', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win-close', () => mainWindow && mainWindow.close());

// 去广告开关（来自设置面板）：控制网络层拦截是否生效
ipcMain.on('set-adblock', (_e, enabled) => {
  adblockEnabled = !!enabled;
});

// 把窗口尺寸调成给定宽高比（保持当前宽度调整高度），并限制在屏幕可用区域内。
// 最大化 / 全屏时不调整。
function fitWindowToAspect(ratio) {
  if (!mainWindow || mainWindow.isMaximized() || mainWindow.isFullScreen()) return;
  const b = mainWindow.getBounds();
  let newW = b.width;
  let newH = Math.round(newW / ratio);
  const disp = screen.getDisplayMatching(b);
  const wa = disp.workArea; // 含 x/y/width/height
  if (newH > wa.height) {
    newH = wa.height;
    newW = Math.round(newH * ratio);
  }
  if (newW > wa.width) {
    newW = wa.width;
    newH = Math.round(newW / ratio);
  }
  // 保持窗口当前位置（仅在超出屏幕时夹回），不强制居中，尊重用户摆放
  let x = b.x;
  let y = b.y;
  if (x + newW > wa.x + wa.width) x = wa.x + wa.width - newW;
  if (y + newH > wa.y + wa.height) y = wa.y + wa.height - newH;
  if (x < wa.x) x = wa.x;
  if (y < wa.y) y = wa.y;
  mainWindow.setBounds({ x, y, width: newW, height: newH });
}

// 纯净模式下把窗口锁定为视频的宽高比：缩放窗口时画面等比缩放，不留黑边也不裁切。
// 同时在进入新视频（比例变化）时，自动把窗口尺寸调成该视频比例。
// ratio<=0 表示解除锁定（恢复自由缩放）。
ipcMain.on('set-aspect', (_e, ratio) => {
  if (!mainWindow) return;
  try {
    if (ratio > 0) {
      mainWindow.setAspectRatio(ratio);
      fitWindowToAspect(ratio);
    } else {
      mainWindow.setAspectRatio(0);
    }
  } catch (_) {}
});

// 切换 YouTube 显示语言：设置 hl 偏好 + Accept-Language，然后刷新
const YT_HL = {
  zh: 'zh-CN',
  en: 'en',
  ru: 'ru',
  fr: 'fr',
  es: 'es',
  uk: 'uk',
  ka: 'ka',
  hy: 'hy',
  mg: 'mg',
};
const YT_ACCEPT = {
  zh: 'zh-CN,zh;q=0.9',
  en: 'en-US,en;q=0.9',
  ru: 'ru,en;q=0.8',
  fr: 'fr-FR,fr;q=0.9',
  es: 'es-ES,es;q=0.9,en;q=0.6',
  uk: 'uk,en;q=0.7',
  ka: 'ka,en;q=0.7',
  hy: 'hy,en;q=0.7',
  mg: 'mg,en;q=0.7',
};

// 写入 YouTube 语言偏好（hl cookie + Accept-Language），供启动恢复 / 手动切换复用
async function applyYtLang(lang) {
  const hl = YT_HL[lang] || 'en';
  const ses = session.fromPartition(PARTITION);
  try {
    ses.setUserAgent(ses.getUserAgent(), YT_ACCEPT[lang] || 'en-US,en;q=0.9');
  } catch (_) {}
  try {
    const url = 'https://www.youtube.com';
    const existing = await ses.cookies.get({ url, name: 'PREF' });
    const params = new URLSearchParams(existing[0] ? existing[0].value : '');
    params.set('hl', hl);
    await ses.cookies.set({
      url,
      name: 'PREF',
      value: params.toString(),
      domain: '.youtube.com',
      path: '/',
      secure: true,
    });
  } catch (err) {
    console.error('[applyYtLang] 设置失败：', err);
  }
}

ipcMain.on('set-yt-lang', async (_e, lang) => {
  appSettings.ytLang = lang; // 记住语言，下次启动自动恢复
  saveAppSettings();
  await applyYtLang(lang);
  if (mainWindow) mainWindow.webContents.reload();
});

// Windows 任务栏 / 搜索栏正确归组并显示应用图标
if (process.platform === 'win32') {
  app.setAppUserModelId('com.purebox.youtube');
}

app.whenReady().then(() => {
  loadAppSettings();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
