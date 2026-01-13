import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateReportPDF } from '../modules/calibrations/reportPdf';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const sample = {
    reportNo: '2026-TEST-0001',
    customer: { name: 'לקוחות לדוגמה', customerNo: 'C-123', address: 'רחוב הישראל 1' },
    scale: {
      model: {
        manufacturer: 'A&D',
        modelName: 'electronic',
        maxCapacity: 30,
        e: 0.01,
        d: 0.01,
        unit: 'kg',
        accuracyClass: 'III'
      },
      serialMfg: 'SN5675765'
    },
    testDate: new Date().toISOString(),
    measurementsJson: JSON.stringify({
      measurements: {
        accuracy: [
          { load: 0, reading1: 0, reading3: 0, tolerance: 0.001 },
          { load: 5, reading1: 5.002, reading3: 4.998, tolerance: 0.01 }
        ],
        eccentricity: [],
        repeatability: [],
        sensitivity: [],
        time: [],
        tare: []
      }
    })
  } as any;

  const outDir = path.join(__dirname, '../../tmp');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `test-report-${Date.now()}.pdf`);

  try {
    const buf = await generateReportPDF(sample);
    fs.writeFileSync(outPath, buf);
    console.log('Generated PDF at:', outPath);
    process.exit(0);
  } catch (err) {
    console.error('PDF generation failed:', err);
    process.exit(2);
  }
}

run();
