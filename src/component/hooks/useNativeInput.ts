// Owns the hidden native input used to:
// - open the software keyboard on mobile
// - receive browser text/IME/beforeinput events
// - translate those native events into semantic editor operations
import {
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
  useEffect,
  useEffectEvent,
} from "react";
import type { Editor, EditorStateChange } from "@/editor";

type UseNativeInputOptions = {
  editor: Editor;
  editorState: ReturnType<Editor["createState"]>;
  editorStateRef: RefObject<ReturnType<Editor["createState"]> | null>;
  getViewportRenderData: () => ReturnType<Editor["prepareViewport"]>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onActivity: () => void;
  onEditorStateChange: (stateChange: EditorStateChange | null) => void;
};

type InputEventHandlers = {
  onBeforeInput: (event: FormEvent<HTMLTextAreaElement | HTMLCanvasElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLCanvasElement | HTMLTextAreaElement>) => void;
};

type HiddenInputHandlers = InputEventHandlers & {
  onFocus: () => void;
  onInput: (event: FormEvent<HTMLTextAreaElement>) => void;
};

type CanvasInputHandlers = InputEventHandlers & {
  onFocus: () => void;
};

type NativeInputController = {
  focusInput: () => void;
  hiddenInputProps: HiddenInputHandlers;
  canvasInputProps: CanvasInputHandlers;
};

const nativeInputContextWindow = 64;

export function useNativeInput({
  editor,
  editorState,
  editorStateRef,
  getViewportRenderData,
  inputRef,
  onActivity,
  onEditorStateChange,
}: UseNativeInputOptions): NativeInputController {
  const focusInput = useEffectEvent(() => {
    const input = inputRef.current;
    const currentState = editorStateRef.current ?? editorState;

    if (!input) {
      return;
    }

    const focusNativeInput = () => {
      input.focus({
        preventScroll: true,
      });
      syncNativeInputContext(input, currentState);
    };
    const windowObject = input.ownerDocument.defaultView;

    focusNativeInput();

    if (windowObject) {
      windowObject.requestAnimationFrame(() => {
        focusNativeInput();
      });
    }
  });

  const applyNativeText = useEffectEvent((state: typeof editorState, value: string) => {
    const insertedText = stripSyncedNativeInputPrefix(value, resolveNativeInputPrefix(state));
    const segments = insertedText.replace(/\r\n/g, "\n").split(/(\n)/);
    let nextState = state;
    let animationStarted = false;
    let documentChanged = false;

    for (const segment of segments) {
      if (segment.length === 0) {
        continue;
      }

      const stateUpdate =
        segment === "\n"
          ? editor.insertLineBreak(nextState)
          : editor.insertText(nextState, segment);

      if (!stateUpdate) {
        continue;
      }

      nextState = stateUpdate.state;
      animationStarted ||= stateUpdate.animationStarted;
      documentChanged ||= stateUpdate.documentChanged;
    }

    return nextState === state
      ? null
      : {
          animationStarted,
          documentChanged,
          state: nextState,
        };
  });

  const handleBeforeInput = useEffectEvent(
    (event: FormEvent<HTMLTextAreaElement | HTMLCanvasElement>) => {
      const currentState = editorStateRef.current ?? editorState;
      const nativeEvent = event.nativeEvent as InputEvent;
      const deleteDirection = resolveDeleteDirection(nativeEvent.inputType);

      switch (nativeEvent.inputType) {
        case "insertText":
          if (!nativeEvent.data) {
            return;
          }

          event.preventDefault();
          onActivity();
          onEditorStateChange(applyNativeText(currentState, nativeEvent.data));
          return;
      }

      if (isLineBreakInputType(nativeEvent.inputType)) {
        event.preventDefault();
        onActivity();
        onEditorStateChange(editor.insertLineBreak(currentState));
        return;
      }

      if (deleteDirection === "backward") {
        event.preventDefault();
        onActivity();
        onEditorStateChange(editor.deleteBackward(currentState));
        return;
      }

      if (deleteDirection === "forward") {
        event.preventDefault();
        onActivity();
        onEditorStateChange(editor.deleteForward(currentState));
      }
    },
  );

  const handleInput = useEffectEvent((event: FormEvent<HTMLTextAreaElement>) => {
    const currentState = editorStateRef.current ?? editorState;
    const value = event.currentTarget.value;

    if (stripSyncedNativeInputPrefix(value, resolveNativeInputPrefix(currentState)).length === 0) {
      syncNativeInputContext(event.currentTarget, currentState);
      return;
    }

    onActivity();
    onEditorStateChange(applyNativeText(currentState, value));
  });

  const handleKeyDown = useEffectEvent(
    (event: KeyboardEvent<HTMLCanvasElement | HTMLTextAreaElement>) => {
      const currentState = editorStateRef.current ?? editorState;
      const stateUpdate = editor.handleKeyboardEvent(
        currentState,
        getViewportRenderData().layout,
        event.nativeEvent,
      );

      if (!stateUpdate) {
        return;
      }

      event.preventDefault();
      onActivity();
      onEditorStateChange(stateUpdate);
    },
  );

  const handleHiddenInputFocus = useEffectEvent(() => {
    onActivity();
    const input = inputRef.current;
    const currentState = editorStateRef.current ?? editorState;

    if (input) {
      syncNativeInputContext(input, currentState);
    }
  });

  const handleCanvasFocus = useEffectEvent(() => {
    onActivity();
    focusInput();
  });

  useEffect(() => {
    const input = inputRef.current;

    if (!input) {
      return;
    }

    syncNativeInputContext(input, editorState);
  }, [editorState, inputRef]);

  return {
    focusInput,
    hiddenInputProps: {
      onBeforeInput: handleBeforeInput,
      onFocus: handleHiddenInputFocus,
      onInput: handleInput,
      onKeyDown: handleKeyDown,
    },
    canvasInputProps: {
      onBeforeInput: handleBeforeInput,
      onFocus: handleCanvasFocus,
      onKeyDown: handleKeyDown,
    },
  };
}

