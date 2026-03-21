import { schema, table, t, SenderError } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";

// ── Types ──────────────────────────────────────────────────────────────────────

const Position = t.object("Position", { x: t.i32(), y: t.i32() });

// ── Constants ──────────────────────────────────────────────────────────────────

const GRID_SIZE = 30;
const TICK_INTERVAL_MICROS = 150_000n; // 150ms per tick
const INITIAL_SNAKE_LENGTH = 3;
const COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#e67e22",
  "#1abc9c",
  "#fd79a8",
];

// ── Tables ─────────────────────────────────────────────────────────────────────

const game = table(
  { name: "game", public: true },
  {
    id: t.u64().primaryKey(),
    hostIdentity: t.identity(),
    phase: t.string(), // 'lobby' | 'playing' | 'finished'
    gridSize: t.u32(),
    rngState: t.u64(),
    playerCount: t.u32(),
  },
);

const player = table(
  { name: "player", public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    direction: t.string(), // 'up' | 'down' | 'left' | 'right'
    nextDirection: t.string(),
    alive: t.bool(),
    score: t.u32(),
    color: t.string(),
    segments: t.array(Position),
    joinOrder: t.u32(),
  },
);

const food = table(
  { name: "food", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    x: t.i32(),
    y: t.i32(),
  },
);

const tick_schedule = table(
  {
    name: "tick_schedule",
    public: true,
    scheduled: ((): any => gameTick) as () => any,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

// ── Schema ─────────────────────────────────────────────────────────────────────

const spacetimedb = schema({ game, player, food, tick_schedule });
export default spacetimedb;

// ── Helpers ────────────────────────────────────────────────────────────────────

function nextRng(state: bigint): bigint {
  return (
    (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn
  );
}

function rngInt(state: bigint, max: number): [bigint, number] {
  const next = nextRng(state);
  return [next, Number((next >> 33n) % BigInt(max))];
}

function isOpposite(d1: string, d2: string): boolean {
  return (
    (d1 === "up" && d2 === "down") ||
    (d1 === "down" && d2 === "up") ||
    (d1 === "left" && d2 === "right") ||
    (d1 === "right" && d2 === "left")
  );
}

function directionDelta(d: string): { dx: number; dy: number } {
  switch (d) {
    case "up":
      return { dx: 0, dy: -1 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    case "right":
      return { dx: 1, dy: 0 };
    default:
      return { dx: 1, dy: 0 };
  }
}

function getStartPosition(joinOrder: number, gridSize: number) {
  const mid = Math.floor(gridSize / 2);
  const positions = [
    { x: 5, y: mid, direction: "right" },
    { x: gridSize - 6, y: mid, direction: "left" },
    { x: mid, y: 5, direction: "down" },
    { x: mid, y: gridSize - 6, direction: "up" },
    { x: 5, y: 5, direction: "right" },
    { x: gridSize - 6, y: 5, direction: "left" },
    { x: 5, y: gridSize - 6, direction: "right" },
    { x: gridSize - 6, y: gridSize - 6, direction: "left" },
  ];
  return positions[joinOrder % positions.length];
}

function makeSegments(x: number, y: number, direction: string, length: number) {
  const segments: Array<{ x: number; y: number }> = [];
  let dx = 0,
    dy = 0;
  if (direction === "right") dx = -1;
  else if (direction === "left") dx = 1;
  else if (direction === "down") dy = -1;
  else if (direction === "up") dy = 1;
  for (let i = 0; i < length; i++) {
    segments.push({ x: x + dx * i, y: y + dy * i });
  }
  return segments;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function spawnFood(ctx: any, rngState: bigint, gridSize: number): bigint {
  const occupied = new Set<string>();
  for (const p of ctx.db.player.iter()) {
    if (!p.alive) continue;
    for (const seg of p.segments) {
      occupied.add(`${seg.x},${seg.y}`);
    }
  }
  for (const f of ctx.db.food.iter()) {
    occupied.add(`${f.x},${f.y}`);
  }

  let state = rngState;
  let attempts = 0;
  while (attempts < 100) {
    let x: number, y: number;
    [state, x] = rngInt(state, gridSize);
    [state, y] = rngInt(state, gridSize);
    if (!occupied.has(`${x},${y}`)) {
      ctx.db.food.insert({ id: 0n, x, y });
      return state;
    }
    attempts++;
  }
  // Fallback: first empty cell
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      if (!occupied.has(`${x},${y}`)) {
        ctx.db.food.insert({ id: 0n, x, y });
        return state;
      }
    }
  }
  return state;
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((_ctx) => {});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (p) {
    const gameRow = ctx.db.game.id.find(1n);
    if (gameRow && gameRow.phase === "playing") {
      ctx.db.player.identity.update({ ...p, alive: false, segments: [] });
    }
  }
});

// ── Reducers ───────────────────────────────────────────────────────────────────

export const joinGame = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    if (!name.trim()) throw new SenderError("Name cannot be empty");

    const existing = ctx.db.player.identity.find(ctx.sender);
    if (existing) throw new SenderError("Already joined");

    let gameRow = ctx.db.game.id.find(1n);
    if (!gameRow) {
      gameRow = ctx.db.game.insert({
        id: 1n,
        hostIdentity: ctx.sender,
        phase: "lobby",
        gridSize: GRID_SIZE,
        rngState: ctx.timestamp.microsSinceUnixEpoch,
        playerCount: 0,
      });
    }

    if (gameRow.phase !== "lobby")
      throw new SenderError("Game already in progress");

    const joinOrder = gameRow.playerCount;
    ctx.db.game.id.update({ ...gameRow, playerCount: joinOrder + 1 });

    ctx.db.player.insert({
      identity: ctx.sender,
      name: name.trim(),
      direction: "right",
      nextDirection: "right",
      alive: true,
      score: 0,
      color: COLORS[joinOrder % COLORS.length],
      segments: [],
      joinOrder,
    });
  },
);

