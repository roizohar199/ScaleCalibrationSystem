const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');

const filePath = process.argv[2] || path.join(__dirname, '../../מאזני לחות.docx');

console.log('בודק קובץ:', filePath);

if (!fs.existsSync(filePath)) {
  console.error('קובץ לא נמצא:', filePath);
  process.exit(1);
}

async function testExtractTables() {
  try {
    const buffer = fs.readFileSync(filePath);
    
    // חילוץ HTML
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;
    
    console.log('\n=== HTML תוצאה (1000 תווים ראשונים) ===');
    console.log(html.substring(0, 1000));
    
    // חילוץ טקסט גולמי
    const textResult = await mammoth.extractRawText({ buffer });
    const text = textResult.value;
    
    console.log('\n=== טקסט גולמי (500 תווים ראשונים) ===');
    console.log(text.substring(0, 500));
    
    // חיפוש טבלאות ב-HTML
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    const tables = [];
    let match;
    
    while ((match = tableRegex.exec(html)) !== null) {
      tables.push(match[1]);
    }
    
    console.log(`\n=== נמצאו ${tables.length} טבלאות ===\n`);
    
    tables.forEach((tableHtml, idx) => {
      console.log(`\n--- טבלה ${idx + 1} ---`);
      const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      const rows = [];
      let rowMatch;
      
      while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
        rows.push(rowMatch[1]);
      }
      
      console.log(`מספר שורות: ${rows.length}`);
      
      // הדפסת 3 שורות ראשונות
      rows.slice(0, 3).forEach((rowHtml, rowIdx) => {
        const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
        const cells = [];
        let cellMatch;
        
        while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
          const cellText = cellMatch[1]
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          cells.push(cellText);
        }
        
        console.log(`שורה ${rowIdx + 1}: ${cells.join(' | ')}`);
      });
    });
    
  } catch (error) {
    console.error('שגיאה:', error);
    process.exit(1);
  }
}

testExtractTables();











