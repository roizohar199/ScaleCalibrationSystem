import React from 'react';
import { Card } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Search, ChevronRight, ChevronLeft } from 'lucide-react';

interface Column {
  header: string;
  accessor: string | ((row: any) => any);
  render?: (value: any, row: any) => React.ReactNode;
  width?: string;
}

interface DataTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  emptyMessage?: string;
  loading?: boolean;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
}

export default function DataTable({
  columns,
  data,
  onRowClick,
  searchPlaceholder = 'חיפוש...',
  searchValue,
  onSearchChange,
  emptyMessage = 'אין נתונים להצגה',
  loading = false,
  page = 1,
  totalPages = 1,
  onPageChange
}: DataTableProps) {
  return (
    <Card className="border-0 shadow-lg shadow-slate-200/50 overflow-hidden">
      {onSearchChange && (
        <div className="p-6 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder={searchPlaceholder}
              value={searchValue || ''}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pr-10 bg-slate-50 border-slate-200 focus:bg-white transition-colors"
            />
          </div>
        </div>
      )}
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              {columns.map((col, index) => (
                <th 
                  key={index}
                  className="px-6 py-4 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider"
                  style={{ width: col.width }}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="h-5 w-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-slate-500">טוען...</span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => (
                <tr
                  key={row.id || rowIndex}
                  onClick={() => onRowClick?.(row)}
                  className={`
                    transition-colors
                    ${onRowClick ? 'cursor-pointer hover:bg-violet-50/50' : ''}
                  `}
                >
                  {columns.map((col, colIndex) => {
                    const getValue = (row: any, accessor: string | ((row: any) => any)) => {
                      if (typeof accessor === 'function') {
                        return accessor(row);
                      }
                      return row[accessor];
                    };
                    const value = getValue(row, col.accessor);
                    return (
                      <td 
                        key={colIndex}
                        className="px-6 py-4 text-sm text-slate-700"
                      >
                        {col.render ? col.render(value, row) : value || '-'}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-500">
            עמוד {page} מתוך {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(page - 1)}
              disabled={page === 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(page + 1)}
              disabled={page === totalPages}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
