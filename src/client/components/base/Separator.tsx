import React from "react";

export type SeparatorOrientation = "horizontal" | "vertical";
export type SeparatorSpacing = "none" | "xs" | "sm" | "md";

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: SeparatorOrientation;
  spacing?: SeparatorSpacing;
  label?: React.ReactNode;
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  (
    {
      orientation = "horizontal",
      spacing = "sm",
      label,
      className = "",
      ...props
    },
    ref,
  ) => {
    const classNames = [
      "base-separator",
      `base-separator--${orientation}`,
      `base-separator--spacing-${spacing}`,
      label ? "base-separator--with-label" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div
        ref={ref}
        role="separator"
        aria-orientation={orientation}
        className={classNames}
        {...props}
      >
        {label ? <span className="base-separator__label">{label}</span> : null}
      </div>
    );
  },
);

Separator.displayName = "Separator";
