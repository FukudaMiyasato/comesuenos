#include "face.h"
#include "config.h"
#include <U8g2lib.h>

#if OLED_HEIGHT == 32
static U8G2_SSD1306_128X32_UNIVISION_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);
#else
static U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE, PIN_OLED_SCL, PIN_OLED_SDA);
#endif

static const int W = 128;
static const int H = OLED_HEIGHT;
static const float S = OLED_HEIGHT / 64.0f; // escala vertical

static volatile FaceState state = FACE_IDLE;
static volatile uint32_t stateSince = 0;
static volatile float level = 0;
static char msg[3][24];

// Valores animados (se acercan suavemente al objetivo)
static float eyeW = 30, eyeH = 38, gazeX = 0, gazeY = 0;

static float approach(float v, float target, float k) { return v + (target - v) * k; }

void faceSet(FaceState s) {
  if (state == s) return;
  state = s;
  stateSince = millis();
}

void faceLevel(float l) { level = constrain(l, 0.0f, 1.0f); }

void faceMessage(const char *a, const char *b, const char *c) {
  strlcpy(msg[0], a, sizeof msg[0]);
  strlcpy(msg[1], b, sizeof msg[1]);
  strlcpy(msg[2], c, sizeof msg[2]);
  faceSet(FACE_MESSAGE);
}

static void drawEye(int cx, int cy, int w, int h) {
  if (h < 3) h = 3;
  int r = min(min(w, h) / 2 - 1, (int)(8 * S) + 2);
  if (r < 0) r = 0;
  oled.drawRBox(cx - w / 2, cy - h / 2, w, h, r);
}

static void faceTask(void *) {
  uint32_t nextBlink = millis() + 2500, blinkStart = 0, nextGaze = millis() + 1500;
  float tGazeX = 0, tGazeY = 0;

  for (;;) {
    uint32_t now = millis();
    FaceState s = state;
    uint32_t age = now - stateSince;
    oled.clearBuffer();

    if (s == FACE_MESSAGE) {
      oled.setFont(H == 32 ? u8g2_font_5x8_tf : u8g2_font_6x12_tf);
      int lh = H == 32 ? 10 : 16;
      for (int i = 0; i < 3; i++) oled.drawStr(0, lh * (i + 1) - 2 + (H == 64 ? 6 : 0), msg[i]);
      oled.sendBuffer();
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }

    // Vuelta automática al reposo tras una reacción
    if ((s == FACE_HAPPY || s == FACE_SAD) && age > 1600) { faceSet(FACE_IDLE); s = FACE_IDLE; }

    float tW = 30, tH = 38 * S, blink = 1.0f;

    switch (s) {
      case FACE_IDLE:
        if (now > nextGaze) {
          tGazeX = random(-14, 15);
          tGazeY = random(-6, 7) * S;
          if (random(3) == 0) tGazeX = tGazeY = 0;
          nextGaze = now + random(1200, 3500);
        }
        if (now > nextBlink) { blinkStart = now; nextBlink = now + random(2500, 6000); }
        if (now - blinkStart < 160) {
          float p = (now - blinkStart) / 160.0f;
          blink = fabsf(p - 0.5f) * 2.0f; // 1 -> 0 -> 1
        }
        break;
      case FACE_LISTENING: // ojos muy abiertos que laten con el volumen
        tGazeX = tGazeY = 0;
        tW = 34 + level * 6;
        tH = (44 + level * 14) * S;
        break;
      case FACE_THINKING: // mirando arriba, entrecerrados
        tGazeX = 10;
        tGazeY = -8 * S;
        tH = 22 * S;
        break;
      case FACE_HAPPY:
        tGazeX = tGazeY = 0;
        tH = 30 * S;
        break;
      case FACE_SAD:
        tGazeX = 0;
        tGazeY = 6 * S;
        tH = 8 * S;
        break;
      default: break;
    }

    eyeW = approach(eyeW, tW, 0.3f);
    eyeH = approach(eyeH, tH, 0.3f);
    gazeX = approach(gazeX, tGazeX, 0.25f);
    gazeY = approach(gazeY, tGazeY, 0.25f);

    int cy = H / 2 + (int)gazeY;
    int lx = 38 + (int)gazeX, rx = 90 + (int)gazeX;
    int w = (int)eyeW, h = (int)(eyeH * blink);
    drawEye(lx, cy, w, h);
    drawEye(rx, cy, w, h);

    if (s == FACE_HAPPY) { // recorta la parte baja: ojos en forma de ^ ^
      oled.setDrawColor(0);
      int r = w / 2 + 2;
      oled.drawDisc(lx, cy + h / 2 + r / 3, r);
      oled.drawDisc(rx, cy + h / 2 + r / 3, r);
      oled.setDrawColor(1);
    }
    if (s == FACE_THINKING) { // tres puntitos animados
      int n = (age / 300) % 4;
      for (int i = 0; i < n; i++) oled.drawDisc(56 + i * 8, H - 4, H == 32 ? 1 : 2);
    }

    oled.sendBuffer();
    vTaskDelay(pdMS_TO_TICKS(25));
  }
}

void faceBegin() {
  oled.setBusClock(400000);
  oled.begin();
  oled.setContrast(255);
  stateSince = millis();
  xTaskCreatePinnedToCore(faceTask, "face", 6144, nullptr, 1, nullptr, 0);
}
