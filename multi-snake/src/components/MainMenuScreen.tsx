import { useState } from "react";
import { styles } from "../styles";
import type { Game, Player, User } from "../module_bindings/types";

export function MainMenuScreen({
  userRow,
  games,
  users,
  players,
  onSetName,
  onCreateLobby,
  onJoinLobby,
}: {
  userRow: User | null;
  games: readonly Game[];
  users: readonly User[];
  players: readonly Player[];
  onSetName: (name: string) => void;
  onCreateLobby: () => void;
  onJoinLobby: (gameId: bigint) => void;
}) {
  const [name, setName] = useState(userRow?.name ?? "");
  const [editing, setEditing] = useState(!userRow);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSetName(name.trim());
      setEditing(false);
    }
  };

  const lobbies = games.filter((g) => g.phase === "lobby");

  const getHostName = (g: Game) => {
    const hostUser = users.find(
      (u) => u.identity.toHexString() === g.hostIdentity.toHexString(),
    );
    return hostUser?.name ?? "Unknown";
  };

  const getPlayerCount = (g: Game) => {
    return players.filter((p) => p.gameId === g.id).length;
  };

  if (!userRow || editing) {
    return (
      <div style={styles.page}>
        <h1 style={styles.title}>SNAKE ARENA</h1>
        <p style={styles.subtitle}>Multiplayer Snake Game</p>
        <div style={styles.card}>
          <form onSubmit={handleNameSubmit}>
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
              {userRow ? "Update Name" : "Set Name"}
            </button>
            {userRow && (
              <button
                type="button"
                style={{
                  ...styles.btnSecondary,
                  width: "100%",
                  marginTop: "0.5rem",
                }}
                onClick={() => {
                  setName(userRow.name);
                  setEditing(false);
                }}
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      <p style={styles.subtitle}>Multiplayer Snake Game</p>
      <div style={styles.card}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <span style={{ color: "#eee", fontSize: "1.1rem" }}>
            Welcome, <strong>{userRow.name}</strong>
          </span>
          <button
            style={{
              ...styles.btnSecondary,
              padding: "0.3rem 0.75rem",
              fontSize: "0.8rem",
            }}
            onClick={() => setEditing(true)}
          >
            Rename
          </button>
        </div>

        <button style={styles.btnPrimary} onClick={onCreateLobby}>
          Create Lobby
        </button>

        <h3 style={{ margin: "1.5rem 0 0.75rem", color: "#eee" }}>
          Open Lobbies ({lobbies.length})
        </h3>
        {lobbies.length === 0 ? (
          <p style={{ color: "#666", fontSize: "0.9rem" }}>
            No open lobbies. Create one!
          </p>
        ) : (
          lobbies.map((g) => (
            <div key={g.id.toString()} style={styles.lobbyRow}>
              <div>
                <span style={{ color: "#eee" }}>{getHostName(g)}'s lobby</span>
                <span
                  style={{
                    color: "#888",
                    marginLeft: "0.5rem",
                    fontSize: "0.85rem",
                  }}
                >
                  {getPlayerCount(g)}/8 players
                </span>
              </div>
              <button
                style={{
                  ...styles.btnSecondary,
                  padding: "0.3rem 0.75rem",
                  fontSize: "0.8rem",
                }}
                onClick={() => onJoinLobby(g.id)}
              >
                Join
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
