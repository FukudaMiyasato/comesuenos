const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("comechismes", {
  phrase: (pcm) => ipcRenderer.send("phrase", pcm),
  micError: (message) => ipcRenderer.send("mic-error", message),
  onStatus: (fn) => ipcRenderer.on("status", (_e, s) => fn(s)),
});
