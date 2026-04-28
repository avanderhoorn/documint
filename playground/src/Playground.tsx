import { useEffect, useRef, useState } from "react";
import {
  Documint,
  type DocumentPresence,
  type DocumentUser,
  subscribeLifecycle,
} from "documint";
import {
  createDiagnosticsCollector,
  DebugPanel,
  DIAGNOSTICS_STAGES,
  type DiagnosticsCollector,
} from "./diagnostics";
import { fixtureOptions, getThemeOption, themeOptions } from "./data";
import { DiagnosticsPopover } from "./popovers/DiagnosticsPopover";
import { UsersPopover } from "./popovers/UsersPopover";
import { ThemePopover } from "./popovers/ThemePopover";

const VALID_STAGES: ReadonlySet<string> = new Set(DIAGNOSTICS_STAGES);

export function Playground() {
  const [fixtureId, setFixtureId] = useState<string>(fixtureOptions[0].id);
  const [content, setContent] = useState<string>(fixtureOptions[0].markdown);
  const [themeId, setThemeId] = useState<string>(themeOptions[0].id);
  const [users, setUsers] = useState<DocumentUser[]>([]);
  const [presence, setPresence] = useState<DocumentPresence[]>([]);
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);

  // The collector lives behind a ref so toggling the debug panel doesn't
  // recreate Documint or its editor. Lifetime is managed synchronously by
  // the toggle handler — creating it inside `useEffect` would commit AFTER
  // the first panel-open render, so any lifecycle event fired during that
  // render (parse, serialize, layout) would be dropped on the floor.
  const collectorRef = useRef<DiagnosticsCollector | undefined>(undefined);
  // Bumped each time the collector identity flips so the panel UI can
  // re-render with the new instance.
  const [collectorVersion, setCollectorVersion] = useState(0);

  const handleToggleDebugPanel = () => {
    const next = !debugPanelOpen;
    // Side effects belong in the event handler body, NOT inside the
    // `setState` updater. React intentionally invokes updaters twice in
    // strict-mode dev to surface impure ones; doing the collector swap
    // there would allocate a second collector per click and silently leak
    // the first. Event handlers fire exactly once per click.
    collectorRef.current = next ? createDiagnosticsCollector() : undefined;
    setCollectorVersion((v) => v + 1);
    setDebugPanelOpen(next);
  };

  // Subscribe to lifecycle events while the panel is open. `subscribeLifecycle`
  // handles the prefix-filter + envelope-strip; we still validate the stage
  // suffix against the known taxonomy so an unknown variant can't crash
  // `collector.record(stage, ...)`.
  useEffect(() => {
    if (!debugPanelOpen) return;
    return subscribeLifecycle((event) => {
      const collector = collectorRef.current;
      if (!collector) return;
      if (!VALID_STAGES.has(event.type)) return;
      const { type: _type, durationMs = 0, ...meta } = event as { type: string; durationMs?: number } & Record<string, unknown>;
      collector.record(event.type, meta, durationMs);
    });
  }, [debugPanelOpen, collectorVersion]);

  const activeThemeOption = getThemeOption(themeId);
  const activeTheme = activeThemeOption.theme;

  const handleFixtureChange = (nextFixtureId: string) => {
    const nextFixture = fixtureOptions.find((candidate) => candidate.id === nextFixtureId);

    if (!nextFixture) {
      return;
    }

    setFixtureId(nextFixture.id);
    setContent(nextFixture.markdown);
  };

  const handleThemeChange = (nextThemeId: string) => {
    setThemeId(nextThemeId);
  };

  const handleContentChange = (nextContent: string) => {
    setContent(nextContent);
  };

  return (
    <main className="playground-shell">
      <header className="playground-header">
        <h1>Documint Playground</h1>

        <div className="playground-controls">
          <label className="fixture-picker">
            <select
              aria-label="Select markdown fixture"
              onChange={(event) => handleFixtureChange(event.target.value)}
              value={fixtureId}
            >
              {fixtureOptions.map((fixture) => (
                <option key={fixture.id} value={fixture.id}>
                  {fixture.label}
                </option>
              ))}
            </select>
          </label>

          <ThemePopover onThemeIdChange={handleThemeChange} themeId={themeId} />

          <UsersPopover
            content={content}
            onPresenceChange={setPresence}
            onUsersChange={setUsers}
            resetKey={fixtureId}
          />

          {/* Live raw bridge-event log (upstream's forensic panel) and our
              aggregate diagnostics panel. Both are dev-only — gated so they
              ship with `bun run dev` but not with the deployable demo
              (`bun run build:playground`). */}
          {process.env.NODE_ENV !== "production" ? <DiagnosticsPopover /> : null}
          {process.env.NODE_ENV !== "production" ? (
            <button
              className="playground-menu-toggle"
              onClick={handleToggleDebugPanel}
              title={debugPanelOpen ? "Close debug panel" : "Open debug panel"}
              type="button"
            >
              ⚡ Debug
            </button>
          ) : null}
        </div>
      </header>

      <section className="playground-grid">
        <div className="host-panel">
          <div className="host-card">
            <Documint
              content={content}
              onContentChanged={handleContentChange}
              presence={presence}
              theme={activeTheme ?? undefined}
              users={users}
            />
          </div>
        </div>

        <div className="source-panel">
          <div className="source-card">
            <textarea
              aria-label="Markdown source"
              className="source-editor"
              onChange={(event) => handleContentChange(event.target.value)}
              spellCheck={false}
              value={content}
            />
          </div>
        </div>
      </section>

      {debugPanelOpen && (
        <div className="debug-panel">
          <DebugPanel collector={collectorRef.current} key={collectorVersion} />
        </div>
      )}
    </main>
  );
}
