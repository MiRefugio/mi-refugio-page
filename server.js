// server.js — API Contacto Mi Refugio (ESM)
// Requisitos: Node 18+ (fetch global), "type":"module" en package.json

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

// ---------------------------
// Config básica
// ---------------------------
const app = express();

// Límite de tamaño de body
app.use(express.json({ limit: '64kb' }));

// CORS: permite múltiples orígenes desde .env (separados por coma)
const allowList = (process.env.ALLOW_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Permitir sin origin (curl / Postman) o si está en la lista
    if (!origin || allowList.includes('*') || allowList.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for origin: ' + origin), false);
  }
}));

// Cabeceras de seguridad mínimas (sin helmet)
app.use((_, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ---------------------------
// SMTP transporter (pool)
// ---------------------------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || 'true') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  pool: true,              // reusa conexiones
  maxConnections: 5,
  maxMessages: 50
});

// Verificación inicial de SMTP
transporter.verify((err) => {
  if (err) {
    console.error('[SMTP VERIFY ERROR]', err);
  } else {
    console.log('[SMTP] listo para enviar');
  }
});

// ---------------------------
// Utilidades
// ---------------------------

// Escape básico para evitar HTML no deseado en el correo
const escapeHtml = (str = '') =>
  str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Validación simple de email
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

// Rate-limit sencillo en memoria (por IP)
const rlStore = new Map(); // ip -> {count, resetAt}
const RATE_WINDOW_MS = 60_000; // 1 min
const RATE_MAX = 20;           // 20 req/min por IP

function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const item = rlStore.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > item.resetAt) {
    item.count = 0;
    item.resetAt = now + RATE_WINDOW_MS;
  }
  item.count++;
  rlStore.set(ip, item);
  res.setHeader('X-RateLimit-Limit', RATE_MAX.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_MAX - item.count).toString());
  res.setHeader('X-RateLimit-Reset', Math.floor(item.resetAt / 1000).toString());
  if (item.count > RATE_MAX) return res.status(429).json({ error: 'Rate limit exceeded' });
  next();
}

// Verificación reCAPTCHA v2 (checkbox)
async function verifyRecaptcha(token, remoteip) {
  const params = new URLSearchParams();
  params.append('secret', process.env.RECAPTCHA_SECRET_KEY || '');
  params.append('response', token);
  if (remoteip) params.append('remoteip', remoteip);

  const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  return resp.json(); // { success: true/false, hostname?, challenge_ts?, ... }
}

// ---------------------------
// Rutas
// ---------------------------

app.get('/health', async (req, res) => {
  try {
    await transporter.verify();
    res.json({ ok: true, smtp: 'ok', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ ok: false, smtp: 'fail', error: e.message });
  }
});

app.post('/api/contact', rateLimit, async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0].trim() || req.socket.remoteAddress || '';
    const { name, email, type, message, recaptcha } = req.body || {};

    // Validaciones
    if (!name || !email || !type || !message || !recaptcha) {
      return res.status(400).json({ error: 'Campos requeridos faltantes' });
    }
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Correo inválido' });
    }
    const allowedTypes = new Set(['pregunta', 'sugerencia', 'otro']);
    if (!allowedTypes.has(String(type))) {
      return res.status(400).json({ error: 'Tipo inválido' });
    }
    if (String(message).trim().length < 10 || String(message).length > 1000) {
      return res.status(400).json({ error: 'Mensaje debe tener entre 10 y 1000 caracteres' });
    }

    // reCAPTCHA
    const captcha = await verifyRecaptcha(recaptcha, ip);
    if (!captcha?.success) {
      return res.status(400).json({ error: 'reCAPTCHA inválido' });
    }
    // (Opcional) validar hostname si quieres atar a mirefugio.github.io:
    // if (captcha.hostname && captcha.hostname !== 'mirefugio.github.io') { ... }

    // Sanitizar contenido para el correo HTML
    const safeName = escapeHtml(String(name).trim());
    const safeEmail = escapeHtml(String(email).trim());
    const safeType = escapeHtml(String(type).trim());
    const safeMsg = escapeHtml(String(message).trim());

    // Enviar correo
    const info = await transporter.sendMail({
      from: `"Mi Refugio" <${process.env.SMTP_USER}>`,  // Debe coincidir con SMTP_USER
      to: process.env.MAIL_TO,
      replyTo: safeEmail,
      subject: `Contacto Mi Refugio — ${safeType}`,
      html: `
        <h2>Nuevo mensaje de contacto</h2>
        <ul>
          <li><b>Nombre:</b> ${safeName}</li>
          <li><b>Correo:</b> ${safeEmail}</li>
          <li><b>Tipo:</b> ${safeType}</li>
          <li><b>IP:</b> ${escapeHtml(ip)}</li>
        </ul>
        <pre style="white-space:pre-wrap;font-family:system-ui,Segoe UI,Arial,sans-serif">${safeMsg}</pre>
        <hr>
        <small>Origen: Web · reCAPTCHA OK · ${new Date().toISOString()}</small>
      `
    });

    console.log('[MAIL OK]', info.messageId);
    return res.json({ ok: true });
  } catch (e) {
    console.error('[MAIL ERROR]', {
      message: e?.message,
      code: e?.code,
      response: e?.response,
      responseCode: e?.responseCode
    });
    return res.status(500).json({ error: 'No se pudo enviar el correo' });
  }
});

// ---------------------------
// Arranque
// ---------------------------
const PORT = Number(process.env.PORT || 3001);
app.listen(PORT, () => {
  console.log(`API contacto lista en http://localhost:${PORT}`);
});
