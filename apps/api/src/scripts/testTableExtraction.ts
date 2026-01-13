import fs from "fs";
import path from "path";
import mammoth from "mammoth";

async function testExtractTables(filePath: string) {
  console.log(`מנסה לחלץ טבלאות מ: ${filePath}\n`);
  
  if (!fs.existsSync(filePath)) {
    console.error(`הקובץ לא נמצא: ${filePath}`);
    return;
  }
  
  const buffer = fs.readFileSync(filePath);
  
  try {
    // ניסיון 1: חילוץ HTML
    console.log("=== ניסיון חילוץ HTML ===");
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;
    console.log(`אורך HTML: ${html.length} תווים`);
    
    // חיפוש טבלאות ב-HTML
    const tableMatches = html.match(/<table[^>]*>[\s\S]*?<\/table>/gi);
    console.log(`נמצאו ${tableMatches ? tableMatches.length : 0} טבלאות ב-HTML`);
    
    if (tableMatches && tableMatches.length > 0) {
      console.log("\n=== תוכן הטבלאות ===");
      tableMatches.forEach((table, idx) => {
        console.log(`\nטבלה ${idx + 1}:`);
        console.log(table.substring(0, 500)); // הדפסת 500 תווים ראשונים
      });
    }
    
    // ניסיון 2: חילוץ טקסט גולמי
    console.log("\n=== ניסיון חילוץ טקסט גולמי ===");
    const textResult = await mammoth.extractRawText({ buffer });
    const text = textResult.value;
    console.log(`אורך טקסט: ${text.length} תווים`);
    console.log(`תחילת הטקסט:\n${text.substring(0, 1000)}`);
    
    // ניסיון 3: חילוץ ישירות מה-XML
    console.log("\n=== ניסיון חילוץ ישירות מה-XML ===");
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip(buffer);
    const docXml = zip.getEntry("word/document.xml")?.getData().toString("utf-8");
    
    if (docXml) {
      const tableMatchesXml = docXml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/gi);
      console.log(`נמצאו ${tableMatchesXml ? tableMatchesXml.length : 0} טבלאות ב-XML`);
      
      if (tableMatchesXml && tableMatchesXml.length > 0) {
        console.log("\n=== תוכן הטבלאות מה-XML ===");
        tableMatchesXml.forEach((table, idx) => {
          console.log(`\nטבלה ${idx + 1} (ראשוני 500 תווים):`);
          console.log(table.substring(0, 500));
        });
      }
    }
    
  } catch (error: any) {
    console.error("שגיאה:", error.message);
    console.error(error.stack);
  }
}

// הרצת הבדיקה
const filePath = process.argv[2] || "C:\\Scaling Calibration HUB\\מאזני לחות.docx";
testExtractTables(filePath)
  .then(() => {
    console.log("\nסיום בדיקה");
    process.exit(0);
  })
  .catch((error) => {
    console.error("שגיאה:", error);
    process.exit(1);
  });

