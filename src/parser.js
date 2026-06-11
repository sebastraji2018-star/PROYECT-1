const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Devuelve la fecha y hora actual en zona America/Santiago en formato legible.
 */
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

  // ISO con offset -04:00 (o -03:00 según horario de verano — se calcula automáticamente)
  const iso = now.toLocaleString('sv-SE', { timeZone: 'America/Santiago' }).replace(' ', 'T');
  const offsetMs = -new Date().getTimezoneOffset() * 60000;
  // Calcular offset real en America/Santiago
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

/**
 * Envía el mensaje del usuario a Claude Haiku y retorna el JSON parseado.
 * @param {string} userMessage - Texto enviado por el usuario en WhatsApp
 * @returns {Promise<{accion: string, titulo: string, fecha_inicio: string, fecha_fin: string, respuesta_usuario: string}>}
 */
async function parseMessage(userMessage) {
  const dt = getCurrentDatetimeInfo();

  const userPrompt = `Fecha y hora actual en Santiago de Chile: ${dt.readable} (${dt.isoWithOffset}, offset ${dt.offset})

Mensaje del usuario: "${userMessage}"`;

  console.log(`[PARSER] Enviando a Claude Haiku. Fecha actual: ${dt.readable}`);

  let rawResponse;
  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
    rawResponse = response.content[0].text.trim();
    console.log(`[PARSER] Respuesta cruda de Claude: ${rawResponse}`);
  } catch (err) {
    console.error('[PARSER] Error llamando a Claude API:', err.message || err);
    throw new Error('Error en Claude API: ' + (err.message || String(err)));
  }

  // Parseo seguro: extraer JSON aunque Claude incluya texto extra
  let parsed;
  try {
    // Intento 1: parseo directo
    parsed = JSON.parse(rawResponse);
  } catch {
    // Intento 2: buscar primer bloque JSON con regex
    const match = rawResponse.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        parsed = JSON.parse(match[0]);
      } catch (e2) {
        console.error('[PARSER] No se pudo parsear JSON de Claude:', rawResponse);
        throw new Error('Claude devolvió JSON inválido');
      }
    } else {
      console.error('[PARSER] Claude no devolvió JSON:', rawResponse);
      throw new Error('Claude no devolvió JSON');
    }
  }

  // Validar campos obligatorios
  if (!parsed.accion || !parsed.respuesta_usuario) {
    console.error('[PARSER] JSON de Claude incompleto:', parsed);
    throw new Error('JSON de Claude sin campos obligatorios');
  }

  // Asegurar fecha_fin si falta (default: fecha_inicio + 1 hora)
  if (parsed.accion === 'crear_evento' && parsed.fecha_inicio && !parsed.fecha_fin) {
    const start = new Date(parsed.fecha_inicio);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    parsed.fecha_fin = end.toISOString().replace('Z', parsed.fecha_inicio.slice(-6));
    console.log(`[PARSER] fecha_fin calculada automáticamente: ${parsed.fecha_fin}`);
  }

  return parsed;
}

module.exports = { parseMessage };
