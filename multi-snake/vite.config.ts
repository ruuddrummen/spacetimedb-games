import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // loadEnv loads .env → .env.local → .env.{mode} → .env.{mode}.local
  // When start-tunnel.sh writes .env.tunnel, run Vite with:  npx vite --mode tunnel
  // This makes the tunnel's VITE_SPACETIMEDB_HOST override .env.local automatically.
  const env = loadEnv(mode, ".", ["VITE_"]);

  return {
    plugins: [react()],
    define: Object.fromEntries(
      Object.entries(env)
        .filter(([k]) => k.startsWith("VITE_"))
        .map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
    ),
    server: {
      host: true, // bind to 0.0.0.0 so devtunnel can forward traffic
    },
  };
});
