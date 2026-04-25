/**
 * Comment thread resolution: re-attach threads against the current document
 * snapshot using quote/context-based scoring on top of the document-layer
 * anchor primitives.
 *
 * The strategy is two-pass:
 *   1. Exact-quote pass — find every container where the persisted quote
 *      appears verbatim. Context (prefix/suffix matches) breaks ties.
 *   2. Context-only pass — when no verbatim quote exists, treat prefix and
 *      suffix as the anchor and estimate the missing edge from the prior
 *      quote length.
 *
 * Comments owns the policy: scoring weights, similarity heuristics, and how
 * `matched` vs `repaired` is decided. The substrate (search, capture,
 * verification) lives in `src/document/anchors.ts`.
 */

import type { Document } from "../types";
import {
  clamp,
  createAnchorFromContainer,
  DEFAULT_ANCHOR_KIND,
  extractQuoteFromContainer,
  findContextRanges,
  findOccurrences,
  listAnchorContainers,
  prefixMatchesAt,
  suffixMatchesAt,
  type AnchorContainer,
  type AnchorMatch,
  type AnchorResolutionStatus,
} from "../anchors";
import type { CommentResolution, CommentThread } from "./types";

// --- Scoring weights ---

// Exact-quote candidates are already strong signals (the quoted text appears
// verbatim), so context only acts as a tiebreaker. Repair-mode candidates
// have no exact quote to anchor them, so matching prefix/suffix carries more
// weight and length similarity / shared character overlap break ties between
// fuzzy locations.
const EXACT_CONTEXT_MATCH_SCORE = 48;
const CONTEXT_REPAIR_MATCH_SCORE = 64;
const MAX_LENGTH_SIMILARITY_SCORE = 32;

type AnchorMatchCandidate = {
  container: AnchorContainer;
  endOffset: number;
  score: number;
  startOffset: number;
};

// --- Public API ---

export function resolveCommentThread(thread: CommentThread, snapshot: Document): CommentResolution {
  const anchorKind = thread.anchor.kind ?? DEFAULT_ANCHOR_KIND;
  const containers = listAnchorContainers(snapshot).filter(
    (container) => container.containerKind === anchorKind,
  );
  const exactCandidates = collectExactQuoteCandidates(thread, containers);

  if (exactCandidates.length > 0) {
    return finalizeResolution(thread, exactCandidates, null);
  }

  const contextCandidates = collectContextResolutionCandidates(thread, containers);

  if (contextCandidates.length > 0) {
    return finalizeResolution(thread, contextCandidates, "repaired");
  }

  return {
    match: null,
    repair: null,
    status: "stale",
  };
}

// --- Candidate collection ---

function collectExactQuoteCandidates(thread: CommentThread, containers: AnchorContainer[]) {
  const candidates: AnchorMatchCandidate[] = [];
  const quote = thread.quote;

  if (quote.length === 0) {
    return candidates;
  }

  for (const container of containers) {
    for (const startOffset of findOccurrences(container.text, quote)) {
      candidates.push({
        container,
        endOffset: startOffset + quote.length,
        score: scoreExactCandidate(thread, container, startOffset),
        startOffset,
      });
    }
  }

  candidates.sort((left, right) => right.score - left.score);

  return candidates;
}

function collectContextResolutionCandidates(thread: CommentThread, containers: AnchorContainer[]) {
  const candidates: AnchorMatchCandidate[] = [];

  for (const container of containers) {
    candidates.push(...collectContainerContextCandidates(thread, container));
  }

  candidates.sort((left, right) => right.score - left.score);

  return candidates;
}

