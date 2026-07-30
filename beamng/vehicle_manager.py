import math


class VehicleManager:
    def __init__(self, bng):
        self.bng = bng
        self.vehicles = {}
        self.connected = False

    def get_all_vehicles(self):
        self.vehicles = self.bng.vehicles.get_current()
        return self.vehicles

    def connect_all_vehicles(self):
        if self.connected:
            return

        self.get_all_vehicles()

        print(f"Connecting to {len(self.vehicles)} vehicles...")

        for vehicle in self.vehicles.values():
            vehicle.connect(self.bng)

        self.connected = True
        print("All vehicles connected!")

    def get_vehicle_data(self):
        if not self.connected:
            raise RuntimeError(
                "Vehicles are not connected. Call connect_all_vehicles() first."
            )

        traffic_data = []

        for vehicle_id, vehicle in self.vehicles.items():
            vehicle.poll_sensors()

            state = vehicle.state

            vx, vy, vz = state["vel"]
            speed = math.sqrt(vx ** 2 + vy ** 2 + vz ** 2)

            # Include rotation/heading when available (may be None)
            rot = state.get('rot') if isinstance(state, dict) else None
            direction = state.get('dir') if isinstance(state, dict) else None

            traffic_data.append({
                "id": vehicle_id,
                "position": state["pos"],
                "speed": speed,
                "rot": rot,
                "dir": direction,
            })

        return traffic_data