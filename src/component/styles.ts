import { DOCUMINT_LEAF_STYLES } from "./leaves/styles";

// Base Documint host and SSR-fallback styles. These are low-specificity on
// purpose so embedding apps can layer presentation on top without fighting the
// component's required structure.
export const DOCUMINT_EDITOR_STYLES = `
:where(.documint) {
  display: grid;
  min-width: 0;
  min-height: 0;
}

:where(.documint-scroll-container) {
  position: relative;
  display: block;
  width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
}

:where(.documint-input) {
  /* The bridge must look like a real focused input to iOS so Safari
     shifts the page above the virtual keyboard. Empirically:
       - opacity must be greater than 0
       - the bounding rect must be at least 2x2 pixels (1x1 is skipped)
       - pointer-events must not be none
     Any of those signals "not a real user input" and iOS won't shift.
     We hide the element from the user via transparent colors while
     keeping those signals correct. JS sizes/positions it at the caret
     at focus time. */
  position: absolute;
  top: 0;
  left: 0;
  width: 2px;
  height: 2px;
  padding: 0;
  border: 0;
  margin: 0;
  color: transparent;
  background: transparent;
  caret-color: transparent;
  outline: none;
  resize: none;
}

:where(.documint-scroll-content) {
  position: relative;
  min-height: 100%;
  overflow: hidden;
}

:where(.documint-content-canvas) {
  position: absolute;
  inset: 0 auto auto 0;
  display: block;
  width: 100%;
  outline: none;
}

:where(.documint-overlay-canvas) {
  position: absolute;
  inset: 0 auto auto 0;
  display: block;
  width: 100%;
  pointer-events: none;
}

:where(.documint-presence-indicators) {
  position: sticky;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.45rem;
  height: 0;
  pointer-events: none;
}

.documint-presence-indicator {
  --documint-presence-indicator-size: 1.45rem;
  display: inline-flex;
  flex-direction: row-reverse;
  align-items: center;
  min-width: var(--documint-presence-indicator-size);
  height: var(--documint-presence-indicator-size);
  padding: 0;
  border: 1px solid var(--documint-leaf-border);
  border-radius: 999px;
  background: var(--documint-leaf-bg);
  box-shadow: var(
    --documint-leaf-shadow,
    0 14px 40px color-mix(in srgb, var(--documint-leaf-text) 16%, transparent)
  );
  color: var(--documint-leaf-text);
  cursor: pointer;
  font-family: var(--documint-leaf-font-family, "Avenir Next", "Segoe UI", sans-serif);
  font-size: 0.66rem;
  font-weight: 700;
  line-height: 1;
  pointer-events: auto;
}

:where(.documint-presence-indicator:disabled) {
  cursor: default;
  opacity: 0.72;
}

:where(.documint-presence-indicator-avatar) {
  display: inline-grid;
  place-items: center;
  width: var(--documint-presence-indicator-size);
  height: var(--documint-presence-indicator-size);
  overflow: hidden;
  border-radius: 999px;
  background: var(--documint-presence-color);
  color: white;
}

:where(.documint-presence-indicator-image) {
  display: block;
  width: calc(100% - 2px);
  height: calc(100% - 2px);
  border-radius: inherit;
  object-fit: cover;
}

:where(.documint-presence-indicator-direction) {
  display: inline-flex;
  align-items: center;
  height: 100%;
  padding: 0 0.42rem 0 0.36rem;
  color: var(--documint-leaf-text);
}

:where(.documint-presence-indicator-arrow) {
  display: block;
}

:where(.documint-selection-handle) {
  position: absolute;
  z-index: 4;
  width: 1.2rem;
  height: 1.2rem;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
}

:where(.documint-selection-handle:active) {
  cursor: grabbing;
}

:where(.documint-selection-handle-start) {
  transform: translate(-70%, -82%);
}

:where(.documint-selection-handle-end) {
  transform: translate(-30%, -39%);
}

:where(.documint-selection-handle-knob) {
  position: absolute;
  inset: 0;
  display: block;
  border: 2px solid var(--documint-selection-handle-border);
  border-radius: 999px;
  background: var(--documint-selection-handle-bg);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.18);
}

:where(.documint-fallback) {
  max-width: 100%;
  color: #0f172a;
  line-height: 1.65;
  white-space: normal;
}

:where(.documint-fallback p) {
  margin: 0 0 0.9rem;
}

:where(.documint-fallback h1),
:where(.documint-fallback h2),
:where(.documint-fallback h3),
:where(.documint-fallback h4),
:where(.documint-fallback h5),
:where(.documint-fallback h6) {
  margin: 0 0 0.85rem;
  line-height: 1.15;
}

:where(.documint-fallback h1) {
  font-size: 2rem;
}

:where(.documint-fallback h2) {
  font-size: 1.55rem;
}

:where(.documint-fallback h3) {
  font-size: 1.25rem;
}

:where(.documint-fallback ul),
:where(.documint-fallback ol) {
  margin: 0 0 1rem;
  padding-left: 1.4rem;
}

:where(.documint-fallback li > p) {
  margin: 0;
}

:where(.documint-fallback blockquote) {
  margin: 0 0 1rem;
  padding-left: 1rem;
  border-left: 3px solid rgba(14, 116, 144, 0.3);
  color: #334155;
}

:where(.documint-fallback pre) {
  margin: 0 0 1rem;
  padding: 0.9rem 1rem;
  overflow: auto;
  border-radius: 0.85rem;
  background: #0f172a;
  color: #e2e8f0;
}

:where(.documint-fallback table) {
  width: 100%;
  margin: 0 0 1rem;
  border-collapse: collapse;
}

:where(.documint-fallback td) {
  padding: 0.45rem 0.55rem;
  border: 1px solid rgba(148, 163, 184, 0.35);
}

:where(.documint-fallback a) {
  color: #0369a1;
}

:where(.preview-rich-header) {
  margin: 0 0 0.35rem;
  color: #9fb3c8;
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:where(.preview-block-code) {
  margin: 0 0 1rem;
  padding: 0.75rem;
  border-radius: 0.9rem;
  background: linear-gradient(180deg, #132033, #0f172a);
  color: #e2e8f0;
}

:where(.preview-block-code pre) {
  margin: 0;
  padding: 0.9rem 1rem;
  overflow: auto;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.72);
}

:where(.preview-block-table) {
  margin: 0 0 1rem;
  padding: 0.75rem;
  border: 1px solid rgba(14, 116, 144, 0.18);
  border-radius: 0.9rem;
  background: rgba(248, 250, 252, 0.96);
}

:where(.preview-table-scroll) {
  overflow-x: auto;
}

:where(.preview-table-scroll table) {
  min-width: max-content;
}

:where(.preview-inline-image) {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  max-width: min(100%, 34rem);
  margin: 0 0.15rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid rgba(14, 116, 144, 0.16);
  border-radius: 999px;
  background: rgba(240, 249, 255, 0.95);
  vertical-align: middle;
}

:where(.preview-inline-image img) {
  flex: none;
  width: 2.4rem;
  height: 2.4rem;
  object-fit: cover;
  border-radius: 0.65rem;
  background: rgba(148, 163, 184, 0.18);
}

:where(.preview-inline-image > span) {
  display: grid;
  min-width: 0;
}

:where(.preview-inline-image strong) {
  color: #0f172a;
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  font-size: 0.88rem;
}

:where(.preview-inline-image small) {
  overflow: hidden;
  color: #475569;
  font-family: "Avenir Next", "Segoe UI", sans-serif;
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

${DOCUMINT_LEAF_STYLES}
`;
