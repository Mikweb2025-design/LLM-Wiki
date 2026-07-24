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
const HEALTH_TIMEOUT_MS = 30000;
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
  const candidates = [
    'python3',
    'python',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
    '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
    '/usr/bin/python3',
  ];

  // In dev, prefer local venv
  if (!app.isPackaged) {
    const venvPy = path.join(getBackendPath(), 'venv', 'bin', 'python3');
    if (fs.existsSync(venvPy)) return venvPy;
  }

  for (const cmd of candidates) {
    try {
      const { execSync } = require('child_process');
      const resolved = execSync(`which ${cmd}`, { encoding: 'utf8', timeout: 3000 }).trim();
      if (resolved && fs.existsSync(resolved)) return resolved;
    } catch {
      // try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------
function startBackend() {
  const backendPath = getBackendPath();
  const pythonCmd = findPython();

  if (!pythonCmd) {
    dialog.showErrorBox(
      'Python non trovato',
      'LLM Wiki richiede Python 3 con pip.\n\nInstalla Python da https://python.org\npoi esegui: pip install -r requirements.txt'
    );
    app.quit();
    return;
  }

  console.log(`[MAIN] Python: ${pythonCmd}`);
  console.log(`[MAIN] Backend path: ${backendPath}`);

  backendProcess = spawn(pythonCmd, [
    '-m', 'uvicorn', 'app.main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
  ], {
    cwd: backendPath,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  });

  backendProcess.stdout.on('data', (d) => console.log(`[BACKEND] ${d.toString().trim()}`));
  backendProcess.stderr.on('data', (d) => console.error(`[BACKEND] ${d.toString().trim()}`));

  backendProcess.on('error', (err) => {
    console.error('[BACKEND] spawn error:', err);
    dialog.showErrorBox('Errore Backend', `Impossibile avviare Python:\n${err.message}`);
    app.quit();
  });

  backendProcess.on('exit', (code) => {
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
function createMainWindow() {
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
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[MAIN] load failed: ${code} ${desc}`);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  createSplash();
  startFrontendServer();
  startBackend();

  pollHealth(() => {
    createMainWindow();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
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
  cleanup();
  if (process.platform !== 'darwin') app.quit();
});
