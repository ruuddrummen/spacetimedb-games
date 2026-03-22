import { SenderError, t } from "spacetimedb/server";
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
import {
  isOpposite,
  directionDelta,
  getStartPosition,
  makeSegments,
  spawnFood,
} from "./helpers";

// ── Helpers ────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanupGame(ctx: any, gameId: bigint) {
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

    // If game is playing and <=1 alive player remains, end
    if (gameRow.phase === "playing") {
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
  let rng = gameRow.rngState;
  const gameId = gameRow.id;

  // Initialize snakes for all players in this game
  const players = [...ctx.db.player.player_game_id.filter(gameId)];
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
    rng = spawnFood(ctx, rng, gridSize, gameId);
  }

  // Update game state
  ctx.db.game.id.update({ ...gameRow, phase: "playing", rngState: rng });

  // Schedule first tick
  const nextTime = ctx.timestamp.microsSinceUnixEpoch + TICK_INTERVAL_MICROS;
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

    if (!isOpposite(p.direction, direction)) {
      ctx.db.player.identity.update({ ...p, nextDirection: direction });
    }
  },
);

export const game_tick = spacetimedb.reducer(
  { arg: tick_schedule.rowType },
  (ctx, { arg: scheduledRow }) => {
    const gameId = scheduledRow.gameId;
    const gameRow = ctx.db.game.id.find(gameId);
    if (!gameRow || gameRow.phase !== "playing") return;

    const gridSize = gameRow.gridSize;
    let rng = gameRow.rngState;
    const allPlayers = [...ctx.db.player.player_game_id.filter(gameId)];
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

    // Collect food positions for this game
    const foodList = [...ctx.db.food.food_game_id.filter(gameId)];
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
        rng = spawnFood(ctx, rng, gridSize, gameId);
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
      gameId,
    });
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
    });
  }

  // Reset game to lobby
  ctx.db.game.id.update({
    ...gameRow,
    phase: "lobby",
    rngState: ctx.timestamp.microsSinceUnixEpoch,
  });
});
