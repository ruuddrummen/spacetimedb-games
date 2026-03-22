import { styles } from "../styles";
import type { Game, Player } from "../module_bindings/types";

export function GameOverScreen({
  game,
  players,
  isHost,
  onRestart,
  onLeave,
}: {
  game: Game;
  players: readonly Player[];
  isHost: boolean;
  onRestart: () => void;
  onLeave: () => void;
}) {
  const gamePlayers = players.filter((p) => p.gameId === game.id);
  const sorted = [...gamePlayers].sort((a, b) => b.score - a.score);
  const winner = sorted[0];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>GAME OVER</h1>
      {gamePlayers.length > 1 && winner && (
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
      {gamePlayers.length === 1 && (
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
          <>
            <button style={styles.btnPrimary} onClick={onRestart}>
              Play Again
            </button>
            <button
              style={{
                ...styles.btnSecondary,
                width: "100%",
                marginTop: "0.5rem",
              }}
              onClick={onLeave}
            >
              Leave Lobby
            </button>
          </>
        ) : (
          <>
            <p
              style={{
                color: "#888",
                fontSize: "0.85rem",
                textAlign: "center",
                margin: "1rem 0 0.5rem",
              }}
            >
              Waiting for host to restart...
            </p>
            <button
              style={{ ...styles.btnSecondary, width: "100%" }}
              onClick={onLeave}
            >
              Leave Lobby
            </button>
          </>
        )}
      </div>
    </div>
  );
}
