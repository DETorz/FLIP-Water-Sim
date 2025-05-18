// FLIP_Sim.jsx
import React, { useState, useEffect, useRef } from 'react';
import Grid from './Grid';

class FLIP_Particle {
  constructor(x, y, vx = 0, vy = 0, mass = 1) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.mass = mass;
  }
}

/**
 * FLIP_Sim: FLIP solver with physics-based spring repulsion
 * Applies smooth spring forces based on particle masses
 */
export function FLIP_SIM({
  width = 48,
  height = 48,
  dt = 0.1,
  particleCount = 500,
  cellSize = 15,
  gravityMag = 9.81,
  pressureIters = 4,
  buoyancy = 2,
  springStiffness = 50,
  springDamping = 2, 
}) {
  // State
  const [cellStates, setCellStates] = useState(Array(width * height).fill(0));
  const [positions, setPositions] = useState([]);
  const [gravity, setGravity] = useState({ x: 0, y: gravityMag });
  const [showParticles, setShowParticles] = useState(true);

  // Mouse drag for gravity direction
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurr, setDragCurr] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  const onDown = e => {
    const r = wrapperRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX - r.left, y: e.clientY - r.top });
    setDragCurr({ x: e.clientX - r.left, y: e.clientY - r.top });
    setDragging(true);
  };
  const onMove = e => {
    if (!dragging) return;
    const r = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    setDragCurr({ x, y });
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    const n = Math.hypot(dx, dy) || 1;
    setGravity({ x: (dx / n) * gravityMag, y: (dy / n) * gravityMag });
  };
  const onUp = () => setDragging(false);

  // Initialize particles
  const particlesRef = useRef(
    Array.from({ length: particleCount }, () => {
      const x = 1 + Math.random() * (width - 2);
      const y = 1 + Math.random() * (height - 2);
      const a = Math.random() * 2 * Math.PI;
      const s = Math.random() * 0.5;
      return new FLIP_Particle(x, y, Math.cos(a) * s, Math.sin(a) * s);
    })
  );

  // Grid buffers
  const massArr   = useRef(new Float32Array(width * height));
  const velArr    = useRef(new Float32Array(width * height * 2));
  const oldArr    = useRef(new Float32Array(width * height * 2));
  const presArr   = useRef(new Float32Array(width * height));
  const divArr    = useRef(new Float32Array(width * height));

  useEffect(() => {
    let anim;
    const personalSpace = 1;

    function step() {
      const m = massArr.current;
      const v = velArr.current;
      const ov = oldArr.current;
      const p = presArr.current;
      const d = divArr.current;

      // Clear grids
      m.fill(0);
      v.fill(0);
      ov.fill(0);
      p.fill(0);
      d.fill(0);

      // P2G
      particlesRef.current.forEach(pt => {
        const i = Math.floor(pt.x);
        const j = Math.floor(pt.y);
        if (i < 1 || i >= width - 1 || j < 1 || j >= height - 1) return;
        const idx = j * width + i;
        m[idx] += pt.mass;
        v[2 * idx]     += pt.mass * pt.vx;
        v[2 * idx + 1] += pt.mass * pt.vy;
      });

      // Grid velocities
      for (let idx = 0; idx < width * height; idx++) {
        if (m[idx] > 0) {
          const vx = v[2 * idx]     / m[idx];
          const vy = v[2 * idx + 1] / m[idx];
          ov[2 * idx]     = vx;
          ov[2 * idx + 1] = vy;
          v[2 * idx]     = vx;
          v[2 * idx + 1] = vy;
        }
      }

      // Apply gravity
      const { x: gx, y: gy } = gravity;
      for (let idx = 0; idx < width * height; idx++) {
        if (m[idx] > 0) {
          v[2 * idx]     += gx * dt;
          v[2 * idx + 1] += gy * dt;
        }
      }

      // Pressure projection
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const uxR = v[2 * (idx + 1)], uxL = v[2 * (idx - 1)];
          const uyD = v[2 * ((y + 1) * width + x) + 1], uyU = v[2 * ((y - 1) * width + x) + 1];
          d[idx] = (uxR - uxL + uyD - uyU) * 0.5;
          p[idx] = 0;
        }
      }
      for (let it = 0; it < pressureIters; it++) {
        for (let y = 1; y < height - 1; y++) {
          for (let x = 1; x < width - 1; x++) {
            const idx = y * width + x;
            p[idx] = (p[idx - 1] + p[idx + 1] + p[idx - width] + p[idx + width] - d[idx]) * 0.25;
          }
        }
      }

      // Subtract gradient & buoyancy
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const gradX = (p[idx + 1] - p[idx - 1]) * 0.5;
          const gradY = (p[idx + width] - p[idx - width]) * 0.5;
          v[2 * idx]     -= gradX;
          v[2 * idx + 1] -= gradY;
          v[2 * idx + 1] += p[idx] * buoyancy * dt;
        }
      }

      // G2P
      particlesRef.current.forEach(pt => {
        const i = Math.floor(pt.x);
        const j = Math.floor(pt.y);
        if (i < 1 || i >= width - 1 || j < 1 || j >= height - 1) return;
        const idx = j * width + i;
        pt.vx += v[2 * idx]   - ov[2 * idx];
        pt.vy += v[2 * idx + 1] - ov[2 * idx + 1];
      });

      // Advect & clamp
      particlesRef.current.forEach(pt => {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.x = Math.min(Math.max(pt.x, 1), width - 2);
        pt.y = Math.min(Math.max(pt.y, 1), height - 2);
      });

      // Build hash-grid
      const buckets = new Map();
      const keyOfCell = (hx, hy) => `${hx},${hy}`;
      particlesRef.current.forEach((pt, i) => {
        const hx = Math.floor(pt.x);
        const hy = Math.floor(pt.y);
        const key = keyOfCell(hx, hy);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
      });

      // Spring repulsion
      particlesRef.current.forEach((p1, i) => {
        const hx = Math.floor(p1.x);
        const hy = Math.floor(p1.y);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const bucket = buckets.get(keyOfCell(hx + ox, hy + oy));
            if (!bucket) continue;
            bucket.forEach(j => {
              if (j <= i) return;
              const p2 = particlesRef.current[j];
              const dx = p2.x - p1.x;
              const dy = p2.y - p1.y;
              const dist = Math.hypot(dx, dy);
              if (dist > 0 && dist < personalSpace * 1.2) {
                const count = bucket.length;
                const rest = personalSpace * (0.8 + 0.2 * Math.min(count / 6, 1));
                const delta = dist - rest;
                const nx = dx / dist;
                const ny = dy / dist;
                const fs = springStiffness * delta;
                const relV = (p2.vx - p1.vx) * nx + (p2.vy - p1.vy) * ny;
                const fd = springDamping * relV;
                const f = fs + fd;
                const fx = f * nx;
                const fy = f * ny;
                p1.vx += (fx / p1.mass) * dt;
                p1.vy += (fy / p1.mass) * dt;
                p2.vx -= (fx / p2.mass) * dt;
                p2.vy -= (fy / p2.mass) * dt;
              }
            });
          }
        }
      });

      // Build cell counts and update state
      const counts = Array(width * height).fill(0);
      particlesRef.current.forEach(pt => {
        const ix = Math.floor(pt.x);
        const iy = Math.floor(pt.y);
        counts[iy * width + ix]++;
      });
      setCellStates(counts);
      setPositions(particlesRef.current.map(pt => ({ x: pt.x, y: pt.y })));

      // Next frame
      anim = requestAnimationFrame(step);
    }

    anim = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim);
  }, [width, height, dt, gravity, pressureIters, buoyancy, springStiffness, springDamping]);

  return (
    <div style={{ textAlign: 'center', margin: '8px' }}>
      <label>
        <input
          type="checkbox"
          checked={showParticles}
          onChange={e => setShowParticles(e.target.checked)}
        />{' '}Show particles
      </label>
      <div
        ref={wrapperRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        style={{
          position: 'relative',
          width: `${width * cellSize}px`,
          height: `${height * cellSize}px`,
          margin: 'auto',
          cursor: 'crosshair',
        }}
      >
        <Grid
          width={width}
          height={height}
          cellStates={cellStates}
          cellSize={cellSize}
          particlePositions={showParticles ? positions : []}
        />
        {dragging && (
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
            <line
              x1={dragStart.x}
              y1={dragStart.y}
              x2={dragCurr.x}
              y2={dragCurr.y}
              stroke="magenta"
              strokeWidth="2"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