export const startGame = spacetimedb.reducer((ctx) => {
  const gameRow = ctx.db.game.id.find(1n);
  if (!gameRow) throw new SenderError("No game exists");
  if (gameRow.phase !== "lobby") throw new SenderError("Game not in lobby");
  if (gameRow.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError("Only the host can start the game");
  }

  const gridSize = gameRow.gridSize;
  let rng = gameRow.rngState;

  // Initialize snakes for all players
  const players = [...ctx.db.player.iter()];
  if (players.length === 0) throw new SenderError("No players");

  for (const p of players) {
    const start = getStartPosition(p.joinOrder, gridSize);
    const segs = makeSegments(
      start.x,
      start.y,
      start.direction,
      INITIAL_SNAKE_LENGTH,
    );
    ctx.db.player.identity.update({
      ...p,
      direction: start.direction,
      nextDirection: start.direction,
      alive: true,
      score: 0,
      segments: segs,
    });
  }

  // Spawn initial food
  const foodCount = Math.max(3, players.length + 1);
  for (let i = 0; i < foodCount; i++) {
    rng = spawnFood(ctx, rng, gridSize);
  }

  // Update game state
  ctx.db.game.id.update({ ...gameRow, phase: "playing", rngState: rng });

  // Schedule first tick
  const nextTime = ctx.timestamp.microsSinceUnixEpoch + TICK_INTERVAL_MICROS;
  ctx.db.tick_schedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextTime),
  });
});

export const changeDirection = spacetimedb.reducer(
  { direction: t.string() },
  (ctx, { direction }) => {
    const validDirs = ["up", "down", "left", "right"];
    if (!validDirs.includes(direction))
      throw new SenderError("Invalid direction");

    const p = ctx.db.player.identity.find(ctx.sender);
    if (!p) throw new SenderError("Not in game");
    if (!p.alive) return;

    if (!isOpposite(p.direction, direction)) {
      ctx.db.player.identity.update({ ...p, nextDirection: direction });
    }
  },
);

