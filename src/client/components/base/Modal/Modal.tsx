import {
  forwardRef,
  useEffect,
  useId,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import {
  isTopDialog,
  popDialog,
  pushDialog,
} from "../../../engine/dialogStack";

export type ModalSize = "sm" | "md" | "lg" | "wide";

export interface ModalProps extends HTMLAttributes<HTMLElement> {
  open?: boolean;
  onClose?: () => void;
  /** When true, Escape and backdrop clicks do not trigger `onClose` (e.g., while a nested confirmation is open or a write is in flight). */
  dismissDisabled?: boolean;
  size?: ModalSize;
  /** Stretches the modal edge-to-edge (100dvh) on mobile screens (`<= 680px`). */
  fullScreenMobile?: boolean;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  backdropClassName?: string;
  children?: ReactNode;
}

export interface ModalBodyProps extends HTMLAttributes<HTMLDivElement> {
  /** `"split"` arranges sidebar navigation + content horizontally on desktop and stacks vertically on mobile; `"stack"` is always vertical. */
  layout?: "stack" | "split";
  children?: ReactNode;
}

export interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export interface ModalFooterProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

export const ModalBody = forwardRef<HTMLDivElement, ModalBodyProps>(
  function ModalBody(
    { layout = "stack", className = "", children, ...props },
    ref,
  ) {
    const classNames = [
      "base-modal__body",
      `base-modal__body--${layout}`,
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classNames} {...props}>
        {children}
      </div>
    );
  },
);

export const ModalContent = forwardRef<HTMLDivElement, ModalContentProps>(
  function ModalContent({ className = "", children, ...props }, ref) {
    const classNames = ["base-modal__content", className]
      .filter(Boolean)
      .join(" ");

    return (
      <div ref={ref} className={classNames} {...props}>
        {children}
      </div>
    );
  },
);

export const ModalFooter = forwardRef<HTMLElement, ModalFooterProps>(
  function ModalFooter({ className = "", children, ...props }, ref) {
    const classNames = ["base-modal__footer", className]
      .filter(Boolean)
      .join(" ");

    return (
      <footer ref={ref} className={classNames} {...props}>
        {children}
      </footer>
    );
  },
);

const ModalRoot = forwardRef<HTMLElement, ModalProps>(function Modal(
  {
    open = true,
    onClose,
    dismissDisabled = false,
    size = "md",
    fullScreenMobile = false,
    ariaLabelledBy,
    ariaLabel,
    backdropClassName = "",
    className = "",
    children,
    ...props
  },
  ref,
) {
  const dialogId = useId();

  useEffect(() => {
    if (!open) return;
    pushDialog(dialogId);
    return () => popDialog(dialogId);
  }, [open, dialogId]);

  useEffect(() => {
    if (!open || dismissDisabled || !onClose) return;
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (!isTopDialog(dialogId)) return;
      event.preventDefault();
      onClose?.();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [open, dismissDisabled, dialogId, onClose]);

  if (!open) return null;

  const backdropClasses = [
    "base-modal-backdrop",
    fullScreenMobile ? "base-modal-backdrop--fullscreen-mobile" : "",
    backdropClassName,
  ]
    .filter(Boolean)
    .join(" ");

  const modalClasses = [
    "base-modal",
    `base-modal--${size}`,
    fullScreenMobile ? "base-modal--fullscreen-mobile" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={backdropClasses}
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !dismissDisabled &&
          onClose &&
          isTopDialog(dialogId)
        ) {
          onClose();
        }
      }}
    >
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-label={ariaLabel}
        className={modalClasses}
        {...props}
      >
        {children}
      </section>
    </div>
  );
});

export const Modal = Object.assign(ModalRoot, {
  Body: ModalBody,
  Content: ModalContent,
  Footer: ModalFooter,
});

export default Modal;
