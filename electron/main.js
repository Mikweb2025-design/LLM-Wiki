const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const serveBuild = require('./serve-build');

let mainWindow;
let backendProcess;
let frontendServer;

function getResourcePath(relativePath) {
  // In development, use relative path from electron directory
  // In production, we want to use the original source files, not the packaged ones
  // for proper path resolution
  const sourcePath = path.join(__dirname, '..', relativePath);
  
  // Check if source files exist - if so, use them (better for dev/testing)
  if (fs.existsSync(sourcePath)) {
    console.log(`Using source path for ${relativePath}: ${sourcePath}`);
    return sourcePath;
  }
  
  // Fall back to packaged resources
  const basePath = app.isPackaged 
    ? path.join(process.resourcesPath, relativePath)
    : path.join(__dirname, '..', relativePath);
  console.log(`Resource path for ${relativePath}: ${basePath}`);
  return basePath;
}

function startFrontendServer() {
  const buildPath = getResourcePath('frontend-build');
  console.log('=== STARTFRONTEND ===');
  console.log('Frontend build path:', buildPath);
  console.log('Path exists:', fs.existsSync(buildPath));
  frontendServer = serveBuild(buildPath, 3456);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    title: 'LLM Wiki',
    icon: path.join(getResourcePath('.'), 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Carica l'app React dal server locale
  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3456';
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Gestione errori caricamento
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Errore caricamento:', errorDescription);
  });
}

function startBackend() {
  const backendPath = getResourcePath('backend');
  const isPackaged = app.isPackaged;
  
  let pythonCmd;
  
  // In packaged app, use system Python
  if (isPackaged) {
    // Try different Python versions to find one with uvicorn installed
    const pythonVersions = [
      '/Library/Frameworks/Python.framework/Versions/3.13/bin/python3',
      '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3',
      '/opt/homebrew/bin/python3',
      '/usr/local/bin/python3',
      '/usr/bin/python3'
    ];
    
    for (const py of pythonVersions) {
      if (fs.existsSync(py)) {
        pythonCmd = py;
        break;
      }
    }
  } else {
    // In development, use local venv if it exists
    const venvPython = path.join(backendPath, 'venv', 'bin', 'python3');
    pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python3';
  }

  console.log('=== STARTBACKEND ===');
  console.log('Avvio backend da:', backendPath);
  console.log('Python command:', pythonCmd);
  console.log('Is packaged:', isPackaged);
  console.log('Backend path exists:', fs.existsSync(backendPath));

  // Start uvicorn directly (assuming deps are installed)
  startUvicorn();

  function startUvicorn() {
    console.log('=== STARTING UVICORN ===');
    
    backendProcess = spawn(pythonCmd, ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'], {
      cwd: backendPath,
      stdio: 'pipe',
      shell: true,
      env: { ...process.env, PYTHONUNBUFFERED: '1' }
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend errore: ${data}`);
    });

    backendProcess.on('error', (err) => {
      console.error('Errore avvio backend:', err);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend terminato con codice ${code}`);
    });
  }
}

app.whenReady().then(() => {
  // Avvia server frontend
  startFrontendServer();
  
  // Avvia backend
  startBackend();

  // Attendi che i servizi siano pronti
  setTimeout(() => {
    createWindow();
  }, 3000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Ferma backend e frontend server
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendServer) {
    frontendServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill();
  }
  if (frontendServer) {
    frontendServer.close();
  }
});
