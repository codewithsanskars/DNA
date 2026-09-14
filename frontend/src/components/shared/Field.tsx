import {
  forwardRef,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  useId,
} from 'react';
import Icon from './Icon';

const CONTROL =
  'w-full rounded-md border border-border-strong bg-card px-3 text-sm text-foreground transition-colors duration-150 ' +
  'placeholder:text-subtle-foreground focus:border-brand/70 focus:outline-none focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60';

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-foreground">
      {children}
      {hint && <span className="text-2xs font-normal text-subtle-foreground">{hint}</span>}
    </label>
  );
}

interface FieldProps {
  label?: ReactNode;
  hint?: string;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: (id: string) => ReactNode;
}

export function Field({ label, hint, help, error, required, children }: FieldProps) {
  const id = useId();
  return (
    <div>
      {label && (
        <Label htmlFor={id} hint={hint}>
          {label}
          {required && <span className="text-brand-text">*</span>}
        </Label>
      )}
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-xs text-brand-text">{error}</p>
      ) : help ? (
        <p className="mt-1.5 text-xs text-subtle-foreground">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${CONTROL} h-9 ${className}`} {...rest} />;
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', rows = 3, ...rest }, ref) {
    return <textarea ref={ref} rows={rows} className={`${CONTROL} resize-none py-2 leading-relaxed ${className}`} {...rest} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={`${CONTROL} h-9 cursor-pointer appearance-none pr-9 ${className}`}
          {...rest}
        >
          {children}
        </select>
        <Icon
          name="chevron-down"
          size={15}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-subtle-foreground"
        />
      </div>
    );
  }
);