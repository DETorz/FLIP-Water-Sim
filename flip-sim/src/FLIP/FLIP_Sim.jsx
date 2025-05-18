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
 * FLIP_Sim: FLIP with gel-like repulsion, viscosity, and interactive gravity
 */
export function FLIP_SIM({
  width = 48,
  height = 48,
  dt = 0.05,
  particleCount = 200,
  personalSpace = 1.0,
  stiffness = 80,
  damping = 1.0,
  viscosity = 1.0,
  gravityMag = 9.8,
}) {
  const cellSize = 15;
  const [cellStates, setCellStates] = useState(Array(width * height).fill(0));
  const [positions, setPositions] = useState([]);

  // interactive gravity vector
  const [gravity, setGravity] = useState({ x: 0, y: gravityMag });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 });
  const wrapperRef = useRef(null);

  // initialize particles
  const particlesRef = useRef(
    Array.from({ length: particleCount }, () => {
      const x = 1 + Math.random() * (width - 2);
      const y = 1 + Math.random() * (height - 2);
      const angle = Math.random() * 2 * Math.PI;
      const speed = Math.random() * 0.5;
      return new FLIP_Particle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
    })
  );

  // handle mouse interactions to adjust gravity
  const handleMouseDown = e => {
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    setDragging(true);
  };
  const handleMouseMove = e => {
    if (!dragging) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setDragCurrent({ x, y });
    const dx = x - dragStart.x;
    const dy = y - dragStart.y;
    const norm = Math.hypot(dx, dy) || 1;
    setGravity({ x: (dx / norm) * gravityMag, y: (dy / norm) * gravityMag });
  };
  const handleMouseUp = () => {
    setDragging(false);
  };

  const mass = useRef(new Float32Array(width * height));
  const mom  = useRef(new Float32Array(width * height * 2));
  const oldU = useRef(new Float32Array(width * height * 2));

  useEffect(() => {
    let anim;
    function step() {
      const m = mass.current;
      const mu = mom.current;
      const oU = oldU.current;
      m.fill(0);
      mu.fill(0);
      oU.fill(0);

      // P2G
      particlesRef.current.forEach(p => {
        const i = Math.floor(p.x);
        const j = Math.floor(p.y);
        if (i < 1 || i >= width-1 || j < 1 || j >= height-1) return;
        const idx = j * width + i;
        m[idx] += p.mass;
        mu[2*idx]     += p.mass * p.vx;
        mu[2*idx + 1] += p.mass * p.vy;
      });

      // grid velocity & store old
      for (let idx = 0; idx < width*height; idx++) {
        if (m[idx] > 0) {
          const ux = mu[2*idx] / m[idx];
          const uy = mu[2*idx+1] / m[idx];
          oU[2*idx]     = ux;
          oU[2*idx + 1] = uy;
          mu[2*idx]     = ux;
          mu[2*idx + 1] = uy;
        }
      }

      // apply interactive gravity
      const gx = gravity.x;
      const gy = gravity.y;
      for (let idx = 0; idx < width*height; idx++) {
        if (m[idx] > 0) {
          mu[2*idx    ] += gx * dt;
          mu[2*idx + 1] += gy * dt;
        }
      }

      // G2P
      particlesRef.current.forEach(p => {
        const i = Math.floor(p.x);
        const j = Math.floor(p.y);
        if (i < 1 || i >= width-1 || j < 1 || j >= height-1) return;
        const idx = j * width + i;
        if (m[idx] > 0) {
          p.vx += mu[2*idx]     - oU[2*idx];
          p.vy += mu[2*idx + 1] - oU[2*idx + 1];
        }
      });

      // advect + bounce
      particlesRef.current.forEach(p => {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 1) { p.x = 1; p.vx *= -0.5; }
        if (p.x > width-2) { p.x = width-2; p.vx *= -0.5; }
        if (p.y < 1) { p.y = 1; p.vy *= -0.5; }
        if (p.y > height-2) { p.y = height-2; p.vy *= -0.5; }
      });

      // neighbor hash and repulsion + viscosity
      const buckets = new Map();
      particlesRef.current.forEach((p, i) => {
        const key = `${Math.floor(p.x)},${Math.floor(p.y)}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
      });
      particlesRef.current.forEach((p1, i) => {
        const cx = Math.floor(p1.x);
        const cy = Math.floor(p1.y);
        for (let oy=-1; oy<=1; oy++) for (let ox=-1; ox<=1; ox++) {
          const bucket = buckets.get(`${cx+ox},${cy+oy}`);
          if (!bucket) continue;
          bucket.forEach(j => {
            if (j <= i) return;
            const p2 = particlesRef.current[j];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0 && dist < personalSpace) {
              const penetration = personalSpace - dist;
              const nx = dx/dist;
              const ny = dy/dist;
              const corr = penetration*0.5;
              p1.x -= nx*corr; p1.y -= ny*corr;
              p2.x += nx*corr; p2.y += ny*corr;
              const rvx = p2.vx - p1.vx;
              const rvy = p2.vy - p1.vy;
              const relVel = rvx*nx + rvy*ny;
              const Fs = stiffness*penetration;
              const Fd = damping*relVel;
              const F  = Fs + Fd;
              const fx = F*nx; const fy = F*ny;
              p1.vx -= fx/p1.mass*dt; p1.vy -= fy/p1.mass*dt;
              p2.vx += fx/p2.mass*dt; p2.vy += fy/p2.mass*dt;
              const vis = viscosity*dt;
              const dvx = (p2.vx - p1.vx)*vis;
              const dvy = (p2.vy - p1.vy)*vis;
              p1.vx += dvx; p1.vy += dvy;
              p2.vx -= dvx; p2.vy -= dvy;
            }
          });
        }
      });

      // update cells
      const newStates = Array(width*height).fill(0);
      particlesRef.current.forEach(p => {
        const ix = Math.floor(p.x);
        const iy = Math.floor(p.y);
        newStates[iy*width + ix]++;
      });
      setCellStates(newStates);
      setPositions(particlesRef.current.map(p => ({ x: p.x, y: p.y })));

      anim = requestAnimationFrame(step);
    }
    anim = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim);
  }, [width,height,dt,personalSpace,stiffness,damping,viscosity,gravity]);

  return (
    <div
      ref={wrapperRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      style={{
        position: 'relative',
        width: `${width*cellSize}px`,
        height: `${height*cellSize}px`,
        margin: 'auto',
        cursor: 'crosshair',
      }}
    >
      <Grid
        width={width}
        height={height}
        cellStates={cellStates}
        cellSize={cellSize}
        particlePositions={positions}
      />
      {dragging && (
        <svg
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
        >
          <line
            x1={dragStart.x}
            y1={dragStart.y}
            x2={dragCurrent.x}
            y2={dragCurrent.y}
            stroke="magenta"
            strokeWidth="2"
          />
        </svg>
      )}
    </div>
  );
}
