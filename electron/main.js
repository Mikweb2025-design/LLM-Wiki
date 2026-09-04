const { app, BrowserWindow, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const http = require('http');
const serveBuild = require('./serve-build');

// Single-instance: evita doppio backend / doppia porta 8000 da Finder
let mainWindow;
let splashWindow;
let backendProcess;
let frontendServer;
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3456;
const HEALTH_TIMEOUT_MS = 120000; // 120s — venv install on first launch can take ~60s+
const HEALTH_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------
function getResourcePath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(__dirname, '..', ...parts);
}

function getBackendPath() {
  return getResourcePath('backend');
}

function getFrontendBuildPath() {
  return getResourcePath('frontend-build');
}

// ---------------------------------------------------------------------------
// Python detection
// ---------------------------------------------------------------------------
function findPython() {
  const { execSync } = require('child_process');

  // In dev, prefer local venv
  if (!app.isPackaged) {
    const venvPy = path.join(getBackendPath(), 'venv', 'bin', 'python3');
    if (fs.existsSync(venvPy)) return venvPy;
  }

  // Absolute paths — check directly (no `which` needed, works from Finder)
  // Prioritize Python 3.13 which has the dependencies installed
  const absPaths = [
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ];

  // Validate each candidate can import uvicorn
  for (const p of absPaths) {
    if (!fs.existsSync(p)) continue;
    try {
      execSync(`"${p}" -c "import uvicorn, fastapi"`, {
        encoding: 'utf8', timeout: 5000,
        env: { PYTHONIOENCODING: 'utf-8' },
      });
      return p;
    } catch {
      // This Python doesn't have the deps, try next
    }
  }

  // Fallback: use `which` for bare command names (needs a shell)
  const bareCmds = ['python3', 'python'];
  for (const cmd of bareCmds) {
    try {
      const resolved = execSync(`/usr/bin/which ${cmd}`, {
        encoding: 'utf8', timeout: 3000,
        env: { PATH: '/Library/Frameworks/Python.framework/Versions/3.13/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' },
      }).trim();
      if (resolved && fs.existsSync(resolved)) {
        try {
          execSync(`"${resolved}" -c "import uvicorn, fastapi"`, {
            encoding: 'utf8', timeout: 5000,
            env: { PYTHONIOENCODING: 'utf-8' },
          });
          return resolved;
        } catch {
          // has python but no deps
        }
      }
    } catch {
      // which not found
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Writable backend copy (DMG is read-only, so we copy backend to ~/Library/...)
// ---------------------------------------------------------------------------
function getWritableBackendPath() {
  const userData = app.getPath('userData'); // ~/Library/Application Support/LLM Wiki
  return path.join(userData, 'backend');
}

function ensureWritableBackend(sourcePath) {
  const destPath = getWritableBackendPath();

  // If dest exists and source is inside a read-only mount, use dest directly
  if (fs.existsSync(destPath) && !isPathWritable(sourcePath)) {
    console.log(`[MAIN] Using cached backend: ${destPath}`);
    return destPath;
  }

  // If dest doesn't exist or source is newer, copy
  if (!fs.existsSync(destPath) || isSourceNewer(sourcePath, destPath)) {
    console.log(`[MAIN] Copying backend to ${destPath}...`);
    fs.mkdirSync(destPath, { recursive: true });
    copyDirSync(sourcePath, destPath);
    console.log('[MAIN] Backend copied.');
  }

  return destPath;
}

function isPathWritable(p) {
  try { fs.accessSync(p, fs.constants.W_OK); return true; }
  catch { return false; }
}

function isSourceNewer(src, dest) {
  try {
    // Controlla TUTTI i file backend rilevanti, non solo main.py
    const filesToCheck = [
      path.join(src, 'app', 'main.py'),
      path.join(src, 'app', 'utils', 'database.py'),
      path.join(src, 'app', 'utils', 'vector_store.py'),
      path.join(src, 'app', 'utils', 'document_processor.py'),
      path.join(src, 'app', 'utils', 'llm_handler.py'),
      path.join(src, 'app', 'routers', 'chat.py'),
      path.join(src, 'app', 'routers', 'documents.py'),
      path.join(src, 'requirements.txt'),
    ];
    for (const srcFile of filesToCheck) {
      try {
        const rel = path.relative(src, srcFile);
        const destFile = path.join(dest, rel);
        const srcStat = fs.statSync(srcFile);
        const destStat = fs.statSync(destFile);
        if (srcStat.mtimeMs > destStat.mtimeMs) return true;
      } catch {}
    }
    return false;
  } catch { return true; }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// Venv management — create venv and install deps if needed
// ---------------------------------------------------------------------------
function getVenvPython(backendPath) {
  return path.join(backendPath, 'venv', 'bin', 'python3');
}

function ensureVenv(pythonCmd, backendPath, log) {
  const venvPython = getVenvPython(backendPath);
  const venvMarker = path.join(backendPath, 'venv', '.installed');
  const reqFile = path.join(backendPath, 'requirements.txt');

  // Skip if venv already exists and requirements haven't changed
  if (fs.existsSync(venvPython) && fs.existsSync(venvMarker)) {
    try {
      const reqStat = fs.statSync(reqFile);
      const markerStat = fs.statSync(venvMarker);
      if (reqStat.mtimeMs <= markerStat.mtimeMs) {
        log('[MAIN] Venv already up to date');
        return venvPython;
      }
    } catch { /* re-create */ }
  }

  log('[MAIN] Creating venv and installing dependencies (first launch may take a few minutes)...');

  // Send splash progress
  setSplashStatus('Installing dependencies (first launch only)...');

  const { execSync } = require('child_process');

  try {
    // Create venv
    log(`[MAIN] Running: ${pythonCmd} -m venv ${path.join(backendPath, 'venv')}`);
    execSync(`"${pythonCmd}" -m venv "${path.join(backendPath, 'venv')}"`, {
      encoding: 'utf8', timeout: 60000,
      env: { PYTHONIOENCODING: 'utf-8' },
    });
    log('[MAIN] Venv created');

    // Install requirements
    log('[MAIN] Installing requirements...');
    execSync(`"${venvPython}" -m pip install --upgrade pip`, {
      encoding: 'utf8', timeout: 120000,
      env: { PYTHONIOENCODING: 'utf-8' },
    });
    execSync(`"${venvPython}" -m pip install -r "${reqFile}"`, {
      encoding: 'utf8', timeout: 600000,
      env: { PYTHONIOENCODING: 'utf-8' },
    });
    log('[MAIN] Requirements installed');

    // Mark as installed
    fs.writeFileSync(venvMarker, new Date().toISOString());
    return venvPython;
  } catch (err) {
    log(`[MAIN-ERROR] Venv setup failed: ${err.message}`);
    // Fall back to system python — it might work if deps are globally installed
    return pythonCmd;
  }
}

// ---------------------------------------------------------------------------
// Kill stale process on port
// ---------------------------------------------------------------------------
function killPortProcess(port, log) {
  // Uccide solo processi nostri (uvicorn app.main / llm-wiki), mai servizi estranei sulla 8000
  function isOwnBackend(pid) {
    try {
      const cmd = execSync(`ps -p ${pid} -o command=`, {
        encoding: 'utf8',
        timeout: 3000,
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      }).trim();
      return /uvicorn|app\.main|llm-wiki/i.test(cmd);
    } catch {
      return false;
    }
  }
  try {
    const output = execSync(`lsof -ti :${port}`, {
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    }).trim();
    if (output) {
      const pids = output.split('\n').filter(Boolean);
      for (const pid of pids) {
        if (String(pid).trim() === String(process.pid)) continue;
        if (!isOwnBackend(pid)) {
          log(`[MAIN] Port ${port} occupata da processo esterno PID ${pid} — non la uccido (chiudi l'altro servizio o cambia porta)`);
          continue;
        }
        log(`[MAIN] Killing stale backend PID ${pid} on port ${port}`);
        try {
          execSync(`kill -9 ${pid}`, {
            encoding: 'utf8',
            timeout: 5000,
            env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
          });
        } catch {}
      }
      // Wait briefly for port to be released
      execSync('sleep 1', { timeout: 3000 });
      log(`[MAIN] Port ${port} cleared`);
    }
  } catch {
    // lsof found nothing or failed — port is free
  }
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------
let backendLogFile = null;

function getLogPath() {
  return path.join(app.getPath('userData'), 'backend.log');
}

function rotateLogIfNeeded(logPath, maxBytes = 5 * 1024 * 1024) {
  try {
    const st = fs.statSync(logPath);
    if (st.size > maxBytes) {
      const oldPath = `${logPath}.old`;
      try { fs.rmSync(oldPath, { force: true }); } catch {}
      fs.renameSync(logPath, oldPath);
    }
  } catch {
    // file mancante -> niente rotazione
  }
}

function setSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  // Passa il testo come argomento (niente interpolazione JS -> niente break su quote/backtick)
  splashWindow.webContents
    .executeJavaScript(
      '(() => { const el = document.querySelector("p"); if (el) el.textContent = arguments[0]; })(' +
        JSON.stringify(String(text).slice(0, 120)) +
        ')'
    )
    .catch(() => {});
}

function startBackend() {
  const sourcePath = getBackendPath();
  const backendPath = ensureWritableBackend(sourcePath);
  const basePython = findPython();

  if (!basePython) {
    dialog.showErrorBox(
      'Python non trovato',
      'LLM Wiki richiede Python 3 con pip.\n\nInstalla Python da https://python.org\npoi esegui: pip install -r requirements.txt'
    );
    app.quit();
    return;
  }

  console.log(`[MAIN] Python: ${basePython}`);
  console.log(`[MAIN] Backend path: ${backendPath}`);

  // Write logs to file so we can debug Finder launches (con rotazione 5MB)
  const logPath = getLogPath();
  rotateLogIfNeeded(logPath);
  try { backendLogFile = fs.createWriteStream(logPath, { flags: 'a' }); } catch {}

  function log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}\n`;
    console.log(msg);
    try { backendLogFile.write(line); } catch {}
  }

  log(`[MAIN] Python: ${basePython}`);
  log(`[MAIN] Backend path: ${backendPath}`);
  log(`[MAIN] CWD exists: ${fs.existsSync(backendPath)}`);
  log(`[MAIN] app/main.py exists: ${fs.existsSync(path.join(backendPath, 'app', 'main.py'))}`);

  // Ensure venv with all dependencies
  const pythonCmd = ensureVenv(basePython, backendPath, log);
  log(`[MAIN] Using python: ${pythonCmd}`);

  // Kill any stale process occupying the backend port
  killPortProcess(BACKEND_PORT, log);

  backendProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'app.main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
  ], {
    cwd: backendPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  backendProcess.stdout.on('data', (d) => {
    const msg = d.toString().trim();
    console.log(`[BACKEND] ${msg}`);
    log(`[BACKEND] ${msg}`);
  });
  backendProcess.stderr.on('data', (d) => {
    const msg = d.toString().trim();
    console.error(`[BACKEND] ${msg}`);
    log(`[BACKEND-ERR] ${msg}`);
    // Update splash with error info (safe: niente interpolazione)
    setSplashStatus(msg.substring(0, 120));
  });

  backendProcess.on('error', (err) => {
    console.error('[BACKEND] spawn error:', err);
    try {
      const logPath = getLogPath();
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] [BACKEND-SPAWN-ERROR] ${err.stack || err.message}\n`);
    } catch {}
    dialog.showErrorBox('Errore Backend', `Impossibile avviare Python:\n${err.message}`);
    app.quit();
  });

  let backendReady = false;
  // pollHealth imposta backendReady=true via callback wrapper sotto
  backendProcess._markReady = () => { backendReady = true; };
  backendProcess.on('exit', (code) => {
    log(`[BACKEND] exited with code ${code}`);
    console.log(`[BACKEND] exited with code ${code}`);
    if (code !== null && code !== 0) {
      // Se il backend muore DOPO il ready (app in uso): log + dialog, ma non quit
      // automatico — l'utente potrebbe voler salvare chat / copiare il log.
      if (backendReady && mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox(
          'Backend terminato',
          `Il backend si è fermato (codice ${code}).\nL'interfaccia resta aperta in sola lettura.\nLog: ${getLogPath()}\n\nRiavvia l'app per ripristinare chat e ricerca.`
        );
        return;
      }
      const msg = `Il backend si è fermato (codice ${code}).\nLog: ${getLogPath()}`;
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showErrorBox('Backend crash', msg);
      }
      if (appReady) app.quit();
    }
  });
}

