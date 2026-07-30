import React, { useRef, useState, useEffect, useMemo } from 'react';
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

  const [vehicles, setVehicles] = useState({});
  const canvasRef = useRef(null);

  // Build graph stats (node degrees & polyline lengths) and classify roads
  const roadInfo = useMemo(() => {
    const nodeKey = (p) => `${p.nx.toFixed(4)},${p.ny.toFixed(4)}`;
    const nodeCount = new Map();
    const polylines = mapData.polylines || [];
    for (const pl of polylines) {
      for (const pt of pl.points) {
        const k = nodeKey(pt);
        nodeCount.set(k, (nodeCount.get(k) || 0) + 1);
      }
    }

    const infos = polylines.map((pl) => {
      // compute normalized length
      let len = 0;
      for (let i = 1; i < pl.points.length; i++) {
        const a = pl.points[i - 1];
        const b = pl.points[i];
        const dx = a.nx - b.nx;
        const dy = a.ny - b.ny;
        len += Math.sqrt(dx * dx + dy * dy);
      }
      // degree average
      let degSum = 0;
      for (const p of pl.points) {
        degSum += nodeCount.get(nodeKey(p)) || 0;
      }
      const avgDeg = degSum / Math.max(1, pl.points.length);
      // heuristic classification
      let type = 'minor';
      if (len > 0.18 || avgDeg >= 3) type = 'major';
      else if (len > 0.06 || avgDeg >= 2.0) type = 'secondary';

      return { len, avgDeg, type, points: pl.points };
    });

    return infos;
  }, []);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket('ws://localhost:8765');
      ws.onopen = () => console.log('Connected to live map server');
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'positions') {
            const map = {};
            for (const v of data.vehicles) {
              map[v.id] = v;
            }
            setVehicles(map);
          }
        } catch (e) {
          console.warn('Invalid WS message', e);
        }
      };
      ws.onclose = () => console.log('WS closed');
      ws.onerror = (err) => console.warn('WS error', err);
    } catch (e) {
      console.warn('Could not connect to WS', e);
    }

    return () => {
      try {
        ws && ws.close();
      } catch (e) {}
    };
  }, []);

  // stroke width scales inversely with zoom so inner/core lines become thinner when zoomed in
  // Use much smaller base and minimum values so lines render thin like Google map roads
  const baseStroke = 0.0004; // viewBox units (reduced)
  const strokeWidth = Math.max(0.00005, baseStroke / Math.max(0.0001, state.scale));

  // draw base rasterized roads to canvas for performance
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // background
    ctx.fillStyle = '#fbfdff';
    ctx.fillRect(0, 0, w, h);

    // draw road bases
    for (const info of roadInfo) {
      const pts = info.points;
      // choose color and width by type
      let color = '#f4d35e';
      let lineWidth = (info.type === 'major' ? 18 : info.type === 'secondary' ? 10 : 5);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const x = pts[i].nx * w;
        const y = pts[i].ny * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  // redraw when size or roadInfo changes
  }, [w, h, roadInfo]);

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
      <div className="map-controls">
        <button onClick={() => setState(s => ({ ...s, scale: Math.min(s.scale * 1.25, 8) }))}>+</button>
        <button onClick={() => setState(s => ({ ...s, scale: Math.max(s.scale / 1.25, 0.2) }))}>−</button>
      </div>
      <div
        className="svg-wrapper"
        style={{
          width: w,
          height: h,
          transform: `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`,
          backgroundColor: '#fbfdff',
        }}
      >
        {/* raster base canvas */}
        <canvas ref={canvasRef} style={{ width: w, height: h, position: 'absolute', left: 0, top: 0 }} />
        <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
          {/* grid */}
          <defs>
            <pattern id="grid" width="0.25" height="0.25" patternUnits="objectBoundingBox">
              <rect width="0.25" height="0.25" fill="#fbfdff"></rect>
              <path d="M0 0 L0.25 0 M0 0 L0 0.25" stroke="#eef2f7" strokeWidth="0.002" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1" height="1" fill="url(#grid)" />
          {/* centerlines (SVG) drawn above canvas base for crispness */}
          {roadInfo &&
            roadInfo.map((info, i) => {
              const pts = info.points;
              const ptsStr = pointsToStr(pts);
              // centerline color and width by type
              let centerColor = '#2b6cb0';
              let centerWidth = strokeWidth * (info.type === 'major' ? 1.6 : info.type === 'secondary' ? 1.2 : 1.0);
              return (
                <polyline
                  key={i}
                  points={ptsStr}
                  fill="none"
                  stroke={centerColor}
                  strokeWidth={centerWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

          {/* POI labels */}
          {mapData.points && mapData.points.slice(0, 80).map((p, idx) => (
            <g key={`poi-${idx}`}>
              <circle cx={p.nx} cy={p.ny} r={0.006 / state.scale} fill="#ef4444" stroke="#fff" strokeWidth={0.001} />
              <text x={p.nx + 0.007} y={p.ny + 0.003} fontSize={0.02} fill="#0f172a">{p.x ? `POI` : 'POI'}</text>
            </g>
          ))}

          {/* vehicles */}
          {Object.values(vehicles).map((v) => (
            <circle key={v.id} cx={v.nx} cy={v.ny} r={0.01 / state.scale} fill="rgba(220,38,38,0.95)" stroke="#fff" strokeWidth={0.001} />
          ))}
        </svg>
      </div>
    </div>
  );
}
