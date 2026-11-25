// Detección de voz por volumen, igual que el firmware del ESP32: graba desde que hay voz
// hasta 1,2 s de silencio o 15 s como máximo, y entrega la frase al proceso principal.
const MAX_RECORD_MS = 15000, SILENCE_END_MS = 1200, PREROLL_MS = 400, MIN_SPEECH_MS = 300;
const MIN_THRESHOLD = 250, THRESHOLD_FACTOR = 3.5;

(async () => {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    window.comechismes.micError(err.message);
    return;
  }
  const ctx = new AudioContext({ sampleRate: 16000 });
  await ctx.audioWorklet.addModule("vad-worklet.js");
  const node = new AudioWorkletNode(ctx, "frames");
  ctx.createMediaStreamSource(stream).connect(node);

  const prerollFrames = Math.round(PREROLL_MS / 20);
  let preroll = [], frames = null;
  let noise = 60, level = 0, silentMs = 0, loudMs = 0, hp = 0, prev = 0;

  node.port.onmessage = ({ data }) => {
    const frame = new Int16Array(320);
    let sum = 0;
    for (let i = 0; i < 320; i++) {
      const x = Math.max(-32768, Math.min(32767, Math.round(data[i] * 32767)));
      frame[i] = x;
      hp = 0.945 * (hp + x - prev); prev = x; // paso alto de ~150 Hz
      sum += hp * hp;
    }
    level += 0.3 * (Math.sqrt(sum / 320) - level);
    const loud = level > Math.max(MIN_THRESHOLD, noise * THRESHOLD_FACTOR);
    // Ruido de fondo: baja rápido en silencio y sube muy despacio si el ambiente es ruidoso.
    noise += (level < noise ? 0.05 : loud ? 0.0005 : 0.02) * (level - noise);

    if (!frames) {
      preroll.push(frame);
      if (preroll.length > prerollFrames) preroll.shift();
      if (loud) { frames = preroll; preroll = []; silentMs = 0; loudMs = 20; }
      return;
    }
    frames.push(frame);
    if (loud) { silentMs = 0; loudMs += 20; } else silentMs += 20;
    const total = frames.length * 20;
    if (silentMs >= SILENCE_END_MS || total >= MAX_RECORD_MS) {
      if (total >= MAX_RECORD_MS && silentMs < SILENCE_END_MS) noise = Math.max(noise, level / THRESHOLD_FACTOR);
      if (loudMs >= MIN_SPEECH_MS) {
        const pcm = new Int16Array(frames.length * 320);
        frames.forEach((f, i) => pcm.set(f, i * 320));
        window.comechismes.phrase(pcm.buffer);
      }
      frames = null;
    }
  };
})();
