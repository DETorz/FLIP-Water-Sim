// FLIP_Sim.jsx
import React, { useState, useEffect, useRef } from "react";
import Grid from "./Grid";

export function FLIP_SIM({
  width = 48,
  height = 48,
  dt = 0.016, // how many time steps are taken for each simulation iteration. lower is faster but less stable
  particleCount = 1000,
  cellSize = 15,
  gravityMag = 20,
  collisionDamping = 0.8, // how much energy is perserved for each bounce
  smoothingRadius = 1.33, // each particle repels itself from its neighbors based on this value
  targetDensity = 0.2, // the density of the fluid when it rests. higher means more dense particles
  pressureMultiplier = 0.5, // higher pressure applies when a neighbor enters another's smoothingRadius
  nearPressureMultiplier = 5, // higher pressure applies more force towards close neighbors
  viscosityStrength = 0.5, // higher means more friction between particles
}) {
  const [cellStates, setCellStates] = useState(Array(width * height).fill(0));
  const [positions, setPositions] = useState([]);
  const [showParticles, setShowParticles] = useState(true);

  // total count of cells inside the circle where fluid can occupy
  const nonSolidCount = (() => {
    const cx = (width - 1) / 2;
    const cy = (height - 1) / 2;
    const radius = Math.min(width, height) / 2 - 1;
    let count = 0;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const dx = col - cx;
        const dy = row - cy;
        if (dx * dx + dy * dy <= radius * radius) count++;
      }
    }
    return count;
  })();

  const particlesRef = useRef(
    Array.from({ length: particleCount }, () => ({
      x: Math.random() * (width - 2) + 1,
      y: Math.random() * (height - 2) + 1,
      vx: 0,
      vy: 0,
      density: 0,
      nearDensity: 0,
      pressure: 0,
      nearPressure: 0,
      pressureForceX: 0,
      pressureForceY: 0,
      viscosityForceX: 0,
      viscosityForceY: 0,
    }))
  );
  const predictedRef = useRef(
    Array.from({ length: particleCount }, () => ({ x: 0, y: 0 }))
  );
  const gravityRef = useRef({ x: 0, y: gravityMag });
  const containerRef = useRef(null);
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  const spikyKernelPow2 = (r, h) => {
    const x = h - r;
    return x > 0 ? x * x : 0;
  };
  const spikyKernelPow3 = (r, h) => {
    const x = h - r;
    return x > 0 ? x * x * x : 0;
  };
  const derivativeSpikyPow2 = (r, h) => {
    const x = h - r;
    return x > 0 ? -2 * x : 0;
  };
  const derivativeSpikyPow3 = (r, h) => {
    const x = h - r;
    return x > 0 ? -3 * x * x : 0;
  };
  const viscosityKernel = (r, h) => {
    const h2 = h * h,
      r2 = r * r;
    const x = h2 - r2;
    return x > 0 ? x * x * x : 0;
  };

  const toSimCoords = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / cellSize,
      y: (clientY - rect.top) / cellSize,
    };
  };
  const handleMouseDown = (e) => {
    const p = toSimCoords(e.clientX, e.clientY);
    setDragStart(p);
    setDragEnd(p);
  };
  const handleMouseMove = (e) => {
    if (dragStart) setDragEnd(toSimCoords(e.clientX, e.clientY));
  };
  const handleMouseUp = (e) => {
    if (!dragStart) return;
    const end = toSimCoords(e.clientX, e.clientY);
    const dx = end.x - dragStart.x;
    const dy = end.y - dragStart.y;
    const len = Math.hypot(dx, dy) || 1;
    gravityRef.current = {
      x: (dx / len) * gravityMag,
      y: (dy / len) * gravityMag,
    };
    setDragStart(null);
    setDragEnd(null);
  };

  useEffect(() => {
    let anim;
    const parts = particlesRef.current;
    const pred = predictedRef.current;
    const sqrt = Math.sqrt;
    const invTarget = 1 / (targetDensity + 1e-6);
    const h2 = smoothingRadius * smoothingRadius;

    function step() {
      // 1) gravity and predict
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.vx += gravityRef.current.x * dt;
        p.vy += gravityRef.current.y * dt;
        pred[i].x = p.x + p.vx * dt;
        pred[i].y = p.y + p.vy * dt;
      }
      // 2) spatial hash
      const cellMap = new Map();
      for (let i = 0; i < parts.length; i++) {
        const { x, y } = pred[i];
        const key = `${Math.floor(x / smoothingRadius)},${Math.floor(
          y / smoothingRadius
        )}`;
        (cellMap.get(key) || cellMap.set(key, []).get(key)).push(i);
      }
      // 3) densities
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.density = 0;
        p.nearDensity = 0;
        const { x, y } = pred[i];
        const cx = Math.floor(x / smoothingRadius);
        const cy = Math.floor(y / smoothingRadius);
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            for (const j of cellMap.get(`${cx + ox},${cy + oy}`) || []) {
              const dx = pred[j].x - x;
              const dy = pred[j].y - y;
              const r2 = dx * dx + dy * dy;
              if (r2 > h2) continue;
              const r = sqrt(r2);
              p.density += spikyKernelPow2(r, smoothingRadius);
              p.nearDensity += spikyKernelPow3(r, smoothingRadius);
            }
          }
      }
      // 4) pressures
      for (const p of parts) {
        const dd = p.density - targetDensity;
        const nd = p.nearDensity - targetDensity;
        p.pressure = pressureMultiplier * Math.max(dd, 0);
        p.nearPressure = nearPressureMultiplier * Math.max(nd, 0);
        p.pressureForceX = 0;
        p.pressureForceY = 0;
      }
      // 5) pressure forces
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const { x, y } = pred[i];
        const cx = Math.floor(x / smoothingRadius);
        const cy = Math.floor(y / smoothingRadius);
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            for (const j of cellMap.get(`${cx + ox},${cy + oy}`) || []) {
              if (i === j) continue;
              const q = parts[j];
              const dx = pred[j].x - x;
              const dy = pred[j].y - y;
              const r2 = dx * dx + dy * dy;
              if (r2 > h2) continue;
              const r = sqrt(r2),
                invR = r ? 1 / r : 0;
              const dirX = dx * invR,
                dirY = dy * invR;
              const sp = 0.5 * (p.pressure + q.pressure);
              const sn = 0.5 * (p.nearPressure + q.nearPressure);
              const gradF =
                derivativeSpikyPow2(r, smoothingRadius) * sp * invTarget;
              const gradN =
                derivativeSpikyPow3(r, smoothingRadius) * sn * invTarget;
              p.pressureForceX += dirX * (gradF + gradN);
              p.pressureForceY += dirY * (gradF + gradN);
            }
          }
      }
      // 6) viscosity
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.viscosityForceX = 0;
        p.viscosityForceY = 0;
        const { x, y } = pred[i];
        const cx = Math.floor(x / smoothingRadius);
        const cy = Math.floor(y / smoothingRadius);
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            for (const j of cellMap.get(`${cx + ox},${cy + oy}`) || []) {
              if (i === j) continue;
              const q = parts[j];
              const dx = pred[j].x - x;
              const dy = pred[j].y - y;
              const r2 = dx * dx + dy * dy;
              if (r2 > h2) continue;
              const r = sqrt(r2);
              const w = viscosityKernel(r, smoothingRadius);
              p.viscosityForceX += (q.vx - p.vx) * w;
              p.viscosityForceY += (q.vy - p.vy) * w;
            }
          }
      }
      // 7) integrate & bounce
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const dens = p.density || 1;
        p.vx +=
          (p.pressureForceX / dens) * dt +
          p.viscosityForceX * viscosityStrength * dt;
        p.vy +=
          (p.pressureForceY / dens) * dt +
          p.viscosityForceY * viscosityStrength * dt;
        p.x = pred[i].x + p.vx * dt;
        p.y = pred[i].y + p.vy * dt;
        const cxSim = (width - 1) / 2,
          cySim = (height - 1) / 2,
          radiusSim = Math.min(width, height) / 2 - 1;
        const dxSim = p.x - cxSim,
          dySim = p.y - cySim;
        const dist = Math.sqrt(dxSim * dxSim + dySim * dySim);
        if (dist > radiusSim) {
          const nx = dxSim / dist,
            ny = dySim / dist;
          p.x = cxSim + nx * radiusSim;
          p.y = cySim + ny * radiusSim;
          const vn = p.vx * nx + p.vy * ny;
          p.vx -= (1 + collisionDamping) * vn * nx;
          p.vy -= (1 + collisionDamping) * vn * ny;
        }
      }
      // 8) render update
      const counts = Array(width * height).fill(0);
      const posArr = [];
      for (const p of parts) {
        const ix = Math.floor(p.x),
          iy = Math.floor(p.y);
        counts[iy * width + ix]++;
        posArr.push({ x: p.x, y: p.y });
      }
      setCellStates(counts);
      setPositions(posArr);
      anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim);
  }, [
    width,
    height,
    dt,
    particleCount,
    cellSize,
    gravityMag,
    collisionDamping,
    smoothingRadius,
    targetDensity,
    pressureMultiplier,
    nearPressureMultiplier,
    viscosityStrength,
  ]);

  return (
    <div style={{ textAlign: "center", margin: 8 }}>
      <label>
        <input
          type="checkbox"
          checked={showParticles}
          onChange={(e) => setShowParticles(e.target.checked)}
        />{" "}
        Show particles
      </label>
      <span style={{ marginLeft: 12 }}>Non-solid cells: {nonSolidCount}</span>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          position: "relative",
          width: width * cellSize,
          height: height * cellSize,
          cursor: "crosshair",
          margin: "auto",
        }}
      >
        <Grid
          width={width}
          height={height}
          cellStates={cellStates}
          cellSize={cellSize}
          particlePositions={showParticles ? positions : []}
        />
        {dragStart && dragEnd && (
          <svg
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              pointerEvents: "none",
            }}
          >
            <line
              x1={dragStart.x * cellSize}
              y1={dragStart.y * cellSize}
              x2={dragEnd.x * cellSize}
              y2={dragEnd.y * cellSize}
              stroke="magenta"
              strokeWidth={1}
            />
          </svg>
        )}
      </div>
    </div>
  );
}
