// ── Tick Engine ────────────────────────────────────────────────────────────────
//
// Pure computation module — no ctx, no DB, no I/O.
// All game physics live here: movement, collision, food, scoring, game-over.

import {
  isOpposite,
  directionDelta,
  rngInt,
  getStartPosition,
  makeSegments,
} from "./helpers";

// Re-export pure helpers for external consumers
export { isOpposite, directionDelta, rngInt, getStartPosition, makeSegments };

// ── Types ──────────────────────────────────────────────────────────────────────

export type Position = { x: number; y: number };

export interface PlayerSnapshot {
  id: string; // identity hex string
  direction: string;
  nextDirection: string;
  nextDirection2: string;
  segments: Position[];
  alive: boolean;
  score: number;
  joinOrder: number;
}

export interface FoodSnapshot {
  id: bigint;
  x: number;
  y: number;
}

export interface GamePhysicsSnapshot {
  players: PlayerSnapshot[];
  food: FoodSnapshot[];
  rngState: bigint;
}

export interface PlayerMutation {
  id: string;
  direction: string;
  nextDirection: string;
  nextDirection2: string;
  segments: Position[];
  alive: boolean;
  score: number;
}

export interface TickResult {
  playerMutations: PlayerMutation[];
  foodToDelete: bigint[];
  foodToSpawn: Position[];
  gameOver: boolean;
  nextRngState: bigint;
}

export interface InitializeResult {
  playerMutations: PlayerMutation[];
  foodSpawns: Position[];
  nextRngState: bigint;
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/**
 * Find a random unoccupied cell for food. Returns null only when the entire
 * grid is occupied (extremely unlikely but handled).
 */
export function spawnFoodPure(
  rngState: bigint,
  gridSize: number,
  occupied: Set<string>,
): { position: Position | null; nextRngState: bigint } {
  let state = rngState;
  let attempts = 0;
  while (attempts < 100) {
    let x: number, y: number;
    [state, x] = rngInt(state, gridSize);
    [state, y] = rngInt(state, gridSize);
    if (!occupied.has(`${x},${y}`)) {
      return { position: { x, y }, nextRngState: state };
    }
    attempts++;
  }
  // Fallback: first empty cell
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      if (!occupied.has(`${x},${y}`)) {
        return { position: { x, y }, nextRngState: state };
      }
    }
  }
  return { position: null, nextRngState: state };
}

/**
 * Build the set of occupied cells, matching the same view that the original
 * spawnFood saw when reading from the database mid-loop.
 *
 * @param allPlayers       every player in the game (alive or not)
 * @param updatedSegments  segments already written for players processed so far
 * @param updatedAlive     alive flag already written for players processed so far
 * @param remainingFood    food map with eaten entries removed (key = "x,y")
 * @param spawnedFood      positions of food spawned earlier in this tick
 */
