const { google } = require('googleapis');

/**
 * Crea y retorna un cliente autenticado de Google Calendar usando Service Account.
 */
function getCalendarClient() {
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!privateKey || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    throw new Error('Credenciales de Google Calendar no configuradas (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY)');
  }

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * Crea un evento en Google Calendar.
 * @param {Object} params
 * @param {string} params.titulo - Título del evento
 * @param {string} params.fechaInicio - ISO 8601 con offset, ej: "2024-03-15T17:00:00-04:00"
 * @param {string} params.fechaFin - ISO 8601 con offset
 * @returns {Promise<string|null>} URL del evento creado, o null si no está disponible
 */
async function createCalendarEvent({ titulo, fechaInicio, fechaFin }) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!calendarId) {
    throw new Error('GOOGLE_CALENDAR_ID no configurado');
  }

  if (!titulo || !fechaInicio || !fechaFin) {
    throw new Error(`Parámetros insuficientes para crear evento: titulo="${titulo}", inicio="${fechaInicio}", fin="${fechaFin}"`);
  }

  console.log(`[CALENDAR] Creando evento: "${titulo}" | ${fechaInicio} → ${fechaFin}`);

  let calendar;
  try {
    calendar = getCalendarClient();
  } catch (err) {
    console.error('[CALENDAR] Error inicializando cliente:', err.message);
    throw err;
  }

  const event = {
    summary: titulo,
    start: {
      dateTime: fechaInicio,
      timeZone: 'America/Santiago',
    },
    end: {
      dateTime: fechaFin,
      timeZone: 'America/Santiago',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  try {
    const response = await calendar.events.insert({
      calendarId,
      resource: event,
    });

    const created = response.data;
    console.log(`[CALENDAR] Evento creado exitosamente. ID: ${created.id} | Link: ${created.htmlLink}`);
    return created.htmlLink || null;

  } catch (err) {
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message || err.message;
    console.error(`[CALENDAR] Error creando evento (HTTP ${status}): ${msg}`);

    if (status === 401 || status === 403) {
      throw new Error(`Sin permisos para el calendario "${calendarId}". Verifica que compartiste el calendario con la Service Account.`);
    }
    if (status === 404) {
      throw new Error(`Calendario "${calendarId}" no encontrado. Revisa GOOGLE_CALENDAR_ID.`);
    }
    throw new Error(`Error de Google Calendar: ${msg}`);
  }
}

module.exports = { createCalendarEvent };
