# Comechismes

Un ESP32-S3 con ojos que escucha: cuando detecta volumen graba hasta que hay silencio
(o hasta el tiempo máximo) y envía el audio a esta web. La web lo transcribe, decide el
sentimiento y las categorías, y guarda **solo eso** para dibujarlo.

```
ESP32 (mic I2S) --WAV--> /api/audio --Whisper--> texto --GPT--> sentimiento + categorías
                                                   └─ se descarta      └─ se guarda con la fecha
```

**Privacidad:** no se guarda ni el audio ni la transcripción. Por cada frase solo queda
categoría + sentimiento + fecha.

- `/` — ojos, interruptor de gráfico y el gráfico:
  - **Círculos:** uno por categoría y sentimiento (azul positivo, rojo negativo, gris claro neutral);
    más grande cuantas más veces se habló. Al pulsarlo muestra cuándo fue creciendo.
  - **24 horas:** línea de tiempo vertical con los temas de cada hora y los más hablados.
- `/admin` — dormir/despertar la escucha y activar 50 datos falsos de demostración.
- `/doc` — documentación: flujo de la IA, propuesta de evals y futuro con modelos locales.

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
| `POST /api/audio` | Recibe un WAV, lo transcribe, lo clasifica y suma un punto a cada categoría |
| `GET /api/data` | Círculos y menciones de las últimas 24 h (la página consulta cada 3 s) |
| `DELETE /api/data` | Borra todos los datos |
| `GET` / `PUT /api/state` | Lee o cambia los ajustes: `listening` y `fake` |

La clasificación usa un modelo de chat barato (`gpt-4o-mini`;
con solo clave de Groq, `llama-3.1-8b-instant`). `CLASSIFY_MODEL` permite forzar otro. Antes de
crear una categoría nueva se le pasan las existentes para que las reutilice.

Las categorías están orientadas a un local de comida rápida: se parte de `limpieza`, `atención`,
`local`, `comida`, `variedad` y `bulla` (ver `BASE_CATEGORIES` en `lib/classify.ts`), y el modelo
puede añadir otras si ninguna encaja.

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

**Red alternativa:** en la página *Setup* del equipo (o con `wifi2 <ssid> <clave>` por serie) se puede
guardar una segunda red. Si no hay conexión, cada 20 s prueba una red, alternando entre las dos.

Por serie (`.venv/bin/python firmware/devcmd.py 5 "info"`): `url <u>`, `token <t>`,
`wifi <ssid> <clave>`, `wifi2 <ssid> <clave>`, `levels`, `info`, `reset`.

Caras: reposo (parpadea y mira alrededor) · escuchando (ojos grandes que laten con el volumen) ·
enviando (mira arriba + puntitos) · ok (ojos felices) · error (ojos cerrados).
