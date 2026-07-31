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

            # include any optimised routes and metrics computed by background optimiser
            opt = websocket.app_state.get('optimised_routes') if hasattr(websocket, 'app_state') else None
            metrics = websocket.app_state.get('metrics') if hasattr(websocket, 'app_state') else None
            payload = json.dumps({'type': 'positions', 'vehicles': msgs, 'optimised_routes': opt or {}, 'metrics': metrics or {}})
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

    # build graph from map data once
    from tools.quantum.graph import build_graph_from_map, nearest_node_for_coord
    from tools.quantum.k_shortest import k_shortest_paths

    graph = build_graph_from_map(map_data)

    # simple optimiser task: every few seconds build candidate paths and solve QUBO
    async def optimiser_task():
        # configure D-Wave usage from environment
        use_dwave = os.environ.get('DWAVE_USE_HW', '0') in ('1', 'true', 'True')
        sampler_params = {}
        # optional annealing params
        at = os.environ.get('DWAVE_ANNEALING_TIME')
        if at:
            try:
                sampler_params['annealing_time'] = float(at)
            except Exception:
                pass
        nsrt = os.environ.get('DWAVE_NUM_SPIN_REVERSAL')
        if nsrt:
            try:
                sampler_params['num_spin_reversal_transforms'] = int(nsrt)
            except Exception:
                pass

        solver = DWaveSolverWrapper(use_dwave=use_dwave, sampler_params=sampler_params)
        while True:
            try:
                traffic = vm.get_vehicle_data()
                # Build candidate k-shortest paths per vehicle using road graph
                vehicle_paths = {}       # paths as lists of edge ids (for QUBO)
                vehicle_display = {}     # paths as lists of polyline indices (for dashboard)
                path_costs = {}

                for v in traffic:
                    vid = v['id']
                    vx = v['position'][0]
                    vy = v['position'][1]
                    nx = v.get('nx')
                    ny = v.get('ny')
                    if nx is None:
                        minx, maxx = bounds['minx'], bounds['maxx']
                        miny, maxy = bounds['miny'], bounds['maxy']
                        nx = (vx - minx) / (maxx - minx) if maxx != minx else 0.5
                        ny = (maxy - vy) / (maxy - miny) if maxy != miny else 0.5

                    src = nearest_node_for_coord(graph, nx, ny)
                    # choose a set of target nodes (intersections) within a radius
                    # simple heuristic: use nodes with degree > 1
                    candidate_targets = [i for i, adjl in graph['adj'].items() if len(adjl) > 1]
                    # compute distances and pick few targets
                    def ndist(n):
                        x, y = graph['nodes'][n]
                        dx = x - nx
                        dy = y - ny
                        return dx*dx + dy*dy
                    candidate_targets.sort(key=ndist)
                    targets = candidate_targets[:6]

                    K = 3
                    candidates = []
                    disp_candidates = []
                    for t in targets[:3]:
                        paths = k_shortest_paths(graph, src, t, K=K)
                        for pidx, path in enumerate(paths[:K]):
                            if not path:
                                continue
                            key = len(candidates)
                            candidates.append(path)
                            # display sequence: map edge ids to polyline indices (keep order)
                            poly_seq = [graph['edges'][eid]['poly_idx'] for eid in path]
                            disp_candidates.append(poly_seq)
                            # cost = total length
                            cost = sum(graph['edges'][eid]['weight'] for eid in path)
                            path_costs[(vid, key)] = float(cost)
                    if not candidates:
                        # fallback to nearest polyline index
                        candidates = [[0]]
                        disp_candidates = [[0]]
                        path_costs[(vid,0)] = 1.0
                    vehicle_paths[vid] = candidates
                    vehicle_display[vid] = disp_candidates

                # honour on-demand optimisation trigger
                if app_state.get('optimize_request'):
                    app_state['optimize_request'] = False
                    run_now = True
                else:
                    run_now = False

                # prepare edge capacities (default 2 per edge)
                edge_capacity = {eid: 2 for eid in graph['edges'].keys()}

                if vehicle_paths and (run_now or True):
                    qubo, index_map = build_qubo(vehicle_paths, path_costs, same_vehicle_penalty=8.0, overlap_penalty=4.0, edge_capacity=edge_capacity)
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
                    optimized_total = 0.0
                    baseline_total = 0.0
                    # baseline: take first candidate cost per vehicle
                    for vid, cand_list in vehicle_paths.items():
                        if (vid, 0) in path_costs:
                            baseline_total += path_costs[(vid, 0)]

                    for vid, pidx in chosen_single.items():
                        if pidx is None:
                            continue
                        # chosen path as edge ids
                        edge_path = vehicle_paths[vid][pidx]
                        # convert to polyline sequence for display
                        # choose corresponding display candidate if sizes match
                        disp_seq = vehicle_display.get(vid, [])
                        pl_idx = None
                        if pidx < len(disp_seq):
                            pl_idx = disp_seq[pidx]
                        else:
                            # fallback map edges to poly idxs
                            pl_idx = [graph['edges'][eid]['poly_idx'] for eid in edge_path]
                        chosen_polylines[vid] = pl_idx
                        # accumulate optimized cost
                        optimized_total += sum(graph['edges'][eid]['weight'] for eid in edge_path)

                    app_state['optimised_routes'] = chosen_polylines
                    app_state['metrics'] = {'baseline_total': baseline_total, 'optimized_total': optimized_total}
                    try:
                        print('Optimiser produced routes:', json.dumps({'routes': chosen_polylines, 'metrics': app_state['metrics']}))
                    except Exception:
                        print('Optimiser produced routes (non-serializable)')
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

        # run broadcast send loop and receive loop concurrently
        send_task = asyncio.create_task(broadcast_positions(ws, path, controller, vm, bounds))

        try:
            async for message in ws:
                # expect JSON messages from client
                try:
                    m = json.loads(message)
                    if m.get('type') == 'optimize':
                        # signal optimiser to run immediately
                        app_state['optimize_request'] = True
                        try:
                            print('Received optimize request from client')
                        except Exception:
                            pass
                        # send ack back to client
                        try:
                            await ws.send(json.dumps({'type': 'opt_ack'}))
                        except Exception:
                            pass
                except Exception:
                    pass
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            send_task.cancel()

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
