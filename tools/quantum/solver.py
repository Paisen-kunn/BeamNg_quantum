"""
Sampler wrapper that prefers D-Wave Ocean samplers but falls back to classical solvers.

Usage:
  solver = DWaveSolverWrapper()
  result = solver.sample_qubo(qubo_dict, num_reads=100)

If the D-Wave Ocean SDK is available and credentials configured, it will use
the hardware sampler; otherwise it uses dimod's simulated annealer.
"""
from typing import Dict, Tuple, Any
import json

try:
    # prefer dimod interface
    import dimod
except Exception:
    dimod = None

class DWaveSolverWrapper:
    def __init__(self, use_dwave=True, sampler_params=None):
        self.use_dwave = use_dwave
        self.sampler_params = sampler_params or {}

    def _to_bqm(self, qubo: Dict[Tuple[int,int], float]):
        if dimod is None:
            return None
        return dimod.BinaryQuadraticModel.from_qubo(qubo)

    def sample_qubo(self, qubo: Dict[Tuple[int,int], float], num_reads: int = 100):
        bqm = self._to_bqm(qubo)

        # Try D-Wave hardware sampler (with EmbeddingComposite) or hybrid sampler
        if self.use_dwave:
            try:
                from dwave.system import DWaveSampler, EmbeddingComposite, LeapHybridSampler
                # Prefer D-Wave QPU when available
                try:
                    sampler = EmbeddingComposite(DWaveSampler())
                    params = {**self.sampler_params}
                    params.setdefault('num_reads', num_reads)
                    sampleset = sampler.sample_qubo({k: v for k, v in qubo.items()}, **params)
                    best = sampleset.first
                    return {'sample': dict(best.sample), 'energy': float(best.energy), 'source': 'dwave_qpu'}
                except Exception:
                    # fallback to Leap Hybrid if QPU not reachable
                    sampler = LeapHybridSampler()
                    params = {**self.sampler_params}
                    params.setdefault('time_limit', 5)
                    sampleset = sampler.sample(bqm, **params)
                    best = sampleset.first
                    return {'sample': dict(best.sample), 'energy': float(best.energy), 'source': 'dwave_hybrid'}
            except Exception as e:
                print('D-Wave samplers unavailable or failed:', e)

        # Try dimod simulated annealing
        if dimod is not None:
            try:
                sampler = dimod.SimulatedAnnealingSampler()
                sampleset = sampler.sample(bqm, num_reads=num_reads)
                best = sampleset.first
                return {'sample': dict(best.sample), 'energy': float(best.energy), 'source': 'simulated_annealing'}
            except Exception as e:
                print('Dimod SA failed:', e)

        # Last-resort: greedy random sampler
        vars = sorted(set([i for i,j in qubo.keys()] + [j for i,j in qubo.keys()]))
        import random
        best_sample = None
        best_energy = float('inf')
        for _ in range(max(10, num_reads)):
            s = {v: random.choice([0,1]) for v in vars}
            energy = 0.0
            for (i,j), w in qubo.items():
                energy += w * s[i] * s[j]
            if energy < best_energy:
                best_energy = energy
                best_sample = s.copy()
        return {'sample': best_sample, 'energy': best_energy, 'source': 'greedy_random'}
