import fs from "fs";
import path from "path";
import mammoth from "mammoth";

/**
 * סקריפט לחילוץ טבלת "סטיית דיוק הסקלה וסטיה מאיפוס" מקובץ DOCX
 */

async function extractAccuracyTable(filePath: string) {
  console.log(`📄 קורא קובץ: ${filePath}`);
  
  const buffer = fs.readFileSync(filePath);
  
  // המרה ל-HTML
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value;
  
  console.log(`✅ HTML נוצר, אורך: ${html.length} תווים\n`);
  
  // חילוץ טבלאות
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  let tableCount = 0;
  
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tableCount++;
    const tableHtml = tableMatch[1];
    
    // חילוץ שורות
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const tableRows: string[][] = [];
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      const rowCells: string[] = [];
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        const cellText = cellMatch[1]
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, ' ')
          .trim();
        rowCells.push(cellText);
      }
      
      if (rowCells.length > 0) {
        tableRows.push(rowCells);
      }
    }
    
    if (tableRows.length < 2) continue;
    
    // בדיקה אם זו טבלת דיוק
    const headerRow = tableRows[0].join(' ').toLowerCase();
    const isAccuracyTable = 
      headerRow.includes('סטיית דיוק') || 
      headerRow.includes('accuracy of reading') ||
      headerRow.includes('permissible error') ||
      (headerRow.includes('upload') && headerRow.includes('download')) ||
      (headerRow.includes('קריאה בעליה') && headerRow.includes('קריאה בירידה'));
    
    if (isAccuracyTable) {
      console.log(`\n📊 נמצאה טבלת בדיקת דיוק (טבלה #${tableCount}):`);
      console.log(`   שורות: ${tableRows.length}`);
      console.log(`   עמודות: ${tableRows[0]?.length || 0}\n`);
      
      // הדפסת כותרות
      console.log("כותרות:");
      tableRows[0].forEach((cell, i) => {
        console.log(`  [${i}]: ${cell}`);
      });
      console.log();
      
      // הדפסת שורות נתונים
      console.log("שורות נתונים:");
      for (let i = 1; i < tableRows.length; i++) {
        const row = tableRows[i];
        console.log(`\nשורה ${i}:`);
        row.forEach((cell, j) => {
          console.log(`  [${j}]: ${cell}`);
        });
        
        // ניסיון לחלץ מספרים
        const numbers: number[] = [];
        for (const cell of row) {
          let cleaned = cell.replace(/[^\d.,\-\s]/g, ' ').trim();
          cleaned = cleaned.replace(/(\d)\s+\./g, '$1.').replace(/\.\s+(\d)/g, '.$1');
          cleaned = cleaned.replace(/,/g, '.');
          cleaned = cleaned.replace(/\s+/g, '');
          
          const numMatches = cleaned.match(/-?\d+\.?\d*/g);
          if (numMatches && numMatches.length > 0) {
            for (const numStr of numMatches) {
              const num = parseFloat(numStr);
              if (!isNaN(num)) {
                numbers.push(num);
              }
            }
          }
        }
        
        if (numbers.length > 0) {
          console.log(`  מספרים שנמצאו: ${numbers.join(', ')}`);
        }
      }
      
      // החזרת המבנה המלא
      return {
        headers: tableRows[0],
        rows: tableRows.slice(1),
        rawHtml: tableHtml
      };
    }
  }
  
  console.log(`\n⚠️ לא נמצאה טבלת בדיקת דיוק בקובץ`);
  return null;
}

async function main() {
  const filePath = process.argv[2] || path.resolve("15קג 1גרם.docx");
  
  try {
    const result = await extractAccuracyTable(filePath);
    
    if (result) {
      console.log("\n✅ טבלה נחלצה בהצלחה!");
    } else {
      console.log("\n❌ לא נמצאה טבלת בדיקת דיוק");
    }
  } catch (error) {
    console.error("❌ שגיאה:", error);
    process.exit(1);
  }
}

main();




