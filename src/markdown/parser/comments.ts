/**
 * Owns markdown-specific extraction of the trailing comment directive,
 * including the JSON array envelope that wraps persisted comment threads.
 */

import { parseCommentThread, type CommentThread } from "@/comments";
import type { Block, DirectiveBlock } from "@/document";
import { commentDirectiveName } from "../shared";

export function extractCommentDirective(blocks: Block[]) {
  const lastBlock = blocks.at(-1);
  const commentDirectiveBlock = lastBlock && isCommentDirectiveBlock(lastBlock) ? lastBlock : null;
  const contentBlocks = blocks.filter((block) => !isCommentDirectiveBlock(block));

  return {
    blocks: contentBlocks,
    comments: commentDirectiveBlock ? parseCommentThreads(commentDirectiveBlock.body) : [],
  };
}

function parseCommentThreads(body: string): CommentThread[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed.flatMap((candidate) => {
    const thread = parseCommentThread(candidate);
    return thread ? [thread] : [];
  });
}

function isCommentDirectiveBlock(block: Block): block is DirectiveBlock {
  return block.type === "directive" && block.name === commentDirectiveName;
}
