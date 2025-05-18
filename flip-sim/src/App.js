// App.js
import React from 'react';
import './App.css';
import { FLIP_SIM } from './FLIP/FLIP_Sim';

function App() {
  return (
    <div className="Sim">
      <FLIP_SIM width={48} height={48} />
    </div>
  );
}

export default App;
