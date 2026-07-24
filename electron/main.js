const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const serveBuild = require('./serve-build');

let mainWindow;
let splashWindow;
let backendProcess;
let frontendServer;

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
    const srcStat = fs.statSync(path.join(src, 'app', 'main.py'));
    const destStat = fs.statSync(path.join(dest, 'app', 'main.py'));
    return srcStat.mtimeMs > destStat.mtimeMs;
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
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.webContents.executeJavaScript(
      `document.querySelector('p').textContent = 'Installing dependencies (first launch only)...'`
    ).catch(() => {});
  }

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
// Backend
// ---------------------------------------------------------------------------
let backendLogFile = null;

function getLogPath() {
  return path.join(app.getPath('userData'), 'backend.log');
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

  // Write logs to file so we can debug Finder launches
  const logPath = getLogPath();
  try { backendLogFile = fs.createWriteStream(logPath); } catch {}

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
    // Update splash with error info
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.webContents.executeJavaScript(
        `document.querySelector('p').textContent = '${msg.substring(0, 80).replace(/'/g, "\\'")}'`
      ).catch(() => {});
    }
  });

  backendProcess.on('error', (err) => {
    console.error('[BACKEND] spawn error:', err);
    dialog.showErrorBox('Errore Backend', `Impossibile avviare Python:\n${err.message}`);
    app.quit();
  });

  backendProcess.on('exit', (code) => {
    log(`[BACKEND] exited with code ${code}`);
    console.log(`[BACKEND] exited with code ${code}`);
    if (code !== null && code !== 0 && mainWindow) {
      dialog.showErrorBox('Backend crash', `Il backend si è fermato (codice ${code}).`);
    }
  });
}

// ---------------------------------------------------------------------------
// Health poll — waits for backend to be ready
// ---------------------------------------------------------------------------
function pollHealth(onReady) {
  const start = Date.now();

  function check() {
    const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/health`, (res) => {
      if (res.statusCode === 200) {
        console.log('[MAIN] Backend ready');
        onReady();
        return;
      }
      retry();
    });
    req.on('error', retry);
    req.setTimeout(2000, () => { req.destroy(); retry(); });
  }

  function retry() {
    if (Date.now() - start > HEALTH_TIMEOUT_MS) {
      console.error('[MAIN] Backend health timeout');
      dialog.showErrorBox(
        'Timeout Backend',
        'Il backend non ha risposto entro 30 secondi.\nControlla che le dipendenze siano installate:\n\n  cd backend && pip install -r requirements.txt'
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
let mainWindowCreated = false;

function createMainWindow() {
  if (mainWindowCreated || (mainWindow && !mainWindow.isDestroyed())) return;
  mainWindowCreated = true;

  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${FRONTEND_PORT}`;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'LLM Wiki',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowCreated = false;
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[MAIN] load failed: ${code} ${desc}`);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
let appReady = false;

app.whenReady().then(() => {
  appReady = true;
  createSplash();
  startFrontendServer();
  startBackend();

  pollHealth(() => {
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
  if (backendProcess && !backendProcess.killed) {
    try { backendProcess.kill('SIGTERM'); } catch {}
    // Force kill after 2s if still alive
    setTimeout(() => {
      if (backendProcess && !backendProcess.killed) {
        try { backendProcess.kill('SIGKILL'); } catch {}
      }
    }, 2000);
  }
  if (frontendServer) {
    try { frontendServer.close(); } catch {}
  }
}

app.on('before-quit', cleanup);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanup();
    app.quit();
  }
});
