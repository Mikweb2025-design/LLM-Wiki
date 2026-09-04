// preload.js — ponte sicuro renderer <-> main (contextBridge, niente nodeIntegration)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('llmWiki', {
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  platform: process.platform,
});
