"""
Yen's algorithm for k-shortest loopless paths on the simple graph created by graph.py.

Paths are returned as lists of edge ids; we convert these to polyline indices by
looking up `edges[edge_id]['poly_idx']`.
"""
import heapq
from typing import List, Dict, Tuple


def dijkstra(graph, source, target):
    # nodes are indices, edges in graph['edges'], adj lists of edge ids
    import math
    dist = {source: 0.0}
    prev = {}
    pq = [(0.0, source)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == target:
            break
        if d > dist.get(u, float('inf')):
            continue
        for eid in graph['adj'].get(u, []):
            e = graph['edges'][eid]
            v = e['to']
            nd = d + e['weight']
            if nd < dist.get(v, float('inf')):
                dist[v] = nd
                prev[v] = (u, eid)
                heapq.heappush(pq, (nd, v))

    if target not in dist:
        return None
    # reconstruct path as list of edge ids
    path_edges = []
    cur = target
    while cur != source:
        u, eid = prev[cur]
        path_edges.append(eid)
        cur = u
    path_edges.reverse()
    return path_edges


def k_shortest_paths(graph, source, target, K=3):
    # Implementation of Yen's algorithm
    A = []  # shortest paths
    B = []  # potential kth

    sp = dijkstra(graph, source, target)
    if not sp:
        return A
    A.append(sp)

    for k in range(1, K):
        for i in range(len(A[-1])):
            spur_node = graph['edges'][A[-1][i]]['from']
            root_path = A[-1][:i]

            removed_edges = set()
            for p in A:
                if len(p) > i and p[:i] == root_path:
                    removed_edges.add(p[i])

            # temporarily remove edges
            removed = {}
            for eid in removed_edges:
                # mark by deleting from adj
                e = graph['edges'][eid]
                u = e['from']
                if eid in graph['adj'][u]:
                    graph['adj'][u].remove(eid)
                    removed[eid] = u

            spur_path = dijkstra(graph, spur_node, target)

            # restore removed edges
            for eid, u in removed.items():
                graph['adj'][u].append(eid)

            if spur_path:
                total_path = root_path + spur_path
                # avoid duplicates
                if total_path not in A and total_path not in [p for _, p in B]:
                    cost = sum(graph['edges'][e]['weight'] for e in total_path)
                    heapq.heappush(B, (cost, total_path))

        if not B:
            break
        cost, path = heapq.heappop(B)
        A.append(path)

    return A
