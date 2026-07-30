"""
Example runner that builds a toy QUBO, solves it using the solver wrapper,
and writes results to stdout and a JSON file.

Run: python runner.py
"""
import json
from qubo import build_qubo, example_problem
from solver import DWaveSolverWrapper

def main():
    vehicle_paths, path_costs = example_problem()
    qubo, index_map = build_qubo(vehicle_paths, path_costs, same_vehicle_penalty=8.0, overlap_penalty=6.0)

    solver = DWaveSolverWrapper(use_dwave=True)
    res = solver.sample_qubo(qubo, num_reads=50)

    out = {
        'qubo_size': len(qubo),
        'solution': res,
        'index_map': index_map,
    }
    print(json.dumps(out, indent=2))
    with open('tools/quantum/last_solution.json', 'w') as f:
        json.dump(out, f, indent=2)

if __name__ == '__main__':
    main()
