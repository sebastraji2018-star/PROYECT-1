require('dotenv').config();
const express = require('express');
const { handleWebhookVerification, handleIncomingMessage } = require('./webhook');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'whatsapp-calendar-assistant', timestamp: new Date().toISOString() });
});

// Verificación del webhook de Meta (GET)
app.get('/webhook', handleWebhookVerification);

// Recepción de mensajes entrantes de Meta (POST)
app.post('/webhook', handleIncomingMessage);

app.listen(PORT, () => {
  console.log(`[SERVER] Iniciado en puerto ${PORT}`);
  console.log(`[SERVER] Zona horaria: ${process.env.TZ || 'America/Santiago'}`);
});

// Captura errores no manejados para evitar crashes silenciosos
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1); // Docker/Railway reiniciará el proceso
});

process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  process.exit(1);
});
