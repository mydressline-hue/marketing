interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  color?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const colorMap = {
  primary: 'bg-primary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  danger: 'bg-danger-500',
};

const sizeMap = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export default function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  color = 'primary',
  size = 'md',
}: ProgressBarProps) {
  const pct = Math.min((value / max) * 100, 100);

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between items-center mb-1">
          {label && <span className="text-sm text-surface-600 dark:text-surface-300">{label}</span>}
          {showValue && <span className="text-sm font-medium text-surface-700 dark:text-surface-200">{Math.round(pct)}%</span>}
        </div>
      )}
      <div className={`w-full bg-surface-200 dark:bg-surface-700 rounded-full overflow-hidden ${sizeMap[size]}`}>
        <div
          className={`${colorMap[color]} rounded-full transition-all duration-500 h-full`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
