import { type CSSProperties } from "react";
import { Palette } from "lucide-react";
import { getThemeOption, themeOptions } from "../data";
import { PlaygroundPopover } from "./PlaygroundPopover";

type ThemePopoverProps = {
  onThemeIdChange: (themeId: string) => void;
  themeId: string;
};

export function ThemePopover({ onThemeIdChange, themeId }: ThemePopoverProps) {
  const activeThemeOption = getThemeOption(themeId);
  const showSwatch = activeThemeOption.id !== "system";

  return (
    <PlaygroundPopover
      ariaLabel="Select editor theme"
      containerClassName="theme-controls"
      flyoutClassName="theme-flyout"
      icon={<Palette size={16} strokeWidth={2.1} />}
      iconStyle={showSwatch ? getThemeSwatchStyle(activeThemeOption) : undefined}
      showSwatch={showSwatch}
    >
      {({ close }) => (
        <div className="theme-list">
          {themeOptions.map((option) => (
            <button
              className={option.id === themeId ? "is-active" : undefined}
              key={option.id}
              onClick={() => {
                onThemeIdChange(option.id);
                close();
              }}
              style={getThemeOptionLabelStyle(option)}
              type="button"
            >
              <span
                aria-hidden="true"
                className="theme-option-icon"
                style={getThemeSwatchStyle(option)}
              >
                <Palette size={16} strokeWidth={2.1} />
              </span>
              {option.label}
            </button>
          ))}
        </div>
      )}
    </PlaygroundPopover>
  );
}

function getThemeOptionLabelStyle(option: (typeof themeOptions)[number]): CSSProperties {
  return {
    color:
      option.id === "dark"
        ? "#111827"
        : option.id === "midnight"
          ? "#6d28d9"
          : (option.theme?.paragraphText ?? option.theme?.leafText ?? "var(--playground-text)"),
  };
}

function getThemeSwatchStyle(option: (typeof themeOptions)[number]): CSSProperties {
  return {
    background:
      option.theme?.background ??
      "linear-gradient(135deg, rgba(15, 23, 42, 0.16), rgba(148, 163, 184, 0.32))",
    borderColor: option.theme?.tableBorder ?? "rgba(15, 23, 42, 0.16)",
    color: option.theme?.caret ?? "rgba(15, 23, 42, 0.68)",
  };
}
