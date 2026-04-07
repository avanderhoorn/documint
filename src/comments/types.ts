import type { Anchor, AnchorResolution } from "@/document";

export type CommentThread = {
  quote: string;
  comments: Comment[];
  anchor: Anchor;
  resolvedAt?: string;
};

export type Comment = {
  body: string;
  updatedAt: string;
};

// Anchor resolution types

// What needs to be refreshed on a `CommentThread` when its anchor drifts and
// has been re-located. Callers writing this back into a thread keep its
// quote/anchor representation in sync with the snapshot.
export type CommentRepair = {
  anchor: Anchor;
  quote: string;
};

export type CommentResolution = AnchorResolution<CommentRepair>;
