import { useRef, useEffect, useState, useCallback } from "react";
import { tables, reducers } from "./module_bindings";
import { useSpacetimeDB, useTable, useReducer } from "spacetimedb/react";
import { useIdentity } from "./main";
import type { Identity } from "spacetimedb";
import type { Game, Player, Food } from "./module_bindings/types";

const CELL_SIZE = 18;

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f23",
    color: "#ccc",
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
  },
  title: {
    fontSize: "2.5rem",
    fontWeight: 700,
    color: "#00cc00",
    margin: "0 0 0.5rem",
    letterSpacing: "0.05em",
  },
  subtitle: {
    color: "#888",
    margin: "0 0 2rem",
    fontSize: "0.9rem",
  },
  card: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "2rem",
    minWidth: "320px",
    maxWidth: "420px",
    width: "100%",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "1rem",
    border: "2px solid #2a2a4a",
    borderRadius: "8px",
    background: "#16213e",
    color: "#eee",
    outline: "none",
    boxSizing: "border-box" as const,
    marginBottom: "1rem",
  },
  btnPrimary: {
    width: "100%",
    padding: "0.75rem 1.5rem",
    fontSize: "1rem",
    fontWeight: 600,
    border: "none",
    borderRadius: "8px",
    background: "#00cc00",
    color: "#0f0f23",
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "0.6rem 1.5rem",
    fontSize: "0.9rem",
    fontWeight: 600,
    border: "2px solid #00cc00",
    borderRadius: "8px",
    background: "transparent",
    color: "#00cc00",
    cursor: "pointer",
  },
  playerList: {
    listStyle: "none",
    padding: 0,
    margin: "1rem 0",
  },
  playerItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.5rem 0",
    fontSize: "1rem",
  },
  colorDot: (color: string) => ({
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    background: color,
    flexShrink: 0,
  }),
  badge: {
    fontSize: "0.7rem",
    background: "#f39c12",
    color: "#0f0f23",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: 700,
  },
  gameLayout: {
    display: "flex",
    gap: "1.5rem",
    alignItems: "flex-start",
    flexWrap: "wrap" as const,
    justifyContent: "center",
  },
  scoreboard: {
    background: "#1a1a2e",
    borderRadius: "12px",
    padding: "1rem 1.5rem",
    minWidth: "180px",
  },
  scoreRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.35rem 0",
    fontSize: "0.9rem",
  },
  canvas: {
    borderRadius: "8px",
    border: "2px solid #2a2a4a",
  },
  deadLabel: {
    color: "#666",
    fontSize: "0.75rem",
    marginLeft: "4px",
  },
} as const;

// ── Sub-components ─────────────────────────────────────────────────────────────

function ConnectingScreen() {
  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      <p style={{ color: "#888" }}>Connecting to server...</p>
    </div>
  );
}

function JoinScreen({ onJoin }: { onJoin: (name: string) => void }) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) onJoin(name.trim());
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      <p style={styles.subtitle}>Multiplayer Snake Game</p>
      <div style={styles.card}>
        <form onSubmit={handleSubmit}>
          <input
            style={styles.input}
            type="text"
            placeholder="Enter your name..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={16}
            autoFocus
          />
          <button
            style={styles.btnPrimary}
            type="submit"
            disabled={!name.trim()}
          >
            Join Game
          </button>
        </form>
      </div>
    </div>
  );
}

function LobbyScreen({
  players,
  isHost,
  onStart,
  identity,
}: {
  players: readonly Player[];
  isHost: boolean;
  onStart: () => void;
  identity: Identity | null;
}) {
  const sorted = [...players].sort((a, b) => a.joinOrder - b.joinOrder);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      <p style={styles.subtitle}>Waiting in lobby...</p>
      <div style={styles.card}>
        <h3 style={{ margin: "0 0 0.5rem", color: "#eee" }}>
          Players ({players.length})
        </h3>
        <ul style={styles.playerList}>
          {sorted.map((p) => {
            const isMe =
              identity && p.identity.toHexString() === identity.toHexString();
            return (
              <li key={p.identity.toHexString()} style={styles.playerItem}>
                <span style={styles.colorDot(p.color)} />
                <span
                  style={{
                    color: isMe ? "#fff" : "#ccc",
                    fontWeight: isMe ? 600 : 400,
                  }}
                >
                  {p.name}
                  {isMe ? " (you)" : ""}
                </span>
                {p.joinOrder === 0 && <span style={styles.badge}>HOST</span>}
              </li>
            );
          })}
        </ul>
        {isHost ? (
          <button style={styles.btnPrimary} onClick={onStart}>
            Start Game
            {players.length === 1 ? " (Solo)" : ` (${players.length} players)`}
          </button>
        ) : (
          <p
            style={{
              color: "#888",
              fontSize: "0.85rem",
              textAlign: "center",
              margin: "1rem 0 0",
            }}
          >
            Waiting for host to start the game...
          </p>
        )}
      </div>
    </div>
  );
}

