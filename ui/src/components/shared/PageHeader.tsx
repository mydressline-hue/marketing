import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  icon?: ReactNode;
}

export default function PageHeader({ title, subtitle, actions, icon }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            {icon}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{title}</h1>
          {subtitle && <p className="text-sm text-surface-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
