import { schema, table, t } from "spacetimedb/server";

// ── Types ──────────────────────────────────────────────────────────────────────

export const Position = t.object("Position", { x: t.i32(), y: t.i32() });

// ── Constants ──────────────────────────────────────────────────────────────────

export const GRID_SIZE = 30;
export const TICK_INTERVAL_MICROS = 150_000n; // 150ms per tick
export const INITIAL_SNAKE_LENGTH = 3;
export const COLORS = [
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

export const game = table(
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

export const player = table(
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

export const food = table(
  { name: "food", public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    x: t.i32(),
    y: t.i32(),
  },
);

// Late-binding for scheduled reducer (avoids circular dependency with reducers.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _gameTick: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const registerGameTick = (reducer: any) => {
  _gameTick = reducer;
};

export const tick_schedule = table(
  {
    name: "tick_schedule",
    public: true,
    scheduled: (() => _gameTick) as () => any,
  },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  },
);

// ── Schema ─────────────────────────────────────────────────────────────────────

const spacetimedb = schema({ game, player, food, tick_schedule });
export default spacetimedb;
