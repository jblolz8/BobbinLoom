import { type HTMLAttributes, type ReactNode } from "react";

export type FormGridCols = 1 | 2 | "2-asymmetric" | 3 | 4 | "cards";
export type FormGridGap = "xs" | "sm" | "md" | "lg";

export interface FormGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: FormGridCols;
  gap?: FormGridGap;
  children?: ReactNode;
}

export function FormGrid({
  cols = 2,
  gap = "sm",
  className = "",
  children,
  ...props
}: FormGridProps) {
  const classNames = [
    "base-form-grid",
    `base-form-grid--cols-${cols}`,
    `base-form-grid--gap-${gap}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} {...props}>
      {children}
    </div>
  );
}

export default FormGrid;
