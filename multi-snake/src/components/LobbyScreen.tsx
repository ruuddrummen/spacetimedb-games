import { styles } from "../styles";
import type { Identity } from "spacetimedb";
import type { Game, Player } from "../module_bindings/types";

export function LobbyScreen({
  game,
  players,
  isHost,
  onStart,
  onLeave,
  onClose,
  identity,
}: {
  game: Game;
  players: readonly Player[];
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
  onClose: () => void;
  identity: Identity | null;
}) {
  const lobbyPlayers = players.filter((p) => p.gameId === game.id);
  const sorted = [...lobbyPlayers].sort((a, b) => a.joinOrder - b.joinOrder);

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      <p style={styles.subtitle}>Waiting in lobby...</p>
      <div style={styles.card}>
        <h3 style={{ margin: "0 0 0.5rem", color: "#eee" }}>
          Players ({lobbyPlayers.length})
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
          <>
            <button style={styles.btnPrimary} onClick={onStart}>
              Start Game
              {lobbyPlayers.length === 1
                ? " (Solo)"
                : ` (${lobbyPlayers.length} players)`}
            </button>
            <button
              style={{
                ...styles.btnDanger,
                width: "100%",
                marginTop: "0.5rem",
              }}
              onClick={onClose}
            >
              Close Lobby
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
              Waiting for host to start the game...
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
