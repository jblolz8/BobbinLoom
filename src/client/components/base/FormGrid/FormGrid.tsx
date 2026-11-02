import { type HTMLAttributes, type ReactNode } from "react";
import "./FormGrid.css";

export type FormGridCols =
  | 1
  | 2
  | "2-asymmetric"
  | "sidebar-left"
  | "sidebar-right"
  | 3
  | 4
  | "cards"
  | "portrait"
  | "compact";
export type FormGridGap = "xs" | "sm" | "md" | "lg";

export interface FormGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: FormGridCols;
  gap?: FormGridGap;
  /** Keep the column count on mobile/narrow viewports instead of collapsing to a single column (useful for compact 2x2 thumbnail tile grids). */
  keepColumnsOnMobile?: boolean;
  children?: ReactNode;
}

export function FormGrid({
  cols = 2,
  gap = "sm",
  keepColumnsOnMobile = false,
  className = "",
  children,
  ...props
}: FormGridProps) {
  const classNames = [
    "base-form-grid",
    `base-form-grid--cols-${cols}`,
    `base-form-grid--gap-${gap}`,
    keepColumnsOnMobile ? "base-form-grid--keep-cols" : "",
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
