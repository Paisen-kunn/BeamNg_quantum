from beamng.controller import BeamNGController

controller = BeamNGController()
controller.connect()

print("\nBeamNG object:")
print(controller.bng)

print("\nHas vehicles API?")
print(hasattr(controller.bng, "vehicles"))

print("\nHas scenario API?")
print(hasattr(controller.bng, "scenario"))

controller.disconnect()