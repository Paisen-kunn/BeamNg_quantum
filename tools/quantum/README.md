D-Wave integration notes

This folder contains a simple QUBO builder and a solver wrapper that can use
D-Wave QPUs or hybrid solvers via the D-Wave Ocean SDK.

Requirements
- Configure D-Wave credentials (https://docs.ocean.dwavesys.com/en/stable/overview/sapi.html)
- Install dependencies: `pip install dwave-ocean-sdk dwave-system dimod`

Environment variables
- `DWAVE_USE_HW=1` to enable D-Wave samplers (QPU or hybrid). If unset or 0, the server falls back to classical samplers.
- `DWAVE_ANNEALING_TIME` (float) to set annealing time for QPU sampler (microseconds).
- `DWAVE_NUM_SPIN_REVERSAL` (int) to set number of spin-reversal transforms.

Notes
- Real quantum annealing runs require valid D-Wave credentials and network access to the Leap/QPU endpoints.
- For development without hardware, the wrapper falls back to `dimod.SimulatedAnnealingSampler`.
- The current `optimiser_task` in `tools/live_map_server.py` uses the solver wrapper and will respect `DWAVE_USE_HW` and sampler params.
