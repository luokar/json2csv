import type { UseFormRegisterReturn } from "react-hook-form";

import { Label } from "@/components/ui/label";

const controlSelectClassName =
  "flex h-9 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2364748b%22%20d%3D%22M2.5%204.5L6%208l3.5-3.5%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-8";

export function SelectField({
  id,
  label,
  options,
  registration,
}: {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={controlSelectClassName} {...registration}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ToggleField({
  label,
  registration,
}: {
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <label className="flex items-center gap-2.5 rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted cursor-default">
      <input
        type="checkbox"
        className="size-4 rounded border-border accent-primary"
        {...registration}
      />
      {label}
    </label>
  );
}

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export { controlSelectClassName };
