import React, { useState, useRef, useEffect, useContext as useReactContext } from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectContextValue {
  value: string;
  onValueChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SelectContext = React.createContext<SelectContextValue | null>(null);

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectValueProps {
  placeholder?: string;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export function Select({ value, onValueChange, children }: SelectProps) {
  const [open, setOpen] = useState(false);
  
  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ children, className = '' }: SelectTriggerProps) {
  const context = useReactContext(SelectContext);
  if (!context) throw new Error('SelectTrigger must be used within Select');
  
  return (
    <button
      type="button"
      onClick={() => context.setOpen(!context.open)}
      className={`flex h-10 xs:h-12 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 xs:px-4 py-2 xs:py-3 text-sm xs:text-base focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 touch-target ${className}`}
    >
      {children}
      <ChevronDown className="h-4 w-4 text-slate-500 flex-shrink-0" />
    </button>
  );
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = useReactContext(SelectContext);
  if (!context) throw new Error('SelectValue must be used within Select');
  
  return <span className="text-slate-700">{context.value || placeholder || 'בחר...'}</span>;
}

export function SelectContent({ children, className = '' }: SelectContentProps) {
  const context = useReactContext(SelectContext);
  const ref = useRef<HTMLDivElement>(null);
  
  if (!context) throw new Error('SelectContent must be used within Select');
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        context.setOpen(false);
      }
    };
    
    if (context.open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [context.open, context]);
  
  if (!context.open) return null;
  
  return (
    <div
      ref={ref}
      className={`absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg ${className}`}
      style={{ maxHeight: '200px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}
    >
      {children}
    </div>
  );
}

export function SelectItem({ value, children, className = '' }: SelectItemProps) {
  const context = useReactContext(SelectContext);
  if (!context) throw new Error('SelectItem must be used within Select');
  
  const isSelected = context.value === value;
  
  return (
    <div
      onClick={() => {
        context.onValueChange(value);
        context.setOpen(false);
      }}
      className={`cursor-pointer px-3 xs:px-4 py-2 xs:py-3 text-sm xs:text-base hover:bg-slate-100 touch-target ${
        isSelected ? 'bg-violet-50 text-violet-600' : 'text-slate-700'
      } ${className}`}
    >
      {children}
    </div>
  );
}

