import { extractPlainTextFromInlineNodes } from "./document";
import type { Document } from "./types";
import { visitDocument } from "./visit";

// The closed set of container families that anchors can attach to.
// `DEFAULT_ANCHOR_KIND` is the implicit kind: an `Anchor` with no `kind` set is
// understood as anchored to a default-kind container, which keeps the common
// case out of the persisted payload.
export const ANCHOR_KINDS = ["text", "code", "tableCell"] as const;

export type AnchorKind = (typeof ANCHOR_KINDS)[number];

export const DEFAULT_ANCHOR_KIND: AnchorKind = "text";

export function isAnchorKind(value: unknown): value is AnchorKind {
  return value === "text" || value === "code" || value === "tableCell";
}

// Drops a kind that matches the default so persisted payloads stay canonical.
export function normalizeAnchorKind(kind: AnchorKind | undefined): AnchorKind | undefined {
  return kind === DEFAULT_ANCHOR_KIND ? undefined : kind;
}

export type Anchor = {
  kind?: AnchorKind;
  prefix?: string;
  suffix?: string;
};

export type AnchorContainer = {
  containerKind: AnchorKind;
  containerOrdinal: number;
  id: string;
  text: string;
};

// Where an `Anchor` resolved to in a current `Document` snapshot.
export type AnchorMatch = {
  containerId: string;
  containerKind: AnchorKind;
  containerOrdinal: number;
  startOffset: number;
  endOffset: number;
};

// Lifecycle of an anchor reattachment attempt.
//   matched   - The anchor's exact context still appears in the snapshot.
//   repaired  - The anchor drifted; resolution recovered a best-fit location.
//   ambiguous - Multiple equally-strong locations exist; no safe pick.
//   stale     - The anchor can no longer be located.
export type AnchorResolutionStatus = "ambiguous" | "matched" | "repaired" | "stale";

// Generic resolution result. Subsystems pick their own `TRepair` payload to
// carry whatever they want to refresh on the anchored entity (e.g. a comment's
// quoted text). `repair` is non-null whenever `match` is non-null; together
// they describe both *where* the anchor lives now and *how* its persisted
// representation should be updated to keep tracking the same span cleanly.
export type AnchorResolution<TRepair> = {
  match: AnchorMatch | null;
  repair: TRepair | null;
  status: AnchorResolutionStatus;
};

export function listAnchorContainers(document: Document): AnchorContainer[] {
  const containers: AnchorContainer[] = [];

  visitDocument(document, {
    enterBlock(block) {
      switch (block.type) {
        case "heading":
        case "paragraph":
          containers.push({
            containerKind: "text",
            containerOrdinal: containers.length,
            id: block.id,
            text: extractPlainTextFromInlineNodes(block.children),
          });
          break;
          
        case "code":
          containers.push({
            containerKind: "code",
            containerOrdinal: containers.length,
            id: block.id,
            text: block.source,
          });
          break;
      }
    },
    enterTableCell(cell) {
      containers.push({
        containerKind: "tableCell",
        containerOrdinal: containers.length,
        id: cell.id,
        text: extractPlainTextFromInlineNodes(cell.children),
      });
    },
  });

  return containers;
}
