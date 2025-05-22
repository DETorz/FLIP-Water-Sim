import React, { useState, useEffect, useRef } from 'react';
import Grid from './Grid';

// SPH Fluid with uniform-grid neighbor search
class Particle {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.mass = 1;
    this.density = 0;
    this.pressure = 0;
  }
}

export function FLIP_SIM({
  width = 48,
  height = 48,
  dt = 0.04,
  particleCount = 1000,
  cellSize = 15,
  gravityMag = 9.81,
  smoothingRadius = 1.5,
  kPressure = 8.0,
  maxForce = 5.0,
}) {
  const [cellStates, setCellStates] = useState(Array(width * height).fill(0));
  const [positions, setPositions] = useState([]);
  const [showParticles, setShowParticles] = useState(true);
  const [gravity, setGravity] = useState({ x: 0, y: gravityMag });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurr, setDragCurr] = useState({ x: 0, y: 0 });

  const wrapperRef = useRef(null);
  const frameRef = useRef(0);

  // Initialize particles in grid layout
  const particlesRef = useRef(
    (() => {
      const arr = [];
      const nCols = Math.ceil(Math.sqrt(particleCount));
      const nRows = Math.ceil(particleCount / nCols);
      let idx = 0;
      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < nCols && idx < particleCount; c++, idx++) {
          const x = 1 + (c + 0.5) * ((width - 2) / nCols);
          const y = 1 + (r + 0.5) * ((height - 2) / nRows);
          arr.push(new Particle(x, y));
        }
      }
      return arr;
    })()
  );

  // Buckets for neighbor search
  const bucketsRef = useRef(Array.from({ length: width * height }, () => []));

  // Mouse handlers
  const onDown = e => {
    const rect = wrapperRef.current.getBoundingClientRect();
    setDragStart({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragCurr({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setDragging(true);
  };
  const onMove = e => {
    if (!dragging) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragCurr({ x, y });
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    const len = Math.hypot(dx, dy) || 1;
    setGravity({ x: (dx / len) * gravityMag, y: (dy / len) * gravityMag });
  };
  const onUp = () => setDragging(false);

  useEffect(() => {
    let anim;
    const h2 = smoothingRadius * smoothingRadius;
    const kernel = r2 => {
      const d = h2 - r2;
      return d > 0 ? d * d : 0;
    };

    function step() {
      const parts = particlesRef.current;
      const buckets = bucketsRef.current;

      // Clear buckets
      for (let b of buckets) b.length = 0;

      // Populate buckets using current positions
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        buckets[cy * width + cx].push(i);
      }

      // Compute densities and pressures
      let totalDensity = 0;
      for (let p of parts) p.density = 0;
      for (let p of parts) {
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nc = cx + ox;
            const nr = cy + oy;
            if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
            const bucket = buckets[nr * width + nc];
            for (let j = 0; j < bucket.length; j++) {
              const q = parts[bucket[j]];
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const r2 = dx * dx + dy * dy;
              p.density += kernel(r2);
            }
          }
        }
        totalDensity += p.density;
      }
      const avgDensity = totalDensity / particleCount;
      for (let p of parts) {
        p.pressure = kPressure * (p.density - avgDensity);
      }

      // Integrate forces (pressure + gravity)
      for (let p of parts) {
        let fx = gravity.x;
        let fy = gravity.y;
        const cx = Math.floor(p.x);
        const cy = Math.floor(p.y);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nc = cx + ox;
            const nr = cy + oy;
            if (nc < 0 || nc >= width || nr < 0 || nr >= height) continue;
            const bucket = buckets[nr * width + nc];
            for (let j = 0; j < bucket.length; j++) {
              const q = parts[bucket[j]];
              if (q === p) continue;
              const dx = p.x - q.x;
              const dy = p.y - q.y;
              const r2 = dx * dx + dy * dy;
              if (r2 > h2) continue;
              const rLen = Math.sqrt(r2);
              const minDist = smoothingRadius * 0.1;
              if (rLen < minDist) continue;
              const w = kernel(r2);
              const presTerm = (p.pressure + q.pressure) / (q.density + 1e-6);
              fx += (dx / rLen) * w * presTerm;
              fy += (dy / rLen) * w * presTerm;
            }
          }
        }
        // Clamp force
        const fMag = Math.hypot(fx, fy);
        if (fMag > maxForce) {
          fx = (fx / fMag) * maxForce;
          fy = (fy / fMag) * maxForce;
        }
        // Dampen and integrate
        p.vx = (p.vx + fx * dt) * 0.95;
        p.vy = (p.vy + fy * dt) * 0.95;
        p.x = Math.min(Math.max(p.x + p.vx * dt, 1), width - 2);
        p.y = Math.min(Math.max(p.y + p.vy * dt, 1), height - 2);
      }

      // Throttle render: update UI every other frame
      frameRef.current++;
      if (frameRef.current % 2 === 0) {
        const counts = Array(width * height).fill(0);
        for (let p of parts) counts[Math.floor(p.y) * width + Math.floor(p.x)]++;
        setCellStates(counts);
        // build positions array without map() arrow to avoid no-loop-func warning
        const newPositions = [];
        for (let i = 0; i < parts.length; i++) {
          const pp = parts[i];
          newPositions.push({ x: pp.x, y: pp.y });
        }
        setPositions(newPositions);
      }

      anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim);
  }, [width, height, dt, gravity, smoothingRadius, kPressure, maxForce, particleCount]);

  return (
    <div style={{ textAlign: 'center', margin: 8 }}>
      <label>
        <input type="checkbox" checked={showParticles} onChange={e => setShowParticles(e.target.checked)} /> Show particles
      </label>
      <div
        ref={wrapperRef}
        onMouseDown={onDown}
        onMouseMove={onMove}
        onMouseUp={onUp}
        style={{ position: 'relative', width: width * cellSize, height: height * cellSize, margin: 'auto', cursor: 'crosshair' }}
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
            <line x1={dragStart.x} y1={dragStart.y} x2={dragCurr.x} y2={dragCurr.y} stroke="magenta" strokeWidth={2} />
          </svg>
        )}
      </div>
    </div>
  );
}
