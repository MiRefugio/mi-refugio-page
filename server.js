import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.ALLOW_ORIGIN?.split(',') || '*' }));

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 465),
  secure: String(process.env.SMTP_SECURE || 'true') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

async function verifyRecaptcha(token){
  const params = new URLSearchParams();
  params.append('secret', process.env.RECAPTCHA_SECRET_KEY);
  params.append('response', token);
  const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body: params
  });
  return resp.json(); // { success: true/false, ... }
}

app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, type, message, recaptcha } = req.body || {};
    if (!name || !email || !type || !message || !recaptcha){
      return res.status(400).json({ error:'Campos requeridos faltantes' });
    }

    const captcha = await verifyRecaptcha(recaptcha);
    if (!captcha.success) return res.status(400).json({ error:'reCAPTCHA inválido' });

    await transporter.sendMail({
      from: `"Mi Refugio" <${process.env.SMTP_USER}>`,
      to: process.env.MAIL_TO,
      replyTo: email,
      subject: `Contacto Mi Refugio — ${type}`,
      html: `
        <h2>Nuevo mensaje</h2>
        <ul>
          <li><b>Nombre:</b> ${name}</li>
          <li><b>Correo:</b> ${email}</li>
          <li><b>Tipo:</b> ${type}</li>
        </ul>
        <pre style="white-space:pre-wrap">${message}</pre>
        <hr><small>Origen: Web · reCAPTCHA OK</small>
      `
    });

    res.json({ ok:true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error:'No se pudo enviar el correo' });
  }
});

app.listen(process.env.PORT || 3001, () =>
  console.log(`API contacto lista en http://localhost:${process.env.PORT||3001}`)
);
