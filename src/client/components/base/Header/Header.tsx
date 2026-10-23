import {
  forwardRef,
  type ElementType,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "../Icon";
import { Text, type TextElement } from "../Text/Text";
import "./Header.css";

export type HeaderVariant = "app" | "page" | "modal" | "panel" | "section";

export interface HeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  as?: ElementType;
  variant?: HeaderVariant;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode | IconName;
  badge?: ReactNode;
  actions?: ReactNode;
  titleId?: string;
  /** Compact responsive layout (e.g., mobile play view on the app header). */
  compact?: boolean;
  bordered?: boolean;
  sticky?: boolean;
  children?: ReactNode;
}

export interface HeaderBrandProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}

export interface HeaderNavProps extends HTMLAttributes<HTMLElement> {
  ariaLabel?: string;
  children?: ReactNode;
}

export interface HeaderActionsProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export interface HeaderTitleProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  as?: TextElement;
  icon?: ReactNode | IconName;
  badge?: ReactNode;
  subtitle?: ReactNode;
  titleId?: string;
  children?: ReactNode;
}

const DEFAULT_HEADING_BY_VARIANT: Record<HeaderVariant, TextElement> = {
  app: "h1",
  page: "h2",
  modal: "h2",
  panel: "h3",
  section: "h5",
};

function renderHeaderIcon(icon: ReactNode | IconName | undefined, size: number): ReactNode {
  if (!icon) return null;
  if (typeof icon === "string") {
    return <Icon name={icon} size={size} />;
  }
  return icon;
}

export const HeaderBrand = forwardRef<HTMLDivElement, HeaderBrandProps>(function HeaderBrand(
  { icon, title, onClick, className = "", children, ...props },
  ref
) {
  const isInteractive = typeof onClick === "function";

  const handleKeyDown = (e: KeyboardEvent<HTMLHeadingElement>) => {
    if (!onClick) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      ref={ref}
      className={["base-header__brand", className].filter(Boolean).join(" ")}
      {...props}
    >
      {(icon || title) && (
        <h1
          className={[
            "base-header__logo",
            isInteractive ? "base-header__logo--clickable" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onClick={onClick}
          onKeyDown={isInteractive ? handleKeyDown : undefined}
          role={isInteractive ? "button" : undefined}
          tabIndex={isInteractive ? 0 : undefined}
        >
          {icon && <span className="base-header__logo-icon">{icon}</span>}
          {title && (
            <Text as="span" className="base-header__logo-text" weight="bold" tone="primary">
              {title}
            </Text>
          )}
        </h1>
      )}
      {children}
    </div>
  );
});

export const HeaderNav = forwardRef<HTMLElement, HeaderNavProps>(function HeaderNav(
  { ariaLabel, className = "", children, ...props },
  ref
) {
  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      className={["base-header__nav", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </nav>
  );
});

export const HeaderActions = forwardRef<HTMLDivElement, HeaderActionsProps>(function HeaderActions(
  { className = "", children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={["base-header__actions", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
    </div>
  );
});

export const HeaderTitle = forwardRef<HTMLDivElement, HeaderTitleProps>(function HeaderTitle(
  { as = "h2", icon, badge, subtitle, titleId, className = "", children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={["base-header__main", className].filter(Boolean).join(" ")}
      {...props}
    >
      <div className="base-header__title-row">
        <Text as={as} id={titleId} className="base-header__title">
          {icon && <span className="base-header__title-icon">{renderHeaderIcon(icon, 16)}</span>}
          <span className="base-header__title-text">{children}</span>
          {badge}
        </Text>
      </div>
      {subtitle &&
        (typeof subtitle === "string" ? (
          <Text as="p" tone="secondary" className="base-header__subtitle">
            {subtitle}
          </Text>
        ) : (
          <div className="base-header__subtitle">{subtitle}</div>
        ))}
    </div>
  );
});

const HeaderRoot = forwardRef<HTMLElement, HeaderProps>(function Header(
  {
    as,
    variant = "section",
    title,
    subtitle,
    icon,
    badge,
    actions,
    titleId,
    compact = false,
    bordered = false,
    sticky = false,
    className = "",
    children,
    ...props
  },
  ref
) {
  const Component: ElementType = as ?? (variant === "section" ? "div" : "header");
  const headingElement = DEFAULT_HEADING_BY_VARIANT[variant];
  const iconSize = variant === "section" ? 13 : 16;

  const classNames = [
    "base-header",
    `base-header--${variant}`,
    compact ? "base-header--compact" : "",
    bordered ? "base-header--bordered" : "",
    sticky ? "base-header--sticky" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const hasStructuredTitle = title !== undefined && title !== null;

  return (
    <Component ref={ref} className={classNames} {...props}>
      {hasStructuredTitle ? (
        <>
          <div className="base-header__row">
            <div className="base-header__main">
              <Text as={headingElement} id={titleId} className="base-header__title">
                {icon && (
                  <span className="base-header__title-icon">
                    {renderHeaderIcon(icon, iconSize)}
                  </span>
                )}
                <span className="base-header__title-text">{title}</span>
                {badge}
              </Text>
              {subtitle &&
                (typeof subtitle === "string" ? (
                  <Text as="p" tone="secondary" className="base-header__subtitle">
                    {subtitle}
                  </Text>
                ) : (
                  <div className="base-header__subtitle">{subtitle}</div>
                ))}
            </div>
            {actions && <div className="base-header__actions">{actions}</div>}
          </div>
          {children}
        </>
      ) : (
        children
      )}
    </Component>
  );
});

export const Header = Object.assign(HeaderRoot, {
  Brand: HeaderBrand,
  Nav: HeaderNav,
  Actions: HeaderActions,
  Title: HeaderTitle,
});

export default Header;
