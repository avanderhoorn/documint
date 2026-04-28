import { useEffect, useRef, useState } from "react";

// Measures the browser's actual frame rate via requestAnimationFrame.
// Only runs while mounted (debug panel open). Normalizes by elapsed time
// and discards samples after long pauses (backgrounded tab).
export function useFps(): number {
  const [fps, setFps] = useState(0);
  const framesRef = useRef(0);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    let rafId: number;
    lastTimeRef.current = performance.now();
    framesRef.current = 0;

    const loop = (now: number) => {
      framesRef.current++;
      const elapsed = now - lastTimeRef.current;

      if (elapsed >= 1000) {
        if (elapsed < 2000) {
          // Normal sample — normalize by actual elapsed time
          setFps(Math.round((framesRef.current * 1000) / elapsed));
        }
        // If elapsed >= 2000ms (backgrounded tab), discard and reset
        framesRef.current = 0;
        lastTimeRef.current = now;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return fps;
}
