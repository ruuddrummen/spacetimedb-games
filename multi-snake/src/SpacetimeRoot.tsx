import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, ErrorContext } from "./module_bindings/index.ts";
import {
  ConnectionStatus,
  ConnectionStatusContext,
  IdentityContext,
  SubscriptionReadyContext,
} from "./context.ts";
import { HOST, DB_NAME, TOKEN_KEY } from "./config.ts";
import App from "./App.tsx";

const MAX_RETRY_DELAY = 10_000;
const BASE_RETRY_DELAY = 1_000;

export function SpacetimeRoot() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [subscriptionReady, setSubscriptionReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    error: null,
    retrying: false,
  });
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
