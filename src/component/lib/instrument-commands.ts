// Wraps every public command from `@/editor` with a thin diagnostics shim
// so each call emits a `command` lifecycle event. The wrapper preserves
// each command's signature, so it's a drop-in replacement at every call
// site. Lives here (not in the editor subsystem) because upstream's editor
// exposes commands as plain free functions and has no facade.
//
// Wrappers are pure (no per-instance state), so a single frozen
// module-level instance is shared across all `Documint` mounts.
//
// In production every wrapper body collapses to `command(...args)` via the
// NODE_ENV gate; only the closure objects themselves remain.

import {
  createCommentThread as rawCreateCommentThread,
  dedent as rawDedent,
  deleteBackward as rawDeleteBackward,
  deleteComment as rawDeleteComment,
  deleteCommentThread as rawDeleteCommentThread,
  deleteForward as rawDeleteForward,
  deleteSelection as rawDeleteSelection,
  deleteTable as rawDeleteTable,
  deleteTableColumn as rawDeleteTableColumn,
  deleteTableRow as rawDeleteTableRow,
  editComment as rawEditComment,
  indent as rawIndent,
  insertLineBreak as rawInsertLineBreak,
  insertTable as rawInsertTable,
  insertTableColumn as rawInsertTableColumn,
  insertTableRow as rawInsertTableRow,
  insertText as rawInsertText,
  moveListItemDown as rawMoveListItemDown,
  moveListItemUp as rawMoveListItemUp,
  redo as rawRedo,
  removeLink as rawRemoveLink,
  replaceSelection as rawReplaceSelection,
  replyToCommentThread as rawReplyToCommentThread,
  resolveCommentThread as rawResolveCommentThread,
  selectAll as rawSelectAll,
  toggleBold as rawToggleBold,
  toggleInlineCode as rawToggleInlineCode,
  toggleItalic as rawToggleItalic,
  toggleStrikethrough as rawToggleStrikethrough,
  toggleTaskItem as rawToggleTaskItem,
  toggleUnderline as rawToggleUnderline,
  undo as rawUndo,
  updateLink as rawUpdateLink,
} from "@/editor";
import { emitLifecycle } from "@/lifecycle";

type AnyCommand<Args extends unknown[], Result> = (...args: Args) => Result;

// `EditorState`-like shape used by the no-op detector. Kept structural so
// the wrapper doesn't have to import the full `EditorState` type.
type EditorStateLike = { documentIndex: unknown; selection: unknown };

function isStateLike(value: unknown): value is EditorStateLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "documentIndex" in value &&
    "selection" in value
  );
}

function wrap<Args extends unknown[], Result>(
  name: string,
  command: AnyCommand<Args, Result>,
): AnyCommand<Args, Result> {
  return (...args: Args) => {
    if (process.env.NODE_ENV === "production") {
      return command(...args);
    }
    const startedAt = performance.now();
    const result = command(...args);
    // Skip emission for no-op commands. Three no-op shapes are recognized:
    //   1. `null` return — explicit "nothing to do" (e.g. resolving a
    //      missing thread, formatting toggle on empty selection).
    //   2. Identity return — `result === args[0]`. Several commands
    //      (`undo` with empty history, `redo` with empty future) return
    //      their input state object unchanged to signal a no-op.
    //   3. Wrapped-identity return — `result` is a fresh state object but
    //      neither the document nor the selection moved (e.g. `selectAll`
    //      always builds a new state via `setSelection`, even when the
    //      whole document is already selected). Comparing by reference on
    //      the two state slots that all editor commands mutate covers
    //      this without making the wrapper EditorState-aware.
    if (result == null || result === args[0]) return result;
    if (isStateLike(args[0]) && isStateLike(result)) {
      if (
        result.documentIndex === args[0].documentIndex &&
        result.selection === args[0].selection
      ) {
        return result;
      }
    }
    emitLifecycle({
      type: "command",
      name,
      durationMs: performance.now() - startedAt,
    });
    return result;
  };
}

// Module-level frozen object. Wrappers are pure, so all `Documint` mounts
// share the same instance.
export const instrumentedCommands = Object.freeze({
  insertText: wrap("insertText", rawInsertText),
  insertLineBreak: wrap("insertLineBreak", rawInsertLineBreak),
  deleteBackward: wrap("deleteBackward", rawDeleteBackward),
  deleteForward: wrap("deleteForward", rawDeleteForward),
  deleteSelection: wrap("deleteSelection", rawDeleteSelection),
  replaceSelection: wrap("replaceSelection", rawReplaceSelection),

  selectAll: wrap("selectAll", rawSelectAll),

  toggleBold: wrap("toggleBold", rawToggleBold),
  toggleItalic: wrap("toggleItalic", rawToggleItalic),
  toggleStrikethrough: wrap("toggleStrikethrough", rawToggleStrikethrough),
  toggleUnderline: wrap("toggleUnderline", rawToggleUnderline),
  toggleInlineCode: wrap("toggleInlineCode", rawToggleInlineCode),

  indent: wrap("indent", rawIndent),
  dedent: wrap("dedent", rawDedent),
  moveListItemUp: wrap("moveListItemUp", rawMoveListItemUp),
  moveListItemDown: wrap("moveListItemDown", rawMoveListItemDown),
  toggleTaskItem: wrap("toggleTaskItem", rawToggleTaskItem),

  undo: wrap("undo", rawUndo),
  redo: wrap("redo", rawRedo),

  insertTable: wrap("insertTable", rawInsertTable),
  insertTableColumn: wrap("insertTableColumn", rawInsertTableColumn),
  deleteTableColumn: wrap("deleteTableColumn", rawDeleteTableColumn),
  insertTableRow: wrap("insertTableRow", rawInsertTableRow),
  deleteTableRow: wrap("deleteTableRow", rawDeleteTableRow),
  deleteTable: wrap("deleteTable", rawDeleteTable),

  updateLink: wrap("updateLink", rawUpdateLink),
  removeLink: wrap("removeLink", rawRemoveLink),

  createCommentThread: wrap("createCommentThread", rawCreateCommentThread),
  replyToCommentThread: wrap("replyToCommentThread", rawReplyToCommentThread),
  editComment: wrap("editComment", rawEditComment),
  deleteComment: wrap("deleteComment", rawDeleteComment),
  deleteCommentThread: wrap("deleteCommentThread", rawDeleteCommentThread),
  resolveCommentThread: wrap("resolveCommentThread", rawResolveCommentThread),
});

export type InstrumentedCommands = typeof instrumentedCommands;
