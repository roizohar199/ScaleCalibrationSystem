import React from 'react';
import { Button } from '../ui/button';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}

export default function PageHeader({ 
  title, 
  subtitle, 
  actions,
  icon: Icon 
}: PageHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Actions on the left */}
        {actions && (
          <div className="flex-shrink-0 order-2 sm:order-1">
            {actions}
          </div>
        )}
        
        {/* Title and Subtitle in the center */}
        <div className="flex-1 text-center sm:text-right order-1 sm:order-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-1">{title}</h1>
          {subtitle && (
            <p className="text-sm text-slate-500">{subtitle}</p>
          )}
        </div>

        {/* Icon on the right */}
        {Icon && (
          <div className="hidden sm:flex h-12 w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0 order-3">
            <Icon className="h-6 w-6 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}
