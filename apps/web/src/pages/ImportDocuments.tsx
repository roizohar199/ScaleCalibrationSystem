import React, { useState } from 'react';
import api from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  FolderOpen,
  FileArchive
} from 'lucide-react';

interface ImportResult {
  processed: number;
  errors?: string[];
}

export default function ImportDocuments() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.docx') || droppedFile.name.endsWith('.zip')) {
        setFile(droppedFile);
        setError(null);
      } else {
        setError('יש להעלות קובץ DOCX או ZIP בלבד');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.name.endsWith('.docx') || selectedFile.name.endsWith('.zip')) {
        setFile(selectedFile);
        setError(null);
      } else {
        setError('יש להעלות קובץ DOCX או ZIP בלבד');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('אנא בחר קובץ להעלאה');
      return;
    }

    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await api.post<ImportResult>('/imports/documents/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      if (response.data.errors && response.data.errors.length > 0) {
        setError(`הושלם עם ${response.data.errors.length} שגיאות`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'שגיאה בהעלאת הקובץ');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">יבוא מסמכי כיול</h1>
        <p className="text-gray-600">העלה מסמכי DOCX או ZIP להמרה אוטומטית למערכת</p>
      </div>

      <Card className="p-6">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          {file ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <FileText className="w-12 h-12 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-lg">{file.name}</p>
                <p className="text-sm text-gray-500">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => setFile(null)}
                className="mt-2"
              >
                בחר קובץ אחר
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <Upload className="w-12 h-12 text-gray-400" />
              </div>
              <div>
                <p className="text-lg font-medium mb-2">
                  גרור קובץ לכאן או לחץ לבחירה
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  תמיכה בקבצי DOCX ו-ZIP
                </p>
                <input
                  id="file-upload"
                  type="file"
                  accept=".docx,.zip"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  type="button"
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <FolderOpen className="w-4 h-4 mr-2" />
                  בחר קובץ
                </Button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start">
            <AlertCircle className="w-5 h-5 text-red-500 mr-2 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-800 font-medium">שגיאה</p>
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-4 space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center mb-2">
                <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                <p className="text-green-800 font-medium">יבוא הושלם בהצלחה</p>
              </div>
              <p className="text-green-700">
                עובדו {result.processed} מסמכים
              </p>
            </div>

            {result.errors && result.errors.length > 0 && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center mb-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500 mr-2" />
                  <p className="text-yellow-800 font-medium">
                    {result.errors.length} שגיאות
                  </p>
                </div>
                <ul className="list-disc list-inside text-yellow-700 text-sm space-y-1">
                  {result.errors.slice(0, 10).map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                  {result.errors.length > 10 && (
                    <li>ועוד {result.errors.length - 10} שגיאות...</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex gap-4">
          <Button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="flex-1"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                מעלה...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                העלה קובץ
              </>
            )}
          </Button>
          {result && (
            <Button variant="outline" onClick={handleReset}>
              העלה קובץ נוסף
            </Button>
          )}
          <Button variant="outline" onClick={() => navigate('/office')}>
            חזור
          </Button>
        </div>
      </Card>

      <Card className="mt-6 p-6">
        <h2 className="text-xl font-bold mb-4">מידע נוסף</h2>
        <ul className="list-disc list-inside space-y-2 text-gray-700" dir="rtl">
          <li>המערכת תזהה אוטומטית את כל הנתונים מהמסמכים</li>
          <li>ייווצרו לקוחות, דגמי משקלים וכיולים חדשים</li>
          <li>טבלאות ייחוס יישמרו בנפרד מהמדידות</li>
          <li>מסמכים כפולים יזוהו ויידלגו</li>
        </ul>
      </Card>
    </div>
  );
}

