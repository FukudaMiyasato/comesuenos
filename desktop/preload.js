const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("comechismes", {
  phrase: (pcm) => ipcRenderer.send("phrase", pcm),
  level: (data) => ipcRenderer.send("level", data),
  onLevel: (fn) => {
    const handler = (_e, data) => fn(data);
    ipcRenderer.on("level", handler);
    return () => ipcRenderer.removeListener("level", handler);
  },
  micError: (message) => ipcRenderer.send("mic-error", message),
  onStatus: (fn) => ipcRenderer.on("status", (_e, s) => fn(s)),
});
