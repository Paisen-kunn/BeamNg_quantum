from beamngpy import BeamNGpy
from config import BEAMNG_HOME, HOST, PORT


class BeamNGController:
    def __init__(self):
        self.bng = BeamNGpy(
            HOST,
            PORT,
            home=BEAMNG_HOME
        )

    def connect(self):
        print("Connecting to BeamNG...")
        self.bng.open(launch=True)
        print("Connected to BeamNG!")

    def disconnect(self):
        self.bng.close()