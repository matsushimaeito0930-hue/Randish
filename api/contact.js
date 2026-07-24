const sendJson = (response, status, body) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
};

const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { message: 'Method not allowed.' });
  }

  const name = clean(request.body?.name, 100);
  const email = clean(request.body?.email, 254).toLowerCase();
  const subject = clean(request.body?.subject, 200);
  const content = clean(request.body?.content, 5000);
  if (!name || !subject || !content || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return sendJson(response, 400, { message: 'Contact form input is invalid.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_CONTACT_FROM_EMAIL || 'RANDISH Contact <info@randish.jp>';
  if (!apiKey) {
    return sendJson(response, 503, { message: 'Resend contact email is not configured.' });
  }

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#18130f">
      <h1>RANDISH お問い合わせ</h1>
      <p><strong>名前:</strong> ${escapeHtml(name)}</p>
      <p><strong>メールアドレス:</strong> ${escapeHtml(email)}</p>
      <p><strong>件名:</strong> ${escapeHtml(subject)}</p>
      <hr><p style="white-space:pre-wrap">${escapeHtml(content)}</p>
    </div>`;
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: ['info@randish.jp'],
        reply_to: email,
        subject: `[RANDISH お問い合わせ] ${subject}`,
        html,
        text: `名前: ${name}\nメールアドレス: ${email}\n件名: ${subject}\n\n${content}`,
      }),
    });
    if (!result.ok) {
      return sendJson(response, 400, { message: 'Resend contact email send failed.' });
    }
    return sendJson(response, 200, { success: true, message: 'お問い合わせを送信しました。' });
  } catch {
    return sendJson(response, 502, { message: 'Resend contact email send failed.' });
  }
};
