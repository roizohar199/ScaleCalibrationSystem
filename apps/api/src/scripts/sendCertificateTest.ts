import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const API = `http://localhost:${process.env.PORT || 4010}`;

async function request(path: string, opts: any = {}) {
  const url = API + path;
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch {};
  return { res, text, json, headers: res.headers };
}

async function main() {
  const recipient = process.argv[2] || process.env.SMTP_USER;
  if (!recipient) {
    console.error('Usage: tsx src/scripts/sendCertificateTest.ts recipient@domain');
    process.exit(1);
  }

  // 1) Login as admin
  const loginBody = { email: 'office@weighing.co.il', password: '1234' };
  const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(loginBody) });
  const setCookie = login.headers.get('set-cookie');
  if (!setCookie) {
    console.error('Login failed or no Set-Cookie returned:', login.text || login.json);
    process.exit(2);
  }
  const cookie = setCookie.split(';')[0];
  console.log('Logged in, cookie:', cookie);

  // 2) Get certificates
  const certs = await request('/api/certificates', { headers: { Cookie: cookie } });
  let certificates = certs.json || [];
  console.log('Found certificates count:', Array.isArray(certificates) ? certificates.length : 0);

  let certId: string | null = null;

  if (Array.isArray(certificates) && certificates.length > 0) {
    certId = certificates[0].id;
    console.log('Using existing certificate id:', certId);
  } else {
    // 3) find an approved calibration to issue a cert
    const cals = await request('/api/calibrations', { headers: { Cookie: cookie } });
    const calList = cals.json || [];
    const approved = Array.isArray(calList) ? calList.find((c: any) => c.status === 'APPROVED') : null;
    if (!approved) {
      console.error('No APPROVED calibrations found. Cannot issue certificate.');
      process.exit(3);
    }
    console.log('Found approved calibration:', approved.id);
    const issue = await request(`/api/certificates/${approved.id}/issue`, { method: 'POST', headers: { Cookie: cookie } });
    if (!issue.json || !issue.json.id) {
      console.error('Failed to issue certificate:', issue.text || issue.json);
      process.exit(4);
    }
    certId = issue.json.id;
    console.log('Issued certificate id:', certId);
  }

  // 4) Send certificate via API
  const send = await request(`/api/certificates/${certId}/send-email`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: recipient }) });
  console.log('Send response status:', send.res.status);
  console.log('Send response body:', send.text || send.json);
}

main().catch(err => { console.error(err); process.exit(10); });
