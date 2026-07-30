import time
import os

from beamng.controller import BeamNGController
from beamng.vehicle_manager import VehicleManager


def main():
    controller = BeamNGController()

    try:
        controller.connect()

        print("Load Poland Roads, spawn traffic, then press ENTER...")
        input()

        vehicle_manager = VehicleManager(controller.bng)
        vehicle_manager.connect_all_vehicles()


        print("\nLive Traffic Data:\n")

        while True:
            os.system("cls")
            traffic = vehicle_manager.get_vehicle_data()

            print("=" * 60)

            for vehicle in traffic:
                print(
                    f"{vehicle['id']:12}"
                    f" Speed: {vehicle['speed']:.2f} m/s"
                    f" Position: {vehicle['position']}"
                )

            time.sleep(1)

    except KeyboardInterrupt:
        print("\nClosing...")

    finally:
        controller.disconnect()


if __name__ == "__main__":
    main()