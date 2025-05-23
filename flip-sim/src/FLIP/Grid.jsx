// Grid.jsx
import React from 'react';

export default function Grid({
  width = 48,
  height = 48,
  cellSize = 15,
  cellStates = [],
  particlePositions = [],
}) {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const radius = Math.min(width, height) / 2 - 1;

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
    gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
  };

  return (
    <div style={containerStyle}>
      <div style={gridWrapperStyle}>
        <div style={gridStyle}>
          {Array.from({ length: width * height }).map((_, idx) => {
            const count = cellStates[idx] || 0;
            let bg = 'transparent';
            if (count >= 2) bg = '#FFBA0D';
            else if (count === 1) bg = '#FFF04D';

            const row = Math.floor(idx / width);
            const col = idx % width;
            // Outside circle is solid
            const dx = col - centerX;
            const dy = row - centerY;
            if (dx * dx + dy * dy > radius * radius) {
              bg = '#555';
            }

            const borderColor = bg === 'transparent' ? '#e6e6e6' : bg;
            return (
              <div
                key={idx}
                style={{
                  width: `${cellSize}px`,
                  height: `${cellSize}px`,
                  boxSizing: 'border-box',
                  backgroundColor: bg,
                  border: `1px solid ${borderColor}`,
                }}
              />
            );
          })}
        </div>
        {particlePositions.map((p, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: 'black',
              left: `${p.x * cellSize}px`,
              top: `${p.y * cellSize}px`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}
