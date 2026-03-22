/**
 * Auto-detect the SpacetimeDB WebSocket URL.
 * When the page is served through a devtunnel (*.devtunnels.ms) but the
 * configured host still points at localhost/127.0.0.1, derive the correct
 * wss:// URL by swapping the Vite port (5173) for the STDB port (3000) in
 * the current page origin.
 */
function resolveHost(): string {
  const configured =
    import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
  const origin = window.location.origin;

  const isLocalhost =
    configured.includes("localhost") || configured.includes("127.0.0.1");
  const isTunnel = origin.includes(".devtunnels.ms");

  if (isLocalhost && isTunnel) {
    // e.g. origin = "https://abc-5173.euw.devtunnels.ms"
    // replace the Vite port with the STDB port in the subdomain
    const tunnelWs = origin
      .replace(/^https:\/\//, "wss://")
      .replace(/^http:\/\//, "ws://")
      .replace("-5173", "-3000");
    console.log(
      `[auto-detect] Page served via devtunnel, using SpacetimeDB host: ${tunnelWs}`,
    );
    return tunnelWs;
  }

  return configured;
}

export const HOST = resolveHost();
export const DB_NAME =
  import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "multi-snake";
export const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;
