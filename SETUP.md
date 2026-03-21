# Getting Started

## After reopening in the devcontainer

The `post-create.sh` script runs automatically and installs the SpacetimeDB CLI. Once the terminal prompt appears, follow the steps below.

---

### Step 1 — Verify the CLI is available

Open a new terminal and confirm the CLI was installed:

```bash
spacetime --version
```

If the command is not found, run:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

### Step 2 — Bootstrap the project (first time only)

Run the **Bootstrap Project** task to scaffold the project from the official `react-ts` template:

- **Menu:** Terminal → Run Task → Bootstrap Project
- **Keyboard:** `Ctrl+Shift+B` opens the default build tasks

This runs `spacetime dev --template react-ts` in the workspace root. It will:

1. Create a `server/` directory containing the TypeScript SpacetimeDB module
2. Create a `client/` directory containing the React + Vite frontend
3. Start the local SpacetimeDB server and publish the module
4. Generate TypeScript client bindings in `client/src/module_bindings/`
5. Watch the server module for changes

> **Note:** This task runs indefinitely — it acts as the dev server after scaffolding. Press `Ctrl+C` to stop it once the files have been created and switch to the **Start All** task for subsequent dev sessions.

---

### Step 3 — Install frontend dependencies

After bootstrapping, install the client npm packages:

```bash
cd client && npm install
```

This is done automatically on container rebuild if `client/package.json` already exists.

---

### Step 4 — Start the development servers

For all subsequent sessions, use the **Start All** task:

- **Menu:** Terminal → Run Task → Start All
- **Keyboard:** `Ctrl+Shift+B`

This starts two processes in parallel:

| Task | Command | What it does |
|---|---|---|
| Start SpacetimeDB Dev | `spacetime dev` in `server/` | Starts SpacetimeDB on port 3000, publishes the module, watches for changes |
| Start Frontend | `npm run dev` in `client/` | Starts Vite on port 5173 |

---

### Step 5 — Open the app

Navigate to [localhost:5173](http://localhost:5173) in your browser. VS Code may open it automatically via the `onAutoForward` setting.

---

## Port reference

| Port | Service |
|---|---|
| `3000` | SpacetimeDB WebSocket API |
| `5173` | Vite dev server (React frontend) |

---

## Useful CLI commands

```bash
# Check the local SpacetimeDB server status
spacetime server ping

# List published modules
spacetime list

# View server logs
spacetime logs <module-name>

# Regenerate TypeScript client bindings manually
spacetime generate --lang typescript --out-dir client/src/module_bindings
```
