// ── Helpers ────────────────────────────────────────────────────────────────────

function nextRng(state: bigint): bigint {
  return (
    (state * 6364136223846793005n + 1442695040888963407n) & 0xffffffffffffffffn
  );
}

export function rngInt(state: bigint, max: number): [bigint, number] {
  const next = nextRng(state);
  return [next, Number((next >> 33n) % BigInt(max))];
}

export function isOpposite(d1: string, d2: string): boolean {
  return (
    (d1 === "up" && d2 === "down") ||
    (d1 === "down" && d2 === "up") ||
    (d1 === "left" && d2 === "right") ||
    (d1 === "right" && d2 === "left")
  );
}

export function directionDelta(d: string): { dx: number; dy: number } {
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

export function getStartPosition(joinOrder: number, gridSize: number) {
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

export function makeSegments(
  x: number,
  y: number,
  direction: string,
  length: number,
) {
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
export function spawnFood(
  ctx: any,
  rngState: bigint,
  gridSize: number,
  gameId: bigint,
): bigint {
  const occupied = new Set<string>();
  for (const p of ctx.db.player.player_game_id.filter(gameId)) {
    if (!p.alive) continue;
    for (const seg of p.segments) {
      occupied.add(`${seg.x},${seg.y}`);
    }
  }
  for (const f of ctx.db.food.food_game_id.filter(gameId)) {
    occupied.add(`${f.x},${f.y}`);
  }

  let state = rngState;
  let attempts = 0;
  while (attempts < 100) {
    let x: number, y: number;
    [state, x] = rngInt(state, gridSize);
    [state, y] = rngInt(state, gridSize);
    if (!occupied.has(`${x},${y}`)) {
      ctx.db.food.insert({ id: 0n, gameId, x, y });
      return state;
    }
    attempts++;
  }
  // Fallback: first empty cell
  for (let x = 0; x < gridSize; x++) {
    for (let y = 0; y < gridSize; y++) {
      if (!occupied.has(`${x},${y}`)) {
        ctx.db.food.insert({ id: 0n, gameId, x, y });
        return state;
      }
    }
  }
  return state;
}
