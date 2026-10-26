import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_SELECTOR, wrapIndex } from "../../../engine/dialogFocus";
import { isTopDialog, popDialog, pushDialog } from "../../../engine/dialogStack";

export type DialogProps = {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  isBusy?: boolean;
  className?: string;
  maxWidth?: number | string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  headerAction?: ReactNode;
};

export function Dialog({
  title,
  description,
  children,
  footer,
  onClose,
  isBusy = false,
  className = "",
  maxWidth,
  initialFocusRef,
  headerAction,
}: DialogProps) {
  const titleId = useId();
  const id = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    pushDialog(id);
    return () => popDialog(id);
  }, [id]);

  useEffect(() => {
    const active = document.activeElement;
    restoreRef.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const target = initialFocusRef?.current ?? sectionRef.current;
    target?.focus();
    return () => {
      const previous = restoreRef.current;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [initialFocusRef]);

  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      if (!isTopDialog(id)) return;
      const section = sectionRef.current;
      const target = event.target;
      if (!section || !(target instanceof HTMLElement)) return;
      if (section.contains(target)) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (target !== document.body) restoreRef.current = target;
      (initialFocusRef?.current ?? section).focus();
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [id, initialFocusRef]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (!isTopDialog(id)) return;
      if (event.key === "Escape") {
        if (!isBusy) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const section = sectionRef.current;
      if (!section) return;
      const stops = Array.from(
        section.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(
        (node) =>
          node.offsetParent !== null && !node.closest('[aria-hidden="true"]'),
      );
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const current =
        active instanceof HTMLElement ? stops.indexOf(active) : -1;
      const atEdge =
        current === -1 ||
        (event.shiftKey ? current === 0 : current === stops.length - 1);
      if (!atEdge) return;
      event.preventDefault();
      stops[wrapIndex(stops.length, current, event.shiftKey)].focus();
    },
    [id, isBusy, onClose],
  );

  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isBusy) return;
      if (!isTopDialog(id)) return;
      const section = sectionRef.current;
      if (
        section &&
        event.target instanceof Node &&
        section.contains(event.target)
      )
        return;
      onClose();
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [id, isBusy, onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy && isTopDialog(id))
          onClose();
      }}
    >
      <section
        ref={sectionRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal ${className}`.trim()}
        style={maxWidth !== undefined ? { maxWidth } : undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              typeof description === "string" ? (
                <p>{description}</p>
              ) : (
                description
              )
            ) : null}
          </div>
          {headerAction ?? null}
        </header>
        {children}
        <div className="settings-actions">{footer}</div>
      </section>
    </div>,
    document.body,
  );
}

export default Dialog;
