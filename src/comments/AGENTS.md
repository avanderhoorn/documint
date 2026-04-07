# Comments

This sub-system owns anchored review annotations. Its job is to define the persisted comment-thread shape, create anchors against semantic document content, resolve those anchors against the current document snapshot, and provide immutable thread mutation primitives that the editor API wraps into stateful editor operations. All comment mutation from consumers should go through the editor API rather than calling these primitives directly.

Comments intentionally operate on `Document`, not `EditorModel`. They use content-addressable anchors rather than runtime addresses, so the simplest correct substrate is semantic document content plus markdown persistence. The editor consumes this subsystem by projecting those semantic anchors into live runtime ranges; the dependency must not point the other way.

### Key Files

- `types.ts` - Owns the persisted comment vocabulary: threads, comments, anchors, and resolution results.

- `anchors.ts` - Owns comment anchor construction and the quote/context-based resolution algorithm that re-attaches threads against the current document snapshot, using document-level anchor containers from `src/document`.

- `threads.ts` - Owns immutable CRUD operations and queries over comment threads: creation, replies, edits, deletion, and resolution status.

- `serialization.ts` - Owns defensive parsing of a single untrusted comment-thread payload. Persistence layers own their own envelope (JSON shape, storage location) and call `parseCommentThread` per item.

- `index.ts` - Owns the public comment API surface. All comment operations used by other subsystems flow through this barrel.
