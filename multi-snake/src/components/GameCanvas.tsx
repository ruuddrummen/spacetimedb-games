import { useRef, useEffect } from "react";
import { CELL_SIZE } from "../constants";
import { styles } from "../styles";
import type { Player, Food } from "../module_bindings/types";

export function GameCanvas({
  players,
  foods,
  gridSize,
}: {
  players: readonly Player[];
  foods: readonly Food[];
  gridSize: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasSize = gridSize * CELL_SIZE;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Background
    ctx.fillStyle = "#0f0f23";
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Grid
    ctx.strokeStyle = "#1a1a3a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= gridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(i * CELL_SIZE, 0);
      ctx.lineTo(i * CELL_SIZE, canvasSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * CELL_SIZE);
      ctx.lineTo(canvasSize, i * CELL_SIZE);
      ctx.stroke();
    }

    // Food
    for (const f of foods) {
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(
        f.x * CELL_SIZE + CELL_SIZE / 2,
        f.y * CELL_SIZE + CELL_SIZE / 2,
        CELL_SIZE / 2 - 2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      // Glow
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Snakes
    for (const p of players) {
      if (p.segments.length === 0) continue;
      const alpha = p.alive ? 1 : 0.3;
      ctx.globalAlpha = alpha;

      for (let i = 0; i < p.segments.length; i++) {
        const seg = p.segments[i];
        const x = seg.x * CELL_SIZE + 1;
        const y = seg.y * CELL_SIZE + 1;
        const size = CELL_SIZE - 2;

        if (i === 0) {
          // Head - rounded
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.roundRect(x, y, size, size, 5);
          ctx.fill();
          // Eyes
          ctx.fillStyle = "#fff";
          const eyeSize = 3;
          ctx.fillRect(
            x + size * 0.25 - eyeSize / 2,
            y + size * 0.35 - eyeSize / 2,
            eyeSize,
            eyeSize,
          );
          ctx.fillRect(
            x + size * 0.75 - eyeSize / 2,
            y + size * 0.35 - eyeSize / 2,
            eyeSize,
            eyeSize,
          );
        } else {
          // Body
          ctx.fillStyle = p.color;
          ctx.fillRect(x, y, size, size);
        }
      }
      ctx.globalAlpha = 1;
    }
  }, [players, foods, gridSize, canvasSize]);

  return (
    <canvas
      ref={canvasRef}
      width={canvasSize}
      height={canvasSize}
      style={styles.canvas}
    />
  );
}
