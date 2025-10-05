// js/donations.js

// Relleno rápido de montos
document.querySelectorAll('#donaciones [data-amount]')?.forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById('donationAmount');
    input.value = btn.getAttribute('data-amount');
  });
});

// Validación + punto de integración con tu backend
const form = document.getElementById('donation-form');
form?.addEventListener('submit', async (e) => {
  if (!form.checkValidity()) {
    e.preventDefault();
    e.stopPropagation();
    form.classList.add('was-validated');
    return;
  }

  e.preventDefault(); // Evita submit por defecto: aquí va tu backend
  form.classList.add('was-validated');

  // Datos del formulario
  const payload = {
    amount_clp: Number(document.getElementById('donationAmount').value),
    name: document.getElementById('donorName').value || null,
    email: document.getElementById('donorEmail').value,
    type: document.querySelector('input[name=\"donationType\"]:checked')?.value || 'one_time',
    accepted_terms: document.getElementById('terms').checked,
    source: 'web', // útil para analytics
  };

  // Endpoint a implementar por ti (ej. Express/NestJS)
  const endpoint = form.dataset.endpoint || '/api/donations/create';

  /* EJEMPLO DE INTEGRACIÓN (cuando tengas backend):
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Error al procesar donación');
    const data = await res.json();

    // Si rediriges a Webpay/checkout:
    // window.location.href = data.redirect_url;

    alert('¡Gracias por tu aporte! Revisa tu correo para el comprobante.');
    form.reset();
    form.classList.remove('was-validated');
  } catch (err) {
    console.error(err);
    alert('No pudimos procesar tu donación. Intenta nuevamente.');
  }
  */
});
