// Comechismes — ojos en la pantalla + escucha por volumen + envío del audio a la web.
#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <driver/i2s.h>

#include "config.h"
#include "face.h"

static Preferences prefs;
static WiFiManager wm;
static WiFiManagerParameter *pUrl, *pToken;
static String serverUrl, deviceToken;

// ---------- Configuración ----------
static void loadConfig() {
  prefs.begin("cfg", false);
  serverUrl = prefs.isKey("url") ? prefs.getString("url") : String();
  deviceToken = prefs.isKey("token") ? prefs.getString("token") : String();
}

static void setUrl(String u) {
  u.trim();
  while (u.endsWith("/")) u.remove(u.length() - 1);
  serverUrl = u;
  prefs.putString("url", u);
}

static void setToken(String t) {
  t.trim();
  deviceToken = t;
  prefs.putString("token", t);
}

static volatile bool listeningEnabled = true; // interruptor de la web

static void showStatus() {
  if (WiFi.status() != WL_CONNECTED) {
    faceMessage("Configura el WiFi:", "conectate a la red", PORTAL_SSID);
  } else if (serverUrl.isEmpty()) {
    faceMessage("Falta URL servidor", "abre en el navegador", WiFi.localIP().toString().c_str());
  } else {
    faceSet(listeningEnabled ? FACE_IDLE : FACE_SLEEP);
  }
}

static void setListeningEnabled(bool on) {
  if (on == listeningEnabled) return;
  listeningEnabled = on;
  Serial.printf("[estado] %s\n", on ? "escuchando" : "en pausa");
  showStatus();
}

/** Tarea aparte: pregunta a la web si el interruptor está encendido. */
static void stateTask(void *) {
  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(STATE_POLL_MS));
    if (WiFi.status() != WL_CONNECTED || serverUrl.isEmpty()) continue;
    String url = serverUrl + "/api/state";
    WiFiClient plain;
    WiFiClientSecure tls;
    tls.setInsecure();
    HTTPClient http;
    if (!(url.startsWith("https://") ? http.begin(tls, url) : http.begin(plain, url))) continue;
    http.setTimeout(8000);
    if (http.GET() == 200) {
      String body = http.getString();
      body.replace(" ", "");
      if (body.indexOf("\"listening\":false") >= 0) setListeningEnabled(false);
      else if (body.indexOf("\"listening\":true") >= 0) setListeningEnabled(true);
    } // si falla la consulta se conserva el último estado conocido
    http.end();
  }
}

// ---------- Micrófono ----------
static void micBegin() {
  i2s_config_t cfg = {};
  cfg.mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX);
  cfg.sample_rate = SAMPLE_RATE;
  cfg.bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT;
  cfg.channel_format = I2S_CHANNEL_FMT_ONLY_LEFT;
  cfg.communication_format = I2S_COMM_FORMAT_STAND_I2S;
  cfg.intr_alloc_flags = ESP_INTR_FLAG_LEVEL1;
  cfg.dma_buf_count = 8;
  cfg.dma_buf_len = CHUNK_SAMPLES;
  cfg.use_apll = false;

  i2s_pin_config_t pins = {};
  pins.mck_io_num = I2S_PIN_NO_CHANGE;
  pins.bck_io_num = PIN_MIC_SCK;
  pins.ws_io_num = PIN_MIC_WS;
  pins.data_out_num = I2S_PIN_NO_CHANGE;
  pins.data_in_num = PIN_MIC_SD;

  i2s_driver_install(I2S_NUM_0, &cfg, 0, nullptr);
  i2s_set_pin(I2S_NUM_0, &pins);
  i2s_zero_dma_buffer(I2S_NUM_0);
}

/** Lee 20 ms, los deja en `out` (16 bit) y devuelve su RMS. */
static float micRead(int16_t *out) {
  static int32_t raw[CHUNK_SAMPLES];
  static float prevIn = 0, prevOut = 0;
  size_t got = 0;
  i2s_read(I2S_NUM_0, raw, sizeof raw, &got, portMAX_DELAY);
  int n = got / sizeof(int32_t);
  double sum = 0;
  for (int i = 0; i < n; i++) {
    float v = (float)(raw[i] >> MIC_SHIFT);
    // Pasa-altos ~150 Hz: quita el offset y el zumbido grave (ventiladores, red eléctrica)
    // que sube el ruido de fondo sin aportar nada a la voz.
    float hp = 0.944f * (prevOut + v - prevIn);
    prevIn = v;
    prevOut = v = hp;
    v = constrain(v, -32768.0f, 32767.0f);
    out[i] = (int16_t)v;
    sum += (double)v * v;
  }
  for (int i = n; i < CHUNK_SAMPLES; i++) out[i] = 0;
  return n ? sqrtf(sum / n) : 0;
}

