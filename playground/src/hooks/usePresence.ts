import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { Presence } from "documint";

type ManualPresence = Presence & {
  localId: string;
};

export function usePresence(content: string) {
  const [manualName, setManualName] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualAnchorPrefix, setManualAnchorPrefix] = useState("");
  const [manualAnchorSuffix, setManualAnchorSuffix] = useState("");
  const [manualColor, setManualColor] = useState("#0ea5e9");
  const [manualPresence, setManualPresence] = useState<ManualPresence[]>([]);
  const [autoMode, setAutoMode] = useState(false);
  const [autoPresence, setAutoPresence] = useState<Presence | null>(null);

  const presence = useMemo<Presence[]>(
    () => (autoMode ? (autoPresence ? [autoPresence] : []) : manualPresence),
    [autoMode, autoPresence, manualPresence],
  );

  const presenceToggleStateClassName = autoMode
    ? "presence-toggle is-auto"
    : manualPresence.length > 0
      ? "presence-toggle is-manual"
      : "presence-toggle";

  const showPresenceToggleSwatch = autoMode || manualPresence.length > 0;
  const presenceToggleSwatchStyle: CSSProperties | undefined = autoMode
    ? {
        background: "rgba(14, 165, 233, 0.14)",
        borderColor: "rgba(14, 165, 233, 0.34)",
        color: "#0284c7",
      }
    : manualPresence.length > 0
      ? {
          background: "rgba(22, 163, 74, 0.14)",
          borderColor: "rgba(22, 163, 74, 0.34)",
          color: "#15803d",
        }
      : undefined;
  const reset = useCallback(() => {
    setManualPresence([]);
    setManualName("");
    setManualImageUrl("");
    setManualAnchorPrefix("");
    setManualAnchorSuffix("");
    setAutoPresence(null);
  }, []);

  useEffect(() => {
    if (!autoMode) {
      setAutoPresence(null);
      return;
    }

    const updateAutoPresence = () => {
      setAutoPresence(createRandomPresence(content));
    };

    updateAutoPresence();

    const intervalId = window.setInterval(updateAutoPresence, 2200);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoMode, content]);

  return {
    presence,
    popoverProps: {
      ariaLabel: "Configure presence",
      containerClassName: "presence-controls",
      flyoutClassName: "presence-flyout",
      iconClassName: `presence-toggle-icon ${presenceToggleStateClassName}`,
      iconStyle: presenceToggleSwatchStyle,
      showSwatch: showPresenceToggleSwatch,
    },
    auto: {
      presence: autoPresence,
      enabled: autoMode,
      setEnabled: setAutoMode,
    },
    manualForm: {
      color: manualColor,
      canAddPresence: manualName.trim().length > 0,
      imageUrl: manualImageUrl,
      name: manualName,
      prefix: manualAnchorPrefix,
      setColor: setManualColor,
      setImageUrl: setManualImageUrl,
      setName: setManualName,
      setPrefix: setManualAnchorPrefix,
      setSuffix: setManualAnchorSuffix,
      suffix: manualAnchorSuffix,
      addPresence() {
        const name = manualName.trim();
        const imageUrl = manualImageUrl.trim();
        const prefix = manualAnchorPrefix.trim();
        const suffix = manualAnchorSuffix.trim();

        if (name.length === 0) {
          return;
        }

        setManualPresence((current) => [
          ...current,
          createManualPresence(name, imageUrl, prefix, suffix, manualColor, current.length),
        ]);
        setManualName("");
        setManualImageUrl("");
        setManualAnchorPrefix("");
        setManualAnchorSuffix("");
      },
    },
    manualPresence: {
      items: manualPresence,
      removePresence(localId: string) {
        setManualPresence((current) =>
          current.filter((candidate) => candidate.localId !== localId),
        );
      },
    },
    reset,
  };
}

function createManualPresence(
  name: string,
  imageUrl: string,
  prefix: string,
  suffix: string,
  color: string,
  index: number,
): ManualPresence {
  const cursor = createPresenceCursor(prefix, suffix);
  const presence: ManualPresence = {
    color,
    localId: `manual-${Date.now()}-${index}`,
    name,
  };

  if (cursor) {
    presence.cursor = cursor;
  }

  if (imageUrl) {
    presence.imageUrl = imageUrl;
  }

  return presence;
}

function createRandomPresence(content: string): Presence | null {
  const candidates = extractVisibleTextCandidates(content);

  if (candidates.length === 0) {
    return null;
  }

  const text = candidates[Math.floor(Math.random() * candidates.length)]!;

  return {
    color: "#f97316",
    cursor: Math.random() > 0.5 ? { prefix: text } : { suffix: text },
    name: "User",
  };
}

function createPresenceCursor(prefix: string, suffix: string): Presence["cursor"] {
  if (prefix.length === 0 && suffix.length === 0) {
    return undefined;
  }

  return {
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

function extractVisibleTextCandidates(content: string) {
  return stripCommentAppendix(content)
    .split("\n")
    .map((line) => sanitizeMarkdownLine(line))
    .filter((line) => line.length >= 18)
    .flatMap((line) => collectPresenceCandidateSnippets(line));
}

function sanitizeMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^>\s?/u, "")
    .replace(/^[-*+]\s+(?:\[[ xX]\]\s+)?/u, "")
    .replace(/^\d+\.\s+/u, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/gu, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
    .trim();
}

function stripCommentAppendix(content: string) {
  const appendixStart = content.indexOf("\n:::documint-comments");

  return appendixStart === -1 ? content : content.slice(0, appendixStart);
}

function collectPresenceCandidateSnippets(line: string) {
  if (line.length <= 42) {
    return [line];
  }

  const snippets: string[] = [];
  const segments = line.split(/[.!?]/u).map((segment) => segment.trim());

  for (const segment of segments) {
    if (segment.length >= 18 && segment.length <= 90) {
      snippets.push(segment);
    }
  }

  return snippets.length > 0 ? snippets : [line.slice(0, 90).trim()];
}

export function describePresence(presence: Presence) {
  const name = presence.name.trim() || "Presence";

  if (!presence.cursor) {
    return name;
  }

  if (presence.cursor.prefix && presence.cursor.suffix) {
    return `${name}: between "${presence.cursor.prefix}" and "${presence.cursor.suffix}"`;
  }

  if (presence.cursor.prefix) {
    return `${name}: after "${presence.cursor.prefix}"`;
  }

  return `${name}: before "${presence.cursor.suffix ?? ""}"`;
}
