import React from 'react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { CheckCircle, XCircle, ChevronUp, ChevronDown, Info } from 'lucide-react';

interface MeasurementRow {
  load?: number;
  position?: string;
  reading1?: number | null;
  reading2?: number | null;
  reading3?: number | null;
  reading?: number | null;
  readings?: (number | null)[];
  average?: number | null;
  error?: number | null;
  std_dev?: number | null;
  tolerance?: number;
  pass?: boolean | null;
}

interface MeasurementTableProps {
  type: 'accuracy' | 'eccentricity' | 'repeatability';
  measurements: MeasurementRow[];
  onMeasurementChange: (index: number, field: string, value: any) => void;
  readOnly?: boolean;
  profile?: any;
}

export default function MeasurementTable({ 
  type, 
  measurements, 
  onMeasurementChange, 
  readOnly = false,
  profile
}: MeasurementTableProps) {
  // פונקציה לעיצוב מספר - מסירה אפסים מיותרים בסוף, אבל מציגה 0.000
  const formatNumber = (num: number): string => {
    if (num === 0) {
      return '0.000';
    }
    if (num % 1 === 0) {
      return num.toString();
    }
    // מציג מספר עם עד 3 ספרות אחרי הנקודה, אבל מסיר אפסים מיותרים בסוף
    return parseFloat(num.toFixed(3)).toString();
  };

  // פונקציה לעיצוב tolerance - מציגה עד 4 ספרות אחרי הנקודה כדי להציג 0.0005 נכון
  const formatTolerance = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return '-';
    if (num === 0) return '0.000';
    // נציג עם עד 4 ספרות אחרי הנקודה, אבל נסיר אפסים מיותרים בסוף
    const formatted = num.toFixed(4);
    // נסיר אפסים מיותרים בסוף, אבל נשאיר לפחות 3 ספרות אחרי הנקודה
    const trimmed = formatted.replace(/\.?0+$/, '');
    // אם אין נקודה עשרונית, נוסיף .000
    if (!trimmed.includes('.')) {
      return trimmed + '.000';
    }
    // אם יש פחות מ-3 ספרות אחרי הנקודה, נוסיף אפסים
    const parts = trimmed.split('.');
    if (parts[1].length < 3) {
      return parts[0] + '.' + parts[1].padEnd(3, '0');
    }
    return trimmed;
  };

  // פונקציה לעדכון ערך עם צעד (step)
  const updateValue = (index: number, field: string, currentValue: number | null | undefined, step: number, direction: 'up' | 'down') => {
    if (readOnly) return;
    
    const current = currentValue !== null && currentValue !== undefined ? currentValue : 0;
    const newValue = direction === 'up' ? current + step : current - step;
    // עיגול ל-3 ספרות אחרי הנקודה
    const roundedValue = Math.round(newValue * 1000) / 1000;
    onMeasurementChange(index, field, roundedValue);
  };

  // קומפוננטה לכפתורי חץ למעלה/למטה
  const ArrowButtons = ({ 
    onUp, 
    onDown, 
    disabled = false 
  }: { 
    onUp: () => void; 
    onDown: () => void; 
    disabled?: boolean;
  }) => {
    if (readOnly || disabled) return null;
    
    return (
      <div className="flex flex-col gap-0.5 mr-1">
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onUp();
          }}
          className="h-3 w-4 flex items-center justify-center hover:bg-slate-100 rounded-t border border-slate-200 border-b-0"
          title="הגדל"
        >
          <ChevronUp className="h-3 w-3 text-slate-600" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDown();
          }}
          className="h-3 w-4 flex items-center justify-center hover:bg-slate-100 rounded-b border border-slate-200"
          title="הקטן"
        >
          <ChevronDown className="h-3 w-3 text-slate-600" />
        </button>
      </div>
    );
  };

  const renderAccuracyTable = () => {
    // חישוב סטיות
    const calculateUploadError = (reading: number | null | undefined, load: number | null | undefined) => {
      if (reading !== null && reading !== undefined && load !== null && load !== undefined) {
        return (reading - load).toFixed(3);
      }
      return '-';
    };

    const calculateDownloadError = (reading: number | null | undefined, load: number | null | undefined) => {
      if (reading !== null && reading !== undefined && load !== null && load !== undefined) {
        return (reading - load).toFixed(3);
      }
      return '-';
    };

    return (
      <div className="overflow-x-auto" dir="rtl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* סדר העמודות הפוך (משמאל לימין): מסה מועמסת | קריאה בעליה | סטיה בעליה | קריאה בירידה | סטיה בירידה | סטיה מותרת */}
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">מסה מועמסת<br />LOAD MASS</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">קריאה בעליה<br />UPLOAD READING</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">סטיה בעליה<br />UPLOAD ERROR</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">קריאה בירידה<br />DOWNLOAD READING</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">סטיה בירידה<br />DOWNLOAD ERROR</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">
                <div className="flex items-center justify-end gap-1">
                  <span>סטיה מותרת<br />PERMISSIBLE ERROR</span>
                  <div className="group relative">
                    <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      הסטייה המותרת (MPE) מחושבת לפי תקן OIML R76 Table 6 ויכולה להיות קטנה מ-e בעומסים נמוכים: 0.5e, 1e, או 1.5e בהתאם לעומס ורמת הדיוק
                    </div>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {(!measurements || measurements.length === 0) ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  אין נתונים להצגה
                </td>
              </tr>
            ) : (
              measurements.map((row, index) => {
              const uploadReading = row.reading1;
              const downloadReading = row.reading3;
              const load = row.load;
              const uploadError = calculateUploadError(uploadReading, load);
              const downloadError = calculateDownloadError(downloadReading, load);
              
              // #region agent log
              if (index < 6) {
                fetch('http://127.0.0.1:7243/ingest/30140c7b-1d13-4efb-a927-9f6d978ce01a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MeasurementTable.tsx:82',message:'MeasurementTable - row values',data:{index,load,uploadReading,downloadReading,uploadError,downloadError,tolerance:row.tolerance},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'J'})}).catch(()=>{});
              }
              // #endregion
              
              return (
                <tr key={index} className="border-b border-slate-200 hover:bg-slate-50/50">
                  {/* מסה מועמסת */}
                  <td className="px-2 py-3 font-medium text-slate-700 border border-slate-200">
                    <div className="flex items-center justify-center gap-1">
                      {!readOnly && (
                        <ArrowButtons
                          onUp={() => updateValue(index, 'load', load, 0.1, 'up')}
                          onDown={() => updateValue(index, 'load', load, 0.1, 'down')}
                        />
                      )}
                      <span className="flex-1 text-center">
                    {load !== null && load !== undefined 
                      ? formatNumber(load)
                      : '-'}
                      </span>
                    </div>
                  </td>
                  
                  {/* קריאה בעליה */}
                  <td className="px-2 py-2 border border-slate-200">
                    {readOnly ? (
                      <span className="text-sm text-slate-700">{uploadReading !== null && uploadReading !== undefined ? uploadReading.toFixed(3) : (load === 0 ? '0.000' : '')}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ArrowButtons
                          onUp={() => updateValue(index, 'reading1', uploadReading, 0.001, 'up')}
                          onDown={() => updateValue(index, 'reading1', uploadReading, 0.001, 'down')}
                        />
                      <Input
                        type="text"
                        value={uploadReading !== null && uploadReading !== undefined ? uploadReading.toFixed(3) : (load === 0 ? '0.000' : '')}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === '' || val === '0.000') {
                            onMeasurementChange(index, 'reading1', val === '0.000' ? 0 : null);
                          } else {
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                              onMeasurementChange(index, 'reading1', num);
                            }
                          }
                        }}
                        disabled={readOnly}
                          className="h-8 flex-1 text-center border-0 focus-visible:ring-0"
                      />
                      </div>
                    )}
                  </td>
                  
                  {/* סטיה בעליה */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200">
                    <span className="block">{uploadError === '-' ? '0.000' : uploadError}</span>
                  </td>
                  
                  {/* קריאה בירידה */}
                  <td className="px-2 py-2 border border-slate-200">
                    {readOnly ? (
                      <span className="text-sm text-slate-700">{downloadReading !== null && downloadReading !== undefined ? downloadReading.toFixed(3) : (load === 0 ? '0.000' : '')}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ArrowButtons
                          onUp={() => updateValue(index, 'reading3', downloadReading, 0.001, 'up')}
                          onDown={() => updateValue(index, 'reading3', downloadReading, 0.001, 'down')}
                        />
                      <Input
                        type="text"
                        value={downloadReading !== null && downloadReading !== undefined ? downloadReading.toFixed(3) : (load === 0 ? '0.000' : '')}
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === '' || val === '0.000') {
                            onMeasurementChange(index, 'reading3', val === '0.000' ? 0 : null);
                          } else {
                            const num = parseFloat(val);
                            if (!isNaN(num)) {
                              onMeasurementChange(index, 'reading3', num);
                            }
                          }
                        }}
                        disabled={readOnly}
                          className="h-8 flex-1 text-center border-0 focus-visible:ring-0"
                      />
                      </div>
                    )}
                  </td>
                  
                  {/* סטיה בירידה */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200">
                    <span className="block">{downloadError === '-' ? '0.000' : downloadError}</span>
                  </td>
                  
                  {/* סטיה מותרת */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200 font-medium">
                    <span className="block">
                      {formatTolerance(row.tolerance)}
                    </span>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderEccentricityTable = () => {
    const calculateUploadError = (reading: number | null | undefined, load: number | null | undefined) => {
      if (reading !== null && reading !== undefined && load !== null && load !== undefined) {
        return (reading - load).toFixed(3);
      }
      return '-';
    };

    return (
      <div className="overflow-x-auto" dir="rtl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* סדר העמודות הפוך (משמאל לימין): נקודת העמסה | קריאה בעליה | סטיה בעליה | סטיה מותרת */}
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">נקודת העמסה<br />LOADING POINT</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">קריאה בעליה<br />UPLOAD READING</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">סטיה בעליה<br />UPLOAD ERROR</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">
                <div className="flex items-center justify-end gap-1">
                  <span>סטיה מותרת<br />PERMISSIBLE ERROR</span>
                  <div className="group relative">
                    <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      הסטייה המותרת (MPE) מחושבת לפי תקן OIML R76 Table 6 ויכולה להיות קטנה מ-e בעומסים נמוכים: 0.5e, 1e, או 1.5e בהתאם לעומס ורמת הדיוק
                    </div>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {(!measurements || measurements.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  אין נתונים להצגה
                </td>
              </tr>
            ) : (
              measurements.map((row, index) => {
              const uploadReading = row.reading1 || row.reading;
              const load = row.load || 5; // בדרך כלל 5 ק"ג לבדיקת אי מרכזיות אם לא מוגדר
              const uploadError = calculateUploadError(uploadReading, load);
              
              return (
                <tr key={index} className="border-b border-slate-200 hover:bg-slate-50/50">
                  {/* נקודת העמסה */}
                  <td className="px-2 py-3 font-medium text-slate-700 border border-slate-200">
                    <div className="flex items-center justify-center gap-1">
                      {!readOnly && (
                        <ArrowButtons
                          onUp={() => {
                            const currentPos = row.position ? parseInt(row.position) : (index + 1);
                            onMeasurementChange(index, 'position', (currentPos + 1).toString());
                          }}
                          onDown={() => {
                            const currentPos = row.position ? parseInt(row.position) : (index + 1);
                            if (currentPos > 1) {
                              onMeasurementChange(index, 'position', (currentPos - 1).toString());
                            }
                          }}
                        />
                      )}
                      <span className="flex-1 text-center">
                    {row.position || (index + 1).toString()}
                      </span>
                    </div>
                  </td>
                  {/* קריאה בעליה */}
                  <td className="px-2 py-2 border border-slate-200">
                    {readOnly ? (
                      <span className="text-sm text-slate-700">{uploadReading !== null && uploadReading !== undefined ? uploadReading.toFixed(3) : '-'}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ArrowButtons
                          onUp={() => updateValue(index, 'reading1', uploadReading, 0.001, 'up')}
                          onDown={() => updateValue(index, 'reading1', uploadReading, 0.001, 'down')}
                        />
                      <Input
                        type="number"
                        step="0.001"
                        value={uploadReading || ''}
                        onChange={(e) => onMeasurementChange(index, 'reading1', e.target.value ? parseFloat(e.target.value) : null)}
                        disabled={readOnly}
                          className="h-8 flex-1 text-center border-0 focus-visible:ring-0"
                      />
                      </div>
                    )}
                  </td>
                  {/* סטיה בעליה */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200">
                    <span className="block">{uploadError === '-' ? '0.000' : uploadError}</span>
                  </td>
                  {/* סטיה מותרת */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200 font-medium">
                    <span className="block">{formatTolerance(row.tolerance)}</span>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  const renderRepeatabilityTable = () => {
    const calculateReadingError = (reading: number | null | undefined, load: number | null | undefined) => {
      if (reading !== null && reading !== undefined && load !== null && load !== undefined) {
        return (reading - load).toFixed(3);
      }
      return '-';
    };

    return (
      <div className="overflow-x-auto" dir="rtl">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {/* סדר העמודות הפוך (משמאל לימין): מסה מועמסת | קריאת המסה | סטיה בקריאה | סטיה מותרת */}
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">מסה מועמסת<br />LOAD MASS</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">קריאת המסה<br />MASS READING</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">סטיה בקריאה<br />READING ERROR</th>
              <th className="px-4 py-3 text-right font-medium text-slate-600 border border-slate-200">
                <div className="flex items-center justify-end gap-1">
                  <span>סטיה מותרת<br />PERMISSIBLE ERROR</span>
                  <div className="group relative">
                    <Info className="h-4 w-4 text-slate-400 hover:text-slate-600 cursor-help" />
                    <div className="absolute right-0 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
                      הסטייה המותרת (MPE) מחושבת לפי תקן OIML R76 Table 6 ויכולה להיות קטנה מ-e בעומסים נמוכים: 0.5e, 1e, או 1.5e בהתאם לעומס ורמת הדיוק
                    </div>
                  </div>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {(!measurements || measurements.length === 0) ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                  אין נתונים להצגה
                </td>
              </tr>
            ) : (
              measurements.map((row, index) => {
              const massReading = row.reading || row.readings?.[0];
              const load = row.load;
              const readingError = calculateReadingError(massReading, load);
              
              return (
                <tr key={index} className="border-b border-slate-200 hover:bg-slate-50/50">
                  {/* מסה מועמסת */}
                  <td className="px-2 py-3 font-medium text-slate-700 border border-slate-200">
                    <div className="flex items-center justify-center gap-1">
                      {!readOnly && (
                        <ArrowButtons
                          onUp={() => updateValue(index, 'load', load, 0.1, 'up')}
                          onDown={() => updateValue(index, 'load', load, 0.1, 'down')}
                        />
                      )}
                      <span className="flex-1 text-center">
                    {load !== null && load !== undefined 
                      ? formatNumber(load)
                      : '-'}
                      </span>
                    </div>
                  </td>
                  {/* קריאת המסה */}
                  <td className="px-2 py-2 border border-slate-200">
                    {readOnly ? (
                      <span className="text-sm text-slate-700">{massReading !== null && massReading !== undefined ? massReading.toFixed(3) : '-'}</span>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ArrowButtons
                          onUp={() => updateValue(index, 'reading', massReading, 0.001, 'up')}
                          onDown={() => updateValue(index, 'reading', massReading, 0.001, 'down')}
                        />
                      <Input
                        type="number"
                        step="0.001"
                        value={massReading || ''}
                        onChange={(e) => onMeasurementChange(index, 'reading', e.target.value ? parseFloat(e.target.value) : null)}
                        disabled={readOnly}
                          className="h-8 flex-1 text-center border-0 focus-visible:ring-0"
                      />
                      </div>
                    )}
                  </td>
                  {/* סטיה בקריאה */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200">
                    <span className="block">{readingError === '-' ? '0.000' : readingError}</span>
                  </td>
                  {/* סטיה מותרת */}
                  <td className="px-4 py-3 text-center text-slate-600 border border-slate-200 font-medium">
                    <span className="block">{formatTolerance(row.tolerance)}</span>
                  </td>
                </tr>
              );
            })
            )}
          </tbody>
        </table>
      </div>
    );
  };

  switch (type) {
    case 'accuracy':
      return renderAccuracyTable();
    case 'eccentricity':
      return renderEccentricityTable();
    case 'repeatability':
      return renderRepeatabilityTable();
    default:
      return null;
  }
}
