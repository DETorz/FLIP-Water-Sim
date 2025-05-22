import React, { useState, useEffect, useRef } from 'react';
import Grid from './Grid';

// SPH/FLIP Fluid Simulation in JS with interactive mouse-driven gravity
export function FLIP_SIM({
  width = 48,
  height = 48,
  dt = 0.03,              // how many time steps are taken for each simulation iteration. higher is faster but less stable
  particleCount = 1000,
  cellSize = 15,
  gravityMag = 9.81,
  collisionDamping = 0.1, // how much energy is perserved for each bounce
  smoothingRadius = 1.33, // each particle repels itself from its neighbors based on this value
  targetDensity = 1.33,  // the density of the fluid when it rests. higher means more dense particles
  pressureMultiplier = 1, // higher pressure applies when a neighbor enters another's smoothingRadius
  nearPressureMultiplier = 50, // higher pressure applies more force towards close neighbors 
  viscosityStrength = 1, // higher means thicker fluid
}) {
  const [cellStates, setCellStates] = useState(Array(width * height).fill(0));
  const [positions, setPositions] = useState([]);
  const [showParticles, setShowParticles] = useState(true);

  // Refs for simulation data
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

  // Gravity vector as ref, updated on mouse drag
  const gravityRef = useRef({ x: 0, y: gravityMag });
  // Container ref for mouse coords
  const containerRef = useRef(null);

  // Drag line state
  const [dragStart, setDragStart] = useState(null);
  const [dragEnd, setDragEnd] = useState(null);

  // Kernels
  const spikyKernelPow2 = (r, h) => { const x = h - r; return x > 0 ? x * x : 0; };
  const spikyKernelPow3 = (r, h) => { const x = h - r; return x > 0 ? x * x * x : 0; };
  const derivativeSpikyPow2 = (r, h) => { const x = h - r; return x > 0 ? -2 * x : 0; };
  const derivativeSpikyPow3 = (r, h) => { const x = h - r; return x > 0 ? -3 * x * x : 0; };
  const viscosityKernel = (r, h) => { const h2 = h * h; const r2 = r * r; const x = h2 - r2; return x > 0 ? x * x * x : 0; };

  // Mouse event handlers
  const toSimCoords = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / cellSize,
      y: (clientY - rect.top) / cellSize,
    };
  };

  const handleMouseDown = e => {
    const pos = toSimCoords(e.clientX, e.clientY);
    setDragStart(pos);
    setDragEnd(pos);
  };
  const handleMouseMove = e => {
    if (!dragStart) return;
    setDragEnd(toSimCoords(e.clientX, e.clientY));
  };
  const handleMouseUp = e => {
    if (!dragStart) return;
    const end = toSimCoords(e.clientX, e.clientY);
    const dx = end.x - dragStart.x;
    const dy = end.y - dragStart.y;
    const len = Math.hypot(dx, dy) || 1;
    // Update gravity direction
    gravityRef.current = { x: (dx / len) * gravityMag, y: (dy / len) * gravityMag };
    // Clear drag line
    setDragStart(null);
    setDragEnd(null);
  };

  // Main simulation loop
  useEffect(() => {
    let anim;
    const parts = particlesRef.current;
    const pred = predictedRef.current;
    const sqrt = Math.sqrt;
    const invTarget = 1 / (targetDensity + 1e-6);
    const h2 = smoothingRadius * smoothingRadius;

    function step() {
      // 1. External forces + predict
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.vx += gravityRef.current.x * dt;
        p.vy += gravityRef.current.y * dt;
        pred[i].x = p.x + p.vx * dt;
        pred[i].y = p.y + p.vy * dt;
      }
      // 2. Spatial hash
      const cellMap = new Map();
      for (let i = 0; i < parts.length; i++) {
        const { x, y } = pred[i];
        const key = `${Math.floor(x / smoothingRadius)},${Math.floor(y / smoothingRadius)}`;
        (cellMap.get(key) || cellMap.set(key, []).get(key)).push(i);
      }
      // 3. Densities
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i]; p.density = 0; p.nearDensity = 0;
        const { x, y } = pred[i];
        const cx = Math.floor(x / smoothingRadius), cy = Math.floor(y / smoothingRadius);
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          for (const j of (cellMap.get(`${cx+ox},${cy+oy}`) || [])) {
            const dx = pred[j].x - x, dy = pred[j].y - y;
            const r2 = dx*dx + dy*dy; if (r2 > h2) continue;
            const r = sqrt(r2);
            p.density += spikyKernelPow2(r, smoothingRadius);
            p.nearDensity += spikyKernelPow3(r, smoothingRadius);
          }
        }
      }
      // 4. Pressures (clamped)
      for (let p of parts) {
        const dd = p.density - targetDensity;
        const nd = p.nearDensity - targetDensity;
        p.pressure     = pressureMultiplier     * Math.max(dd, 0);
        p.nearPressure = nearPressureMultiplier * Math.max(nd, 0);
        p.pressureForceX = 0; p.pressureForceY = 0;
      }
      // 5. Pressure forces
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const { x, y } = pred[i];
        const cx = Math.floor(x/smoothingRadius), cy = Math.floor(y/smoothingRadius);
        for (let oy=-1; oy<=1; oy++) for (let ox=-1; ox<=1; ox++) {
          for (const j of (cellMap.get(`${cx+ox},${cy+oy}`)||[])) {
            if (i===j) continue;
            const q = parts[j];
            const dx = pred[j].x-x, dy = pred[j].y-y;
            const r2 = dx*dx+dy*dy; if(r2>h2) continue;
            const r = sqrt(r2), invR = r?1/r:0;
            const dirX = dx*invR, dirY = dy*invR;
            const sharedP = 0.5*(p.pressure+q.pressure);
            const sharedN = 0.5*(p.nearPressure+q.nearPressure);
            const gradF = derivativeSpikyPow2(r, smoothingRadius)*sharedP*invTarget;
            const gradN = derivativeSpikyPow3(r, smoothingRadius)*sharedN*invTarget;
            p.pressureForceX += dirX*(gradF+gradN);
            p.pressureForceY += dirY*(gradF+gradN);
          }
        }
      }
      // 6. Viscosity
      for (let i=0; i<parts.length; i++) {
        const p = parts[i]; p.viscosityForceX=0; p.viscosityForceY=0;
        const { x, y } = pred[i];
        const cx=Math.floor(x/smoothingRadius), cy=Math.floor(y/smoothingRadius);
        for (let oy=-1; oy<=1; oy++) for (let ox=-1; ox<=1; ox++) {
          for (const j of (cellMap.get(`${cx+ox},${cy+oy}`)||[])) {
            if (i===j) continue;
            const q = parts[j];
            const dx=pred[j].x-x, dy=pred[j].y-y;
            const r2=dx*dx+dy*dy; if(r2>h2) continue;
            const r = sqrt(r2);
            const w = viscosityKernel(r, smoothingRadius);
            p.viscosityForceX += (q.vx-p.vx)*w;
            p.viscosityForceY += (q.vy-p.vy)*w;
          }
        }
      }
      // 7. Integrate + bounce
      for (let p of parts) {
        const dens = p.density||1;
        p.vx += (p.pressureForceX/dens)*dt + p.viscosityForceX*viscosityStrength*dt;
        p.vy += (p.pressureForceY/dens)*dt + p.viscosityForceY*viscosityStrength*dt;
        p.x = pred[parts.indexOf(p)].x + p.vx*dt;
        p.y = pred[parts.indexOf(p)].y + p.vy*dt;
        if(p.x<=1){p.x=1;p.vx*=-collisionDamping}
        if(p.x>=width-2){p.x=width-2;p.vx*=-collisionDamping}
        if(p.y<=1){p.y=1;p.vy*=-collisionDamping}
        if(p.y>=height-2){p.y=height-2;p.vy*=-collisionDamping}
      }
      // 8. Render buffers
      const counts = Array(width*height).fill(0);
      const posArr = [];
      for(const p of parts){
        const ix=Math.floor(p.x), iy=Math.floor(p.y);
        counts[iy*width+ix]++;
        posArr.push({x:p.x,y:p.y});
      }
      setCellStates(counts);
      setPositions(posArr);
      anim = requestAnimationFrame(step);
    }

    anim = requestAnimationFrame(step);
    return () => cancelAnimationFrame(anim);
  }, [width, height, dt, smoothingRadius, targetDensity, pressureMultiplier, nearPressureMultiplier, viscosityStrength, gravityMag, collisionDamping]);

  return (
    <div style={{ textAlign: 'center', margin: 8 }}>
      <label>
        <input type="checkbox" checked={showParticles} onChange={e=>setShowParticles(e.target.checked)} /> Show particles
      </label>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ position: 'relative', width: width*cellSize, height: height*cellSize, cursor: 'crosshair', margin: 'auto' }}
      >
        <Grid
          width={width}
          height={height}
          cellStates={cellStates}
          cellSize={cellSize}
          particlePositions={showParticles?positions:[]}
        />
        {dragStart && dragEnd && (
          <svg
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          >
            <line
              x1={dragStart.x * cellSize}
              y1={dragStart.y * cellSize}
              x2={dragEnd.x   * cellSize}
              y2={dragEnd.y   * cellSize}
              stroke="magenta"
              strokeWidth={1}
            />
          </svg>
        )}
      </div>
    </div>
  );
}
