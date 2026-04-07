/**
 * Comment anchor construction and the quote/context-based resolution algorithm
 * that re-attaches comment threads against the current document snapshot.
 */
import type { Anchor, AnchorContainer, AnchorMatch, AnchorResolutionStatus, Document } from "@/document";
import { listAnchorContainers, normalizeAnchorKind, DEFAULT_ANCHOR_KIND } from "@/document";
import type { CommentResolution, CommentThread } from "./types";

const CONTEXT_WINDOW = 24;

export function createCommentAnchorFromContainer(
  container: AnchorContainer,
  startOffset: number,
  endOffset: number,
): Anchor {
  const normalizedStart = clamp(startOffset, 0, container.text.length);
  const normalizedEnd = clamp(endOffset, normalizedStart, container.text.length);

  return {
    kind: normalizeAnchorKind(container.containerKind),
    prefix:
      container.text.slice(Math.max(0, normalizedStart - CONTEXT_WINDOW), normalizedStart) ||
      undefined,
    suffix: container.text.slice(normalizedEnd, normalizedEnd + CONTEXT_WINDOW) || undefined,
  };
}

export function createCommentQuoteFromContainer(
  container: AnchorContainer,
  startOffset: number,
  endOffset: number,
) {
  const normalizedStart = clamp(startOffset, 0, container.text.length);
  const normalizedEnd = clamp(endOffset, normalizedStart, container.text.length);

  return container.text.slice(normalizedStart, normalizedEnd);
}

// --- Resolution ---

type AnchorMatchCandidate = {
  container: AnchorContainer;
  endOffset: number;
  score: number;
  startOffset: number;
};

// Scoring weights for comment resolution. Exact-quote candidates are already
// strong signals (the quoted text appears verbatim), so context only acts as a
// tiebreaker. Repair-mode candidates have no exact quote to anchor them, so
// matching prefix/suffix carries more weight and length similarity / shared
// character overlap break ties between fuzzy locations.
const EXACT_CONTEXT_MATCH_SCORE = 48;
const CONTEXT_REPAIR_MATCH_SCORE = 64;
const MAX_LENGTH_SIMILARITY_SCORE = 32;

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

function collectExactQuoteCandidates(thread: CommentThread, containers: AnchorContainer[]) {
  const candidates: AnchorMatchCandidate[] = [];
  const quote = thread.quote;

  if (quote.length === 0) {
    return candidates;
  }

  for (const container of containers) {
    let searchIndex = 0;

    while (searchIndex <= container.text.length) {
      const matchIndex = container.text.indexOf(quote, searchIndex);

      if (matchIndex === -1) {
        break;
      }

      candidates.push({
        container,
        endOffset: matchIndex + quote.length,
        score: scoreExactCandidate(thread, container, matchIndex),
        startOffset: matchIndex,
      });
      searchIndex = matchIndex + Math.max(1, quote.length);
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

  if (prefix.length > 0 && suffix.length > 0) {
    let prefixSearchIndex = 0;

    while (prefixSearchIndex <= text.length) {
      const prefixIndex = text.indexOf(prefix, prefixSearchIndex);

      if (prefixIndex === -1) {
        break;
      }

      const startOffset = prefixIndex + prefix.length;
      const suffixIndex = text.indexOf(suffix, startOffset);

      if (suffixIndex !== -1 && suffixIndex >= startOffset) {
        candidates.push({
          container,
          endOffset: suffixIndex,
          score: scoreContextCandidate(thread, container, startOffset, suffixIndex, originalLength),
          startOffset,
        });
      }

      prefixSearchIndex = prefixIndex + Math.max(1, prefix.length);
    }

    return candidates;
  }

  if (prefix.length > 0) {
    let prefixSearchIndex = 0;

    while (prefixSearchIndex <= text.length) {
      const prefixIndex = text.indexOf(prefix, prefixSearchIndex);

      if (prefixIndex === -1) {
        break;
      }

      const startOffset = prefixIndex + prefix.length;
      const endOffset = clamp(startOffset + originalLength, startOffset, text.length);

      candidates.push({
        container,
        endOffset,
        score: scoreContextCandidate(thread, container, startOffset, endOffset, originalLength),
        startOffset,
      });
      prefixSearchIndex = prefixIndex + Math.max(1, prefix.length);
    }

    return candidates;
  }

  if (suffix.length > 0) {
    let suffixSearchIndex = 0;

    while (suffixSearchIndex <= text.length) {
      const suffixIndex = text.indexOf(suffix, suffixSearchIndex);

      if (suffixIndex === -1) {
        break;
      }

      const endOffset = suffixIndex;
      const startOffset = clamp(endOffset - originalLength, 0, endOffset);

      candidates.push({
        container,
        endOffset,
        score: scoreContextCandidate(thread, container, startOffset, endOffset, originalLength),
        startOffset,
      });
      suffixSearchIndex = suffixIndex + Math.max(1, suffix.length);
    }
  }

  return candidates;
}

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

  const repairedAnchor = createCommentAnchorFromContainer(
    first.container,
    first.startOffset,
    first.endOffset,
  );
  const repairedQuote = createCommentQuoteFromContainer(
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

function prefixMatchesAt(text: string, prefix: string | undefined, position: number) {
  if (!prefix) {
    return false;
  }

  return text.slice(Math.max(0, position - prefix.length), position) === prefix;
}

function suffixMatchesAt(text: string, suffix: string | undefined, position: number) {
  if (!suffix) {
    return false;
  }

  return text.slice(position, position + suffix.length) === suffix;
}

function sharedCharacterPrefixLength(left: string, right: string) {
  let length = 0;

  while (length < left.length && length < right.length && left[length] === right[length]) {
    length += 1;
  }

  return length;
}

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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
