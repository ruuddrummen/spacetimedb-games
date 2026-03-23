import { describe, it, expect } from "vitest";
import {
  advanceTick,
  initializeGame,
  spawnFoodPure,
  isOpposite,
  directionDelta,
  makeSegments,
  rngInt,
  type PlayerSnapshot,
  type GamePhysicsSnapshot,
} from "./engine";

// ── Test helpers ───────────────────────────────────────────────────────────────

function mkPlayer(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    id: "player-1",
    direction: "right",
    nextDirection: "right",
    nextDirection2: "",
    segments: [
      { x: 5, y: 15 },
      { x: 4, y: 15 },
      { x: 3, y: 15 },
    ],
    alive: true,
    score: 0,
    joinOrder: 0,
    ...overrides,
  };
}

function mkSnapshot(
  overrides: Partial<GamePhysicsSnapshot> = {},
): GamePhysicsSnapshot {
  return {
    players: [mkPlayer()],
    food: [],
    rngState: 42n,
    ...overrides,
  };
}

// ── Re-exported helpers ────────────────────────────────────────────────────────

describe("isOpposite", () => {
  it("recognises opposite pairs", () => {
    expect(isOpposite("up", "down")).toBe(true);
    expect(isOpposite("down", "up")).toBe(true);
    expect(isOpposite("left", "right")).toBe(true);
    expect(isOpposite("right", "left")).toBe(true);
  });

  it("rejects non-opposite pairs", () => {
    expect(isOpposite("up", "left")).toBe(false);
    expect(isOpposite("up", "right")).toBe(false);
    expect(isOpposite("up", "up")).toBe(false);
  });
});

describe("directionDelta", () => {
  it("returns correct deltas", () => {
    expect(directionDelta("up")).toEqual({ dx: 0, dy: -1 });
    expect(directionDelta("down")).toEqual({ dx: 0, dy: 1 });
    expect(directionDelta("left")).toEqual({ dx: -1, dy: 0 });
    expect(directionDelta("right")).toEqual({ dx: 1, dy: 0 });
  });

  it("defaults to right for unknown direction", () => {
    expect(directionDelta("unknown")).toEqual({ dx: 1, dy: 0 });
  });
});

// ── spawnFoodPure ──────────────────────────────────────────────────────────────

describe("spawnFoodPure", () => {
  it("spawns food on an unoccupied cell", () => {
    const occupied = new Set<string>();
    const result = spawnFoodPure(42n, 10, occupied);
    expect(result.position).not.toBeNull();
    expect(result.position!.x).toBeGreaterThanOrEqual(0);
    expect(result.position!.x).toBeLessThan(10);
    expect(result.position!.y).toBeGreaterThanOrEqual(0);
    expect(result.position!.y).toBeLessThan(10);
  });

  it("avoids occupied cells", () => {
    const occupied = new Set<string>();
    // Run repeatedly — spawned cell should never be occupied
    let rng = 100n;
    for (let i = 0; i < 20; i++) {
      const result = spawnFoodPure(rng, 10, occupied);
      expect(result.position).not.toBeNull();
      const key = `${result.position!.x},${result.position!.y}`;
      expect(occupied.has(key)).toBe(false);
      occupied.add(key);
      rng = result.nextRngState;
    }
  });

  it("falls back to brute-force when random attempts fail", () => {
    // Fill almost all cells on a tiny 3×3 grid
    const occupied = new Set<string>();
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (x !== 2 || y !== 2) occupied.add(`${x},${y}`);
      }
    }
    // Only (2,2) is free
    const result = spawnFoodPure(42n, 3, occupied);
    expect(result.position).toEqual({ x: 2, y: 2 });
  });

  it("returns null position when grid is fully occupied", () => {
    const occupied = new Set<string>();
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        occupied.add(`${x},${y}`);
      }
    }
    const result = spawnFoodPure(42n, 3, occupied);
    expect(result.position).toBeNull();
  });

  it("advances RNG state even when grid is full", () => {
    const occupied = new Set<string>();
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        occupied.add(`${x},${y}`);
      }
    }
    const result = spawnFoodPure(42n, 3, occupied);
    expect(result.nextRngState).not.toBe(42n);
  });
});

// ── advanceTick — movement ─────────────────────────────────────────────────────

