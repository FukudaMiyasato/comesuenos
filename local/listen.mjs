// Escucha con el micrófono de la Mac y envía cada frase a la web local, igual que hacía el ESP32.
// El audio solo viaja a localhost: ni se guarda en disco ni sale de esta máquina.
import { spawn, spawnSync } from "node:child_process";

const URL_AUDIO = process.env.COMECHISMES_URL || "http://127.0.0.1:3000/api/audio";
const RATE = 16000;
const FRAME = 320; // 20 ms
const MAX_RECORD_MS = 60000; // pasado un minuto se envía ese tramo y se sigue grabando
const SILENCE_END_MS = 1200;
const PREROLL_MS = 400;
const MIN_SPEECH_MS = 300; // por debajo de esto es un golpe o un clic, no una frase
const MIN_THRESHOLD = Number(process.env.MIC_MIN_THRESHOLD || 250);
const THRESHOLD_FACTOR = 3.5;
const LEVELS = process.argv.includes("--levels");

/** Elige el micrófono: MIC (nombre o índice) o, por defecto, el integrado de la MacBook. */
function pickMic() {
  if (process.env.MIC) return process.env.MIC;
  const out = spawnSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]).stderr.toString();
  const audio = out.split("audio devices:")[1] ?? "";
  const names = [...audio.matchAll(/\[(\d+)\] (.+)/g)].map((m) => ({ index: m[1], name: m[2].trim() }));
  const mac = names.find((d) => /macbook|integrado|built-in/i.test(d.name));
  return mac ? mac.index : "default";
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

// Las frases se envían de una en una para no saturar los modelos.
let queue = Promise.resolve();
function send(pcm) {
  const seconds = (pcm.length / 2 / RATE).toFixed(1);
  queue = queue.then(async () => {
    try {
      const res = await fetch(URL_AUDIO, { method: "POST", headers: { "Content-Type": "audio/wav" }, body: wav(pcm) });
      const r = await res.json();
      if (r.listening === false) console.log(`· ${seconds}s descartada: la escucha está en pausa (/admin)`);
      else if (r.categories) console.log(`✓ ${seconds}s → ${r.sentiment}: ${r.categories.join(", ")}`);
      else if (r.error) console.log(`✗ ${seconds}s error: ${r.error}`);
      else console.log(`· ${seconds}s sin nada que clasificar`);
    } catch (err) {
      console.log(`✗ no se pudo enviar (${err.message}). ¿Está la web en marcha?`);
    }
  });
}

const mic = pickMic();
const ff = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "avfoundation", "-i", `:${mic}`,
  "-ac", "1", "-ar", String(RATE), "-f", "s16le", "-"], { stdio: ["ignore", "pipe", "inherit"] });
ff.on("exit", (code) => {
  console.error(`ffmpeg terminó (${code}). Si es por permisos: Ajustes del Sistema → Privacidad y seguridad → Micrófono.`);
  process.exit(1);
});
process.on("SIGINT", () => { ff.kill(); process.exit(0); });
process.on("SIGTERM", () => { ff.kill(); process.exit(0); });
console.log(`Escuchando con el micrófono ${mic}. Enviando a ${URL_AUDIO}`);

const prerollFrames = Math.round(PREROLL_MS / 20);
let pending = Buffer.alloc(0);
let preroll = [];
let frames = null; // null = en reposo; array = grabando
let noise = 60, level = 0, silentMs = 0, loudMs = 0, tick = 0;
let hp = 0, prev = 0; // paso alto de ~150 Hz

ff.stdout.on("data", (chunk) => {
  pending = Buffer.concat([pending, chunk]);
  while (pending.length >= FRAME * 2) {
    const frame = pending.subarray(0, FRAME * 2);
    pending = pending.subarray(FRAME * 2);

    let sum = 0;
    for (let i = 0; i < FRAME; i++) {
      const x = frame.readInt16LE(i * 2);
      hp = 0.945 * (hp + x - prev); prev = x;
      sum += hp * hp;
    }
    level += 0.3 * (Math.sqrt(sum / FRAME) - level);
    const threshold = Math.max(MIN_THRESHOLD, noise * THRESHOLD_FACTOR);
    const loud = level > threshold;
    if (LEVELS && ++tick % 10 === 0) console.log(`nivel ${level.toFixed(0)}  ruido ${noise.toFixed(0)}  umbral ${threshold.toFixed(0)}`);

    // Ruido de fondo: baja rápido cuando hay silencio y sube muy despacio (unos 40 s) si el ambiente es ruidoso.
    noise += (level < noise ? 0.05 : loud ? 0.0005 : 0.02) * (level - noise);

    if (!frames) {
      preroll.push(Buffer.from(frame));
      if (preroll.length > prerollFrames) preroll.shift();
      if (loud) { frames = preroll; preroll = []; silentMs = 0; loudMs = 20; }
      continue;
    }

    frames.push(Buffer.from(frame));
    if (loud) { silentMs = 0; loudMs += 20; } else silentMs += 20;
    const total = frames.length * 20;
    const ended = silentMs >= SILENCE_END_MS;
    if (ended || total >= MAX_RECORD_MS) {
      if (loudMs >= MIN_SPEECH_MS) send(Buffer.concat(frames));
      frames = ended ? null : [];
      loudMs = 0;
    }
  }
});