export const gameTick = spacetimedb.reducer(
  { arg: tick_schedule.rowType },
  (ctx, { arg: _scheduledRow }) => {
    const gameRow = ctx.db.game.id.find(1n);
    if (!gameRow || gameRow.phase !== "playing") return;

    const gridSize = gameRow.gridSize;
    let rng = gameRow.rngState;
    const allPlayers = [...ctx.db.player.iter()];
    const alivePlayers = allPlayers.filter((p) => p.alive);

    if (alivePlayers.length === 0) {
      ctx.db.game.id.update({ ...gameRow, phase: "finished", rngState: rng });
      return;
    }

    // Compute new head positions
    const newHeads = new Map<
      string,
      { x: number; y: number; direction: string }
    >();
    for (const p of alivePlayers) {
      let dir = p.nextDirection;
      if (isOpposite(p.direction, dir)) dir = p.direction;
      const { dx, dy } = directionDelta(dir);
      const head = p.segments[0];
      newHeads.set(p.identity.toHexString(), {
        x: head.x + dx,
        y: head.y + dy,
        direction: dir,
      });
    }

    // Collect all body positions for collision detection
    const bodyPositions = new Set<string>();
    for (const p of alivePlayers) {
      for (const seg of p.segments) {
        bodyPositions.add(`${seg.x},${seg.y}`);
      }
    }

    // Detect deaths
    const deaths = new Set<string>();
    for (const p of alivePlayers) {
      const id = p.identity.toHexString();
      const nh = newHeads.get(id)!;

      // Wall collision
      if (nh.x < 0 || nh.x >= gridSize || nh.y < 0 || nh.y >= gridSize) {
        deaths.add(id);
        continue;
      }

      // Body collision
      if (bodyPositions.has(`${nh.x},${nh.y}`)) {
        deaths.add(id);
        continue;
      }

      // Head-to-head collision
      for (const [otherId, otherHead] of newHeads) {
        if (otherId !== id && nh.x === otherHead.x && nh.y === otherHead.y) {
          deaths.add(id);
          deaths.add(otherId);
        }
      }
    }

    // Collect food positions
    const foodList = [...ctx.db.food.iter()];
    const foodMap = new Map<string, bigint>();
    for (const f of foodList) {
      foodMap.set(`${f.x},${f.y}`, f.id);
    }

    // Apply moves
    for (const p of alivePlayers) {
      const id = p.identity.toHexString();
      const nh = newHeads.get(id)!;

      if (deaths.has(id)) {
        ctx.db.player.identity.update({ ...p, alive: false, segments: [] });
        continue;
      }

      const newSegments = [{ x: nh.x, y: nh.y }, ...p.segments];
      let newScore = p.score;

      // Check food collision
      const foodKey = `${nh.x},${nh.y}`;
      if (foodMap.has(foodKey)) {
        const foodId = foodMap.get(foodKey)!;
        ctx.db.food.id.delete(foodId);
        foodMap.delete(foodKey);
        newScore += 1;
        rng = spawnFood(ctx, rng, gridSize);
      } else {
        newSegments.pop();
      }

      ctx.db.player.identity.update({
        ...p,
        direction: nh.direction,
        nextDirection: nh.direction,
        segments: newSegments,
        score: newScore,
      });
    }

    // Check end conditions
    const stillAlive = allPlayers
      .map((p) => p.identity.toHexString())
      .filter(
        (id) =>
          !deaths.has(id) &&
          alivePlayers.some((a) => a.identity.toHexString() === id),
      );
    const totalPlayers = allPlayers.length;

    if (
      stillAlive.length === 0 ||
      (totalPlayers > 1 && stillAlive.length <= 1)
    ) {
      ctx.db.game.id.update({ ...gameRow, phase: "finished", rngState: rng });
      return;
    }

    // Continue game
    ctx.db.game.id.update({ ...gameRow, rngState: rng });

    const nextTime = ctx.timestamp.microsSinceUnixEpoch + TICK_INTERVAL_MICROS;
    ctx.db.tick_schedule.insert({
      scheduledId: 0n,
      scheduledAt: ScheduleAt.time(nextTime),
    });
  },
);

export const restartGame = spacetimedb.reducer((ctx) => {
  const gameRow = ctx.db.game.id.find(1n);
  if (!gameRow) throw new SenderError("No game exists");
  if (gameRow.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError("Only the host can restart");
  }

  // Clear food
  const allFood = [...ctx.db.food.iter()];
  for (const f of allFood) {
    ctx.db.food.id.delete(f.id);
  }

  // Clear scheduled ticks
  const allTicks = [...ctx.db.tick_schedule.iter()];
  for (const tick of allTicks) {
    ctx.db.tick_schedule.scheduledId.delete(tick.scheduledId);
  }

  // Reset players
  const allPlayers = [...ctx.db.player.iter()];
  for (const p of allPlayers) {
    ctx.db.player.identity.update({
      ...p,
      alive: true,
      score: 0,
      segments: [],
      direction: "right",
      nextDirection: "right",
    });
  }

  // Reset game to lobby
  ctx.db.game.id.update({
    ...gameRow,
    phase: "lobby",
    rngState: ctx.timestamp.microsSinceUnixEpoch,
  });
});
