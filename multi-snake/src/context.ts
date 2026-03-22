import { createContext, useContext } from "react";
import type { Identity } from "spacetimedb";

export const IdentityContext = createContext<Identity | null>(null);
export const useIdentity = () => useContext(IdentityContext);

export const SubscriptionReadyContext = createContext<boolean>(false);
export const useSubscriptionReady = () => useContext(SubscriptionReadyContext);

export interface ConnectionStatus {
  error: string | null;
  retrying: boolean;
}

export const ConnectionStatusContext = createContext<ConnectionStatus>({
  error: null,
  retrying: false,
});
export const useConnectionStatus = () => useContext(ConnectionStatusContext);
