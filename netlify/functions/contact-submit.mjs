const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  },
  body: JSON.stringify(body)
});

const clean = (value, max) => String(value ?? '').trim().slice(0, max);
// Strip CR/LF so user input can never inject email headers or log lines.
const oneLine = (value) => String(value).replace(/[\r\n]+/g, ' ');

export const handler = async (event) => {
  const h = event.headers || {};
  const wantsJson = String(h.accept || h.Accept || '').includes('application/json');
  const send = (statusCode, body) => {
    // Plain HTML form posts (JavaScript disabled) get redirected instead of raw JSON.
    if (wantsJson) return json(statusCode, body);
    const target = body.ok ? '/thanks.html' : '/contact.html?error=1';
    return { statusCode: 303, headers: { Location: target, 'Cache-Control': 'no-store' }, body: '' };
  };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  if ((event.body || '').length > 20000) return json(413, { error: 'Request too large.' });
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (allowed.length && origin && !allowed.includes(origin)) return send(403, { error: 'Origin not allowed.' });

  let data;
  try {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    if (contentType.includes('application/json')) data = JSON.parse(rawBody || '{}');
    else data = Object.fromEntries(new URLSearchParams(rawBody));
  } catch { return send(400, { error: 'Invalid request.' }); }

  // Honeypot field: return a generic success to avoid revealing spam filtering.
  if (clean(data['bot-field'], 200)) return send(200, { ok: true });
  const name = clean(data.name, 120);
  const email = clean(data.email, 254).toLowerCase();
  const organisation = clean(data.org || data.organisation, 180);
  const service = clean(data.service, 160) || 'Not sure yet';
  const message = clean(data.message, 5000);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || message.length < 10) {
    return send(400, { error: 'Please check your name, email and message.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Contact submission unavailable: server-side Supabase environment variables are missing.');
    return send(503, { error: 'The enquiry form is temporarily unavailable. Please try again later.' });
  }

  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let saved;
  try {
    const response = await fetch(`${base}/rest/v1/enquiries`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ name, email, organisation, service, message, source: 'website', status: 'new' })
    });
    if (!response.ok) {
      console.error('Supabase enquiry insert failed:', response.status, (await response.text()).slice(0, 300));
      return send(503, { error: 'The enquiry could not be saved. Please try again later.' });
    }
    saved = (await response.json())[0];
  } catch (error) {
    console.error('Supabase enquiry insert error:', error?.message || 'unknown');
    return send(503, { error: 'The enquiry could not be saved. Please try again later.' });
  }

  let notificationStatus = 'not_configured';
  if (process.env.RESEND_API_KEY && process.env.NOTIFICATION_EMAIL && process.env.FROM_EMAIL) {
    try {
      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL,
          reply_to: email,
          to: [process.env.NOTIFICATION_EMAIL],
          subject: `New Vertex Insights enquiry: ${oneLine(name)}`,
          text: `A new website enquiry was received.\n\nName: ${name}\nEmail: ${email}\nOrganisation: ${organisation || 'Not provided'}\nService: ${service}\n\nMessage:\n${message}\n\nEnquiry ID: ${saved?.id || 'saved'}`
        })
      });
      notificationStatus = emailResponse.ok ? 'sent' : 'failed';
      if (!emailResponse.ok) console.error('Email notification provider returned status:', emailResponse.status);
    } catch (error) {
      notificationStatus = 'failed';
      console.error('Email notification error:', error?.message || 'unknown');
    }
  }
  {
    if (saved?.id) {
      try {
        await fetch(`${base}/rest/v1/enquiries?id=eq.${encodeURIComponent(saved.id)}`, {
          method: 'PATCH',
          headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ email_notification_status: notificationStatus })
        });
      } catch (error) { console.error('Could not update notification status:', error?.message || 'unknown'); }
    }
  }

  return send(200, { ok: true, notification: notificationStatus });
};
