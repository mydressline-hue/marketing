import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export default function Card({ title, subtitle, children, actions, className = '', noPadding = false }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-surface-200 ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-100">
          <div>
            {title && <h3 className="font-semibold text-surface-900">{title}</h3>}
            {subtitle && <p className="text-sm text-surface-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-5'}>{children}</div>
    </div>
  );
}
