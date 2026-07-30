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
                        if '"position":' in text or '"position"' in text:
                            try:
                                # Many files contain multiple JSON objects per line; split by lines and parse objects
                                for line in text.splitlines():
                                    line = line.strip()
                                    if '"position"' in line:
                                        # extract array portion
                                        start = line.find('[', line.find('"position"'))
                                        end = line.find(']', start)
                                        if start != -1 and end != -1:
                                            arr = line[start:end+1]
                                            coords = json.loads(arr)
                                            if isinstance(coords, list) and len(coords) >= 2:
                                                positions.append(coords[:3])
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

    xs = [p[0] for p in positions]
    ys = [p[1] for p in positions]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)

    normalized = []
    for p in positions:
        x, y = p[0], p[1]
        nx = (x - minx) / (maxx - minx) if maxx != minx else 0.5
        ny = (maxy - y) / (maxy - miny) if maxy != miny else 0.5
        normalized.append({'x': x, 'y': y, 'nx': nx, 'ny': ny})

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
        'points': normalized,
    }

    os.makedirs(os.path.dirname(OUT_FILE), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=2)

    print('Wrote', OUT_FILE)

if __name__ == '__main__':
    main()
