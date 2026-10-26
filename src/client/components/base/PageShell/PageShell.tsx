import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import "./PageShell.css";

export interface PageShellProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

export interface PageShellSectionProps extends HTMLAttributes<HTMLElement> {
  /** Removes inner padding and hides outer overflow so child panes can manage their own independent scrollbars. */
  flush?: boolean;
  children?: ReactNode;
}

const PageShellRoot = forwardRef<HTMLElement, PageShellProps>(
  function PageShell({ className = "", children, ...props }, ref) {
    return (
      <main
        ref={ref}
        className={`base-page-shell ${className}`.trim()}
        {...props}
      >
        {children}
      </main>
    );
  },
);

const PageShellSection = forwardRef<HTMLElement, PageShellSectionProps>(
  function PageShellSection(
    { flush = false, className = "", children, ...props },
    ref,
  ) {
    const classes = [
      "base-page-shell__section",
      flush ? "base-page-shell__section--flush" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <section ref={ref} className={classes} {...props}>
        {children}
      </section>
    );
  },
);

export const PageShell = Object.assign(PageShellRoot, {
  Section: PageShellSection,
});

export default PageShell;