export const INPUT_SEED = "\u200b";

export function isLineBreakInputType(inputType: string) {
  return inputType === "insertLineBreak" || inputType === "insertParagraph";
}

export function resolveDeleteDirection(inputType: string) {
  switch (inputType) {
    case "deleteContentBackward":
    case "deleteComposedCharacterBackward":
    case "deleteSoftLineBackward":
    case "deleteHardLineBackward":
    case "deleteWordBackward":
      return "backward";
    case "deleteContentForward":
    case "deleteSoftLineForward":
    case "deleteHardLineForward":
    case "deleteWordForward":
      return "forward";
    default:
      return null;
  }
}

export function stripInputSeed(value: string) {
  return value.replaceAll(INPUT_SEED, "");
}

export function resolveNativeInputPrefix(
  state: ReturnType<Editor["createState"]>,
  maxLength = nativeInputContextWindow,
) {
  const { anchor, focus } = state.selection;

  if (anchor.regionId !== focus.regionId || anchor.offset !== focus.offset) {
    return "";
  }

  const region = state.documentEditor.regionIndex.get(focus.regionId);

  if (!region) {
    return "";
  }

  return region.text.slice(Math.max(0, focus.offset - maxLength), focus.offset);
}

export function stripSyncedNativeInputPrefix(value: string, prefix: string) {
  const syncedValue = stripInputSeed(value);

  return syncedValue.startsWith(prefix)
    ? syncedValue.slice(prefix.length)
    : syncedValue;
}

export function syncNativeInputContext(
  input: HTMLTextAreaElement,
  state: ReturnType<Editor["createState"]>,
) {
  const prefix = resolveNativeInputPrefix(state);
  const nextValue = `${INPUT_SEED}${prefix}`;

  input.value = nextValue;
  input.setSelectionRange(nextValue.length, nextValue.length);
}
