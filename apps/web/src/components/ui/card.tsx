import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  [key: string]: any;
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-lg border border-slate-200 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

