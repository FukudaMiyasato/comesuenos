// App de escritorio: arranca los dos modelos locales y la web dentro de una ventana,
// y escucha con el micrófono del equipo. Nada sale de esta máquina salvo la descarga inicial de modelos.
const { app, BrowserWindow, Menu, ipcMain, session, systemPreferences, dialog } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");

const packaged = app.isPackaged;
const resources = packaged ? process.resourcesPath : __dirname;
const ENGINES = path.join(resources, "engines", "bin");
const WEB = packaged ? path.join(resources, "web") : path.join(__dirname, "..", ".next", "standalone");

const MODELS = [
  {
    file: "ggml-large-v3-turbo.bin",
    label: "Transcripción (Whisper)",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
    bytes: 1624555275,
  },
  {
    file: "qwen2.5-3b-instruct-q4_k_m.gguf",
    label: "Clasificación (Qwen 2.5 3B)",
    url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
    bytes: 2104932768,
  },
];

let win = null;
let listener = null;
let baseUrl = "";
const children = [];

const modelsDir = () => path.join(app.getPath("userData"), "models");
const status = (text, progress) => win?.webContents.send("status", { text, progress });

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

/** Descarga un modelo a un .part y lo renombra al terminar; si se interrumpe, continúa donde quedó. */
async function download(model, index) {
  const dest = path.join(modelsDir(), model.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size === model.bytes) return;
  const part = `${dest}.part`;
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  if (have > model.bytes) { fs.rmSync(part); have = 0; }

  if (have < model.bytes) {
    const res = await fetch(model.url, { headers: have ? { Range: `bytes=${have}-` } : {} });
    if (!res.ok) throw new Error(`No se pudo descargar ${model.label} (HTTP ${res.status})`);
    if (have && res.status !== 206) have = 0; // el servidor no admite continuar: se empieza de nuevo
    const out = fs.createWriteStream(part, { flags: have ? "a" : "w" });
    let last = 0;
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await new Promise((r) => out.once("drain", r));
      have += chunk.length;
      if (Date.now() - last > 250) {
        last = Date.now();
        const gb = (n) => (n / 1e9).toFixed(2);
        status(`Descargando ${index + 1} de ${MODELS.length}: ${model.label} · ${gb(have)} de ${gb(model.bytes)} GB`, have / model.bytes);
      }
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
  }
  if (fs.statSync(part).size !== model.bytes) throw new Error(`La descarga de ${model.label} quedó incompleta`);
  fs.renameSync(part, dest);
}

function start(name, command, args, env = {}) {
  const child = spawn(command, args, { env: { ...process.env, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  let tail = "";
  child.stderr.on("data", (d) => { tail = (tail + d).slice(-2000); });
  child.on("exit", (code) => {
    if (app.quitting) return;
    dialog.showErrorBox("Comechismes", `${name} se detuvo (código ${code}).\n\n${tail.slice(-600)}`);
    app.quit();
  });
  children.push(child);
}

async function waitFor(url, seconds = 180) {
  for (let i = 0; i < seconds * 2; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Sin respuesta de ${url}`);
}

async function boot() {
  fs.mkdirSync(modelsDir(), { recursive: true });
  for (const [i, m] of MODELS.entries()) await download(m, i);

  status("Cargando los modelos…");
  const [sttPort, llmPort, webPort] = [await freePort(), await freePort(), await freePort()];
  start("El motor de transcripción", path.join(ENGINES, "whisper-server"), [
    "-m", path.join(modelsDir(), MODELS[0].file), "-l", "es",
    "--host", "127.0.0.1", "--port", String(sttPort), "--inference-path", "/v1/audio/transcriptions",
  ]);
  start("El motor de clasificación", path.join(ENGINES, "llama-server"), [
    "-m", path.join(modelsDir(), MODELS[1].file), "-c", "2048", "-ngl", "99",
    "--host", "127.0.0.1", "--port", String(llmPort),
  ]);
  // La web es el mismo Next.js de siempre, ejecutado con el Node que trae Electron.
  start("La web", process.execPath, [path.join(WEB, "server.js")], {
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(webPort),
    HOSTNAME: "127.0.0.1",
    LOCAL_AI: "1",
    LOCAL_STT_URL: `http://127.0.0.1:${sttPort}/v1/audio/transcriptions`,
    LOCAL_LLM_URL: `http://127.0.0.1:${llmPort}/v1/chat/completions`,
    CLASSIFY_MODEL: "qwen2.5-3b",
    COMECHISMES_DATA_FILE: path.join(app.getPath("userData"), "datos.json"),
  });

  baseUrl = `http://127.0.0.1:${webPort}`;
  await Promise.all([waitFor(`http://127.0.0.1:${sttPort}/`), waitFor(`http://127.0.0.1:${llmPort}/health`), waitFor(`${baseUrl}/api/state`)]);

  await win.loadURL(baseUrl);
  await startListening();
}

async function startListening() {
  if (process.platform === "darwin" && !(await systemPreferences.askForMediaAccess("microphone"))) {
    dialog.showErrorBox("Comechismes", "Sin permiso de micrófono no puedo escuchar.\n\nActívalo en Ajustes del Sistema → Privacidad y seguridad → Micrófono y vuelve a abrir la app.");
    return;
  }
  listener = new BrowserWindow({
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), backgroundThrottling: false },
  });
  listener.loadFile(path.join(__dirname, "listener.html"));
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(16000, 24); h.writeUInt32LE(32000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Las frases llegan del micrófono y se envían de una en una a la web local. El audio no se escribe en disco.
let queue = Promise.resolve();
ipcMain.on("phrase", (_event, pcm) => {
  const body = wav(Buffer.from(pcm));
  queue = queue.then(() =>
    fetch(`${baseUrl}/api/audio`, { method: "POST", headers: { "Content-Type": "audio/wav" }, body }).catch(() => {}),
  );
});
ipcMain.on("mic-error", (_event, message) => dialog.showErrorBox("Comechismes", `No pude abrir el micrófono: ${message}`));

function menu() {
  const go = (label, route, accelerator) => ({ label, accelerator, click: () => baseUrl && win?.loadURL(baseUrl + route) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: "appMenu" },
    { role: "editMenu" },
    { label: "Ver", submenu: [go("Gráficos", "/", "Cmd+1"), go("Administración", "/admin", "Cmd+2"), go("Documentación", "/doc", "Cmd+3"), { type: "separator" }, { role: "reload" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ]));
}

app.whenReady().then(async () => {
  // Solo se concede el micrófono, y solo a las páginas propias de la app.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "media" && wc === listener?.webContents));
  menu();
  win = new BrowserWindow({
    width: 1100, height: 820, title: "Comechismes", backgroundColor: "#ffffff",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.on("closed", () => app.quit());
  await win.loadFile(path.join(__dirname, "setup.html"));
  try {
    await boot();
  } catch (err) {
    if (app.quitting) return;
    dialog.showErrorBox("Comechismes", `${err.message}\n\nRevisa la conexión a internet y vuelve a abrir la app: la descarga continúa donde quedó.`);
    app.quit();
  }
});

function stopAll() {
  app.quitting = true;
  for (const c of children) c.kill();
}
app.on("before-quit", stopAll);
process.on("exit", stopAll);
app.on("window-all-closed", () => app.quit());