// ---------- Grabación ----------
static const size_t MAX_SAMPLES = (size_t)SAMPLE_RATE * MAX_RECORD_MS / 1000;
static const int PREROLL_CHUNKS = PREROLL_MS / CHUNK_MS;
static uint8_t *wav;       // cabecera WAV (44 bytes) + PCM, en PSRAM
static int16_t *pcm;       // = wav + 44
static int16_t *preroll;   // anillo con los últimos PREROLL_MS
static int prerollPos = 0;
static float noiseFloor = 120;
static float envelope = 0;  // RMS suavizado: es lo que se compara con el umbral
static bool debugLevels = false;

static void writeWavHeader(uint32_t dataBytes) {
  struct __attribute__((packed)) {
    char riff[4]; uint32_t size; char wave[4]; char fmt[4]; uint32_t fmtLen;
    uint16_t format, channels; uint32_t rate, byteRate; uint16_t align, bits;
    char data[4]; uint32_t dataLen;
  } h = {{'R','I','F','F'}, 36 + dataBytes, {'W','A','V','E'}, {'f','m','t',' '}, 16,
         1, 1, SAMPLE_RATE, SAMPLE_RATE * 2, 2, 16, {'d','a','t','a'}, dataBytes};
  memcpy(wav, &h, sizeof h);
}

static bool upload(size_t samples) {
  size_t bytes = samples * 2;
  writeWavHeader(bytes);

  WiFiClient plain;
  WiFiClientSecure tls;
  tls.setInsecure(); // sin validar certificado (suficiente para este prototipo)
  HTTPClient http;
  String url = serverUrl + "/api/audio";
  bool https = url.startsWith("https://");
  if (!(https ? http.begin(tls, url) : http.begin(plain, url))) return false;
  http.setTimeout(45000);
  http.addHeader("Content-Type", "audio/wav");
  if (!deviceToken.isEmpty()) http.addHeader("x-device-token", deviceToken);

  uint32_t t0 = millis();
  int code = http.POST(wav, 44 + bytes);
  String body = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  Serial.printf("[upload] %u bytes -> HTTP %d en %lu ms: %s\n", (unsigned)(44 + bytes), code,
                millis() - t0, body.substring(0, 200).c_str());
  if (code == 200 && body.indexOf("\"listening\":false") >= 0) listeningEnabled = false;
  return code == 200;
}

/** Se llama al superar el umbral: graba hasta silencio o tiempo máximo y envía. */
static void recordAndSend(float threshold) {
  faceSet(FACE_LISTENING);
  size_t n = 0;
  // Copia el pre-roll en orden cronológico
  for (int i = 0; i < PREROLL_CHUNKS; i++) {
    int idx = (prerollPos + i) % PREROLL_CHUNKS;
    memcpy(pcm + n, preroll + idx * CHUNK_SAMPLES, CHUNK_SAMPLES * 2);
    n += CHUNK_SAMPLES;
  }

  int silentMs = 0, voicedMs = START_CHUNKS * CHUNK_MS;
  float quietest = envelope;
  bool timedOut = true;
  while (n + CHUNK_SAMPLES <= MAX_SAMPLES) {
    float rms = micRead(pcm + n);
    n += CHUNK_SAMPLES;
    envelope += (rms - envelope) * LEVEL_SMOOTHING;
    quietest = min(quietest, envelope);
    faceLevel(envelope / (threshold * 5));
    if (envelope > threshold) { voicedMs += CHUNK_MS; silentMs = 0; }
    else silentMs += CHUNK_MS;
    if (silentMs >= SILENCE_END_MS) { timedOut = false; break; }
  }
  faceLevel(0);
  const char *why = timedOut ? "tiempo maximo" : "silencio";
  // Si nunca hubo silencio, el ruido de fondo es más alto de lo estimado: se sube
  // para que un ruido constante (ventilador, música) no dispare grabaciones sin fin.
  if (timedOut) noiseFloor = max(noiseFloor, quietest * 0.8f);

  // Recorta el silencio final dejando un pequeño margen
  if (silentMs > 300) n -= (size_t)(silentMs - 300) / CHUNK_MS * CHUNK_SAMPLES;

  Serial.printf("[rec] %.1f s (voz %d ms, fin por %s)\n", (float)n / SAMPLE_RATE, voicedMs, why);
  if (voicedMs < MIN_VOICED_MS) { faceSet(FACE_IDLE); return; }

  // Normaliza el volumen: el micro graba bajo y así se oye (y se transcribe) mejor.
  int peak = 1;
  for (size_t i = 0; i < n; i++) peak = max(peak, abs((int)pcm[i]));
  float gain = min(24.0f, 24000.0f / peak);
  if (gain > 1.05f)
    for (size_t i = 0; i < n; i++) pcm[i] = (int16_t)(pcm[i] * gain);
  Serial.printf("[rec] pico %d, ganancia x%.1f\n", peak, gain);

  faceSet(FACE_THINKING);
  bool ok = WiFi.status() == WL_CONNECTED && upload(n);
  if (!listeningEnabled) faceSet(FACE_SLEEP);
  else faceSet(ok ? FACE_HAPPY : FACE_SAD);
  i2s_zero_dma_buffer(I2S_NUM_0);
}

