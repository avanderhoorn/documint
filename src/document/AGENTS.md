# Document

This sub-system owns the closed, immutable, format-agnostic semantic document model. It defines `Document` and all block/inline node types as discriminated unions, provides deterministic ID generation and `plainText` extraction during canonical construction, and exposes a typed visitor for tree traversal. The data model is intentionally closed — node types don't change at runtime — so exhaustive switches are the primary extension mechanism. Every other subsystem builds on this model without modifying it.

The document layer may also expose small semantic helpers that operate purely on `Document` itself. In particular, content-addressable anchor discovery belongs here when it describes how semantic document content can be enumerated and identified without depending on editor/runtime concepts.

### Key Files

- `types.ts` - Owns the semantic vocabulary: `Document`, block nodes, inline nodes, marks, and related model types.

- `document.ts` - Owns canonical document operations: `createDocument(...)` for full construction, `spliceDocument(...)` for incremental root-level edits, and shared semantic helpers such as `nodeId(...)` and plain-text extraction.

- `build.ts` - Owns semantic node builders and rebuild helpers that keep semantic node shape and derived fields such as `plainText` correct for core node families.

- `visit.ts` - Owns typed semantic tree traversal for blocks, inline nodes, and table-cell text containers.

- `query.ts` - Owns small semantic queries built on the shared walker, such as image discovery and block lookup.

- `anchors.ts` - Owns document-level anchor container discovery for content-addressable consumers such as comments and editor annotations.
