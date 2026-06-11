const crypto = require('crypto');
const { parseMessage } = require('./parser');
const { createCalendarEvent } = require('./calendar');
const { sendWhatsAppMessage } = require('./whatsapp');

/**
 * Verifica el webhook de Meta (handshake inicial).
 * Meta hace GET con hub.challenge — devolvemos el challenge para confirmar ownership.
 */
function handleWebhookVerification(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verificación exitosa');
    return res.status(200).send(challenge);
  }

  console.warn('[WEBHOOK] Verificación fallida — token incorrecto o modo inválido');
  res.sendStatus(403);
}

/**
 * Verifica la firma HMAC-SHA256 que Meta incluye en el header x-hub-signature-256.
 * Protege contra mensajes forjados de terceros.
 */
function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // Si no está configurado, logueamos advertencia pero no bloqueamos (modo dev)
    console.warn('[WEBHOOK] META_APP_SECRET no configurado — saltando verificación de firma');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) {
    console.warn('[WEBHOOK] Firma ausente en el request');
    return false;
  }

  const body = JSON.stringify(req.body);
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(body).digest('hex');

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

/**
 * Recibe los mensajes entrantes de WhatsApp (POST del webhook de Meta).
 */
async function handleIncomingMessage(req, res) {
  // Responder 200 inmediatamente — Meta reintenta si no recibe 200 rápido
  res.sendStatus(200);

  if (!verifyMetaSignature(req)) {
    console.error('[WEBHOOK] Firma inválida — request descartado');
    return;
  }

  try {
    const body = req.body;

    // Validar estructura básica del payload de Meta
    if (!body?.entry?.[0]?.changes?.[0]?.value) {
      console.log('[WEBHOOK] Payload sin estructura esperada — ignorado');
      return;
    }

    const value = body.entry[0].changes[0].value;

    // Solo procesamos mensajes de texto entrantes, no status updates
    if (!value.messages || value.messages.length === 0) {
      console.log('[WEBHOOK] Event sin mensajes (probablemente status update) — ignorado');
      return;
    }

    const message = value.messages[0];
    const from = message.from; // Número del remitente (ej: "56912345678")

    if (message.type !== 'text') {
      console.log(`[WEBHOOK] Mensaje no-texto de ${from} (tipo: ${message.type}) — respondiendo con aviso`);
      await sendWhatsAppMessage(from, 'Por ahora solo entiendo mensajes de texto. Escríbeme qué reunión quieres agendar 📅');
      return;
    }

    const userText = message.text.body.trim();
    console.log(`[WEBHOOK] Mensaje recibido de ${from}: "${userText}"`);

    await processUserMessage(from, userText);

  } catch (err) {
    console.error('[WEBHOOK] Error procesando mensaje:', err);
  }
}

/**
 * Orquesta el flujo: parsear → crear evento → responder al usuario.
 */
async function processUserMessage(from, userText) {
  // 1. Parsear con Claude
  let parsed;
  try {
    parsed = await parseMessage(userText);
    console.log(`[FLOW] Intención parseada para ${from}:`, JSON.stringify(parsed));
  } catch (err) {
    console.error('[FLOW] Error en parser:', err);
    await sendWhatsAppMessage(from, 'Tuve un problema interpretando tu mensaje. ¿Puedes volver a escribirlo? Por ejemplo: "agéndame una reunión mañana a las 10am con Juan"');
    return;
  }

  // 2. Manejar cada acción
  if (parsed.accion === 'ninguna') {
    await sendWhatsAppMessage(from, parsed.respuesta_usuario);
    return;
  }

  if (parsed.accion === 'falta_info') {
    await sendWhatsAppMessage(from, parsed.respuesta_usuario);
    return;
  }

  if (parsed.accion === 'crear_evento') {
    let eventLink;
    try {
      eventLink = await createCalendarEvent({
        titulo: parsed.titulo,
        fechaInicio: parsed.fecha_inicio,
        fechaFin: parsed.fecha_fin,
      });
      console.log(`[FLOW] Evento creado para ${from}: ${parsed.titulo}`);
    } catch (err) {
      console.error('[FLOW] Error creando evento en Calendar:', err);
      await sendWhatsAppMessage(from, `Parseé la reunión "${parsed.titulo}" pero no pude crearla en el calendario. Intenta de nuevo en un momento.`);
      return;
    }

    const confirmacion = parsed.respuesta_usuario + (eventLink ? `\n🔗 ${eventLink}` : '');
    await sendWhatsAppMessage(from, confirmacion);
    return;
  }

  // Acción desconocida — fallback
  console.warn('[FLOW] Acción desconocida:', parsed.accion);
  await sendWhatsAppMessage(from, 'No entendí bien qué quieres hacer. ¿Puedes decirme qué reunión quieres agendar?');
}

module.exports = { handleWebhookVerification, handleIncomingMessage };
