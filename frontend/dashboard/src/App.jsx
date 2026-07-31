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

  const [vehicles, setVehicles] = useState({});
  const [optimisedRoutes, setOptimisedRoutes] = useState({});
  const [metrics, setMetrics] = useState({});
  const [quboData, setQuboData] = useState(null);
  const [ecomData, setEcomData] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followPos, setFollowPos] = useState(null); // {nx, ny}
  const [viewMode, setViewMode] = useState('full'); // 'full' or 'minimap'

  const wsRef = useRef(null);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket('ws://localhost:8765');
      wsRef.current = ws;
      ws.onopen = () => console.log('Connected to live map server');
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
            if (data.type === 'positions') {
            console.log('Received positions payload. optimised_routes=', data.optimised_routes, 'qubo=', data.qubo);
            const map = {};
            for (const v of data.vehicles) {
              map[v.id] = v;
            }
            setVehicles(map);
            if (data.optimised_routes) {
              // Normalize routes: server may send array of polyline indices or array-of-arrays
              const norm = {};
              for (const [vid, val] of Object.entries(data.optimised_routes)) {
                if (Array.isArray(val)) {
                  // if items are arrays, flatten one level
                  if (val.length > 0 && Array.isArray(val[0])) {
                    norm[vid] = [].concat(...val);
                  } else {
                    norm[vid] = val.slice();
                  }
                } else if (val != null) {
                  norm[vid] = [val];
                }
              }
              setOptimisedRoutes(norm);
            }
            if (data.metrics) {
              setMetrics(data.metrics);
            }
            if (data.qubo) {
              setQuboData(data.qubo);
            }
            if (data.ecom) {
              setEcomData(data.ecom);
            }
          } else if (data.type === 'opt_ack') {
            console.log('Server acked optimize request');
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

  function requestOptimise() {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    console.log('Requesting optimisation...');
    ws.send(JSON.stringify({ type: 'optimize' }));
  }

  // Build flattened route points (nx,ny) from optimisedRoutes for player
  function buildRoutePointsForPlayer() {
    const ids = Object.keys(vehicles);
    if (ids.length === 0) return [];
    const playerId = ids.find((id) => id.toLowerCase().includes('player')) || ids[0];
    const chosen = optimisedRoutes[playerId];
    if (!chosen) return [];
    const pts = [];
    for (const pli of chosen) {
      const pl = mapData.polylines[pli];
      if (!pl) continue;
      for (const p of pl.points) {
        pts.push({ nx: p.nx, ny: p.ny });
      }
    }
    return pts;
  }

  // follow animation: moves a synthetic marker along route points
  let followRaf = null;
  function startFollow() {
    if (following) return;
    console.log('Starting follow');
    const pts = buildRoutePointsForPlayer();
    if (!pts || pts.length < 2) return;
    setFollowing(true);
    // compute speed factor from metrics (smaller optimized_total => faster)
    const baseline = metrics?.baseline_total || 1.0;
    const optimized = metrics?.optimized_total || baseline;
    const speedFactor = Math.max(0.2, Math.min(4.0, baseline / Math.max(1e-6, optimized)));

    // step along points with interpolation
    let index = 0;
    let t = 0;
    const baseStep = 0.008; // fraction per frame

    function step() {
      if (!following) return;
      const a = pts[index];
      const b = pts[index + 1] || a;
      t += baseStep * speedFactor;
      if (t >= 1.0) {
        index += 1;
        t = 0;
        if (index >= pts.length - 1) {
          // finished
          setFollowing(false);
          setFollowPos(null);
          cancelAnimationFrame(followRaf);
          return;
        }
      }
      const nx = a.nx + (b.nx - a.nx) * t;
      const ny = a.ny + (b.ny - a.ny) * t;
      setFollowPos({ nx, ny });
      followRaf = requestAnimationFrame(step);
    }

    followRaf = requestAnimationFrame(step);
  }

  function stopFollow() {
    setFollowing(false);
    setFollowPos(null);
  }

  // stroke width scales inversely with zoom so inner/core lines become thinner when zoomed in
  // Use much smaller base and minimum values so lines render thin like Google map roads
  const baseStroke = 0.0004; // viewBox units (reduced)
  const strokeWidth = Math.max(0.00005, baseStroke / Math.max(0.0001, state.scale));

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
        <button type="button" className="icon" onClick={() => setState(s => ({ ...s, scale: Math.min(s.scale * 1.25, 8) }))}>+</button>
        <button type="button" className="icon" onClick={() => setState(s => ({ ...s, scale: Math.max(s.scale / 1.25, 0.2) }))}>−</button>
        <button type="button" onClick={() => setViewMode('full')} style={{ marginLeft: 0, background: viewMode === 'full' ? '#e6eefc' : undefined }}>Full</button>
        <button type="button" onClick={() => setViewMode('minimap')} style={{ marginLeft: 0, background: viewMode === 'minimap' ? '#e6eefc' : undefined }}>Minimap</button>
        <button type="button" onClick={requestOptimise} style={{ marginTop: 6, background: '#e6ffe6' }}>Optimize</button>
        <button type="button" onClick={() => startFollow()} style={{ marginTop: 6, background: '#eef6ff' }}>Follow Route</button>
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
        {/* compare panel */}
        <div style={{ position: 'absolute', left: 16, top: 16, background: '#ffffffcc', padding: 8, borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize: 12, color: '#374151' }}>Baseline total: {metrics?.baseline_total ? metrics.baseline_total.toFixed(2) : '—'}</div>
          <div style={{ fontSize: 12, color: '#063970' }}>Optimized total: {metrics?.optimized_total ? metrics.optimized_total.toFixed(2) : '—'}</div>
          {metrics?.baseline_total && metrics?.optimized_total && (
            <div style={{ fontSize: 12, color: '#065f46' }}>Reduction: {((1 - (metrics.optimized_total / metrics.baseline_total)) * 100).toFixed(1)}%</div>
          )}
        </div>
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
            mapData.polylines.map((pl, i) => {
              const pts = pointsToStr(pl.points);
              const baseWidth = Math.max(0.002, strokeWidth * 6);
              return (
                <g key={i}>
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="#f4d35e"
                    strokeWidth={baseWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.95}
                  />
                  <polyline
                    points={pts}
                    fill="none"
                    stroke="#2b6cb0"
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              );
            })}
          {/* highlight optimised route for player if available */}
          {(() => {
            const ids = Object.keys(vehicles);
            if (ids.length === 0) return null;
            const playerId = ids.find((id) => id.toLowerCase().includes('player')) || ids[0];
            const chosen = optimisedRoutes[playerId];
            if (!chosen) return null;
            // chosen is array of polyline indices
            return chosen.map((pli) => {
              const pl = mapData.polylines[pli];
              if (!pl) return null;
              const pts = pointsToStr(pl.points);
              return (
                <polyline key={`opt-${pli}`} points={pts} fill="none" stroke="#16a34a" strokeWidth={Math.max(0.004, strokeWidth * 10)} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
              );
            });
          })()}
          {/* find main player (id contains 'player' or fallback to first) */}
          {(() => {
            const ids = Object.keys(vehicles);
            if (ids.length === 0) return null;
            const playerId = ids.find((id) => id.toLowerCase().includes('player')) || ids[0];
            const player = vehicles[playerId];
            const others = ids.filter((id) => id !== playerId).map((id) => vehicles[id]);

            const iconScale = 0.035 / Math.max(0.5, state.scale);

            // compute heading angle (deg) if direction available
            let angle = 0;
            if (player && player.dir && Array.isArray(player.dir)) {
              const dx = player.dir[0];
              const dy = player.dir[1];
              // map game dir to screen angle: atan2(dx, -dy)
              angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
            }

            return (
              <g>
                {/* other vehicles as small dots */}
                {others.map((v) => (
                  <circle key={v.id} cx={v.nx} cy={v.ny} r={0.009 / state.scale} fill="rgba(220,38,38,0.95)" stroke="#fff" strokeWidth={0.0008} />
                ))}

                {/* player icon: same size as other vehicles (green) */}
                {player && (
                  <circle key={player.id} cx={player.nx} cy={player.ny} r={0.009 / state.scale} fill="#16a34a" stroke="#fff" strokeWidth={0.0008} />
                )}
                {/* synthetic follow marker (animated) */}
                {followPos && (
                  <circle cx={followPos.nx} cy={followPos.ny} r={0.011 / state.scale} fill="#0ea5a4" stroke="#fff" strokeWidth={0.001} />
                )}
              </g>
            );
          })()}
        </svg>
        {/* Ecommerce right panel */}
        {ecomData && (
          <div style={{ position: 'absolute', right: 16, top: 16, width: 420, height: Math.min(720, h - 48), background: '#fff', borderRadius: 12, boxShadow: '0 8px 30px rgba(2,6,23,0.08)', padding: 16, overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>E‑commerce Dashboard</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>Live</div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Revenue</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>${ecomData.revenue?.toLocaleString() ?? '—'}</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Orders</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{ecomData.orders ?? '—'}</div>
              </div>
              <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: 10 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Conversion</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{((ecomData.conversion || 0) * 100).toFixed(2)}%</div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Top Products</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px', gap: 8 }}>
                {Array.isArray(ecomData.top_products) ? ecomData.top_products.map((p) => (
                  <React.Fragment key={p.id}>
                    <div style={{ fontSize: 13 }}>{p.name}</div>
                    <div style={{ textAlign: 'right', color: '#0ea5a4', fontWeight: 700 }}>{p.sales}</div>
                  </React.Fragment>
                )) : null}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Inventory</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {ecomData.inventory && Object.entries(ecomData.inventory).map(([pid, qty]) => (
                    <tr key={pid} style={{ borderTop: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 6px' }}>{pid}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right' }}>{qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* minimap overlay when requested */}
        {viewMode === 'minimap' && (() => {
          const ids = Object.keys(vehicles);
          if (ids.length === 0) return null;
          const playerId = ids.find((id) => id.toLowerCase().includes('player')) || ids[0];
          const player = vehicles[playerId];
          if (!player) return null;

          const minimapPx = 220;
          const worldSize = 0.18; // world units shown in minimap (square)
          const cx = player.nx;
          const cy = player.ny;
          const minx = cx - worldSize / 2;
          const miny = cy - worldSize / 2;
          const r = worldSize * 0.035;

          return (
            <div style={{ position: 'absolute', right: 16, top: 16, width: minimapPx, height: minimapPx, borderRadius: 8, overflow: 'hidden', boxShadow: '0 6px 18px rgba(0,0,0,0.18)', pointerEvents: 'none', background: '#fff' }}>
              <svg viewBox={`${minx} ${miny} ${worldSize} ${worldSize}`} width={minimapPx} height={minimapPx} preserveAspectRatio="xMidYMid meet">
                <rect x={minx} y={miny} width={worldSize} height={worldSize} fill="#fbfdff" />
                {mapData.polylines && mapData.polylines.map((pl, i) => (
                  <polyline key={i} points={pointsToStr(pl.points)} fill="none" stroke="#f4d35e" strokeWidth={worldSize * 0.02} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
                ))}
                {mapData.polylines && mapData.polylines.map((pl, i) => (
                  <polyline key={`inner-${i}`} points={pointsToStr(pl.points)} fill="none" stroke="#2b6cb0" strokeWidth={worldSize * 0.003} strokeLinecap="round" strokeLinejoin="round" />
                ))}

                {/* other vehicles */}
                {Object.values(vehicles).map((v) => (
                  <circle key={v.id} cx={v.nx} cy={v.ny} r={r} fill={v.id === playerId ? '#16a34a' : 'rgba(220,38,38,0.95)'} stroke="#fff" strokeWidth={worldSize * 0.005} />
                ))}
              </svg>
            </div>
          );
        })()}
        {/* QUBO heatmap overlay */}
        {quboData && (() => {
          const matrix = quboData.matrix || [];
          const labels = quboData.labels || [];
          const N = matrix.length;
          if (N === 0) return null;

          // compute max absolute for normalization
          let maxAbs = 0;
          for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) maxAbs = Math.max(maxAbs, Math.abs(matrix[i][j] || 0));
          if (maxAbs === 0) maxAbs = 1.0;

          const size = 180;
          const cell = size / N;

          const colorFor = (v) => {
            const norm = Math.max(-1, Math.min(1, v / maxAbs));
            // positive -> red, negative -> blue, zero -> white
            if (norm > 0) {
              const t = Math.round(255 - Math.floor(200 * (1 - norm)));
              return `rgb(255,${200 - Math.floor(120 * (1 - norm))},${200 - Math.floor(120 * (1 - norm))})`;
            } else if (norm < 0) {
              const t = Math.round(255 - Math.floor(200 * (1 + norm)));
              return `rgb(${200 - Math.floor(120 * (1 + norm))},${200 - Math.floor(120 * (1 + norm))},255)`;
            }
            return '#ffffff';
          };

          return (
            <div style={{ position: 'absolute', left: 16, bottom: 16, width: size, height: size, background: '#fff', borderRadius: 8, padding: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)', fontSize: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>QUBO Energy Density</div>
              <svg width={size - 16} height={size - 40} viewBox={`0 0 ${size - 16} ${size - 40}`}>
                {matrix.map((row, i) => row.map((val, j) => (
                  <rect key={`${i}-${j}`} x={j * cell} y={i * cell} width={cell} height={cell} fill={colorFor(val)} stroke="#ccc" strokeWidth={0.3} />
                )))}
              </svg>
              <div style={{ marginTop: 6, color: '#374151' }}>{labels.slice(0, 6).join(', ')}</div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