describe("advanceTick — movement", () => {
  it("moves snake forward by one cell", () => {
    const snapshot = mkSnapshot();
    const result = advanceTick(snapshot, 30);

    expect(result.playerMutations).toHaveLength(1);
    const m = result.playerMutations[0];
    expect(m.alive).toBe(true);
    // Head should be at (6, 15)
    expect(m.segments[0]).toEqual({ x: 6, y: 15 });
    // Tail should be popped — length stays 3
    expect(m.segments).toHaveLength(3);
    expect(m.segments).toEqual([
      { x: 6, y: 15 },
      { x: 5, y: 15 },
      { x: 4, y: 15 },
    ]);
  });

  it("respects queued nextDirection", () => {
    const snapshot = mkSnapshot({
      players: [mkPlayer({ nextDirection: "up" })],
    });
    const result = advanceTick(snapshot, 30);
    const m = result.playerMutations[0];
    expect(m.segments[0]).toEqual({ x: 5, y: 14 });
    expect(m.direction).toBe("up");
  });

  it("ignores opposite nextDirection", () => {
    const snapshot = mkSnapshot({
      players: [mkPlayer({ direction: "right", nextDirection: "left" })],
    });
    const result = advanceTick(snapshot, 30);
    const m = result.playerMutations[0];
    // Should continue right, not reverse
    expect(m.segments[0]).toEqual({ x: 6, y: 15 });
    expect(m.direction).toBe("right");
  });
});

// ── advanceTick — wall death ───────────────────────────────────────────────────

describe("advanceTick — wall death", () => {
  it("kills snake hitting right wall", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          segments: [
            { x: 29, y: 15 },
            { x: 28, y: 15 },
            { x: 27, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].alive).toBe(false);
    expect(result.playerMutations[0].segments).toEqual([]);
  });

  it("kills snake hitting top wall", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "up",
          nextDirection: "up",
          segments: [
            { x: 5, y: 0 },
            { x: 5, y: 1 },
            { x: 5, y: 2 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].alive).toBe(false);
  });

  it("kills snake hitting left wall", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "left",
          nextDirection: "left",
          segments: [
            { x: 0, y: 15 },
            { x: 1, y: 15 },
            { x: 2, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].alive).toBe(false);
  });

  it("kills snake hitting bottom wall", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "down",
          nextDirection: "down",
          segments: [
            { x: 5, y: 29 },
            { x: 5, y: 28 },
            { x: 5, y: 27 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].alive).toBe(false);
  });
});

// ── advanceTick — body collision ───────────────────────────────────────────────

describe("advanceTick — body collision", () => {
  it("kills snake running into its own body", () => {
    // Snake curled so next move hits its own body
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "down",
          nextDirection: "down",
          segments: [
            { x: 10, y: 10 },
            { x: 10, y: 9 },
            { x: 11, y: 9 },
            { x: 11, y: 10 },
            { x: 11, y: 11 },
            { x: 10, y: 11 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].alive).toBe(false);
  });

  it("kills snake running into another snake's body", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          id: "p1",
          direction: "right",
          nextDirection: "right",
          segments: [
            { x: 9, y: 10 },
            { x: 8, y: 10 },
            { x: 7, y: 10 },
          ],
        }),
        mkPlayer({
          id: "p2",
          direction: "up",
          nextDirection: "up",
          segments: [
            { x: 10, y: 12 },
            { x: 10, y: 11 },
            { x: 10, y: 10 }, // p1's head will move to (10,10) — but this is p2's body
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    const p1 = result.playerMutations.find((m) => m.id === "p1")!;
    expect(p1.alive).toBe(false);
  });
});

// ── advanceTick — head-to-head ─────────────────────────────────────────────────

describe("advanceTick — head-to-head collision", () => {
  it("kills both snakes on head-to-head collision", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          id: "p1",
          direction: "right",
          nextDirection: "right",
          segments: [
            { x: 9, y: 15 },
            { x: 8, y: 15 },
            { x: 7, y: 15 },
          ],
        }),
        mkPlayer({
          id: "p2",
          direction: "left",
          nextDirection: "left",
          segments: [
            { x: 11, y: 15 },
            { x: 12, y: 15 },
            { x: 13, y: 15 },
          ],
        }),
      ],
    });
    // Both heads move to (10, 15)
    const result = advanceTick(snapshot, 30);
    const p1 = result.playerMutations.find((m) => m.id === "p1")!;
    const p2 = result.playerMutations.find((m) => m.id === "p2")!;
    expect(p1.alive).toBe(false);
    expect(p2.alive).toBe(false);
  });
});

// ── advanceTick — food consumption ─────────────────────────────────────────────

