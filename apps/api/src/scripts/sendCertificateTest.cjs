require('dotenv').config();
const fetch = global.fetch || require('node-fetch');
const API = `http://localhost:${process.env.PORT || 4010}`;

async function main() {
  const recipient = process.argv[2] || process.env.SMTP_USER;
  if (!recipient) { console.error('Usage: node sendCertificateTest.cjs recipient@domain'); process.exit(1); }

  const loginRes = await fetch(API + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'office@weighing.co.il', password: '1234' })
  });
  const setCookie = loginRes.headers.get('set-cookie');
  if (!setCookie) { console.error('Login failed or no set-cookie:', await loginRes.text()); process.exit(2); }
  const cookie = setCookie.split(';')[0];
  console.log('Logged in, cookie:', cookie);

  const certsRes = await fetch(API + '/api/certificates', { headers: { Cookie: cookie } });
  const certs = await certsRes.json();
  if (Array.isArray(certs) && certs.length > 0) {
    const id = certs[0].id;
    console.log('Using certificate id:', id);
    const sendRes = await fetch(`${API}/api/certificates/${id}/send-email`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recipient }) });
    const sendBody = await sendRes.text();
    console.log('Send status:', sendRes.status, 'body:', sendBody);
  } else {
    console.log('No certificates found. Cannot proceed.');
  }
}

main().catch(err => { console.error(err); process.exit(10); });
