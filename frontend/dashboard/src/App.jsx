import React, { useRef, useState, useEffect } from 'react';
import mapData from '../../assets/map_data.json';

export default function App() {
  const containerRef = useRef(null);
  const [state, setState] = useState({ scale: 1, tx: 0, ty: 0, dragging: false, lastX: 0, lastY: 0 });

  // initialize to cover the screen by default
  useEffect(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const imgW = w;
    const imgH = Math.max(
      300,
      Math.round(
        w *
          ((mapData.bounds?.maxy - mapData.bounds?.miny) /
            Math.max(1e-6, mapData.bounds?.maxx - mapData.bounds?.minx) ||
            1)
      )
    );
    const cover = Math.max(w / imgW, h / imgH);
    setState((s) => ({ ...s, scale: Math.max(1, cover), tx: 0, ty: 0 }));
  }, []);

  function onWheel(e) {
    e.preventDefault();
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    setState((s) => {
      const newScale = Math.max(0.2, Math.min(8, s.scale * factor));
      return { ...s, scale: newScale };
    });
  }

  function onMouseDown(e) {
    setState((s) => ({ ...s, dragging: true, lastX: e.clientX, lastY: e.clientY }));
  }
  function onMouseMove(e) {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    setState((s) => ({ ...s, tx: s.tx + dx, ty: s.ty + dy, lastX: e.clientX, lastY: e.clientY }));
  }
  function onMouseUp() {
    setState((s) => ({ ...s, dragging: false }));
  }

  const pointsToStr = (pts) => pts.map((p) => `${p.nx},${p.ny}`).join(' ');

  const w = window.innerWidth;
  const h = window.innerHeight;

  // stroke width scales inversely with zoom so inner/core lines become thinner when zoomed in
  // Use much smaller base and minimum values so lines render thin like Google map roads
  const baseStroke = 0.004; // viewBox units (reduced)
  const strokeWidth = Math.max(0.0005, baseStroke / Math.max(0.0001, state.scale));

  return (
    <div
      ref={containerRef}
      className="dashboard-root"
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div
        className="svg-wrapper"
        style={{ width: w, height: h, transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})` }}
      >
        <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" width={w} height={h}>
          {/* grid */}
          <defs>
            <pattern id="grid" width="0.25" height="0.25" patternUnits="objectBoundingBox">
              <rect width="0.25" height="0.25" fill="#fbfdff"></rect>
              <path d="M0 0 L0.25 0 M0 0 L0 0.25" stroke="#eef2f7" strokeWidth="0.002" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1" height="1" fill="url(#grid)" />
          {mapData.polylines &&
            mapData.polylines.map((pl, i) => (
              <polyline
                key={i}
                points={pointsToStr(pl.points)}
                fill="none"
                stroke="#1e40af"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
        </svg>
      </div>
    </div>
  );
}
