# Editor

This sub-system owns the framework-agnostic editing engine. Its job is to turn `Document` into `DocumentEditor`, apply semantic editing and navigation behavior, produce `DocumentLayout`, and paint that layout without leaking markdown persistence or React lifecycle concerns into the subsystem.

The main stages in this subsystem are:

- `Document -> DocumentEditor`
- `DocumentEditor -> DocumentLayout`
- `DocumentLayout -> canvas pixels`

### Key Files

- `editor.ts` - Owns the host-facing editor boundary: editor state creation, commands, keyboard routing, prepared viewport rendering, hit testing, and paint entrypoints.

- `model/document-editor.ts` - Owns the `Document -> DocumentEditor` projection plus selection normalization and localized semantic text replacement helpers.

- `model/state.ts` - Owns `EditorState`: `DocumentEditor`, current selection, undo history, redo future, and `Document` round-tripping.

- `comments.ts` - Owns runtime comment projection from semantic threads into live ranges plus editor-local anchor maintenance during same-container edits.

- `model/commands/index.ts` - Owns the public editing command surface and composes lower-level block, list, input, inline, and table commands.

- `navigation/index.ts` - Owns the public caret and range navigation boundary.

- `navigation/line.ts` - Owns the default line-based navigation behavior for ordinary document flow.

- `navigation/table.ts` - Owns table-specific vertical navigation overrides.

- `layout/document.ts` - Owns the `DocumentEditor -> DocumentLayout` geometry pass.

- `layout/viewport.ts` - Owns viewport-local layout planning, visible container slicing, and total document height estimation.

- `layout/hit-test.ts` - Owns pointer and caret targeting against prepared layout geometry.

- `render/paint.ts` - Owns pure canvas painting from prepared layout.

- `render/theme.ts` - Owns the semantic editor theme tokens and built-in light/dark themes.
