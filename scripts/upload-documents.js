import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

const API_URL = 'http://localhost:4010';
const EMAIL = 'office@local';
const PASSWORD = '1234';
const ZIP_PATH = process.argv[2] || '../../test-import.zip';

async function uploadDocuments() {
  try {
    // Login
    console.log('Logging in...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD })
    });

    if (!loginRes.ok) {
      const error = await loginRes.text();
      throw new Error(`Login failed: ${error}`);
    }

    const { token } = await loginRes.json();
    console.log('Login successful!');

    // Upload file
    console.log(`Uploading ${ZIP_PATH}...`);
    const formData = new FormData();
    formData.append('file', fs.createReadStream(ZIP_PATH));

    const uploadRes = await fetch(`${API_URL}/imports/documents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      throw new Error(`Upload failed: ${error}`);
    }

    const result = await uploadRes.json();
    console.log('\n=== Upload Results ===');
    console.log(`Processed: ${result.processed} documents`);
    if (result.errors && result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    } else {
      console.log('No errors!');
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

uploadDocuments();

