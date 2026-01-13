#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import zipfile
import xml.etree.ElementTree as ET
import sys
import os

def extract_tables_from_docx(file_path):
    """חילוץ טבלאות מקובץ DOCX"""
    try:
        with zipfile.ZipFile(file_path, 'r') as zip_file:
            # קריאת document.xml
            doc_xml = zip_file.read('word/document.xml').decode('utf-8')
            
            # פרסור XML
            root = ET.fromstring(doc_xml)
            
            # חיפוש טבלאות
            namespaces = {
                'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
            }
            
            tables = root.findall('.//w:tbl', namespaces)
            print(f"נמצאו {len(tables)} טבלאות במסמך\n")
            
            for idx, table in enumerate(tables, 1):
                print(f"=== טבלה {idx} ===")
                rows = table.findall('.//w:tr', namespaces)
                print(f"מספר שורות: {len(rows)}\n")
                
                for row_idx, row in enumerate(rows[:3], 1):  # הדפסת 3 שורות ראשונות
                    cells = row.findall('.//w:tc', namespaces)
                    cell_texts = []
                    for cell in cells:
                        texts = cell.findall('.//w:t', namespaces)
                        cell_text = ' '.join([t.text or '' for t in texts])
                        cell_texts.append(cell_text.strip())
                    print(f"שורה {row_idx}: {' | '.join(cell_texts)}")
                
                if len(rows) > 3:
                    print(f"... ועוד {len(rows) - 3} שורות\n")
                else:
                    print()
                    
    except Exception as e:
        print(f"שגיאה: {e}")
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    file_path = sys.argv[1] if len(sys.argv) > 1 else r'C:\Scaling Calibration HUB\מאזני לחות.docx'
    if os.path.exists(file_path):
        extract_tables_from_docx(file_path)
    else:
        print(f"קובץ לא נמצא: {file_path}")











