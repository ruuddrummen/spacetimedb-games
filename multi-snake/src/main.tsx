import {
  StrictMode,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { Identity } from "spacetimedb";
import { SpacetimeDBProvider } from "spacetimedb/react";
import { DbConnection, ErrorContext } from "./module_bindings/index.ts";

const HOST = import.meta.env.VITE_SPACETIMEDB_HOST ?? "ws://localhost:3000";
const DB_NAME = import.meta.env.VITE_SPACETIMEDB_DB_NAME ?? "multi-snake";
const TOKEN_KEY = `${HOST}/${DB_NAME}/auth_token`;

export const IdentityContext = createContext<Identity | null>(null);
export const useIdentity = () => useContext(IdentityContext);

function Root() {
  const [identity, setIdentity] = useState<Identity | null>(null);

  const connectionBuilder = useMemo(
    () =>
      DbConnection.builder()
        .withUri(HOST)
        .withDatabaseName(DB_NAME)
        .withToken(localStorage.getItem(TOKEN_KEY) || undefined)
        .onConnect((conn: DbConnection, id: Identity, token: string) => {
          localStorage.setItem(TOKEN_KEY, token);
          setIdentity(id);
          conn.subscriptionBuilder().subscribeToAllTables();
        })
        .onDisconnect(() => {
          console.log("Disconnected from SpacetimeDB");
        })
        .onConnectError((_ctx: ErrorContext, err: Error) => {
          console.error("Error connecting to SpacetimeDB:", err);
          if (
            err.message.includes("Unauthorized") ||
            err.message.includes("Failed to verify token")
          ) {
            console.warn("Stored token is invalid, clearing and retrying...");
            localStorage.removeItem(TOKEN_KEY);
            window.location.reload();
          }
        }),
    [],
  );

  return (
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <IdentityContext.Provider value={identity}>
        <App />
      </IdentityContext.Provider>
    </SpacetimeDBProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
