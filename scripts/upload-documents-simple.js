// Simple script to upload documents via API
// Usage: node scripts/upload-documents-simple.js <path-to-zip>

import http from 'http';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = 'http://localhost:4010';
const EMAIL = 'office@local';
const PASSWORD = '1234';
const ZIP_PATH = process.argv[2] || resolve(__dirname, '../../test-import.zip');

async function login() {
  return new Promise((resolve, reject) => {
    const loginData = JSON.stringify({ email: EMAIL, password: PASSWORD });
    
    const options = {
      hostname: 'localhost',
      port: 4010,
      path: '/auth/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(loginData)
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          const result = JSON.parse(data);
          resolve(result.token);
        } else {
          reject(new Error(`Login failed: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(loginData);
    req.end();
  });
}

async function uploadFile(token, filePath) {
  return new Promise((resolve, reject) => {
    const fileContent = fs.readFileSync(filePath);
    const fileName = filePath.split(/[/\\]/).pop();
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    
    const formData = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`),
      Buffer.from('Content-Type: application/zip\r\n\r\n'),
      fileContent,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);

    const options = {
      hostname: 'localhost',
      port: 4010,
      path: '/imports/documents',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': formData.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Upload failed (${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

async function main() {
  try {
    console.log('=== Document Upload Script ===\n');
    
    console.log('Logging in...');
    const token = await login();
    console.log('Login successful!\n');
    
    console.log(`Uploading: ${ZIP_PATH}`);
    const fileSize = fs.statSync(ZIP_PATH).size;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB\n`);
    
    const result = await uploadFile(token, ZIP_PATH);
    
    console.log('=== Upload Results ===');
    console.log(`Processed: ${result.processed} documents`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    } else {
      console.log('No errors!');
    }
    
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();

