import { useEffect } from "react";
import { styles } from "../styles";
import { GameCanvas } from "./GameCanvas";
import { SwipeArea } from "./SwipeArea";
import { TouchDPad } from "./TouchDPad";
import { useIsTouchDevice } from "../hooks/useIsTouchDevice";
import type { Identity } from "spacetimedb";
import type { Game, Player, Food } from "../module_bindings/types";

export function GameScreen({
  game,
  players,
  foods,
  identity,
  onChangeDirection,
  onLeave,
}: {
  game: Game;
  players: readonly Player[];
  foods: readonly Food[];
  identity: Identity | null;
  onChangeDirection: (dir: string) => void;
  onLeave: () => void;
}) {
  const isTouch = useIsTouchDevice();
  const gamePlayers = players.filter((p) => p.gameId === game.id);
  const gameFoods = foods.filter((f) => f.gameId === game.id);

  // Prevent browser nav bar toggle on swipe during gameplay
  useEffect(() => {
    const prevent = (e: TouchEvent) => e.preventDefault();
    document.addEventListener("touchmove", prevent, { passive: false });
    return () => document.removeEventListener("touchmove", prevent);
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      let dir: string | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          dir = "up";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          dir = "down";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          dir = "left";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          dir = "right";
          break;
      }
      if (dir) {
        onChangeDirection(dir);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChangeDirection]);

  const sorted = [...gamePlayers].sort((a, b) => b.score - a.score);

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, fontSize: "1.5rem", marginBottom: "1rem" }}>
        SNAKE ARENA
      </h1>
      <div style={styles.gameLayout}>
        <SwipeArea onSwipe={onChangeDirection}>
          <GameCanvas
            players={gamePlayers}
            foods={gameFoods}
            gridSize={game.gridSize}
          />
        </SwipeArea>
        <div style={styles.scoreboard}>
          <h3
            style={{ margin: "0 0 0.75rem", color: "#eee", fontSize: "1rem" }}
          >
            Scoreboard
          </h3>
          {sorted.map((p) => {
            const isMe =
              identity && p.identity.toHexString() === identity.toHexString();
            return (
              <div key={p.identity.toHexString()} style={styles.scoreRow}>
                <span style={styles.colorDot(p.color)} />
                <span
                  style={{
                    color: !p.alive ? "#555" : isMe ? "#fff" : "#ccc",
                    fontWeight: isMe ? 600 : 400,
                    textDecoration: !p.alive ? "line-through" : "none",
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    color: "#00cc00",
                    fontWeight: 600,
                  }}
                >
                  {p.score}
                </span>
                {!p.alive && <span style={styles.deadLabel}>☠</span>}
              </div>
            );
          })}
          {isTouch && (
            <TouchDPad onDirection={onChangeDirection} />
          )}
          <div
            style={{ marginTop: "1rem", color: "#666", fontSize: "0.75rem" }}
          >
            {isTouch ? "Swipe or use D-pad" : "WASD / Arrow keys"}
          </div>
          <button
            style={{
              ...styles.btnDanger,
              width: "100%",
              marginTop: "0.75rem",
              fontSize: "0.8rem",
            }}
            onClick={onLeave}
          >
            Leave Game
          </button>
        </div>
      </div>
    </div>
  );
}
