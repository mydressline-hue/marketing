interface FormCheckboxProps {
  label: string;
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
  required?: boolean;
  disabled?: boolean;
}

export default function FormCheckbox({
  label,
  name,
  checked,
  onChange,
  description,
  required = false,
  disabled = false,
}: FormCheckboxProps) {
  const id = `form-checkbox-${name}`;

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required={required}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 dark:border-gray-600
          text-primary-600 focus:ring-2 focus:ring-primary-500/20
          disabled:opacity-50 disabled:cursor-not-allowed
          dark:bg-surface-800"
      />
      <div>
        <label
          htmlFor={id}
          className={`text-sm font-medium text-gray-700 dark:text-gray-300 ${
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {description && (
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
