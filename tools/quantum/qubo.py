"""
Simple QUBO builder for vehicle routing choices.

This module builds a QUBO dictionary for a routing-assignment problem where
each vehicle chooses one path from a small candidate set. The objective
minimizes sum(path_cost * x) + penalties for conflicts (shared edges) and
enforces one-path-per-vehicle via quadratic penalties.

The returned QUBO is a dict {(i,j): weight} suitable for dimod.BinaryQuadraticModel.from_qubo
or samplers that accept a QUBO dictionary.
"""
from typing import Dict, Tuple, List, Any

def build_qubo(vehicle_paths, path_costs=None, same_vehicle_penalty=10.0, overlap_penalty=5.0):
    """
    Build a QUBO for a routing assignment problem.

    Args:
      vehicle_paths: dict mapping vehicle_id -> list of candidate paths.
        Each path is represented as a tuple/list of edges (edge ids or hashable).
      path_costs: optional dict mapping (vehicle_id, path_index) -> cost (float).
                 If omitted, path cost = number of edges.
      same_vehicle_penalty: penalty to enforce one-path-per-vehicle.
      overlap_penalty: penalty applied for each shared edge between two chosen paths.

    Returns:
      qubo: dict[(i,j)] -> weight
      index_map: dict index -> (vehicle_id, path_index)
    """
    # assign integer variable indices
    index = 0
    index_map = {}
    inv_map = {}
    for vid, paths in vehicle_paths.items():
        for pidx, _ in enumerate(paths):
            index_map[index] = (vid, pidx)
            inv_map[(vid, pidx)] = index
            index += 1

    qubo: Dict[Tuple[int,int], float] = {}

    def add_qubo(i, j, w):
        if i > j:
            i, j = j, i
        qubo[(i,j)] = qubo.get((i,j), 0.0) + w

    # linear terms from path costs
    for idx, (vid, pidx) in index_map.items():
        if path_costs and (vid, pidx) in path_costs:
            cost = float(path_costs[(vid, pidx)])
        else:
            # default cost: path length (number of edges)
            cost = float(len(vehicle_paths[vid][pidx]))
        # incorporate the one-hot penalty linear shift: c_i - same_vehicle_penalty
        add_qubo(idx, idx, cost - float(same_vehicle_penalty))

    # same-vehicle coupling to enforce exactly-one via penalty*(sum-1)^2
    for vid, paths in vehicle_paths.items():
        indices = [inv_map[(vid, pidx)] for pidx in range(len(paths))]
        for i in range(len(indices)):
            for j in range(i+1, len(indices)):
                # coefficient 2*penalty for pairwise term (see derivation)
                add_qubo(indices[i], indices[j], 2.0 * float(same_vehicle_penalty))

    # overlap penalties between different vehicles' paths
    # build edge->list(vars) map
    edge_map = {}
    for idx, (vid, pidx) in index_map.items():
        path = vehicle_paths[vid][pidx]
        for e in path:
            edge_map.setdefault(e, []).append(idx)

    for e, varlist in edge_map.items():
        # for every pair using same edge, penalize joint selection
        for i in range(len(varlist)):
            for j in range(i+1, len(varlist)):
                add_qubo(varlist[i], varlist[j], float(overlap_penalty))

    return qubo, index_map


def example_problem():
    """Create a tiny example network and candidate paths for testing."""
    # simple edges named as tuples
    # two vehicles with two candidate paths each; paths represented as lists of edges
    vehicle_paths = {
        'vehA': [ [(0,1),(1,2)], [(0,3),(3,2)] ],
        'vehB': [ [(4,1),(1,5)], [(4,6),(6,5)] ],
    }
    # optional custom costs
    path_costs = {('vehA',0): 5.0, ('vehA',1): 6.0, ('vehB',0): 4.0, ('vehB',1): 7.0}
    return vehicle_paths, path_costs
