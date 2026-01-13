import React from 'react';
import { Badge } from '../ui/badge';
import { 
  FileEdit, 
  Send, 
  Eye, 
  CheckCircle, 
  XCircle, 
  Award 
} from 'lucide-react';

interface StatusBadgeProps {
  status: string;
  size?: 'default' | 'lg';
}

const statusConfig: Record<string, {
  label: string;
  color: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  DRAFT: {
    label: 'טיוטה',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: FileEdit
  },
  SUBMITTED: {
    label: 'נשלח לאישור',
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    icon: Send
  },
  IN_REVIEW: {
    label: 'בבדיקה',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    icon: Eye
  },
  APPROVED: {
    label: 'מאושר',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    icon: CheckCircle
  },
  REJECTED: {
    label: 'נדחה',
    color: 'bg-red-50 text-red-600 border-red-200',
    icon: XCircle
  },
  CERTIFICATE_ISSUED: {
    label: 'תעודה הונפקה',
    color: 'bg-violet-50 text-violet-600 border-violet-200',
    icon: Award
  },
  RETURNED_FOR_FIX: {
    label: 'הוחזר לתיקון',
    color: 'bg-orange-50 text-orange-600 border-orange-200',
    icon: FileEdit
  }
};

export default function StatusBadge({ status, size = 'default' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.DRAFT;
  const Icon = config.icon;

  return (
    <Badge 
      variant="outline" 
      className={`${config.color} ${size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2 py-0.5 text-xs'} font-medium`}
    >
      <Icon className={`${size === 'lg' ? 'h-4 w-4 ml-1.5' : 'h-3 w-3 ml-1'}`} />
      {config.label}
    </Badge>
  );
}