// ---------- Comandos por serie (útil para depurar) ----------
static void handleSerial() {
  static String line;
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\n' && c != '\r') { line += c; continue; }
    line.trim();
    if (line.startsWith("url ")) { setUrl(line.substring(4)); Serial.println("ok url=" + serverUrl); showStatus(); }
    else if (line.startsWith("token ")) { setToken(line.substring(6)); Serial.println("ok token"); }
    else if (line.startsWith("wifi ")) {
      int sp = line.indexOf(' ', 5);
      String ssid = sp < 0 ? line.substring(5) : line.substring(5, sp);
      String pass = sp < 0 ? "" : line.substring(sp + 1);
      WiFi.persistent(true);
      WiFi.begin(ssid.c_str(), pass.c_str());
      Serial.println("ok conectando a " + ssid);
    }
    else if (line == "levels") { debugLevels = !debugLevels; }
    else if (line == "info") {
      Serial.printf("wifi=%s ip=%s url=%s escucha=%d ruido=%.0f psram=%u\n", WiFi.SSID().c_str(),
                    WiFi.localIP().toString().c_str(), serverUrl.c_str(), (int)listeningEnabled, noiseFloor,
                    ESP.getFreePsram());
    }
    else if (line == "reset") { wm.resetSettings(); prefs.clear(); ESP.restart(); }
    else if (line.length()) Serial.println("comandos: url <u> | token <t> | wifi <ssid> <clave> | levels | info | reset");
    line = "";
  }
}

static void checkBootButton() {
  static uint32_t downSince = 0;
  if (digitalRead(PIN_BOOT_BTN) == LOW) {
    if (!downSince) downSince = millis();
    if (millis() - downSince > 3000) { // 3 s: borra WiFi y reabre el portal
      faceMessage("Borrando WiFi...", "", "");
      wm.resetSettings();
      delay(800);
      ESP.restart();
    }
  } else downSince = 0;
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  loadConfig();
  faceBegin();

  wav = (uint8_t *)ps_malloc(44 + MAX_SAMPLES * 2);
  preroll = (int16_t *)ps_malloc(PREROLL_CHUNKS * CHUNK_SAMPLES * 2);
  pcm = (int16_t *)(wav + 44);
  if (!wav || !preroll) { faceMessage("Sin PSRAM", "", ""); for (;;) delay(1000); }
  memset(preroll, 0, PREROLL_CHUNKS * CHUNK_SAMPLES * 2);

  micBegin();

  // Portal cautivo: WiFi + URL del servidor + token. Sigue disponible en la IP del equipo.
  pUrl = new WiFiManagerParameter("url", "URL del servidor (https://tu-app.vercel.app)", serverUrl.c_str(), 120);
  pToken = new WiFiManagerParameter("token", "Token del dispositivo (opcional)", deviceToken.c_str(), 64);
  wm.addParameter(pUrl);
  wm.addParameter(pToken);
  wm.setSaveParamsCallback([] { setUrl(pUrl->getValue()); setToken(pToken->getValue()); showStatus(); });
  wm.setConfigPortalBlocking(false);
  wm.setDebugOutput(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  faceMessage("Conectando WiFi...", "", "");
  if (wm.autoConnect(PORTAL_SSID)) wm.startWebPortal();
  showStatus();
  xTaskCreatePinnedToCore(stateTask, "state", 12288, nullptr, 1, nullptr, 0);
}

void loop() {
  static int16_t chunk[CHUNK_SAMPLES];
  static int above = 0;
  static bool wasConnected = false;
  static uint32_t lastDebug = 0;

  handleSerial();
  checkBootButton();
  wm.process();

  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected != wasConnected) {
    wasConnected = connected;
    if (connected) {
      Serial.println("[wifi] conectado, ip " + WiFi.localIP().toString());
      wm.startWebPortal();
    }
    showStatus();
  }

  // El micro se lee siempre para mantener al día el pre-roll y el ruido de fondo
  float rms = micRead(chunk);
  memcpy(preroll + prerollPos * CHUNK_SAMPLES, chunk, sizeof chunk);
  prerollPos = (prerollPos + 1) % PREROLL_CHUNKS;

  envelope += (rms - envelope) * LEVEL_SMOOTHING;
  float threshold = max(MIN_THRESHOLD, noiseFloor * THRESHOLD_FACTOR);
  if (debugLevels && millis() - lastDebug > 200) {
    lastDebug = millis();
    Serial.printf("rms=%.0f nivel=%.0f ruido=%.0f umbral=%.0f\n", rms, envelope, noiseFloor, threshold);
  }

  if (envelope > threshold) above++;
  else {
    above = 0;
    noiseFloor += (envelope - noiseFloor) * 0.02f; // el ruido de fondo solo se adapta en silencio
  }

  if (above >= START_CHUNKS) {
    above = 0;
    if (connected && !serverUrl.isEmpty() && listeningEnabled) recordAndSend(threshold);
  }
}
