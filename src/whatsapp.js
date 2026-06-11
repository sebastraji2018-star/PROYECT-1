const axios = require('axios');

const WHATSAPP_API_URL = 'https://graph.facebook.com/v20.0';

/**
 * Envía un mensaje de texto a un número de WhatsApp usando la Cloud API de Meta.
 * @param {string} to - Número destino en formato internacional sin +, ej: "56912345678"
 * @param {string} text - Texto a enviar (máx. 4096 caracteres)
 * @returns {Promise<void>}
 */
async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.error('[WHATSAPP] WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN no configurados');
    return;
  }

  // Truncar si supera el límite de WhatsApp
  const safeText = text.length > 4096 ? text.slice(0, 4093) + '...' : text;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: safeText },
  };

  console.log(`[WHATSAPP] Enviando mensaje a ${to}: "${safeText.slice(0, 80)}${safeText.length > 80 ? '...' : ''}"`);

  try {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000, // 10 segundos
      }
    );

    const messageId = response.data?.messages?.[0]?.id;
    console.log(`[WHATSAPP] Mensaje enviado exitosamente. Message ID: ${messageId}`);

  } catch (err) {
    const status = err?.response?.status;
    const errorData = err?.response?.data?.error;
    const msg = errorData?.message || err.message;
    console.error(`[WHATSAPP] Error enviando mensaje a ${to} (HTTP ${status}): ${msg}`);

    if (errorData?.code === 131030) {
      console.error('[WHATSAPP] El número no está registrado en WhatsApp o fuera de la ventana de 24h');
    }
    if (status === 401) {
      console.error('[WHATSAPP] Token inválido o expirado. Revisa WHATSAPP_TOKEN.');
    }

    // No re-throw: si falla el envío no queremos crashear el proceso
  }
}

module.exports = { sendWhatsAppMessage };
