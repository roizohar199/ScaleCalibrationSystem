import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const p = path.join(__dirname, '..', '..', 'tmp', 'test-report.pdf');
const buf = fs.readFileSync(p);
const s = buf.toString('utf8');
const samples = [
  'דו"ח בדיקת מאזניים',
  'מרכז',
  'ח"וד',
  'מאזניים בדיקת דו"ח',
];
for (const sample of samples) {
  console.log(sample + ' => ' + (s.indexOf(sample) >= 0));
}
