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

// Wire up the scheduled table → gameTick reducer (late-binding to avoid circular dep)
registerGameTick(gameTick);

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
