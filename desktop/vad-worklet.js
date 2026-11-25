// Pasa el audio del micrófono al hilo principal en bloques de 20 ms (320 muestras a 16 kHz).
class Frames extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(320);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = ch[i];
      if (this.n === 320) {
        this.port.postMessage(this.buf.slice());
        this.n = 0;
      }
    }
    return true;
  }
}
registerProcessor("frames", Frames);