function buildOccupiedSet(
  allPlayers: PlayerSnapshot[],
  updatedSegments: Map<string, Position[]>,
  updatedAlive: Map<string, boolean>,
  remainingFood: Map<string, bigint>,
  spawnedFood: Position[],
): Set<string> {
  const occupied = new Set<string>();

  for (const p of allPlayers) {
    const alive = updatedAlive.has(p.id) ? updatedAlive.get(p.id)! : p.alive;
    if (!alive) continue;
    const segs = updatedSegments.has(p.id)
      ? updatedSegments.get(p.id)!
      : p.segments;
    for (const seg of segs) {
      occupied.add(`${seg.x},${seg.y}`);
    }
  }

  for (const key of remainingFood.keys()) {
    occupied.add(key);
  }
  for (const pos of spawnedFood) {
    occupied.add(`${pos.x},${pos.y}`);
  }

  return occupied;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Advance the game by one tick.  100 % pure — reads only from the snapshot,
 * returns only mutation descriptions.
 */
export function advanceTick(
  snapshot: GamePhysicsSnapshot,
  gridSize: number,
): TickResult {
  const allPlayers = snapshot.players;
  const alivePlayers = allPlayers.filter((p) => p.alive);
  let rng = snapshot.rngState;

  const playerMutations: PlayerMutation[] = [];
  const foodToDelete: bigint[] = [];
  const foodToSpawn: Position[] = [];

  // No alive players → game over immediately
  if (alivePlayers.length === 0) {
    return {
      playerMutations: [],
      foodToDelete: [],
      foodToSpawn: [],
      gameOver: true,
      nextRngState: rng,
    };
  }

  // ── 1. Compute new head positions ────────────────────────────────────────

  const newHeads = new Map<
    string,
    { x: number; y: number; direction: string }
  >();
  for (const p of alivePlayers) {
    let dir = p.nextDirection;
    if (isOpposite(p.direction, dir)) dir = p.direction;
    const { dx, dy } = directionDelta(dir);
    const head = p.segments[0];
    newHeads.set(p.id, {
      x: head.x + dx,
      y: head.y + dy,
      direction: dir,
    });
  }

  // ── 2. Collect body positions for collision detection ────────────────────

  const bodyPositions = new Set<string>();
  for (const p of alivePlayers) {
    for (const seg of p.segments) {
      bodyPositions.add(`${seg.x},${seg.y}`);
    }
  }

  // ── 3. Detect deaths ────────────────────────────────────────────────────

  const deaths = new Set<string>();
  for (const p of alivePlayers) {
    const id = p.id;
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

  // ── 4. Build food lookup ─────────────────────────────────────────────────

  const foodMap = new Map<string, bigint>();
  for (const f of snapshot.food) {
    foodMap.set(`${f.x},${f.y}`, f.id);
  }

  // Track virtual DB state as we process each player sequentially
  const updatedSegments = new Map<string, Position[]>();
  const updatedAlive = new Map<string, boolean>();

  // ── 5. Apply moves ──────────────────────────────────────────────────────

  for (const p of alivePlayers) {
    const id = p.id;
    const nh = newHeads.get(id)!;

    if (deaths.has(id)) {
      playerMutations.push({
        id,
        direction: p.direction,
        nextDirection: p.nextDirection,
        nextDirection2: p.nextDirection2,
        segments: [],
        alive: false,
        score: p.score,
      });
      updatedSegments.set(id, []);
      updatedAlive.set(id, false);
      continue;
    }

    const newSegments = [{ x: nh.x, y: nh.y }, ...p.segments];
    let newScore = p.score;

    // Check food collision
    const foodKey = `${nh.x},${nh.y}`;
    if (foodMap.has(foodKey)) {
      const foodId = foodMap.get(foodKey)!;
      foodToDelete.push(foodId);
      foodMap.delete(foodKey);
      newScore += 1;

      // Spawn replacement food (pure)
      const occupied = buildOccupiedSet(
        allPlayers,
        updatedSegments,
        updatedAlive,
        foodMap,
        foodToSpawn,
      );
      const spawn = spawnFoodPure(rng, gridSize, occupied);
      rng = spawn.nextRngState;
      if (spawn.position) {
        foodToSpawn.push(spawn.position);
      }
    } else {
      newSegments.pop();
    }

    // Shift direction buffer: nextDirection2 becomes nextDirection
    const shifted =
      p.nextDirection2 && !isOpposite(nh.direction, p.nextDirection2)
        ? p.nextDirection2
        : nh.direction;

    playerMutations.push({
      id,
      direction: nh.direction,
      nextDirection: shifted,
      nextDirection2: "",
      segments: newSegments,
      score: newScore,
      alive: true,
    });

    updatedSegments.set(id, newSegments);
    updatedAlive.set(id, true);
  }

  // ── 6. Check end conditions ──────────────────────────────────────────────

  const stillAlive = allPlayers
    .map((p) => p.id)
    .filter(
      (id) => !deaths.has(id) && alivePlayers.some((a) => a.id === id),
    );
  const totalPlayers = allPlayers.length;

  const gameOver =
    stillAlive.length === 0 ||
    (totalPlayers > 1 && stillAlive.length <= 1);

  return {
    playerMutations,
    foodToDelete,
    foodToSpawn,
    gameOver,
    nextRngState: rng,
  };
}

/**
 * Set up a fresh game: place snakes and spawn initial food.
 * Pure — returns mutation descriptions only.
 */
export function initializeGame(
  players: Pick<PlayerSnapshot, "id" | "joinOrder">[],
  gridSize: number,
  initialRngState: bigint,
  initialFoodCount: number,
  initialSnakeLength: number,
): InitializeResult {
  const playerMutations: PlayerMutation[] = [];

  for (const p of players) {
    const start = getStartPosition(p.joinOrder, gridSize);
    const segs = makeSegments(
      start.x,
      start.y,
      start.direction,
      initialSnakeLength,
    );
    playerMutations.push({
      id: p.id,
      direction: start.direction,
      nextDirection: start.direction,
      nextDirection2: "",
      alive: true,
      score: 0,
      segments: segs,
    });
  }

  // Build occupied set from all player segments
  const occupied = new Set<string>();
  for (const pm of playerMutations) {
    for (const seg of pm.segments) {
      occupied.add(`${seg.x},${seg.y}`);
    }
  }

  let rng = initialRngState;
  const foodSpawns: Position[] = [];

  for (let i = 0; i < initialFoodCount; i++) {
    const spawn = spawnFoodPure(rng, gridSize, occupied);
    rng = spawn.nextRngState;
    if (spawn.position) {
      foodSpawns.push(spawn.position);
      occupied.add(`${spawn.position.x},${spawn.position.y}`);
    }
  }

  return { playerMutations, foodSpawns, nextRngState: rng };
}
