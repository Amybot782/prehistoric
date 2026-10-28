/**
 * Collision shapes in world space (tile units). Collisions never use sprite
 * rectangles: each solid object declares its real footprint on the ground.
 */
export function circle(x, y, r) {
  return { type: 'circle', x, y, r };
}

export function aabb(minX, minY, maxX, maxY) {
  return { type: 'aabb', minX, minY, maxX, maxY };
}

export function shapeBounds(s) {
  if (s.type === 'circle') return { minX: s.x - s.r, minY: s.y - s.r, maxX: s.x + s.r, maxY: s.y + s.r };
  return { minX: s.minX, minY: s.minY, maxX: s.maxX, maxY: s.maxY };
}

/**
 * Penetration of a moving circle (cx, cy, r) into a static shape.
 * Writes the push-out vector (nx, ny, depth) into `out` and returns true
 * when they overlap.
 */
export function circleVsShape(cx, cy, r, s, out) {
  if (s.type === 'circle') {
    const dx = cx - s.x;
    const dy = cy - s.y;
    const minDist = r + s.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= minDist * minDist) return false;
    const d = Math.sqrt(d2);
    if (d < 1e-9) {
      out.nx = 1;
      out.ny = 0;
    } else {
      out.nx = dx / d;
      out.ny = dy / d;
    }
    out.depth = minDist - d;
    return true;
  }
  // AABB: closest point on the box.
  const px = Math.max(s.minX, Math.min(cx, s.maxX));
  const py = Math.max(s.minY, Math.min(cy, s.maxY));
  const dx = cx - px;
  const dy = cy - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    out.nx = dx / d;
    out.ny = dy / d;
    out.depth = r - d;
    return true;
  }
  // Centre inside the box: push out along the axis of least penetration.
  const left = cx - s.minX;
  const right = s.maxX - cx;
  const top = cy - s.minY;
  const bottom = s.maxY - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) { out.nx = -1; out.ny = 0; out.depth = left + r; }
  else if (m === right) { out.nx = 1; out.ny = 0; out.depth = right + r; }
  else if (m === top) { out.nx = 0; out.ny = -1; out.depth = top + r; }
  else { out.nx = 0; out.ny = 1; out.depth = bottom + r; }
  return true;
}
