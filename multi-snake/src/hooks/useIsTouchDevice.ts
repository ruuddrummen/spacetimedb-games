import { useState, useEffect } from "react";

export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === "undefined") return false;
    return "ontouchstart" in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    // Detect first touch event for hybrid devices (touch-enabled laptops)
    const onFirstTouch = () => {
      setIsTouch(true);
      window.removeEventListener("touchstart", onFirstTouch);
    };
    window.addEventListener("touchstart", onFirstTouch, { passive: true });
    return () => window.removeEventListener("touchstart", onFirstTouch);
  }, []);

  return isTouch;
}
