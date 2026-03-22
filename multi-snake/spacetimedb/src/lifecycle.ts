import spacetimedb from "./schema";

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
