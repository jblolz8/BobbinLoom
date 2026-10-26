import { forwardRef } from "react";
import { Button, type ButtonProps, type ButtonSize } from "../Button/Button";
import { Icon } from "../Icon/Icon";

export type IconButtonVariant = "ghost" | "secondary" | "overlay" | "danger";

export interface IconButtonProps extends Omit<
  ButtonProps,
  | "children"
  | "leftIcon"
  | "rightIcon"
  | "iconOnly"
  | "isLoading"
  | "variant"
  | "size"
> {
  /** Lucide icon name. */
  icon: string;
  /** REQUIRED: the button's only text. Becomes aria-label and the tooltip. */
  label: string;
  variant?: IconButtonVariant;
  size?: ButtonSize;
  /** Round (media/overlay controls) instead of the default rounded square. */
  round?: boolean;
  /** Swap the glyph for a spinner and disable the button. */
  busy?: boolean;
}

const ICON_SIZE: Record<ButtonSize, number> = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = "ghost",
      size = "sm",
      round = false,
      busy = false,
      title,
      ...props
    },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        iconOnly
        round={round}
        aria-label={label}
        title={title ?? label}
        leftIcon={
          <Icon
            name={busy ? "Loader" : icon}
            size={ICON_SIZE[size]}
            className={busy ? "animate-spin" : undefined}
          />
        }
        {...props}
      />
    );
  },
);
