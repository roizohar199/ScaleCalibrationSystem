import React from 'react';
import { Card } from '../ui/card';

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
  const colorClasses: Record<string, string> = {
    violet: 'from-violet-500 to-purple-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    blue: 'from-blue-500 to-cyan-600',
    rose: 'from-rose-500 to-pink-600'
  };

  const bgColorClasses: Record<string, string> = {
    violet: 'bg-violet-50',
    emerald: 'bg-emerald-50',
    amber: 'bg-amber-50',
    blue: 'bg-blue-50',
    rose: 'bg-rose-50'
  };

  const iconColorClasses: Record<string, string> = {
    violet: 'text-violet-600',
    emerald: 'text-emerald-600',
    amber: 'text-amber-600',
    blue: 'text-blue-600',
    rose: 'text-rose-600'
  };

  return (
    <Card className="relative overflow-hidden border-0 shadow-lg shadow-slate-200/50">
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${colorClasses[color]}`} />
      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-slate-500 font-medium mb-2">{title}</p>
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            {trend !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                <span className={`text-sm font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {trend >= 0 ? '+' : ''}{trend}%
                </span>
                {trendLabel && (
                  <span className="text-xs text-slate-400">{trendLabel}</span>
                )}
              </div>
            )}
          </div>
          <div className={`p-3 rounded-xl ${bgColorClasses[color]} flex-shrink-0`}>
            <Icon className={`h-6 w-6 ${iconColorClasses[color]}`} />
          </div>
        </div>
      </div>
    </Card>
  );
}
