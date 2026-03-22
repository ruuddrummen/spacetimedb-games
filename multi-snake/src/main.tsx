import {
  StrictMode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, ErrorContext } from "./module_bindings/index.ts";
import {
  ConnectionStatus,
  ConnectionStatusContext,
  IdentityContext,
  SubscriptionReadyContext,
} from "./context.ts";

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

const HOST = resolveHost();
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "multi-snake";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

const MAX_RETRY_DELAY = 10_000;
const BASE_RETRY_DELAY = 1_000;

function Root() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    error: null,
    retrying: false,
  });
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

  const scheduleRetry = useCallback(() => {
    const delay = Math.min(
      BASE_RETRY_DELAY * Math.pow(2, retryCount),
      MAX_RETRY_DELAY,
    );
    setConnectionStatus((prev) => ({ ...prev, retrying: true }));
    retryTimer.current = setTimeout(() => {
      setRetryCount((c) => c + 1);
    }, delay);
  }, [retryCount]);

  const connectionBuilder = useMemo(() => {
    // Reset state on new connection attempt
    setIdentity(null);
    setSubscriptionReady(false);

    return DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DB_NAME)
      .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
      .onConnect((conn: DbConnection, id: Identity, token: string) => {
        localStorage.setItem(TOKEN_KEY, token);
        setIdentity(id);
        setConnectionStatus({ error: null, retrying: false });
        conn
          .subscriptionBuilder()
          .onApplied(() => setSubscriptionReady(true))
          .subscribeToAllTables();
      })
      .onDisconnect(() => {
        console.log("Disconnected from SpacetimeDB");
        setSubscriptionReady(false);
        setConnectionStatus({
          error: `Connection lost (${HOST}). Reconnecting…`,
          retrying: true,
        });
        scheduleRetry();
      })
      .onConnectError((_ctx: ErrorContext, err: Error) => {
        console.error("Error connecting to SpacetimeDB:", err);
        if (
          err.message.includes("Unauthorized") ||
          err.message.includes("Failed to verify token")
        ) {
          console.warn("Stored token is invalid, clearing and retrying...");
          localStorage.removeItem(TOKEN_KEY);
          setConnectionStatus({
            error: "Authentication failed. Retrying with fresh credentials…",
            retrying: true,
          });
        } else {
          setConnectionStatus({
            error: `Connection failed (${HOST}): ${err.message}`,
            retrying: true,
          });
        }
        scheduleRetry();
      });
  }, [retryCount, scheduleRetry]);

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder} key={retryCount}>
      <IdentityContext.Provider value={identity}>
        <SubscriptionReadyContext.Provider value={subscriptionReady}>
          <ConnectionStatusContext.Provider value={connectionStatus}>
            <App />
          </ConnectionStatusContext.Provider>
        </SubscriptionReadyContext.Provider>
      </IdentityContext.Provider>
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