function GameScreen({
  game,
  players,
  foods,
  identity,
  onChangeDirection,
}: {
  game: Game;
  players: readonly Player[];
  foods: readonly Food[];
  identity: Identity | null;
  onChangeDirection: (dir: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridSize = game.gridSize;
  const canvasSize = gridSize * CELL_SIZE;

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

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0f0f23";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Grid
    ctx.strokeStyle = "#1a1a3a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvasSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(canvasSize, i * CELL_SIZE);
      ctx.stroke();
    }

    // Food
    for (const f of foods) {
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(
        f.x * CELL_SIZE + CELL_SIZE / 2,
        f.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      // Glow
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Snakes
    for (const p of players) {
      if (p.segments.length === 0) continue;
      const alpha = p.alive ? 1 : 0.3;
      ctx.globalAlpha = alpha;

      for (let i = 0; i < p.segments.length; i++) {
        const seg = p.segments[i];
        const x = seg.x * CELL_SIZE + 1;
        const y = seg.y * CELL_SIZE + 1;
        const size = CELL_SIZE - 2;

        if (i === 0) {
          // Head - rounded
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.roundRect(x, y, size, size, 5);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#fff";
          const eyeSize = 3;
          ctx.fillRect(
            x + size * 0.25 - eyeSize / 2,
            y + size * 0.35 - eyeSize / 2,
            eyeSize,
            eyeSize,
          );
          ctx.fillRect(
            x + size * 0.75 - eyeSize / 2,
            y + size * 0.35 - eyeSize / 2,
            eyeSize,
            eyeSize,
          );
        } else {
          // Body
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }
  }, [players, foods, gridSize, canvasSize]);

  const sorted = [...players].sort((a, b) => b.score - a.score);

  return (
    <div style={styles.page}>
      <h1 style={{ ...styles.title, fontSize: "1.5rem", marginBottom: "1rem" }}>
        SNAKE ARENA
      </h1>
      <div style={styles.gameLayout}>
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          style={styles.canvas}
        />
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
          <div
            style={{ marginTop: "1rem", color: "#666", fontSize: "0.75rem" }}
          >
            WASD / Arrow keys
          </div>
        </div>
      </div>
    </div>
  );
}

function GameOverScreen({
  players,
  isHost,
  onRestart,
}: {
  players: readonly Player[];
  isHost: boolean;
  onRestart: () => void;
}) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>GAME OVER</h1>
      {players.length > 1 && winner && (
        <p
          style={{
            fontSize: "1.2rem",
            color: winner.color,
            margin: "0 0 1.5rem",
            fontWeight: 600,
          }}
        >
          🏆 {winner.name} wins!
        </p>
      )}
      {players.length === 1 && (
        <p style={{ fontSize: "1.2rem", color: "#ccc", margin: "0 0 1.5rem" }}>
          Final Score:{" "}
          <span style={{ color: "#00cc00", fontWeight: 700 }}>
            {sorted[0]?.score ?? 0}
          </span>
        </p>
      )}
      <div style={styles.card}>
        <h3 style={{ margin: "0 0 0.75rem", color: "#eee" }}>Final Scores</h3>
        <ul style={styles.playerList}>
          {sorted.map((p, i) => (
            <li key={p.identity.toHexString()} style={styles.playerItem}>
              <span style={{ color: "#888", width: "24px" }}>#{i + 1}</span>
              <span style={styles.colorDot(p.color)} />
              <span style={{ color: "#ccc" }}>{p.name}</span>
              <span
                style={{
                  marginLeft: "auto",
                  color: "#00cc00",
                  fontWeight: 700,
                }}
              >
                {p.score}
              </span>
            </li>
          ))}
        </ul>
        {isHost ? (
          <button style={styles.btnPrimary} onClick={onRestart}>
            Play Again
          </button>
        ) : (
          <p
            style={{
              color: "#888",
              fontSize: "0.85rem",
              textAlign: "center",
              margin: "1rem 0 0",
            }}
          >
            Waiting for host to restart...
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────────────

function App() {
  const conn = useSpacetimeDB();
  const { isActive: connected } = conn;
  const identity = useIdentity();

  const [games] = useTable(tables.game);
  const [players] = useTable(tables.player);
  const [foods] = useTable(tables.food);

  const game = games[0] ?? null;

  const joinGame = useReducer(reducers.joinGame);
  const startGame = useReducer(reducers.startGame);
  const changeDir = useReducer(reducers.changeDirection);
  const restartGame = useReducer(reducers.restartGame);

  const handleChangeDirection = useCallback(
    (dir: string) => changeDir({ direction: dir }),
    [changeDir],
  );

  // Determine my player
  const myPlayer = identity
    ? players.find((p) => p.identity.toHexString() === identity.toHexString())
    : null;

  const isHost = !!(
    identity &&
    game &&
    game.hostIdentity.toHexString() === identity.toHexString()
  );

  if (!connected) return <ConnectingScreen />;
  if (!myPlayer) return <JoinScreen onJoin={(name) => joinGame({ name })} />;
  if (!game || game.phase === "lobby") {
    return (
      <LobbyScreen
        players={players}
        isHost={isHost}
        onStart={() => startGame()}
        identity={identity}
      />
    );
  }
  if (game.phase === "playing") {
    return (
      <GameScreen
        game={game}
        players={players}
        foods={foods}
        identity={identity}
        onChangeDirection={handleChangeDirection}
      />
    );
  }
  if (game.phase === "finished") {
    return (
      <GameOverScreen
        players={players}
        isHost={isHost}
        onRestart={() => restartGame()}
      />
    );
  }

  return <ConnectingScreen />;
}

export default App;
