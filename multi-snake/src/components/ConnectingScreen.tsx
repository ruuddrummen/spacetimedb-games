import { useConnectionStatus } from "../context";
import { styles } from "../styles";

export function ConnectingScreen() {
  const { error, retrying } = useConnectionStatus();

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>SNAKE ARENA</h1>
      {error ? (
        <>
          <p style={{ color: "#ff4444", maxWidth: 400, textAlign: "center" }}>
            {error}
          </p>
          {retrying && (
            <p style={{ color: "#888", fontSize: "0.85rem" }}>
              Retrying automatically…
            </p>
          )}
        </>
      ) : (
        <p style={{ color: "#888" }}>Connecting to server...</p>
      )}
    </div>
  );
}
