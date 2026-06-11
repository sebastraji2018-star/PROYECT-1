# WhatsApp Calendar Assistant

Asistente de WhatsApp que agenda reuniones en Google Calendar usando lenguaje natural en español chileno.

**Stack:** Node.js · Express · WhatsApp Cloud API · Anthropic Claude Haiku · Google Calendar API · Docker

---

## Cómo funciona

1. Usuario escribe por WhatsApp: _"agéndame una reunión pasado mañana a las 5 con el productor"_
2. El sistema envía el mensaje a Claude Haiku → obtiene JSON estructurado con fecha, hora y título
3. Crea el evento en Google Calendar via Service Account
4. Responde al usuario confirmando lo agendado con link al evento

---

## Estructura del proyecto

```
src/
├── index.js      # Servidor Express + punto de entrada
├── webhook.js    # Recepción y orquestación de mensajes de WhatsApp
├── parser.js     # Parseo de lenguaje natural con Claude Haiku
├── calendar.js   # Creación de eventos en Google Calendar
└── whatsapp.js   # Envío de mensajes por WhatsApp Cloud API
Dockerfile
docker-compose.yml
railway.json
render.yaml
.env.example
```

---

## Variables de entorno

Copia `.env.example` a `.env` y rellena cada valor. Ver el archivo para descripción de cada variable.

---

## Despliegue en Railway (recomendado)

### Paso 1 — Subir el código

```bash
git add .
git commit -m "initial commit"
git push origin main
```

### Paso 2 — Crear proyecto en Railway

1. Ve a [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Selecciona este repositorio
3. Railway detecta el `Dockerfile` automáticamente

### Paso 3 — Configurar variables de entorno

En Railway → tu proyecto → **Variables**, agrega una por una:

| Variable | Valor |
|---|---|
| `WHATSAPP_TOKEN` | Token permanente de Meta |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp Business |
| `WHATSAPP_VERIFY_TOKEN` | String secreto que tú inventas |
| `META_APP_SECRET` | App Secret de tu app de Meta |
| `ANTHROPIC_API_KEY` | API Key de Anthropic |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Email de la Service Account |
| `GOOGLE_PRIVATE_KEY` | Clave privada (con los `\n` literales) |
| `GOOGLE_CALENDAR_ID` | Email o ID del calendario |
| `TZ` | `America/Santiago` |

> **GOOGLE_PRIVATE_KEY en Railway:** Pega el bloque completo incluyendo `-----BEGIN PRIVATE KEY-----` y `-----END PRIVATE KEY-----`. Railway maneja los saltos de línea automáticamente.

### Paso 4 — Obtener la URL pública

En Railway → tu servicio → **Settings** → **Networking** → **Generate Domain**. La URL será algo como: `https://tu-app.up.railway.app`

### Paso 5 — Configurar el webhook en Meta

1. Ve a [developers.facebook.com](https://developers.facebook.com) → Tu App → **WhatsApp** → **Configuration**
2. En **Webhook**, haz clic en **Edit**
3. **Callback URL:** `https://tu-app.up.railway.app/webhook`
4. **Verify Token:** el mismo valor que pusiste en `WHATSAPP_VERIFY_TOKEN`
5. Haz clic en **Verify and Save**
6. Suscríbete al campo **messages** haciendo clic en el toggle

---

## Despliegue en Render (alternativa)

### Paso 1 — Crear Web Service

1. Ve a [render.com](https://render.com) → **New** → **Web Service**
2. Conecta tu repositorio de GitHub
3. Render detecta el `render.yaml` automáticamente

### Paso 2 — Variables de entorno

En el dashboard de Render → tu servicio → **Environment**, agrega las mismas variables de la tabla anterior.

> **GOOGLE_PRIVATE_KEY en Render:** Pega el valor **sin** comillas externas. Render lo trata como string multilínea automáticamente.

### Paso 3 — URL y webhook

Render asigna una URL como `https://tu-app.onrender.com`. Úsala en el paso de configuración del webhook de Meta.

---

## Desarrollo local

```bash
# 1. Instalar dependencias
npm install

# 2. Crear archivo de entorno
cp .env.example .env
# Editar .env con tus credenciales

# 3. Iniciar servidor
npm run dev

# 4. Exponer localmente para pruebas (instalar ngrok)
ngrok http 3000
# Usa la URL de ngrok como Callback URL en Meta
```

---

## Probar el sistema

Una vez desplegado, escríbele al número de WhatsApp Business:
- _"agéndame una reunión mañana a las 10 con el cliente"_
- _"crea una reunión el viernes a las 3pm con María"_
- _"reunión pasado mañana a las 5 de la tarde con el productor"_

---

## Logs

En Railway/Render, los logs están en tiempo real en el dashboard. Cada evento se identifica con prefijo:
- `[SERVER]` — arranque del servidor
- `[WEBHOOK]` — mensajes entrantes y verificación
- `[FLOW]` — orquestación del flujo principal
- `[PARSER]` — llamadas a Claude
- `[CALENDAR]` — operaciones en Google Calendar
- `[WHATSAPP]` — envío de mensajes

---

## Manejo de errores

- **Claude falla:** responde al usuario pidiendo que reescriba el mensaje
- **Calendar falla:** responde al usuario avisando del error y sugiere reintentar
- **WhatsApp API falla:** se logea el error sin crashear el proceso
- **Crash total:** Docker/Railway/Render reinicia el proceso automáticamente (`restart: always`)
