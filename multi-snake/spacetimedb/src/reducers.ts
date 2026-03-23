import { SenderError, t, type ReducerCtx, type InferSchema } from "spacetimedb/server";
import { ScheduleAt } from "spacetimedb";
import spacetimedb from "./schema";
import {
  GRID_SIZE,
  TICK_INTERVAL_MICROS,
  INITIAL_SNAKE_LENGTH,
  COLORS,
  tick_schedule,
  registerGameTick,
} from "./schema";
import { isOpposite } from "./helpers";
import {
  advanceTick,
  initializeGame,
  type PlayerMutation,
  type Position,
} from "./engine";

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type PlayerRow = ReturnType<Ctx["db"]["player"]["identity"]["find"]> & {};

// ── Helpers ────────────────────────────────────────────────────────────────────

function cleanupGame(ctx: Ctx, gameId: bigint) {
  for (const p of [...ctx.db.player.player_game_id.filter(gameId)]) {
    ctx.db.player.identity.delete(p.identity);
  }
  for (const f of [...ctx.db.food.food_game_id.filter(gameId)]) {
    ctx.db.food.id.delete(f.id);
  }
  for (const tick of [...ctx.db.tick_schedule.iter()]) {
    if (tick.gameId === gameId) {
      ctx.db.tick_schedule.scheduledId.delete(tick.scheduledId);
    }
  }
  ctx.db.game.id.delete(gameId);
}

function applyPlayerMutations(ctx: Ctx, existingRows: PlayerRow[], mutations: PlayerMutation[]) {
  const rowMap = new Map<string, PlayerRow>();
  for (const row of existingRows) {
    rowMap.set(row.identity.toHexString(), row);
  }
  for (const m of mutations) {
    const row = rowMap.get(m.id);
    if (!row) continue;
    ctx.db.player.identity.update({
      ...row,
      direction: m.direction,
      nextDirection: m.nextDirection,
      nextDirection2: m.nextDirection2,
      segments: m.segments,
      alive: m.alive,
      score: m.score,
    });
  }
}

function applyFoodMutations(ctx: Ctx, gameId: bigint, toDelete: bigint[], toSpawn: Position[]) {
  for (const foodId of toDelete) {
    ctx.db.food.id.delete(foodId);
  }
  for (const { x, y } of toSpawn) {
    ctx.db.food.insert({ id: 0n, gameId, x, y });
  }
}

// ── Reducers ───────────────────────────────────────────────────────────────────

export const set_name = spacetimedb.reducer(
  { name: t.string() },
  (ctx, { name }) => {
    const trimmed = name.trim();
    if (!trimmed) throw new SenderError("Name cannot be empty");
    if (trimmed.length > 16) throw new SenderError("Name too long (max 16)");

    const existing = ctx.db.user.identity.find(ctx.sender);
    if (existing) {
      ctx.db.user.identity.update({ ...existing, name: trimmed });
      // Also update player name if in a lobby
      const p = ctx.db.player.identity.find(ctx.sender);
      if (p) {
        const gameRow = ctx.db.game.id.find(p.gameId);
        if (gameRow && gameRow.phase === "lobby") {
          ctx.db.player.identity.update({ ...p, name: trimmed });
        }
      }
    } else {
      ctx.db.user.insert({ identity: ctx.sender, name: trimmed });
    }
  },
);

export const create_lobby = spacetimedb.reducer((ctx) => {
  const userRow = ctx.db.user.identity.find(ctx.sender);
  if (!userRow) throw new SenderError("Set your name first");

  const existingPlayer = ctx.db.player.identity.find(ctx.sender);
  if (existingPlayer) throw new SenderError("Already in a game");

  const gameRow = ctx.db.game.insert({
    id: 0n,
    hostIdentity: ctx.sender,
    phase: "lobby",
    gridSize: GRID_SIZE,
    rngState: ctx.timestamp.microsSinceUnixEpoch,
    playerCount: 1,
  });

  ctx.db.player.insert({
    identity: ctx.sender,
    gameId: gameRow.id,
    name: userRow.name,
    direction: "right",
    nextDirection: "right",
    nextDirection2: "",
    alive: true,
    score: 0,
    color: COLORS[0],
    segments: [],
    joinOrder: 0,
  });
});

