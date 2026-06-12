const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function getCurrentDatetimeInfo() {
  const now = new Date();
  const options = {
    timeZone: 'America/Santiago',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const readable = new Intl.DateTimeFormat('es-CL', options).format(now);

  const santiagoParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now);
  const p = {};
  santiagoParts.forEach(({ type, value }) => { p[type] = value; });
  const localStr = `${p.year}-${p.month}-${p.day}T${p.hour === '24' ? '00' : p.hour}:${p.minute}:${p.second}`;
  const utcMs = now.getTime();
  const localMs = new Date(localStr + 'Z').getTime();
  const diffMin = Math.round((localMs - utcMs) / 60000);
  const sign = diffMin >= 0 ? '+' : '-';
  const absMin = Math.abs(diffMin);
  const offsetStr = `${sign}${String(Math.floor(absMin / 60)).padStart(2, '0')}:${String(absMin % 60).padStart(2, '0')}`;

  return { readable, iso: localStr, offset: offsetStr, isoWithOffset: `${localStr}${offsetStr}` };
}

const SYSTEM_PROMPT = `Eres un asistente experto en interpretar mensajes en español chileno informal para agendar reuniones.
Tu ÚNICA tarea es analizar el mensaje del usuario y responder con un JSON válido, sin markdown, sin texto extra, solo el JSON.

El JSON debe tener exactamente esta estructura:
{
  "accion": "crear_evento" | "falta_info" | "ninguna",
  "titulo": "string descriptivo del evento (vacío si no aplica)",
  "fecha_inicio": "ISO 8601 con offset de zona horaria, ej: 2024-03-15T17:00:00-04:00 (vacío si falta_info)",
  "fecha_fin": "ISO 8601, siempre 1 hora después de fecha_inicio si no se especifica (vacío si falta_info)",
  "respuesta_usuario": "texto corto y amigable en español chileno confirmando lo agendado, o preguntando qué falta"
}

Reglas:
- "crear_evento": cuando tienes suficiente info para crear el evento (mínimo: título/asunto y fecha+hora)
- "falta_info": cuando el mensaje quiere agendar algo pero falta fecha, hora u otra info esencial
- "ninguna": saludo, pregunta genérica o mensaje que no tiene relación con agendar
- Resuelve fechas relativas usando la fecha/hora actual que se te da (hoy, mañana, pasado mañana, el viernes, en una hora, etc.)
- Si el día de la semana ya pasó esta semana, asume la próxima semana
- El título debe ser descriptivo: "Reunión con [persona/rol]" si se menciona, o el contexto del mensaje
- respuesta_usuario siempre en español chileno, informal y amigable, máximo 2 oraciones
- NUNCA incluyas markdown, bloques de código ni texto fuera del JSON`;

async function parseMessage(userMessage) {
  const dt = getCurrentDatetimeInfo();

  const fullPrompt = `${SYSTEM_PROMPT}

Fecha y hora actual en Santiago de Chile: ${dt.readable} (${dt.isoWithOffset}, offset ${dt.offset})

Mensaje del usuario: "${userMessage}"`;

  console.log(`[PARSER] Enviando a Gemini. Fecha actual: ${dt.readable}`);

  let rawResponse;
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(fullPrompt);
    rawResponse = result.response.text().trim();
    console.log(`[PARSER] Respuesta cruda de Gemini: ${rawResponse}`);
  } catch (err) {
    console.error('[PARSER] Error llamando a Gemini API:', err.message || err);
    throw new Error('Error en Gemini API: ' + (err.message || String(err)));
  }

  // Limpiar markdown si Gemini lo incluye
  rawResponse = rawResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    const match = rawResponse.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch {
        console.error('[PARSER] No se pudo parsear JSON de Gemini:', rawResponse);
        throw new Error('Gemini devolvió JSON inválido');
      }
    } else {
      console.error('[PARSER] Gemini no devolvió JSON:', rawResponse);
      throw new Error('Gemini no devolvió JSON');
    }
  }

  if (!parsed.accion || !parsed.respuesta_usuario) {
    console.error('[PARSER] JSON de Gemini incompleto:', parsed);
    throw new Error('JSON de Gemini sin campos obligatorios');
  }

  if (parsed.accion === 'crear_evento' && parsed.fecha_inicio && !parsed.fecha_fin) {
    const start = new Date(parsed.fecha_inicio);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    parsed.fecha_fin = end.toISOString().replace('Z', parsed.fecha_inicio.slice(-6));
    console.log(`[PARSER] fecha_fin calculada automáticamente: ${parsed.fecha_fin}`);
  }

  return parsed;
}

module.exports = { parseMessage };
