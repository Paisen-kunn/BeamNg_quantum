import asyncio
import json
import math
import os
import sys

# Ensure repository root is on sys.path so local `beamng` package imports work
ROOT = os.path.dirname(os.path.dirname(__file__))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import websockets

from beamng.controller import BeamNGController
from beamng.vehicle_manager import VehicleManager
from tools.quantum.qubo import build_qubo
from tools.quantum.solver import DWaveSolverWrapper

MAP_DATA = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'map_data.json')


async def broadcast_positions(websocket, path, controller, vehicle_manager, bounds):
    # Keep the connection open and send updates periodically
    try:
        while True:
            traffic = vehicle_manager.get_vehicle_data()
            msgs = []
            for v in traffic:
                x, y, z = v['position']
                minx, maxx = bounds['minx'], bounds['maxx']
                miny, maxy = bounds['miny'], bounds['maxy']
                nx = (x - minx) / (maxx - minx) if maxx != minx else 0.5
                ny = (maxy - y) / (maxy - miny) if maxy != miny else 0.5
                msgs.append({'id': v['id'], 'x': x, 'y': y, 'nx': nx, 'ny': ny, 'speed': v['speed']})

            # include any optimised routes computed by background optimiser
            opt = websocket.app_state.get('optimised_routes') if hasattr(websocket, 'app_state') else None
            payload = json.dumps({'type': 'positions', 'vehicles': msgs, 'optimised_routes': opt or {}})
            await websocket.send(payload)
            await asyncio.sleep(0.2)
    except websockets.exceptions.ConnectionClosed:
        return


async def handler(websocket, path, controller, vehicle_manager, bounds):
    # Upon new client, just call broadcast_positions until disconnect
    await broadcast_positions(websocket, path, controller, vehicle_manager, bounds)


def load_bounds():
    with open(MAP_DATA, 'r', encoding='utf-8') as f:
        d = json.load(f)
    return d['bounds']


async def main_async():
    controller = BeamNGController()
    controller.connect()

    vm = VehicleManager(controller.bng)
    vm.connect_all_vehicles()

    bounds = load_bounds()
    with open(MAP_DATA, 'r', encoding='utf-8') as f:
        map_data = json.load(f)

    # shared state for optimiser -> websocket handlers
    app_state = {'optimised_routes': {}}

    # simple optimiser task: every few seconds build candidate paths and solve QUBO
    async def optimiser_task():
        solver = DWaveSolverWrapper(use_dwave=False)
        while True:
            try:
                traffic = vm.get_vehicle_data()
                # Build simple candidate paths per vehicle using nearby polylines
                vehicle_paths = {}
                path_costs = {}
                # index polylines by centroid
                centroids = []
                for i, pl in enumerate(map_data.get('polylines', [])):
                    xs = [p['nx'] for p in pl['points']]
                    ys = [p['ny'] for p in pl['points']]
                    centroids.append((i, sum(xs)/len(xs), sum(ys)/len(ys)))

                for v in traffic:
                    vid = v['id']
                    vx = v['position'][0]
                    vy = v['position'][1]
                    # normalized coords
                    nx = v.get('nx')
                    ny = v.get('ny')
                    if nx is None:
                        # fallback compute using bounds
                        minx, maxx = bounds['minx'], bounds['maxx']
                        miny, maxy = bounds['miny'], bounds['maxy']
                        nx = (vx - minx) / (maxx - minx) if maxx != minx else 0.5
                        ny = (maxy - vy) / (maxy - miny) if maxy != miny else 0.5

                    # find nearest 3 polylines
                    dists = []
                    for i, cx, cy in centroids:
                        dx = cx - nx
                        dy = cy - ny
                        dists.append((dx*dx + dy*dy, i))
                    dists.sort()
                    # make up to 2 candidate 'paths' by selecting 1 or 2 nearby polylines
                    candidates = []
                    for k in range(2):
                        if k < len(dists):
                            idx = dists[k][1]
                            # represent path as list of polyline indices (edge ids)
                            candidates.append([idx])
                            path_costs[(vid, k)] = float(len(map_data['polylines'][idx]['points']))
                    if not candidates:
                        candidates = [[0]]
                        path_costs[(vid,0)] = 1.0
                    vehicle_paths[vid] = candidates

                if vehicle_paths:
                    qubo, index_map = build_qubo(vehicle_paths, path_costs, same_vehicle_penalty=8.0, overlap_penalty=4.0)
                    res = solver.sample_qubo(qubo, num_reads=50)
                    sample = res.get('sample', {})
                    # map back chosen paths
                    chosen = {}
                    for idx, bit in sample.items():
                        if bit:
                            # idx may be string keys depending on sampler
                            i = int(idx)
                            vid, pidx = index_map[i]
                            chosen.setdefault(vid, []).append(pidx)
                    # simplify to single chosen index per vehicle (pick first)
                    chosen_single = {vid: paths[0] if isinstance(paths, list) and len(paths) > 0 else None for vid, paths in chosen.items()}
                    # convert to polyline index lists
                    chosen_polylines = {}
                    for vid, pidx in chosen_single.items():
                        if pidx is None:
                            continue
                        pl_idx = vehicle_paths[vid][pidx]
                        chosen_polylines[vid] = pl_idx

                    app_state['optimised_routes'] = chosen_polylines
            except Exception as e:
                print('Optimiser error:', e)
            await asyncio.sleep(5.0)


    # Accept either (websocket, path) or just (websocket,) depending on websockets version
    async def ws_handler(ws, path=None):
        # attach shared state so handler can read optimisation results
        try:
            ws.app_state = app_state
        except Exception:
            pass
        await handler(ws, path, controller, vm, bounds)

    server = await websockets.serve(ws_handler, '0.0.0.0', 8765)
    print('WebSocket server listening on ws://0.0.0.0:8765')

    # start optimiser background task
    asyncio.create_task(optimiser_task())

    try:
        await server.wait_closed()
    finally:
        controller.disconnect()


def main():
    asyncio.run(main_async())


if __name__ == '__main__':
    main()