export const join_lobby = spacetimedb.reducer(
  { gameId: t.u64() },
  (ctx, { gameId }) => {
    const userRow = ctx.db.user.identity.find(ctx.sender);
    if (!userRow) throw new SenderError("Set your name first");

    const existingPlayer = ctx.db.player.identity.find(ctx.sender);
    if (existingPlayer) throw new SenderError("Already in a game");

    const gameRow = ctx.db.game.id.find(gameId);
    if (!gameRow) throw new SenderError("Game not found");
    if (gameRow.phase !== "lobby")
      throw new SenderError("Game already in progress");

    const joinOrder = gameRow.playerCount;
    ctx.db.game.id.update({ ...gameRow, playerCount: joinOrder + 1 });

    ctx.db.player.insert({
      identity: ctx.sender,
      gameId,
      name: userRow.name,
      direction: "right",
      nextDirection: "right",
      nextDirection2: "",
      alive: true,
      score: 0,
      color: COLORS[joinOrder % COLORS.length],
      segments: [],
      joinOrder,
    });
  },
);

export const leave_lobby = spacetimedb.reducer((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError("Not in a game");

  const gameRow = ctx.db.game.id.find(p.gameId);
  if (!gameRow) {
    ctx.db.player.identity.delete(ctx.sender);
    return;
  }

  const isHost =
    gameRow.hostIdentity.toHexString() === ctx.sender.toHexString();

  if (isHost) {
    // Host leaving closes the entire lobby
    cleanupGame(ctx, gameRow.id);
  } else {
    ctx.db.player.identity.delete(ctx.sender);
    ctx.db.game.id.update({
      ...gameRow,
      playerCount: gameRow.playerCount > 0 ? gameRow.playerCount - 1 : 0,
    });

    // If game is playing/countdown and <=1 alive player remains, end
    if (gameRow.phase === "playing" || gameRow.phase === "countdown") {
      const remaining = [
        ...ctx.db.player.player_game_id.filter(gameRow.id),
      ].filter((pl) => pl.alive);
      if (remaining.length <= 1) {
        ctx.db.game.id.update({
          ...ctx.db.game.id.find(gameRow.id)!,
          phase: "finished",
        });
      }
    }
  }
});

export const close_lobby = spacetimedb.reducer((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) throw new SenderError("Not in a game");

  const gameRow = ctx.db.game.id.find(p.gameId);
  if (!gameRow) throw new SenderError("Game not found");

  if (gameRow.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError("Only the host can close the lobby");
  }

  cleanupGame(ctx, gameRow.id);
});

export const start_game = spacetimedb.reducer((ctx) => {
  const myPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!myPlayer) throw new SenderError("Not in a game");

  const gameRow = ctx.db.game.id.find(myPlayer.gameId);
  if (!gameRow) throw new SenderError("No game exists");
  if (gameRow.phase !== "lobby") throw new SenderError("Game not in lobby");
  if (gameRow.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError("Only the host can start the game");
  }

  const gridSize = gameRow.gridSize;
  const gameId = gameRow.id;

  const players = [...ctx.db.player.player_game_id.filter(gameId)];
  if (players.length === 0) throw new SenderError("No players");

  const foodCount = Math.max(3, players.length + 1);
  const result = initializeGame(
    players.map((p) => ({ id: p.identity.toHexString(), joinOrder: p.joinOrder })),
    gridSize,
    gameRow.rngState,
    foodCount,
    INITIAL_SNAKE_LENGTH,
  );

  applyPlayerMutations(ctx, players, result.playerMutations);
  for (const { x, y } of result.foodSpawns) {
    ctx.db.food.insert({ id: 0n, gameId, x, y });
  }

  // Update game state — enter countdown phase
  ctx.db.game.id.update({ ...gameRow, phase: "countdown", rngState: result.nextRngState });

  // Schedule first tick after 3-second countdown
  const COUNTDOWN_MICROS = 3_000_000n;
  const nextTime = ctx.timestamp.microsSinceUnixEpoch + COUNTDOWN_MICROS;
  ctx.db.tick_schedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.time(nextTime),
    gameId,
  });
});