// ---------------------------------------------------------------------------
// Health poll — waits for backend to be ready
// ---------------------------------------------------------------------------
function pollHealth(onReady) {
  const start = Date.now();
  let done = false;

  function check() {
    if (done) return;
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      if (done) return;
      if (res.statusCode === 200) {
        done = true;
        console.log('[MAIN] Backend ready');
        onReady();
        return;
      }
      retry();
    });
    req.on('error', () => { if (!done) retry(); });
    req.setTimeout(2000, () => { req.destroy(); if (!done) retry(); });
  }

  function retry() {
    if (done) return;
    if (Date.now() - start > HEALTH_TIMEOUT_MS) {
      done = true;
      console.error('[MAIN] Backend health timeout');
      dialog.showErrorBox(
        'Timeout Backend',
        `Il backend non ha risposto entro ${HEALTH_TIMEOUT_MS / 1000} secondi.\nControlla i log in:\n\n  ${getLogPath()}\n\nOppure reinstalla le dipendenze:`
      );
      app.quit();
      return;
    }
    setTimeout(check, HEALTH_INTERVAL_MS);
  }

  check();
}

// ---------------------------------------------------------------------------
// Frontend server (dev / production)
// ---------------------------------------------------------------------------
function startFrontendServer() {
  const buildPath = getFrontendBuildPath();
  if (!fs.existsSync(buildPath)) {
    dialog.showErrorBox(
      'Frontend mancante',
      `Cartella frontend-build non trovata:\n${buildPath}\n\nEsegui: cd frontend && npm run build`
    );
    app.quit();
    return;
  }
  frontendServer = serveBuild(buildPath, FRONTEND_PORT);
}

