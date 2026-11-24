#pragma once

// ---- Pines (placa xiaozhi "bread-compact-wifi") ----
#define PIN_OLED_SDA 41
#define PIN_OLED_SCL 42
#define PIN_MIC_WS 4
#define PIN_MIC_SCK 5
#define PIN_MIC_SD 6
#define PIN_BOOT_BTN 0

// ---- Audio ----
#define SAMPLE_RATE 16000
#define CHUNK_SAMPLES 320            // 20 ms
#define CHUNK_MS 20
#define MIC_SHIFT 14                 // 32 bit -> 16 bit (menos = más ganancia)

// ---- Detección de voz ----
#define MAX_RECORD_MS 15000          // tiempo máximo de una grabación
#define SILENCE_END_MS 1200          // silencio que da por terminada la frase
#define PREROLL_MS 400               // audio previo al disparo que se conserva
#define START_CHUNKS 3               // chunks seguidos con volumen para empezar
#define MIN_VOICED_MS 300            // menos que esto se descarta (golpes, clics)
#define MIN_THRESHOLD 150.0f         // umbral mínimo de nivel
#define THRESHOLD_FACTOR 4.0f        // umbral = ruido de fondo * factor
#define LEVEL_SMOOTHING 0.3f         // suavizado del nivel (evita que picos sueltos cuenten como voz)

#define PORTAL_SSID "Comechismes-Setup"