describe("advanceTick — food consumption", () => {
  it("grows snake, increments score, deletes food, spawns new food", () => {
    const snapshot = mkSnapshot({
      food: [{ id: 99n, x: 6, y: 15 }],
    });
    const result = advanceTick(snapshot, 30);
    const m = result.playerMutations[0];

    expect(m.score).toBe(1);
    // Snake should grow — tail NOT popped
    expect(m.segments).toHaveLength(4);
    expect(m.segments[0]).toEqual({ x: 6, y: 15 });

    expect(result.foodToDelete).toContain(99n);
    expect(result.foodToSpawn).toHaveLength(1);
  });

  it("spawns replacement food on a different cell", () => {
    const snapshot = mkSnapshot({
      food: [{ id: 1n, x: 6, y: 15 }],
    });
    const result = advanceTick(snapshot, 30);
    const spawned = result.foodToSpawn[0];
    // Should not overlap with any snake segment
    const occupied = new Set(
      result.playerMutations[0].segments.map(
        (s) => `${s.x},${s.y}`,
      ),
    );
    expect(occupied.has(`${spawned.x},${spawned.y}`)).toBe(false);
  });
});

// ── advanceTick — direction buffer ─────────────────────────────────────────────

describe("advanceTick — direction buffer", () => {
  it("shifts nextDirection2 into nextDirection after move", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "right",
          nextDirection: "up",
          nextDirection2: "left",
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    const m = result.playerMutations[0];
    // direction should become "up" (from nextDirection)
    expect(m.direction).toBe("up");
    // nextDirection should become "left" (from nextDirection2)
    expect(m.nextDirection).toBe("left");
    // nextDirection2 should be cleared
    expect(m.nextDirection2).toBe("");
  });

  it("rejects opposite nextDirection2", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          direction: "right",
          nextDirection: "up",
          nextDirection2: "down", // opposite of "up"
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    const m = result.playerMutations[0];
    expect(m.direction).toBe("up");
    // "down" is opposite to new direction "up", so nextDirection should fall back
    expect(m.nextDirection).toBe("up");
  });

  it("clears nextDirection2 after shift", () => {
    const snapshot = mkSnapshot({
      players: [mkPlayer({ nextDirection: "up", nextDirection2: "left" })],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.playerMutations[0].nextDirection2).toBe("");
  });
});

// ── advanceTick — game over ────────────────────────────────────────────────────

