# Component

This sub-system owns the React host for the editor. Its job is to bridge controlled markdown content into `Document`, orchestrate browser, DOM, and canvas lifecycle, and translate user interactions into semantic editor calls — delegating all editing behavior, layout, hit-testing, and paint to the `src/editor` API.

### Key Areas

- **Core** (`Documint.tsx`, `Ssr.tsx`, `index.ts`) - Owns the public `Documint` component, host lifecycle, DOM event wiring, viewport scheduling, canvas layer management, controlled-content bridging, and the semantic HTML surface shown before the interactive canvas mounts.

- **Hooks** (`hooks/`) - Each hook owns one interaction concern: editor instance lifetime, text/keyboard/clipboard input bridging, selection handle management, cursor blink and leaf resolution, hover target debouncing, render-frame coalescing, and async image loading.

- **Leaves** (`leaves/`) - Owns the contextual leaf UI rendered via portals: comment creation and thread interaction, block insertion menus, table editing menus, link preview and editing, and the shared compound toolbar component used across leaf types.

- **Utilities** (`lib/`) - Owns stateless host helpers: keybinding resolution, selection math and clipboard extraction, canvas DPI scaling, pointer coordinate conversion, and built-in theme definitions.
