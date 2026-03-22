import { useCallback } from "react";

const DPAD_SIZE = 160;
const BTN_SIZE = 50;

const containerStyle: React.CSSProperties = {
  position: "relative",
  width: DPAD_SIZE,
  height: DPAD_SIZE,
  margin: "0.75rem auto 0",
  opacity: 0.7,
  userSelect: "none",
  WebkitUserSelect: "none",
};

const btnBase: React.CSSProperties = {
  position: "absolute",
  width: BTN_SIZE,
  height: BTN_SIZE,
  borderRadius: "12px",
  border: "2px solid #00cc00",
  background: "rgba(0, 204, 0, 0.12)",
  color: "#00cc00",
  fontSize: "1.4rem",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  touchAction: "manipulation",
  WebkitTapHighlightColor: "transparent",
};

export function TouchDPad({
  onDirection,
}: {
  onDirection: (direction: string) => void;
}) {
  const handle = useCallback(
    (dir: string) => () => {
      onDirection(dir);
    },
    [onDirection],
  );

  const center = DPAD_SIZE / 2 - BTN_SIZE / 2;

  return (
    <div style={containerStyle}>
      <div
        style={{ ...btnBase, top: 0, left: center }}
        onTouchStart={handle("up")}
        onMouseDown={handle("up")}
        role="button"
        aria-label="Up"
      >
        ▲
      </div>
      <div
        style={{ ...btnBase, bottom: 0, left: center }}
        onTouchStart={handle("down")}
        onMouseDown={handle("down")}
        role="button"
        aria-label="Down"
      >
        ▼
      </div>
      <div
        style={{ ...btnBase, top: center, left: 0 }}
        onTouchStart={handle("left")}
        onMouseDown={handle("left")}
        role="button"
        aria-label="Left"
      >
        ◀
      </div>
      <div
        style={{ ...btnBase, top: center, right: 0 }}
        onTouchStart={handle("right")}
        onMouseDown={handle("right")}
        role="button"
        aria-label="Right"
      >
        ▶
      </div>
    </div>
  );
}
