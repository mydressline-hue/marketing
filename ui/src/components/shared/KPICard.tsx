import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { KPIData } from '../../types';

export default function KPICard({ label, value, change, trend, prefix = '', suffix = '' }: KPIData) {
  const trendColor = trend === 'up' ? 'text-success-600' : trend === 'down' ? 'text-danger-600' : 'text-surface-500';
  const trendBg = trend === 'up' ? 'bg-success-50' : trend === 'down' ? 'bg-danger-50' : 'bg-surface-100';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  return (
    <div className="bg-white rounded-xl border border-surface-200 p-5 hover:shadow-md transition-shadow">
      <p className="text-sm font-medium text-surface-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-surface-900 mb-2">
        {prefix}{typeof value === 'number' ? value.toLocaleString() : value}{suffix}
      </p>
      <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${trendColor} ${trendBg}`}>
        <TrendIcon className="w-3 h-3" />
        <span>{Math.abs(change)}%</span>
      </div>
    </div>
  );
}
