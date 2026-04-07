import { useEffect, useRef } from "react";
import { LocateFixed, Trash2 } from "lucide-react";
import type { Presence } from "documint";
import { describePresence, usePresence } from "../hooks/usePresence";
import { PlaygroundPopover } from "./PlaygroundPopover";

type PresencePopoverProps = {
  content: string;
  onPresenceChange: (presence: Presence[]) => void;
  resetKey: string;
};

export function PresencePopover({ content, onPresenceChange, resetKey }: PresencePopoverProps) {
  const previousResetKeyRef = useRef(resetKey);
  const { auto, manualPresence, manualForm, popoverProps, presence, reset } = usePresence(content);

  useEffect(() => {
    if (previousResetKeyRef.current !== resetKey) {
      previousResetKeyRef.current = resetKey;
      reset();
      onPresenceChange([]);
      return;
    }

    onPresenceChange(presence);
  }, [onPresenceChange, presence, reset, resetKey]);

  return (
    <PlaygroundPopover icon={<LocateFixed size={16} strokeWidth={2.1} />} {...popoverProps}>
      <div className="presence-header">
        <strong>Presence</strong>
        <label className="presence-checkbox">
          <input
            checked={auto.enabled}
            onChange={(event) => auto.setEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>Auto</span>
        </label>
      </div>

      <div className="presence-manual">
        <label className="fixture-picker">
          <span>Name</span>
          <input
            disabled={auto.enabled}
            onChange={(event) => manualForm.setName(event.target.value)}
            placeholder="Name"
            required
            type="text"
            value={manualForm.name}
          />
        </label>

        <label className="fixture-picker">
          <span>Image URL</span>
          <input
            disabled={auto.enabled}
            onChange={(event) => manualForm.setImageUrl(event.target.value)}
            placeholder="Optional avatar image"
            type="url"
            value={manualForm.imageUrl}
          />
        </label>

        <label className="fixture-picker">
          <span>Prefix</span>
          <input
            disabled={auto.enabled}
            onChange={(event) => manualForm.setPrefix(event.target.value)}
            placeholder="Caret appears after this text"
            type="text"
            value={manualForm.prefix}
          />
        </label>

        <label className="fixture-picker">
          <span>Suffix</span>
          <input
            disabled={auto.enabled}
            onChange={(event) => manualForm.setSuffix(event.target.value)}
            placeholder="Caret appears before this text"
            type="text"
            value={manualForm.suffix}
          />
        </label>

        <div className="presence-manual-row">
          <label className="fixture-picker presence-color-picker">
            <span>Color</span>
            <input
              disabled={auto.enabled}
              onChange={(event) => manualForm.setColor(event.target.value)}
              type="color"
              value={manualForm.color}
            />
          </label>

          <button
            className="presence-add"
            disabled={auto.enabled || !manualForm.canAddPresence}
            onClick={manualForm.addPresence}
            type="button"
          >
            Add
          </button>
        </div>
      </div>

      {auto.enabled ? (
        <p className="presence-status">
          {auto.presence
            ? `Auto presence: ${describePresence(auto.presence)}`
            : "Auto presence: waiting for a suitable text run"}
        </p>
      ) : manualPresence.items.length > 0 ? (
        <>
          <div aria-hidden="true" className="presence-divider" />
          <div className="presence-list">
            {manualPresence.items.map((presenceItem) => (
              <div className="presence-chip" key={presenceItem.localId}>
                <span
                  aria-hidden="true"
                  className="presence-chip-swatch"
                  style={{ backgroundColor: presenceItem.color ?? "#0ea5e9" }}
                />
                <span>{describePresence(presenceItem)}</span>
                <button
                  aria-label={`Remove ${describePresence(presenceItem)}`}
                  className="presence-remove"
                  onClick={() => manualPresence.removePresence(presenceItem.localId)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} strokeWidth={2.1} />
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </PlaygroundPopover>
  );
}
