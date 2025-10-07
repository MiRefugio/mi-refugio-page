/* eslint-disable quotes, object-curly-spacing, max-len, require-jsdoc, indent, comma-spacing, no-undef */
"use strict";

/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// functions/index.js
// Cloud Functions v2 + Nodemailer + reCAPTCHA v2 (checkbox)

// Cloud Functions v1 + Runtime Config + Nodemailer + reCAPTCHA v2 (checkbox)
const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const nodemailer = require('nodemailer');

const cfg = functions.config(); // mail.user, mail.pass, recaptcha.secret

exports.contactForm = functions
  .region('us-central1')
  .https.onRequest((req, res) => {
    return cors(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Método no permitido' });
      }

      try {
        const { name, email, type, message, captchaToken } = req.body || {};
        if (!name || !email || !type || !message) {
          return res.status(400).json({ ok: false, error: 'Campos obligatorios incompletos.' });
        }
        if (!captchaToken) {
          return res.status(400).json({ ok: false, error: 'Falta token de reCAPTCHA.' });
        }

        // Verificar reCAPTCHA
        const verify = await fetch('https://www.google.com/recaptcha/api/siteverify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            secret: cfg.recaptcha.secret,
            response: captchaToken,
          }),
        });
        const vjson = await verify.json();
        if (!vjson.success) {
          const reason = (vjson['error-codes'] || []).join(', ');
          return res.status(400).json({ ok: false, error: 'reCAPTCHA inválido: ' + (reason || 'verificación fallida') });
        }

        // Enviar correo (Gmail + App Password)
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: cfg.mail.user, pass: cfg.mail.pass },
        });

        const subject = `Contacto Mi Refugio — ${type}`;
        const html = `
          <div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif">
            <h2 style="margin:0 0 12px">Nuevo mensaje desde la web</h2>
            <p><b>Nombre:</b> ${escapeHtml(name)}</p>
            <p><b>Correo:</b> ${escapeHtml(email)}</p>
            <p><b>Tipo:</b> ${escapeHtml(type)}</p>
            <p><b>Mensaje:</b><br>${escapeHtml(message).replace(/\\n/g,'<br>')}</p>
          </div>
        `;

        await transporter.sendMail({
          from: `"Mi Refugio - Contacto" <${cfg.mail.user}>`,
          to: 'mirefugio.chile@gmail.com',
          replyTo: email,
          subject,
          html,
        });

        return res.json({ ok: true });
      } catch (err) {
        console.error(err);
        return res.status(500).json({ ok: false, error: err.message || 'Error interno' });
      }
    });
  });

function escapeHtml(str = '') {
  return str
    .toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
