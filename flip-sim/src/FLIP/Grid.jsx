// Grid.jsx
import React from 'react';

export default function Grid({
  width = 48,
  height = 48,
  cellSize = 15,
  cellStates = [],
  particlePositions = [],
}) {
  const total = width * height;
  const cells = Array.from({ length: total });

  const containerStyle = {
    margin: 0,
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fafafa',
    overflow: 'hidden',
  };

  const gridWrapperStyle = {
    position: 'relative',
    width: `${width * cellSize}px`,
    height: `${height * cellSize}px`,
    overflow: 'hidden',
  };

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
    gridTemplateRows:    `repeat(${height}, ${cellSize}px)`,
  };

  const baseCellStyle = {
    width: `${cellSize}px`,
    height: `${cellSize}px`,
    boxSizing: 'border-box',
    border: '1px solid #000',
  };

  return (
    <div style={containerStyle}>
      <div style={gridWrapperStyle}>
        {/* grid cells */}
        <div style={gridStyle}>
          {cells.map((_, idx) => {
            const count = cellStates[idx] || 0;
            let bg = 'transparent';
            if (count >= 2) bg = 'orange';
            else if (count === 1) bg = 'red';

            const row = Math.floor(idx / width);
            const col = idx % width;
            if (
              row === 0 || row === height - 1 || col === 0 || col === width - 1
            ) {
              bg = '#555';
            }

            return (
              <div
                key={idx}
                style={{ ...baseCellStyle, backgroundColor: bg }}
              />
            );
          })}
        </div>

        {/* particles as dots, continuous positions */}
        {particlePositions.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: 'black',
              left: `${p.x * cellSize}px`,
              top:  `${p.y * cellSize}px`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
