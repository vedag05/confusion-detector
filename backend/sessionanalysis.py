"""
Usage:
    python sessionanalysis.py logs/session_20250729_125315.jsonl
Outputs:
    emotion_timeline.png   (line chart, distinct colours)
    gaze_heat_gray.png     (grayscale heat-map)
    gaze_heat_color.png    (JET colour map)
"""

import json, sys, collections, itertools
import pandas as pd, numpy as np, cv2, matplotlib.pyplot as plt
from matplotlib.cm import get_cmap

# ---------- load ----------
if len(sys.argv) < 2:
    raise SystemExit("python sessionanalysis.py <log.jsonl>")
rows = [json.loads(l) for l in open(sys.argv[1])]
df   = pd.json_normalize(rows)

# ---------- emotion timeline ----------
# explode to long form
emo_long = (
    df["emotions"]
    .explode()
    .dropna()
    .apply(pd.Series)        # -> name, score
)
# pivot to wide, forward-fill
pivot = emo_long.pivot_table(index=emo_long.index,
                             columns="name",
                             values="score",
                             aggfunc="first").ffill()

# keep at most 5 most-frequent emotions for clarity
top_names = pivot.mean().sort_values(ascending=False).head(5).index
pivot = pivot[top_names]

# distinct colours from tab10 palette
palette = get_cmap("tab10").colors
color_map = dict(zip(top_names, palette))

plt.figure(figsize=(12,4))
for i, name in enumerate(top_names):
    plt.plot(pivot.index * 0.25,   # seconds (250 ms per row)
             pivot[name],
             label=name,
             color=color_map[name],
             linewidth=2)
plt.xlabel("Time (s)"); plt.ylabel("Score (0-1)")
plt.title("Top-5 emotion scores during PAIL task")
plt.legend(loc="upper right")
plt.tight_layout()
plt.savefig("emotion_timeline.png", dpi=300)

# ---------- gaze heat-map ----------
# ----- choose resolution automatically from data -----
xs = [b["x2"] for b in df["gaze_box"].dropna()]
ys = [b["y2"] for b in df["gaze_box"].dropna()]

SCREEN_W = int(max(xs) + 50) if xs else 1920   # +50 px margin
SCREEN_H = int(max(ys) + 50) if ys else 1080

heat = np.zeros((SCREEN_H, SCREEN_W), np.float32)
print(f"Heat-map canvas: {SCREEN_W} × {SCREEN_H}px")


for box in df["gaze_box"].dropna():
    x1,y1,x2,y2 = map(int, (box["x1"], box["y1"], box["x2"], box["y2"]))
    # clamp
    x1 = max(0, min(SCREEN_W-1, x1))
    y1 = max(0, min(SCREEN_H-1, y1))
    x2 = max(0, min(SCREEN_W-1, x2))
    y2 = max(0, min(SCREEN_H-1, y2))
    if x2 > x1 and y2 > y1:
        heat[y1:y2, x1:x2] += 1

# smooth & normalise
heat = cv2.GaussianBlur(heat, (0,0), sigmaX=25, sigmaY=25)
if heat.max() > 0:
    heat_norm = (heat / heat.max() * 255).astype(np.uint8)
else:
    heat_norm = heat.astype(np.uint8)

cv2.imwrite("gaze_heat_gray.png", heat_norm)
color = cv2.applyColorMap(heat_norm, cv2.COLORMAP_JET)
cv2.imwrite("gaze_heat_color.png", color)

print("✅ emotion_timeline.png, gaze_heat_gray.png, gaze_heat_color.png written")
