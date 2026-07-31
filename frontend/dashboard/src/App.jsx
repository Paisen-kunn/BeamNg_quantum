import React, { useRef, useState, useEffect } from 'react';
import mapData from '../../assets/map_data.json';

const PICK_DROP_ROUTE_COLOR = '#ec4899';
const BEST_ROUTE_DARK_PINK = '#9d174d';

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
  const [manualRoute, setManualRoute] = useState([]);
  const [manualRouteMeta, setManualRouteMeta] = useState({});
  const [routeMode, setRouteMode] = useState('source');
  const [sourcePin, setSourcePin] = useState(null);
  const [destinationPin, setDestinationPin] = useState(null);
  const [following, setFollowing] = useState(false);
  const [followPos, setFollowPos] = useState(null); // {nx, ny}
  const [viewMode, setViewMode] = useState('full'); // 'full' or 'minimap'

  const wsRef = useRef(null);

  useEffect(() => {
    let ws;
    try {
    // connect to the backend WebSocket on the same host that served the page
    const wsHost = window.location.hostname || 'localhost';
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsPort = 8765;
    const wsUrl = `${wsProtocol}//${wsHost}:${wsPort}`;
    console.log('Connecting to WS at', wsUrl);
    ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => console.log('Connected to live map server', wsUrl);
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
            if (Array.isArray(data.manual_route)) {
              setManualRoute(data.manual_route);
            }
            if (data.manual_route_meta) {
              setManualRouteMeta(data.manual_route_meta);
            }
          } else if (data.type === 'opt_ack') {
            console.log('Server acked optimize request');
          } else if (data.type === 'route_ack') {
            console.log('Server acked route request', data.meta, data.route);
            if (Array.isArray(data.route)) {
              setManualRoute(data.route);
            }
            if (data.meta) {
              setManualRouteMeta(data.meta);
            }
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

  function requestRoute(source, destination) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'route_request', source, destination }));
  }

  function screenToNormalizedPoint(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    return { nx, ny };
  }

  function handleMapClick(e) {
    if (routeMode === 'none') return;
    const pt = screenToNormalizedPoint(e);
    if (!pt) return;

    if (routeMode === 'source') {
      setSourcePin(pt);
      if (destinationPin) {
        requestRoute(pt, destinationPin);
      }
      setRouteMode('destination');
    } else if (routeMode === 'destination') {
      setDestinationPin(pt);
      if (sourcePin) {
        requestRoute(sourcePin, pt);
      }
      setRouteMode('source');
    }
  }

  function clearPins() {
    setSourcePin(null);
    setDestinationPin(null);
    setManualRoute([]);
    setManualRouteMeta({});
    setRouteMode('source');
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
        <button type="button" onClick={() => setRouteMode('source')} style={{ marginTop: 6, background: routeMode === 'source' ? '#dbeafe' : '#eff6ff' }}>Pin Source</button>
        <button type="button" onClick={() => setRouteMode('destination')} style={{ background: routeMode === 'destination' ? '#dbeafe' : '#eff6ff' }}>Pin Destination</button>
        <button type="button" onClick={clearPins} style={{ background: '#f3f4f6' }}>Clear Pins</button>
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
        <div style={{ position: 'absolute', right: 16, top: 16, background: '#ffffffea', padding: '10px 12px', borderRadius: 10, boxShadow: '0 8px 24px rgba(15,23,42,0.12)', zIndex: 25, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Routing Simulation</div>
          <div style={{ fontSize: 12, color: '#475569' }}>Mode: {routeMode === 'source' ? 'Select source' : 'Select destination'}</div>
          <div style={{ fontSize: 12, color: '#15803d', marginTop: 4 }}>Source: {sourcePin ? `${sourcePin.nx.toFixed(3)}, ${sourcePin.ny.toFixed(3)}` : 'unset'}</div>
          <div style={{ fontSize: 12, color: '#b91c1c' }}>Destination: {destinationPin ? `${destinationPin.nx.toFixed(3)}, ${destinationPin.ny.toFixed(3)}` : 'unset'}</div>
          <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Highlighted route: {manualRoute.length > 0 ? `${manualRoute.length} segments` : 'none yet'}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>Pick/Drop route: <span style={{ color: PICK_DROP_ROUTE_COLOR, fontWeight: 700 }}>pink</span></div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Best route: <span style={{ color: BEST_ROUTE_DARK_PINK, fontWeight: 700 }}>dark pink</span></div>
        </div>
        {/* compare panel */}
        <div style={{ position: 'absolute', left: 16, top: 16, background: '#ffffffcc', padding: 8, borderRadius: 8, boxShadow: '0 6px 18px rgba(0,0,0,0.12)' }}>
          <div style={{ fontSize: 12, color: '#374151' }}>Baseline total: {metrics?.baseline_total ? metrics.baseline_total.toFixed(2) : '—'}</div>
          <div style={{ fontSize: 12, color: '#063970' }}>Optimized total: {metrics?.optimized_total ? metrics.optimized_total.toFixed(2) : '—'}</div>
          {metrics?.baseline_total && metrics?.optimized_total && (
            <div style={{ fontSize: 12, color: '#065f46' }}>Reduction: {((1 - (metrics.optimized_total / metrics.baseline_total)) * 100).toFixed(1)}%</div>
          )}
        </div>
        <svg viewBox="0 0 1 1" preserveAspectRatio="xMidYMid meet" width={w} height={h} onClick={handleMapClick} style={{ cursor: routeMode === 'none' ? 'grab' : 'crosshair' }}>
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
          {/* highlight manual route from source/destination pins */}
          {Array.isArray(manualRoute) && manualRoute.map((pli) => {
            const pl = mapData.polylines[pli];
            if (!pl) return null;
            return (
              <polyline key={`manual-${pli}`} points={pointsToStr(pl.points)} fill="none" stroke={PICK_DROP_ROUTE_COLOR} strokeWidth={Math.max(0.005, strokeWidth * 12)} strokeLinecap="round" strokeLinejoin="round" opacity={0.98} />
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
                <polyline key={`opt-${pli}`} points={pts} fill="none" stroke={BEST_ROUTE_DARK_PINK} strokeWidth={Math.max(0.004, strokeWidth * 10)} strokeLinecap="round" strokeLinejoin="round" opacity={0.98} />
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
                {sourcePin && (
                  <g>
                    <circle cx={sourcePin.nx} cy={sourcePin.ny} r={0.018 / state.scale} fill="#16a34a" stroke="#ffffff" strokeWidth={0.002} />
                    <circle cx={sourcePin.nx} cy={sourcePin.ny} r={0.006 / state.scale} fill="#dcfce7" stroke="none" />
                    <text x={sourcePin.nx + 0.008} y={sourcePin.ny - 0.008} fontSize={0.018 / state.scale} fill="#166534" stroke="#ffffff" strokeWidth={0.0008} paintOrder="stroke">S</text>
                  </g>
                )}
                {destinationPin && (
                  <g>
                    <circle cx={destinationPin.nx} cy={destinationPin.ny} r={0.018 / state.scale} fill="#dc2626" stroke="#ffffff" strokeWidth={0.002} />
                    <circle cx={destinationPin.nx} cy={destinationPin.ny} r={0.006 / state.scale} fill="#fee2e2" stroke="none" />
                    <text x={destinationPin.nx + 0.008} y={destinationPin.ny - 0.008} fontSize={0.018 / state.scale} fill="#991b1b" stroke="#ffffff" strokeWidth={0.0008} paintOrder="stroke">D</text>
                  </g>
                )}
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
