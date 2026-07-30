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

            payload = json.dumps({'type': 'positions', 'vehicles': msgs})
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

    async def ws_handler(ws, path):
        await handler(ws, path, controller, vm, bounds)

    server = await websockets.serve(ws_handler, '0.0.0.0', 8765)
    print('WebSocket server listening on ws://0.0.0.0:8765')

    try:
        await server.wait_closed()
    finally:
        controller.disconnect()


def main():
    asyncio.run(main_async())


if __name__ == '__main__':
    main()
