# Comechismes

Un ESP32-S3 con ojos que escucha: cuando detecta volumen graba hasta que hay silencio
(o hasta el tiempo máximo), envía el audio a esta web y la web lo transcribe en vivo.

```
ESP32 (mic I2S) --WAV por HTTP POST--> /api/audio --Whisper--> lista en /
```

## Web (Next.js, raíz del repo)

```bash
cp .env.example .env.local   # pon GROQ_API_KEY u OPENAI_API_KEY
npm install
npm run dev
```

En Vercel: importa el repo, añade las mismas variables de entorno y la integración
**Upstash for Redis** (Marketplace) para que las transcripciones persistan entre funciones.

| Ruta | Qué hace |
| --- | --- |
| `POST /api/audio` | Recibe un WAV (cuerpo crudo), lo transcribe y lo guarda |
| `GET /api/transcripts` | Últimas transcripciones (la página la consulta cada 1,5 s) |
| `DELETE /api/transcripts` | Borra la lista |

## Firmware (`firmware/`, PlatformIO + Arduino)

Placa: ESP32-S3 N16R8 tipo "bread-compact" — OLED SSD1306 (SDA 41, SCL 42),
micro INMP441 (WS 4, SCK 5, SD 6). Pines y ajustes de detección de voz en `firmware/src/config.h`.

```bash
python3 -m venv .venv && .venv/bin/pip install platformio
.venv/bin/pio run -d firmware -t upload
```

Primer arranque: el equipo crea la red WiFi **Comechismes-Setup**. Conéctate desde el móvil,
elige tu WiFi y escribe la URL del servidor (`https://tu-app.vercel.app`). Después el mismo
formulario sigue disponible en la IP del equipo. Mantener BOOT 3 s borra el WiFi.

Por serie (`.venv/bin/python firmware/devcmd.py 5 "info"`): `url <u>`, `token <t>`,
`wifi <ssid> <clave>`, `levels`, `info`, `reset`.

Caras: reposo (parpadea y mira alrededor) · escuchando (ojos grandes que laten con el volumen) ·
enviando (mira arriba + puntitos) · ok (ojos felices) · error (ojos cerrados).