// ---------------------------------------------------------------------------
// Splash window
// ---------------------------------------------------------------------------
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 320,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    skipTaskbar: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  splashWindow.loadURL(`data:text/html,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(20px);
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        height: 100vh; color: #e2e8f0;
        border-radius: 16px; overflow: hidden;
      }
      .icon {
        width: 72px; height: 72px; border-radius: 18px;
        background: linear-gradient(135deg, #4a9eff, #a855f7);
        display: flex; align-items: center; justify-content: center;
        font-size: 2rem; margin-bottom: 1.2rem;
        box-shadow: 0 8px 32px rgba(74, 158, 255, 0.3);
        animation: pulse 2s ease-in-out infinite;
      }
      h1 {
        font-size: 1.4rem; font-weight: 700;
        background: linear-gradient(135deg, #4a9eff, #a855f7, #ec4899);
        -webkit-background-clip: text; -webkit-text-fill-color: transparent;
        margin-bottom: 0.3rem;
      }
      p { font-size: 0.8rem; color: #94a3b8; margin-bottom: 1.5rem; }
      .dots { display: flex; gap: 6px; }
      .dot {
        width: 8px; height: 8px; border-radius: 50%;
        animation: bounce 1.4s ease-in-out infinite;
      }
      .dot:nth-child(1) { background: #4a9eff; animation-delay: 0s; }
      .dot:nth-child(2) { background: #a855f7; animation-delay: 0.16s; }
      .dot:nth-child(3) { background: #ec4899; animation-delay: 0.32s; }
      @keyframes pulse {
        0%, 100% { transform: scale(1); }
        50% { transform: scale(1.05); }
      }
      @keyframes bounce {
        0%, 80%, 100% { transform: translateY(0); }
        40% { transform: translateY(-10px); }
      }
    </style></head>
    <body>
      <div class="icon">🧠</div>
      <h1>LLM Wiki</h1>
      <p>Avvio backend in corso...</p>
      <div class="dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </body>
    </html>
  `)}`);
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
// Window bounds persistence
// ---------------------------------------------------------------------------
function getBoundsPath() {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

function loadBounds() {
  try {
    const raw = fs.readFileSync(getBoundsPath(), 'utf8');
    const b = JSON.parse(raw);
    if (typeof b.width === 'number' && typeof b.height === 'number') return b;
  } catch {}
  return null;
}

function saveBounds(bounds) {
  try {
    fs.writeFileSync(getBoundsPath(), JSON.stringify(bounds));
  } catch {}
}

let mainWindowCreated = false;

function createAppMenu() {
  const isMac = process.platform === 'darwin';
  try {
    app.setAboutPanelOptions({
      applicationName: 'LLM Wiki',
      applicationVersion: app.getVersion(),
      version: app.getVersion(),
      copyright: 'Copyright © 2026 LLM Wiki (MIT)',
      website: 'https://github.com/Mikweb2025-design/LLM-Wiki',
    });
  } catch {}
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }])],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Apri log backend',
          click: async () => {
            try {
              const { shell } = require('electron');
              await shell.openPath(getLogPath());
            } catch {}
          },
        },
        {
          label: 'Controlla backend (health)',
          click: async () => {
            try {
              const { shell } = require('electron');
              await shell.openExternal(`http://127.0.0.1:${BACKEND_PORT}/health/full`);
            } catch {}
          },
        },
      ],
    },
  ];
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } catch {}
}

