import type { ReactNode } from 'react';

interface FormGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export default function FormGroup({
  title,
  description,
  children,
  className = '',
}: FormGroupProps) {
  return (
    <fieldset className={`space-y-4 ${className}`}>
      <div>
        <legend className="text-sm font-semibold text-surface-900 dark:text-surface-100">
          {title}
        </legend>
        {description && (
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </fieldset>
  );
}