function collectContainerContextCandidates(thread: CommentThread, container: AnchorContainer) {
  const candidates: AnchorMatchCandidate[] = [];
  const originalLength = thread.quote.length;
  const text = container.text;
  const prefix = thread.anchor.prefix ?? "";
  const suffix = thread.anchor.suffix ?? "";

  // Prefix and suffix both present: enumerate every prefix→suffix range and
  // score each as a candidate. The original-quote length informs the score so
  // ranges close to the prior length rank higher.
  if (prefix.length > 0 && suffix.length > 0) {
    for (const range of findContextRanges(text, prefix, suffix)) {
      candidates.push({
        container,
        endOffset: range.endOffset,
        score: scoreContextCandidate(
          thread,
          container,
          range.startOffset,
          range.endOffset,
          originalLength,
        ),
        startOffset: range.startOffset,
      });
    }

    return candidates;
  }

  // Only one side of context survives: anchor at every occurrence and estimate
  // the missing edge using the prior quote length.
  if (prefix.length > 0) {
    for (const prefixIndex of findOccurrences(text, prefix)) {
      const startOffset = prefixIndex + prefix.length;
      const endOffset = clamp(startOffset + originalLength, startOffset, text.length);

      candidates.push({
        container,
        endOffset,
        score: scoreContextCandidate(thread, container, startOffset, endOffset, originalLength),
        startOffset,
      });
    }

    return candidates;
  }

  if (suffix.length > 0) {
    for (const suffixIndex of findOccurrences(text, suffix)) {
      const endOffset = suffixIndex;
      const startOffset = clamp(endOffset - originalLength, 0, endOffset);

      candidates.push({
        container,
        endOffset,
        score: scoreContextCandidate(thread, container, startOffset, endOffset, originalLength),
        startOffset,
      });
    }
  }

  return candidates;
}

// --- Resolution finalization ---

function finalizeResolution(
  thread: CommentThread,
  candidates: AnchorMatchCandidate[],
  forceStatus: AnchorResolutionStatus | null,
): CommentResolution {
  const [first, second] = candidates;

  if (!first) {
    return {
      match: null,
      repair: null,
      status: "stale",
    };
  }

  if (second && first.score === second.score) {
    return {
      match: null,
      repair: null,
      status: "ambiguous",
    };
  }

  const repairedAnchor = createAnchorFromContainer(
    first.container,
    first.startOffset,
    first.endOffset,
  );
  const repairedQuote = extractQuoteFromContainer(
    first.container,
    first.startOffset,
    first.endOffset,
  );
  const status =
    forceStatus ??
    (repairedQuote === thread.quote &&
    (repairedAnchor.prefix ?? "") === (thread.anchor.prefix ?? "") &&
    (repairedAnchor.suffix ?? "") === (thread.anchor.suffix ?? "")
      ? "matched"
      : "repaired");

  return {
    match: toAnchorMatch(first.container, first.startOffset, first.endOffset),
    repair: {
      anchor: repairedAnchor,
      quote: repairedQuote,
    },
    status,
  };
}

function toAnchorMatch(
  container: AnchorContainer,
  startOffset: number,
  endOffset: number,
): AnchorMatch {
  return {
    containerId: container.id,
    containerKind: container.containerKind,
    containerOrdinal: container.containerOrdinal,
    endOffset,
    startOffset,
  };
}

// --- Scoring ---

function scoreExactCandidate(
  thread: CommentThread,
  container: AnchorContainer,
  startOffset: number,
) {
  let score = 0;

  if (prefixMatchesAt(container.text, thread.anchor.prefix, startOffset)) {
    score += EXACT_CONTEXT_MATCH_SCORE;
  }

  if (suffixMatchesAt(container.text, thread.anchor.suffix, startOffset + thread.quote.length)) {
    score += EXACT_CONTEXT_MATCH_SCORE;
  }

  return score;
}

function scoreContextCandidate(
  thread: CommentThread,
  container: AnchorContainer,
  startOffset: number,
  endOffset: number,
  originalLength: number,
) {
  let score = 0;

  if (prefixMatchesAt(container.text, thread.anchor.prefix, startOffset)) {
    score += CONTEXT_REPAIR_MATCH_SCORE;
  }

  if (suffixMatchesAt(container.text, thread.anchor.suffix, endOffset)) {
    score += CONTEXT_REPAIR_MATCH_SCORE;
  }

  score += Math.max(
    0,
    MAX_LENGTH_SIMILARITY_SCORE - Math.abs(originalLength - (endOffset - startOffset)),
  );

  if (thread.quote.length > 0) {
    const candidateText = container.text.slice(startOffset, endOffset);

    if (candidateText.length > 0) {
      score += sharedCharacterPrefixLength(thread.quote, candidateText);
      score += sharedCharacterSuffixLength(thread.quote, candidateText);
    }
  }

  return score;
}

// Count the leading characters two strings share. Comment-specific
// similarity metric for tiebreaking fuzzy match candidates.
function sharedCharacterPrefixLength(left: string, right: string) {
  let length = 0;

  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }

  return length;
}

// Count the trailing characters two strings share. See
// `sharedCharacterPrefixLength`.
function sharedCharacterSuffixLength(left: string, right: string) {
  let length = 0;

  while (
    length < left.length &&
    length < right.length &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}