describe("advanceTick — game over", () => {
  it("ends game when solo player dies", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          segments: [
            { x: 29, y: 15 },
            { x: 28, y: 15 },
            { x: 27, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(true);
  });

  it("ends game when last multiplayer snake alive dies", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({ id: "p1", alive: false, segments: [] }),
        mkPlayer({
          id: "p2",
          segments: [
            { x: 29, y: 15 },
            { x: 28, y: 15 },
            { x: 27, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(true);
  });

  it("ends multiplayer game when only one player remains alive", () => {
    // Two alive players, both die from head-to-head
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          id: "p1",
          direction: "right",
          nextDirection: "right",
          segments: [
            { x: 9, y: 15 },
            { x: 8, y: 15 },
            { x: 7, y: 15 },
          ],
        }),
        mkPlayer({
          id: "p2",
          direction: "left",
          nextDirection: "left",
          segments: [
            { x: 11, y: 15 },
            { x: 12, y: 15 },
            { x: 13, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(true);
  });

  it("continues game when multiple players are still alive", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({
          id: "p1",
          segments: [
            { x: 5, y: 15 },
            { x: 4, y: 15 },
            { x: 3, y: 15 },
          ],
        }),
        mkPlayer({
          id: "p2",
          direction: "left",
          nextDirection: "left",
          segments: [
            { x: 20, y: 15 },
            { x: 21, y: 15 },
            { x: 22, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(false);
  });

  it("returns gameOver=true when no alive players exist", () => {
    const snapshot = mkSnapshot({
      players: [mkPlayer({ alive: false, segments: [] })],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(true);
    expect(result.playerMutations).toHaveLength(0);
  });

  it("ends multiplayer when one player was already dead and last alive player dies", () => {
    const snapshot = mkSnapshot({
      players: [
        mkPlayer({ id: "dead1", alive: false, segments: [] }),
        mkPlayer({ id: "dead2", alive: false, segments: [] }),
        mkPlayer({
          id: "p3",
          direction: "right",
          nextDirection: "right",
          segments: [
            { x: 29, y: 15 },
            { x: 28, y: 15 },
            { x: 27, y: 15 },
          ],
        }),
      ],
    });
    const result = advanceTick(snapshot, 30);
    expect(result.gameOver).toBe(true);
  });
});

// ── advanceTick — RNG determinism ──────────────────────────────────────────────

describe("advanceTick — RNG determinism", () => {
  it("produces identical output for identical input", () => {
    const snapshot = mkSnapshot({
      food: [{ id: 1n, x: 6, y: 15 }],
      rngState: 12345n,
    });

    const result1 = advanceTick(snapshot, 30);
    const result2 = advanceTick(snapshot, 30);

    expect(result1).toEqual(result2);
  });

  it("produces different output for different RNG seeds", () => {
    const base = {
      food: [{ id: 1n, x: 6, y: 15 }] as const,
    };
    const snap1 = mkSnapshot({ ...base, rngState: 100n });
    const snap2 = mkSnapshot({ ...base, rngState: 200n });

    const result1 = advanceTick(snap1, 30);
    const result2 = advanceTick(snap2, 30);

    // Both eat food & spawn replacement, but different RNG → different spawn positions (very likely)
    expect(result1.nextRngState).not.toBe(result2.nextRngState);
  });
});

// ── initializeGame ─────────────────────────────────────────────────────────────

describe("initializeGame", () => {
  it("creates player mutations with correct starting positions", () => {
    const players = [
      { id: "p1", joinOrder: 0 },
      { id: "p2", joinOrder: 1 },
    ];
    const result = initializeGame(players, 30, 42n, 3, 3);

    expect(result.playerMutations).toHaveLength(2);

    const m1 = result.playerMutations.find((m) => m.id === "p1")!;
    expect(m1.alive).toBe(true);
    expect(m1.score).toBe(0);
    expect(m1.segments).toHaveLength(3);
    expect(m1.direction).toBe("right"); // joinOrder 0 → right
    expect(m1.nextDirection).toBe("right");
    expect(m1.nextDirection2).toBe("");

    const m2 = result.playerMutations.find((m) => m.id === "p2")!;
    expect(m2.direction).toBe("left"); // joinOrder 1 → left
    expect(m2.segments).toHaveLength(3);
  });

  it("spawns the requested number of food items", () => {
    const players = [{ id: "p1", joinOrder: 0 }];
    const result = initializeGame(players, 30, 42n, 5, 3);

    expect(result.foodSpawns).toHaveLength(5);
  });

  it("food spawns do not overlap player segments", () => {
    const players = [
      { id: "p1", joinOrder: 0 },
      { id: "p2", joinOrder: 1 },
    ];
    const result = initializeGame(players, 30, 42n, 10, 3);

    const occupied = new Set<string>();
    for (const m of result.playerMutations) {
      for (const seg of m.segments) {
        occupied.add(`${seg.x},${seg.y}`);
      }
    }

    for (const f of result.foodSpawns) {
      expect(occupied.has(`${f.x},${f.y}`)).toBe(false);
    }
  });

  it("food spawns do not overlap each other", () => {
    const players = [{ id: "p1", joinOrder: 0 }];
    const result = initializeGame(players, 30, 42n, 20, 3);

    const seen = new Set<string>();
    for (const f of result.foodSpawns) {
      const key = `${f.x},${f.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("is deterministic with same inputs", () => {
    const players = [
      { id: "p1", joinOrder: 0 },
      { id: "p2", joinOrder: 1 },
    ];
    const r1 = initializeGame(players, 30, 42n, 5, 3);
    const r2 = initializeGame(players, 30, 42n, 5, 3);

    expect(r1).toEqual(r2);
  });

  it("advances RNG state", () => {
    const players = [{ id: "p1", joinOrder: 0 }];
    const result = initializeGame(players, 30, 42n, 3, 3);
    expect(result.nextRngState).not.toBe(42n);
  });
});

// ── rngInt ──────────────────────────────────────────────────────────────────────

describe("rngInt", () => {
  it("returns value in range [0, max)", () => {
    let state = 12345n;
    for (let i = 0; i < 100; i++) {
      let val: number;
      [state, val] = rngInt(state, 30);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(30);
    }
  });

  it("advances RNG state", () => {
    const [next] = rngInt(42n, 10);
    expect(next).not.toBe(42n);
  });
});

// ── makeSegments ───────────────────────────────────────────────────────────────

describe("makeSegments", () => {
  it("creates segments extending opposite to direction", () => {
    const segs = makeSegments(5, 15, "right", 3);
    expect(segs).toEqual([
      { x: 5, y: 15 },
      { x: 4, y: 15 },
      { x: 3, y: 15 },
    ]);
  });

  it("handles up direction", () => {
    const segs = makeSegments(5, 5, "up", 3);
    expect(segs).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
    ]);
  });

  it("handles left direction", () => {
    const segs = makeSegments(10, 5, "left", 3);
    expect(segs).toEqual([
      { x: 10, y: 5 },
      { x: 11, y: 5 },
      { x: 12, y: 5 },
    ]);
  });
});