function createMainWindow() {
  if (mainWindowCreated || (mainWindow && !mainWindow.isDestroyed())) return;
  mainWindowCreated = true;

  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${FRONTEND_PORT}`;
  const saved = loadBounds();

  mainWindow = new BrowserWindow({
    width: saved?.width || 1400,
    height: saved?.height || 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 800,
    minHeight: 600,
    title: 'LLM Wiki',
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      enableRemoteModule: false,
      // preload.js opzionale: se presente, espone API sicure via contextBridge
      preload: fs.existsSync(path.join(__dirname, 'preload.js'))
        ? path.join(__dirname, 'preload.js')
        : undefined,
    },
  });

  // Blocca popup / window.open esterni: apri nel browser di sistema
  try {
    mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
      try {
        const { shell } = require('electron');
        if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) shell.openExternal(openUrl);
      } catch {}
      return { action: 'deny' };
    });
  } catch {}

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    // Ripristina maximized/fullscreen salvati
    try {
      const saved = loadBounds();
      if (saved?.isMaximized) mainWindow.maximize();
    } catch {}
    mainWindow.show();
  });

  // Salva bounds con debounce (resize/move) + su close
  let saveTimer = null;
  const scheduleSave = () => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          const b = mainWindow.getBounds();
          saveBounds({ ...b, isMaximized: mainWindow.isMaximized() });
        } catch {}
      }, 400);
      if (saveTimer.unref) saveTimer.unref();
    } catch {}
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);

  mainWindow.on('close', () => {
    try {
      if (!mainWindow.isMinimized()) {
        const b = mainWindow.getBounds();
        saveBounds({ ...b, isMaximized: mainWindow.isMaximized() });
      }
    } catch {}
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowCreated = false;
  });

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    try {
      const logPath = getLogPath();
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] [RENDER-GONE] ${details?.reason} exitCode=${details?.exitCode}\n`);
    } catch {}
    console.error('[MAIN] render-process-gone:', details);
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[MAIN] load failed: ${code} ${desc}`);
    setSplashStatus(`Errore caricamento frontend (${code}). Backend log in userData/backend.log`);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
let appReady = false;

process.on('uncaughtException', (err) => {
  console.error('[MAIN] uncaughtException:', err);
  try {
    const p = path.join(app.getPath('userData'), 'backend.log');
    fs.appendFileSync(p, `[${new Date().toISOString()}] [MAIN-UNCAUGHT] ${err?.stack || err}\n`);
  } catch {}
});

app.whenReady().then(() => {
  appReady = true;
  try {
    app.on('child-process-gone', (_e, details) => {
      console.error('[MAIN] child-process-gone:', details);
      try {
        const p = path.join(app.getPath('userData'), 'backend.log');
        fs.appendFileSync(p, `[${new Date().toISOString()}] [CHILD-GONE] ${details?.type} reason=${details?.reason} exitCode=${details?.exitCode}\n`);
      } catch {}
    });
  } catch {}
  createAppMenu();
  createSplash();
  startFrontendServer();
  startBackend();

  pollHealth(() => {
    try {
      if (backendProcess && backendProcess._markReady) backendProcess._markReady();
    } catch {}
    createMainWindow();
  });

  app.on('activate', () => {
    if (!appReady) return;
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });
});

function cleanup() {
  try {
    if (backendLogFile) backendLogFile.end();
  } catch {}
  backendLogFile = null;
  if (backendProcess && !backendProcess.killed) {
    try { backendProcess.kill('SIGTERM'); } catch {}
    // Force kill after 2s if still alive
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        try { backendProcess.kill('SIGKILL'); } catch {}
      }
    }, 2000).unref?.();
  }
  if (frontendServer) {
    try { frontendServer.close(); } catch {}
    frontendServer = null;
  }
}

app.on('before-quit', cleanup);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});
