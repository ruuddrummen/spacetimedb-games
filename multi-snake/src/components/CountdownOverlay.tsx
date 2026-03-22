import { useEffect, useRef, useState } from "react";

export function CountdownOverlay({ active }: { active: boolean }) {
  const [count, setCount] = useState(3);
  const [showGo, setShowGo] = useState(false);
  const wasActive = useRef(false);

  // Track active → inactive transition to trigger "GO!"
  useEffect(() => {
    if (active) {
      wasActive.current = true;
    } else if (wasActive.current) {
      wasActive.current = false;
      setCount(0);
      setShowGo(true);
    }
  }, [active]);

  // Run 3-2-1 countdown while active
  useEffect(() => {
    if (!active) return;
    setCount(3);
    setShowGo(false);

    const t1 = setTimeout(() => setCount(2), 1000);
    const t2 = setTimeout(() => setCount(1), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [active]);

  // Auto-hide "GO!" after a brief flash
  useEffect(() => {
    if (!showGo) return;
    const t = setTimeout(() => setShowGo(false), 800);
    return () => clearTimeout(t);
  }, [showGo]);

  const visible = active || showGo;
  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes countdownPop {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active ? "rgba(0, 0, 0, 0.55)" : "transparent",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <span
          key={count}
          style={{
            fontSize: count === 0 ? "4rem" : "6rem",
            fontWeight: 900,
            color: count === 0 ? "#2ecc71" : "#fff",
            textShadow: `0 0 30px ${count === 0 ? "#2ecc71" : "#3498db"}, 0 0 60px ${count === 0 ? "#2ecc71" : "#3498db"}`,
            animation: "countdownPop 0.4s ease-out",
            userSelect: "none",
          }}
        >
          {count > 0 ? count : "GO!"}
        </span>
      </div>
    </>
  );
}
