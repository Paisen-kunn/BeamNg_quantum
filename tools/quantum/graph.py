"""
Build a simple road graph from map_data.json polylines.

Nodes are unique coordinates (rounded). Each polyline becomes an edge from its
start node to end node with weight equal to summed segment lengths. Edges store
the original polyline index so candidate paths can be represented as lists of
polyline indices.
"""
import math
from typing import Dict, Tuple, List, Any


def round_coord(x, y, prec=6):
    return (round(x, prec), round(y, prec))


def build_graph_from_map(map_data):
    nodes = {}
    node_list = []
    edges = {}  # edge_id -> {from,to,weight,poly_idx,seg_idx}
    adj = {}

    def ensure_node(coord):
        if coord in nodes:
            return nodes[coord]
        idx = len(node_list)
        nodes[coord] = idx
        node_list.append(coord)
        adj[idx] = []
        return idx

    # Build segment-level graph: split each polyline into segments between consecutive points
    for pi, pl in enumerate(map_data.get('polylines', [])):
        pts = pl.get('points', [])
        if len(pts) < 2:
            continue
        for si in range(len(pts) - 1):
            a = round_coord(pts[si]['nx'], pts[si]['ny'])
            b = round_coord(pts[si+1]['nx'], pts[si+1]['ny'])
            u = ensure_node(a)
            v = ensure_node(b)
            x1, y1 = pts[si]['nx'], pts[si]['ny']
            x2, y2 = pts[si+1]['nx'], pts[si+1]['ny']
            length = math.hypot(x2 - x1, y2 - y1)
            eid = len(edges)
            edges[eid] = {'from': u, 'to': v, 'weight': length, 'poly_idx': pi, 'seg_idx': si}
            adj[u].append(eid)
            # reverse direction
            rid = len(edges)
            edges[rid] = {'from': v, 'to': u, 'weight': length, 'poly_idx': pi, 'seg_idx': si}
            adj[v].append(rid)

    graph = {'nodes': node_list, 'nodes_map': nodes, 'edges': edges, 'adj': adj}
    return graph


def nearest_node_for_coord(graph, nx, ny):
    best = None
    bestd = float('inf')
    for idx, (x, y) in enumerate(graph['nodes']):
        dx = x - nx
        dy = y - ny
        d = dx*dx + dy*dy
        if d < bestd:
            bestd = d
            best = idx
    return best
