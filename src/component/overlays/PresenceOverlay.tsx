import { ArrowDown, ArrowUp } from "lucide-react";
import type { CSSProperties } from "react";
import type { EditorPresence } from "@/editor";

type PresenceOverlayProps = {
  insetX: number;
  insetY: number;
  onSelect: (presence: EditorPresence) => void;
  presence: EditorPresence[];
};

export function PresenceOverlay({ insetX, insetY, onSelect, presence }: PresenceOverlayProps) {
  if (presence.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Presence"
      className="documint-presence-indicators"
      style={{
        paddingRight: `${insetX}px`,
        top: `${insetY}px`,
      }}
    >
      {presence.map((presenceItem, index) => (
        <PresenceIndicator
          key={resolvePresenceIndicatorKey(presenceItem, index)}
          onSelect={() => onSelect(presenceItem)}
          presence={presenceItem}
        />
      ))}
    </div>
  );
}

function PresenceIndicator({
  onSelect,
  presence,
}: {
  onSelect: () => void;
  presence: EditorPresence;
}) {
  const viewport = presence.viewport;
  const initial = resolvePresenceInitial(presence);
  const DirectionIcon = viewport?.status === "above" ? ArrowUp : ArrowDown;
  const canScrollToPresence = viewport !== null && viewport.scrollTop !== null;
  const showDirection = viewport?.status === "above" || viewport?.status === "below";

  return (
    <button
      aria-label={resolvePresenceIndicatorAriaLabel(presence)}
      className="documint-presence-indicator"
      data-status={viewport?.status ?? "unresolved"}
      disabled={!canScrollToPresence}
      onClick={canScrollToPresence ? onSelect : undefined}
      style={
        {
          "--documint-presence-color": presence.color ?? "var(--documint-leaf-accent)",
        } as CSSProperties
      }
      type="button"
    >
      <span className="documint-presence-indicator-avatar">
        {presence.imageUrl ? (
          <img
            alt=""
            aria-hidden="true"
            className="documint-presence-indicator-image"
            draggable={false}
            src={presence.imageUrl}
          />
        ) : (
          initial
        )}
      </span>
      {showDirection ? (
        <span className="documint-presence-indicator-direction" aria-hidden="true">
          <DirectionIcon
            className="documint-presence-indicator-arrow"
            size={14}
            strokeWidth={2.3}
          />
        </span>
      ) : null}
    </button>
  );
}

function resolvePresenceInitial(presence: EditorPresence) {
  return resolvePresenceName(presence).charAt(0).toLocaleUpperCase();
}

function resolvePresenceIndicatorAriaLabel(presence: EditorPresence) {
  const name = resolvePresenceName(presence);
  const status = presence.viewport?.status ?? "unresolved";

  if (status === "above") {
    return `${name} above viewport`;
  }

  if (status === "below") {
    return `${name} below viewport`;
  }

  if (status === "unresolved") {
    return `${name} unresolved`;
  }

  return `${name} in viewport`;
}

function resolvePresenceName(presence: EditorPresence) {
  return presence.name.trim() || "Presence";
}

function resolvePresenceIndicatorKey(presence: EditorPresence, index: number) {
  return [
    index,
    presence.name,
    presence.imageUrl ?? "",
    presence.color ?? "",
    presence.cursor?.kind ?? "",
    presence.cursor?.prefix ?? "",
    presence.cursor?.suffix ?? "",
  ].join(":");
}
