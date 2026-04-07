import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

type PlaygroundPopoverProps = {
  ariaLabel: string;
  children: ReactNode | ((popover: { close: () => void }) => ReactNode);
  containerClassName: string;
  flyoutClassName: string;
  icon: ReactNode;
  iconClassName?: string;
  iconStyle?: CSSProperties;
  showSwatch?: boolean;
};

export function PlaygroundPopover({
  ariaLabel,
  children,
  containerClassName,
  flyoutClassName,
  icon,
  iconClassName,
  iconStyle,
  showSwatch = true,
}: PlaygroundPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        popoverRef.current &&
        event.target instanceof Node &&
        !popoverRef.current.contains(event.target)
      ) {
        close();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  return (
    <div className={`playground-popover ${containerClassName}`} ref={popoverRef}>
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        className="playground-menu-toggle"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          aria-hidden="true"
          className={`playground-popover-icon${showSwatch ? "" : " is-plain"}${
            iconClassName ? ` ${iconClassName}` : ""
          }`}
          style={showSwatch ? iconStyle : undefined}
        >
          {icon}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={open ? "is-open" : undefined}
          size={14}
          strokeWidth={2.1}
        />
      </button>
      {open ? (
        <div className={`playground-popover-flyout ${flyoutClassName}`}>
          {typeof children === "function" ? children({ close }) : children}
        </div>
      ) : null}
    </div>
  );
}
