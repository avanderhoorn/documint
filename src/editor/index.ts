export {
  createEditor,
  type Editor,
  type EditorHoverTarget,
  type EditorPoint,
  type EditorSelectionPoint,
  type EditorViewportState,
  type EditorStateChange,
} from "./api";

export type {
  EditorPresence,
  EditorPresenceViewport,
  EditorPresenceViewportStatus,
  Presence,
} from "./annotations";

export { type EditorTheme } from "./render/theme";

export {
  emptyDocumentResources,
  type DocumentImageResource,
  type DocumentResources,
} from "./resources";
