import { useCallback, useEffect, useId, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { FOCUSABLE_SELECTOR, wrapIndex } from "../../engine/dialogFocus";

export type DialogProps = {
  title: string;
  /** What the dialog is for, under the title. A string renders as a paragraph; a node is passed
   *  through, so a caller can add the detail list a destructive dialog needs. */
  description?: ReactNode;
  /** The dialog body, between the header and the action row. */
  children?: ReactNode;
  /** The action row, laid out by `.settings-actions` like every other dialog in the app. */
  footer: ReactNode;
  onClose: () => void;
  /** While a write is in flight the dialog refuses Escape and backdrop dismissal, so the operation
   *  cannot be dismissed out from under itself. */
  isBusy?: boolean;
  className?: string;
  maxWidth?: number | string;
  /**
   * Where focus lands when the dialog opens. A destructive dialog passes its Cancel button, so the
   * safe action holds focus and the stray tooltip that used to linger on the trigger behind the
   * dialog has nowhere to live. Without it the dialog container takes focus.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** A trailing control in the header (the Close button some dialogs carry). */
  headerAction?: ReactNode;
};

/**
 * The app's dialog shell: one place that owns the backdrop, the dialog semantics, focus, and Escape.
 *
 * It exists because every hand-rolled dialog got the same three things subtly wrong — no
 * `role="dialog"`, no focus on open, and Escape handled by a window listener that fires whether or
 * not focus is inside. A Radix tooltip sitting on a trigger behind a dialog is the visible symptom:
 * tooltips open on focus, and focus never left the trigger.
 *
 * Focus is remembered and restored on close, the tab ring is contained to the dialog, and the body
 * is portalled so a dialog can be opened from inside another one (the shelf is itself mounted as a
 * dialog in the play view).
 */
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
  headerAction
}: DialogProps) {
  const titleId = useId();
  const sectionRef = useRef<HTMLElement | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  // One mount-time move, and the reverse on the way out. The element that opened the dialog is
  // usually still there when it closes; when a re-render has replaced it, focus is left alone
  // rather than thrown at `<body>`.
  useEffect(() => {
    const active = document.activeElement;
    restoreRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    // This runs before a Radix menu hands focus back to its own trigger, so the trap below — not
    // this line — is what actually keeps focus here.
    const target = initialFocusRef?.current ?? sectionRef.current;
    target?.focus();
    return () => {
      const previous = restoreRef.current;
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [initialFocusRef]);

  /**
   * The trap. Focus belongs to the open dialog, whoever moves it next.
   *
   * Radix is the reason this is not a plain Tab ring: a dropdown restores focus to its trigger when
   * it closes (after the dialog has mounted), and a Radix tooltip on that trigger then opens on
   * focus — which is how a "More options" tooltip ended up floating over the delete dialog. The
   * popper content of a Select or tooltip is a portal of its own and counts as inside; whoever else
   * held focus is remembered so closing can hand it back.
   */
  useEffect(() => {
    function onFocusIn(event: FocusEvent) {
      const section = sectionRef.current;
      const target = event.target;
      if (!section || !(target instanceof HTMLElement)) return;
      if (section.contains(target)) return;
      if (target.closest('[data-radix-popper-content-wrapper]')) return;
      if (target !== document.body) restoreRef.current = target;
      // Back to the dialog's own first stop, not merely the container: an Escape or a Tab from the
      // container is a worse place to land than the field the dialog was opened for.
      (initialFocusRef?.current ?? section).focus();
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [initialFocusRef]);

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        if (!isBusy) onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const section = sectionRef.current;
      if (!section) return;
      // Visible, non-hidden stops only: Radix's selects keep hidden helpers in the tree, and a
      // tab ring that lands on one of those is worse than no ring at all.
      const stops = Array.from(section.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => node.offsetParent !== null && !node.closest('[aria-hidden="true"]')
      );
      if (stops.length === 0) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      const current = active instanceof HTMLElement ? stops.indexOf(active) : -1;
      // Anywhere but the two edges is the browser's own business — it stays inside the ring.
      const atEdge = current === -1 || (event.shiftKey ? current === 0 : current === stops.length - 1);
      if (!atEdge) return;
      event.preventDefault();
      stops[wrapIndex(stops.length, current, event.shiftKey)].focus();
    },
    [isBusy, onClose]
  );

  // The net under the ring: if focus somehow ends up outside the dialog, Escape must still close it.
  // The event is ignored when it came from inside, where the handler above already owns it.
  useEffect(() => {
    function onWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || isBusy) return;
      const section = sectionRef.current;
      if (section && event.target instanceof Node && section.contains(event.target)) return;
      onClose();
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [isBusy, onClose]);

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // Only a press on the backdrop itself: a drag that starts in a field and ends out here must
        // not dismiss the dialog mid-edit.
        if (event.target === event.currentTarget && !isBusy) onClose();
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
            {description ? (typeof description === "string" ? <p>{description}</p> : description) : null}
          </div>
          {headerAction ?? null}
        </header>
        {children}
        <div className="settings-actions">{footer}</div>
      </section>
    </div>,
    document.body
  );
}

export default Dialog;
