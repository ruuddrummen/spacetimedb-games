import spacetimedb from "./schema";

// ── Lifecycle ──────────────────────────────────────────────────────────────────

export const onConnect = spacetimedb.clientConnected((_ctx) => {});

export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const p = ctx.db.player.identity.find(ctx.sender);
  if (!p) return;

  const gameRow = ctx.db.game.id.find(p.gameId);
  if (!gameRow) {
    // Orphaned player row, just clean it up
    ctx.db.player.identity.delete(ctx.sender);
    return;
  }

  const isHost =
    gameRow.hostIdentity.toHexString() === ctx.sender.toHexString();

  if (isHost) {
    // Host disconnected — close the entire lobby
    for (const pl of [...ctx.db.player.player_game_id.filter(gameRow.id)]) {
      ctx.db.player.identity.delete(pl.identity);
    }
    for (const f of [...ctx.db.food.food_game_id.filter(gameRow.id)]) {
      ctx.db.food.id.delete(f.id);
    }
    for (const tick of [...ctx.db.tick_schedule.iter()]) {
      if (tick.gameId === gameRow.id) {
        ctx.db.tick_schedule.scheduledId.delete(tick.scheduledId);
      }
    }
    ctx.db.game.id.delete(gameRow.id);
  } else {
    // Non-host: mark dead if playing, then remove
    if (gameRow.phase === "playing") {
      ctx.db.player.identity.update({ ...p, alive: false, segments: [] });
    }
    ctx.db.player.identity.delete(ctx.sender);
    ctx.db.game.id.update({
      ...gameRow,
      playerCount: gameRow.playerCount > 0 ? gameRow.playerCount - 1 : 0,
    });

    // If playing and <=1 alive player remains, end game
    if (gameRow.phase === "playing") {
      const remaining = [
        ...ctx.db.player.player_game_id.filter(gameRow.id),
      ].filter((pl) => pl.alive);
      if (remaining.length <= 1) {
        const updatedGame = ctx.db.game.id.find(gameRow.id);
        if (updatedGame) {
          ctx.db.game.id.update({ ...updatedGame, phase: "finished" });
        }
      }
    }
  }
});
