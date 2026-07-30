import os
import json

LEVEL_DIR = os.path.join(os.path.dirname(__file__), '..', 'polish_roads_repo', 'levels', 'polish_roads_v2')
OUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'map_data.json')

def find_position_lines(root):
    positions = []
    for dirpath, dirs, files in os.walk(root):
        for fname in files:
            if fname.endswith('.json') or fname.endswith('.level.json') or fname.endswith('.level'):
                path = os.path.join(dirpath, fname)
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        text = f.read()
                        # quick check
                        # extract simple position arrays
                        if '"position"' in text:
                            try:
                                for line in text.splitlines():
                                    line = line.strip()
                                    if '"position"' in line:
                                        start = line.find('[', line.find('"position"'))
                                        end = line.find(']', start)
                                        if start != -1 and end != -1:
                                            arr = line[start:end+1]
                                            coords = json.loads(arr)
                                            if isinstance(coords, list) and len(coords) >= 2:
                                                positions.append(coords[:3])
                            except Exception:
                                pass
                        # extract nodes arrays (polylines)
                        if '"nodes"' in text:
                            try:
                                idx = 0
                                while True:
                                    idx = text.find('"nodes"', idx)
                                    if idx == -1:
                                        break
                                    # find opening bracket for array
                                    bstart = text.find('[', idx)
                                    if bstart == -1:
                                        break
                                    depth = 0
                                    i = bstart
                                    while i < len(text):
                                        if text[i] == '[':
                                            depth += 1
                                        elif text[i] == ']':
                                            depth -= 1
                                            if depth == 0:
                                                bend = i
                                                break
                                        i += 1
                                    else:
                                        break
                                    arr_text = text[bstart:bend+1]
                                    try:
                                        arr = json.loads(arr_text)
                                        # arr is list of node entries, each a list of numbers
                                        # collect first two coords from each node
                                        poly = []
                                        for node in arr:
                                            if isinstance(node, list) and len(node) >= 2:
                                                poly.append([node[0], node[1], node[2] if len(node) > 2 else 0])
                                        if poly:
                                            positions.append({'poly': poly})
                                    except Exception:
                                        pass
                                    idx = bend + 1
                            except Exception:
                                pass
                except Exception:
                    pass
    return positions

def main():
    positions = find_position_lines(LEVEL_DIR)
    if not positions:
        print('No positions found')
        return

    xs = []
    ys = []
    for p in positions:
        if isinstance(p, dict) and 'poly' in p:
            for node in p['poly']:
                xs.append(node[0])
                ys.append(node[1])
        else:
            try:
                xs.append(p[0])
                ys.append(p[1])
            except Exception:
                pass

    if not xs or not ys:
        print('No coordinate extents found')
        return

    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    normalized_points = []
    polylines = []
    for p in positions:
        if isinstance(p, dict) and 'poly' in p:
            pts = []
            for node in p['poly']:
                x, y = node[0], node[1]
                nx = (x - minx) / (maxx - minx) if maxx != minx else 0.5
                ny = (maxy - y) / (maxy - miny) if maxy != miny else 0.5
                pts.append({'x': x, 'y': y, 'nx': nx, 'ny': ny})
            if pts:
                polylines.append({'points': pts})
        else:
            try:
                x, y = p[0], p[1]
                nx = (x - minx) / (maxx - minx) if maxx != minx else 0.5
                ny = (maxy - y) / (maxy - miny) if maxy != miny else 0.5
                normalized_points.append({'x': x, 'y': y, 'nx': nx, 'ny': ny})
            except Exception:
                pass

    preview_src = os.path.join(LEVEL_DIR, 'polish_roads_preview1.png')
    preview_dst = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'assets', 'map_preview.png')
    try:
        import shutil
        os.makedirs(os.path.dirname(preview_dst), exist_ok=True)
        shutil.copy2(preview_src, preview_dst)
        preview_rel = 'map_preview.png'
    except Exception:
        preview_rel = preview_src

    out = {
        'sourcePreview': preview_rel,
        'bounds': {'minx': minx, 'maxx': maxx, 'miny': miny, 'maxy': maxy},
        'points': normalized_points,
        'polylines': polylines,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2)

    print('Wrote', OUT_FILE)

if __name__ == '__main__':
    main()