export const change_direction = spacetimedb.reducer(
  { direction: t.string() },
  (ctx, { direction }) => {
    const validDirs = ["up", "down", "left", "right"];
    if (!validDirs.includes(direction))
      throw new SenderError("Invalid direction");

    const p = ctx.db.player.identity.find(ctx.sender);
    if (!p) throw new SenderError("Not in game");
    if (!p.alive) return;

    if (p.nextDirection === p.direction) {
      // No input queued yet — fill first slot
      if (!isOpposite(p.direction, direction)) {
        ctx.db.player.identity.update({ ...p, nextDirection: direction });
      }
    } else {
      // First slot taken — fill second slot (validate against nextDirection)
      if (!isOpposite(p.nextDirection, direction)) {
        ctx.db.player.identity.update({ ...p, nextDirection2: direction });
      }
    }
  },
);

export const game_tick = spacetimedb.reducer(
  { arg: tick_schedule.rowType },
  (ctx, { arg: scheduledRow }) => {
    const gameId = scheduledRow.gameId;
    const gameRow = ctx.db.game.id.find(gameId);
    if (
      !gameRow ||
      (gameRow.phase !== "playing" && gameRow.phase !== "countdown")
    )
      return;

    // Transition from countdown to playing
    if (gameRow.phase === "countdown") {
      ctx.db.game.id.update({ ...gameRow, phase: "playing" });
      const nextTime =
        ctx.timestamp.microsSinceUnixEpoch + TICK_INTERVAL_MICROS;
      ctx.db.tick_schedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(nextTime),
        gameId,
      });
      return;
    }

    // ── Read snapshot ──────────────────────────────────────────────────────
    const players = [...ctx.db.player.player_game_id.filter(gameId)];
    const food = [...ctx.db.food.food_game_id.filter(gameId)];

    const snapshot = {
      players: players.map((p) => ({
        id: p.identity.toHexString(),
        direction: p.direction,
        nextDirection: p.nextDirection,
        nextDirection2: p.nextDirection2,
        segments: p.segments as { x: number; y: number }[],
        alive: p.alive,
        score: p.score,
        joinOrder: p.joinOrder,
      })),
      food: food.map((f) => ({ id: f.id, x: f.x, y: f.y })),
      rngState: gameRow.rngState,
    };

    // ── Compute ────────────────────────────────────────────────────────────
    const result = advanceTick(snapshot, gameRow.gridSize);

    // ── Write mutations ────────────────────────────────────────────────────
    applyPlayerMutations(ctx, players, result.playerMutations);
    applyFoodMutations(ctx, gameId, result.foodToDelete, result.foodToSpawn);

    ctx.db.game.id.update({
      ...gameRow,
      phase: result.gameOver ? "finished" : "playing",
      rngState: result.nextRngState,
    });

    if (!result.gameOver) {
      const nextTime =
        ctx.timestamp.microsSinceUnixEpoch + TICK_INTERVAL_MICROS;
      ctx.db.tick_schedule.insert({
        scheduledId: 0n,
        scheduledAt: ScheduleAt.time(nextTime),
        gameId,
      });
    }
  },
);

// Wire up the scheduled table → game_tick reducer (late-binding to avoid circular dep)
registerGameTick(game_tick);

export const restart_game = spacetimedb.reducer((ctx) => {
  const myPlayer = ctx.db.player.identity.find(ctx.sender);
  if (!myPlayer) throw new SenderError("Not in a game");

  const gameRow = ctx.db.game.id.find(myPlayer.gameId);
  if (!gameRow) throw new SenderError("No game exists");
  if (gameRow.hostIdentity.toHexString() !== ctx.sender.toHexString()) {
    throw new SenderError("Only the host can restart");
  }

  const gameId = gameRow.id;

  // Clear food for this game
  for (const f of [...ctx.db.food.food_game_id.filter(gameId)]) {
    ctx.db.food.id.delete(f.id);
  }

  // Clear scheduled ticks for this game
  for (const tick of [...ctx.db.tick_schedule.iter()]) {
    if (tick.gameId === gameId) {
      ctx.db.tick_schedule.scheduledId.delete(tick.scheduledId);
    }
  }

  // Reset players for this game
  for (const p of [...ctx.db.player.player_game_id.filter(gameId)]) {
    ctx.db.player.identity.update({
      ...p,
      alive: true,
      score: 0,
      segments: [],
      direction: "right",
      nextDirection: "right",
      nextDirection2: "",
    });
  }

  // Reset game to lobby
  ctx.db.game.id.update({
    ...gameRow,
    phase: "lobby",
    rngState: ctx.timestamp.microsSinceUnixEpoch,
  });
});
