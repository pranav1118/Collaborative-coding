import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './Home';
import Editor from './Editor';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/editor/:roomId" element={<Editor />} />
    </Routes>
  );
}

export default App;