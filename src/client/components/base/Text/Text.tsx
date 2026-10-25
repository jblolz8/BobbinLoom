import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type TextElement =
  | "span"
  | "p"
  | "div"
  | "label"
  | "strong"
  | "em"
  | "code"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6";

export type TextVariant =
  | "body"
  | "caption"
  | "label"
  | "overline"
  | "subtitle"
  | "title"
  | "heading"
  | "display";

export type TextSize = "2xs" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

export type TextTone =
  | "primary"
  | "secondary"
  | "muted"
  | "disabled"
  | "accent"
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "inherit";

export type TextWeight = "normal" | "medium" | "semibold" | "bold";

export type TextLeading = "none" | "tight" | "snug" | "normal" | "relaxed";

export type TextAlign = "left" | "center" | "right";

export interface TextProps extends HTMLAttributes<HTMLElement> {
  as?: TextElement;
  htmlFor?: string;
  variant?: TextVariant;
  size?: TextSize;
  tone?: TextTone;
  weight?: TextWeight;
  leading?: TextLeading;
  align?: TextAlign;
  truncate?: boolean;
  nowrap?: boolean;
  mono?: boolean;
  italic?: boolean;
  uppercase?: boolean;
  children?: ReactNode;
}

const DEFAULT_ELEMENT_BY_VARIANT: Partial<Record<TextVariant, TextElement>> = {
  body: "p",
  subtitle: "p",
  title: "h3",
  heading: "h2",
  display: "h1",
};

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    as,
    variant,
    size,
    tone,
    weight,
    leading,
    align,
    truncate = false,
    nowrap = false,
    mono = false,
    italic = false,
    uppercase = false,
    className = "",
    children,
    ...props
  },
  ref,
) {
  const Component = (as ??
    (variant ? DEFAULT_ELEMENT_BY_VARIANT[variant] : undefined) ??
    "span") as ElementType;

  const classNames = [
    "base-text",
    variant ? `base-text--${variant}` : "",
    size ? `base-text--size-${size}` : "",
    tone ? `base-text--tone-${tone}` : "",
    weight ? `base-text--weight-${weight}` : "",
    leading ? `base-text--leading-${leading}` : "",
    align ? `base-text--align-${align}` : "",
    truncate ? "base-text--truncate" : "",
    nowrap ? "base-text--nowrap" : "",
    mono ? "base-text--mono" : "",
    italic ? "base-text--italic" : "",
    uppercase ? "base-text--uppercase" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Component ref={ref} className={classNames} {...props}>
      {children}
    </Component>
  );
});

export default Text;
