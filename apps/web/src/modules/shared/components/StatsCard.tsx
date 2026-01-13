import React from 'react';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color?: 'violet' | 'emerald' | 'amber' | 'blue' | 'rose';
  trend?: number;
  trendLabel?: string;
}

export default function StatsCard({ 
  title, 
  value, 
  icon: Icon, 
  color = 'violet',
  trend,
  trendLabel
}: StatsCardProps) {
  const iconColorClasses: Record<string, string> = {
    violet: 'text-violet-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-500',
    blue: 'text-blue-500',
    rose: 'text-red-500'
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4 xs:p-5 flex justify-between items-center">
      <div className="flex-1 min-w-0">
        <div className="text-xs xs:text-sm text-slate-500 truncate">{title}</div>
        <div className="text-lg xs:text-2xl font-bold">{value}</div>
      </div>
      <Icon className={`${iconColorClasses[color]} h-5 w-5 xs:h-7 xs:w-7 flex-shrink-0 ml-2 xs:ml-3`} />
    </div>
  );
}

