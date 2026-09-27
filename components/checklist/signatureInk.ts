/**
 * The drawing code shared by the signature surface on the web (a canvas in
 * the page) and on the phone (the same canvas inside a WebView). It is kept
 * as plain browser JavaScript in a string, so both run exactly the same ink.
 *
 * The pad keeps every stroke, redraws them when its box changes size, and
 * exports the signature cropped to the ink, on a transparent background.
 */
export const SIGNATURE_INK_JS = String.raw`
function createInk(canvas, onChange, onDrawing) {
  var ctx = canvas.getContext('2d');
  var strokes = [];
  var current = null;
  var length = 0;
  var INK = '#0A1626';
  var WIDTH = 2.8;

  function size() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }
  function style(c) { c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = INK; c.fillStyle = INK; c.lineWidth = WIDTH; }
  function drawStroke(c, pts) {
    if (!pts.length) return;
    if (pts.length === 1) { c.beginPath(); c.arc(pts[0].x, pts[0].y, WIDTH / 2, 0, Math.PI * 2); c.fill(); return; }
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    var last = pts[pts.length - 1];
    c.lineTo(last.x, last.y);
    c.stroke();
  }
  function redraw() {
    var rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    style(ctx);
    for (var i = 0; i < strokes.length; i++) drawStroke(ctx, strokes[i]);
  }
  function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

  function exportPng() {
    if (length < 40) return null;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var s = 0; s < strokes.length; s++) for (var p = 0; p < strokes[s].length; p++) {
      var pt = strokes[s][p];
      if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
    }
    var pad = 8, scale = 2;
    var w = Math.max(20, maxX - minX + pad * 2), h = Math.max(20, maxY - minY + pad * 2);
    var out = document.createElement('canvas');
    out.width = Math.round(w * scale); out.height = Math.round(h * scale);
    var o = out.getContext('2d');
    o.setTransform(scale, 0, 0, scale, 0, 0);
    o.translate(pad - minX, pad - minY);
    style(o);
    for (var k = 0; k < strokes.length; k++) drawStroke(o, strokes[k]);
    return out.toDataURL('image/png');
  }
  function emit() { onChange(exportPng(), length); }

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    current = [pos(e)];
    strokes.push(current);
    style(ctx);
    drawStroke(ctx, current);
    onDrawing(true);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!current) return;
    e.preventDefault();
    var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (var i = 0; i < events.length; i++) {
      var p = pos(events[i]);
      var last = current[current.length - 1];
      var step = Math.hypot(p.x - last.x, p.y - last.y);
      if (step < 0.6) continue;
      length += step;
      current.push(p);
      if (current.length >= 3) {
        var a = current[current.length - 3], b = current[current.length - 2], c = current[current.length - 1];
        ctx.beginPath();
        ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
        ctx.stroke();
      }
    }
  });
  function end() {
    if (!current) return;
    current = null;
    onDrawing(false);
    emit();
  }
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', end);

  var observer = window.ResizeObserver ? new ResizeObserver(size) : null;
  if (observer) observer.observe(canvas); else window.addEventListener('resize', size);
  size();

  return {
    clear: function () { strokes = []; current = null; length = 0; redraw(); emit(); },
    destroy: function () { if (observer) observer.disconnect(); else window.removeEventListener('resize', size); }
  };
}
`;
