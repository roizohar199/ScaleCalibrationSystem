import React from 'react';
import { Button } from '../../../components/ui/button';

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
    <div className="mb-4 xs:mb-6">
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        {/* Actions on the left */}
        {actions && (
          <div className="flex-shrink-0 order-2 xs:order-1">
            {actions}
          </div>
        )}

        {/* Title and Subtitle in the center */}
        <div className="flex-1 text-center xs:text-right order-1 xs:order-2">
          <h1 className="text-xl xs:text-2xl lg:text-3xl font-bold text-slate-800 mb-1">{title}</h1>
          {subtitle && (
            <p className="text-xs xs:text-sm text-slate-500">{subtitle}</p>
          )}
        </div>

        {/* Icon on the right */}
        {Icon && (
          <div className="hidden xs:flex h-10 w-10 xs:h-12 xs:w-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 items-center justify-center shadow-lg shadow-violet-500/30 flex-shrink-0 order-3">
            <Icon className="h-5 w-5 xs:h-6 xs:w-6 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

