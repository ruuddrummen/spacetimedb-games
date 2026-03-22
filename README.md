# SpacetimeDB Games

Multiplayer browser games built with [SpacetimeDB](https://spacetimedb.com/) and React.

## Getting Started

1. **Open in a Dev Container** — Choose one of:
   - Clone the repo and open it in VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension, then select **Reopen in Container**.
   - For better I/O performance, use **Dev Containers: Clone Repository in Container Volume** from the command palette — this clones directly into a Docker volume instead of a bind mount.
   - Open as a [GitHub Codespace](https://codespaces.new/ruuddrummen/spacetimedb-games) in the browser.

   The container installs all dependencies automatically, including the SpacetimeDB CLI and Dev Tunnels.

2. **Run the "Start All" task** — Open the command palette (`Ctrl+Shift+P`) → _Tasks: Run Task_ → **Start All**. This launches three parallel processes:
   - **SpacetimeDB Server** — local database on port 3000
   - **SpacetimeDB Dev** — publishes the module and watches for changes
   - **Dev Tunnel** — exposes ports 3000 and 5173 so external players can join

3. **Follow the terminal instructions:**
   - In the **SpacetimeDB Dev** terminal, wait until the module is published successfully.
   - In the **Dev Tunnel** terminal, you may be prompted to log in via GitHub device code flow. Follow the on-screen link, enter the code, and the tunnel will start. Once running, share the Vite tunnel URL with other players.

4. **Open the game** — The Vite dev server on port 5173 auto-opens in your browser. If you're using a tunnel, use the tunnel URL instead.

## Games

### Snake Arena (`multi-snake/`)

A real-time multiplayer snake game where players compete on a shared grid.

#### Architecture

The project follows the standard SpacetimeDB full-stack structure:

```
multi-snake/
├── spacetimedb/src/    # Server module (runs inside SpacetimeDB)
│   ├── schema.ts       # Table definitions & shared constants
│   ├── reducers.ts     # Game logic (create/join/start, movement, tick)
│   ├── lifecycle.ts    # Client connect/disconnect handlers
│   └── helpers.ts      # Pure utility functions (RNG, spawning, collision)
└── src/                # React client (Vite + TypeScript)
    ├── SpacetimeRoot.tsx       # SpacetimeDB provider & connection setup
    ├── App.tsx                 # Screen router (menu → lobby → game → game over)
    ├── hooks/useGameState.ts   # Derives game state from subscribed tables
    ├── components/             # UI screens and canvas renderer
    └── module_bindings/        # Auto-generated client SDK (do not edit)
```

#### Server (SpacetimeDB module)

The backend is a set of **tables** and **reducers** that run transactionally inside SpacetimeDB:

- **`user`** — Stores player display names, keyed by identity.
- **`game`** — One row per active game session, tracking phase (`lobby` → `playing` → `finished`), grid size, and an RNG seed for deterministic food spawning.
- **`player`** — One row per player in a game, holding direction, score, alive status, color, and the full snake body as an array of segments.
- **`food`** — Food items on the grid, indexed by game ID.
- **`tick_schedule`** — A scheduled table that fires the `game_tick` reducer at a fixed interval (150ms) to advance the simulation.

Key reducers: `create_lobby`, `join_lobby`, `start_game`, `change_direction`, `game_tick` (scheduled — moves snakes, checks collisions, spawns food), and `restart_game`.

When a host disconnects, the lifecycle handler cleans up the entire game. Non-host disconnects mark the player as dead and remove them.

#### Client (React + Vite)

The client connects to SpacetimeDB over WebSockets and subscribes to all public tables. State is fully server-authoritative — the client never modifies game state locally.

- **`SpacetimeRoot`** manages the connection with automatic reconnection and exponential backoff.
- **`useGameState`** reads the subscribed tables (`useTable`) and derives the current user's game, player, and lobby info.
- **`GameCanvas`** renders the grid, snakes, and food on an HTML5 Canvas.
- **Direction input** is handled via keyboard arrows/WASD and touch controls (`SwipeArea` / `TouchDPad`) for mobile.
- **Tunnel-aware config** — when served through a Dev Tunnel, the client auto-detects the tunnel origin and rewrites the WebSocket URL to route through the tunnel.
