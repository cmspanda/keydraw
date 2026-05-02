// Keydraw — keyboard-focused diagramming app
(() => {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('canvas');
  const objectsLayer = document.getElementById('objects-layer');
  const overlayLayer = document.getElementById('overlay-layer');
  const defs = svg.querySelector('defs');
  const menuEl = document.getElementById('menu');
  const colorPickerEl = document.getElementById('color-picker');
  const colorInput = document.getElementById('color-input');
  const fileInput = document.getElementById('file-input');
  const textEdit = document.getElementById('text-edit');
  const modeEl = document.getElementById('mode-indicator');
  const hintEl = document.getElementById('hint');
  const helpToggle = document.getElementById('help-toggle');
  const helpPanel = document.getElementById('help-panel');

  const GRID = 24;
  const SNAP_DIST = 6;
  const MAX_HISTORY = 100;
  const DEFAULT_FILL = '#dbeafe';
  const DEFAULT_SIZE = 100;
  const STORAGE_KEY = 'keydraw.diagram';

  // --- State ---
  const state = {
    mode: 'idle',
    objects: [],
    selectedIds: [],
    mouse: { x: 200, y: 200 },
    drag: null,
    resize: null,
    endpoint: null,
    marquee: null,
    nextId: 1,
    view: { x: 0, y: 0, scale: 1 },
    pan: null,
    spaceHeld: false,
    gridSnap: false,
    zoomSensitivity: 0.05,
    gridColumns: 4,
    autoConnect: true,
    clipboard: [],
    history: [],
    historyIdx: -1,
  };

  // --- History (undo/redo) ---
  const serializeState = () => JSON.stringify({ objects: state.objects, nextId: state.nextId });
  const pushHistory = () => {
    state.history = state.history.slice(0, state.historyIdx + 1);
    state.history.push(serializeState());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.historyIdx = state.history.length - 1;
    autoSave();
  };
  const undo = () => {
    if (state.historyIdx <= 0) return;
    state.historyIdx--;
    restoreSnapshot(state.history[state.historyIdx]);
  };
  const redo = () => {
    if (state.historyIdx >= state.history.length - 1) return;
    state.historyIdx++;
    restoreSnapshot(state.history[state.historyIdx]);
  };
  const restoreSnapshot = (json) => {
    const s = JSON.parse(json);
    state.objects = s.objects;
    state.nextId = s.nextId;
    state.selectedIds = state.selectedIds.filter(id => state.objects.some(o => o.id === id));
    autoSave();
    render();
  };

  // --- Save / Load ---
  const autoSave = () => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ objects: state.objects, nextId: state.nextId })); } catch {}
  };
  const autoLoad = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.objects && s.objects.length) {
        state.objects = s.objects;
        state.nextId = s.nextId || 1;
      }
    } catch {}
  };
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ objects: state.objects, nextId: state.nextId }, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'keydraw-diagram.json');
  };
  const importJSON = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const s = JSON.parse(ev.target.result);
          state.objects = s.objects || [];
          state.nextId = s.nextId || 1;
          state.selectedIds = [];
          pushHistory();
          render();
        } catch {}
      };
      reader.readAsText(f);
    };
    input.click();
  };
  const downloadBlob = (blob, name) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 100);
  };

  // --- Export image ---
  const exportSVG = () => {
    const clone = svg.cloneNode(true);
    clone.querySelector('#canvas-bg')?.remove();
    const overlay = clone.querySelector('#overlay-layer');
    if (overlay) overlay.innerHTML = '';
    const b = contentBounds();
    const pad = 20;
    clone.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
    clone.setAttribute('width', b.w + pad * 2);
    clone.setAttribute('height', b.h + pad * 2);
    const cs = getComputedStyle(document.documentElement);
    clone.setAttribute('style', `background:${cs.getPropertyValue('--canvas-bg')}`);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    downloadBlob(blob, 'keydraw.svg');
  };
  const exportPNG = () => {
    const clone = svg.cloneNode(true);
    clone.querySelector('#canvas-bg')?.remove();
    const overlay = clone.querySelector('#overlay-layer');
    if (overlay) overlay.innerHTML = '';
    const b = contentBounds();
    const pad = 20;
    clone.setAttribute('viewBox', `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
    clone.setAttribute('width', b.w + pad * 2);
    clone.setAttribute('height', b.h + pad * 2);
    clone.setAttribute('xmlns', SVG_NS);
    const cs = getComputedStyle(document.documentElement);
    const textColor = cs.getPropertyValue('--text-on-obj').trim();
    clone.querySelectorAll('.obj-text').forEach(el => el.setAttribute('fill', textColor));
    const data = new XMLSerializer().serializeToString(clone);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = (b.w + pad * 2) * 2;
      canvas.height = (b.h + pad * 2) * 2;
      const ctx = canvas.getContext('2d');
      ctx.scale(2, 2);
      ctx.fillStyle = cs.getPropertyValue('--canvas-bg').trim();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => downloadBlob(blob, 'keydraw.png'), 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
  };
  const contentBounds = () => {
    if (!state.objects.length) return { x: 0, y: 0, w: 400, h: 300 };
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const o of state.objects) {
      const b = bbox(o);
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  // --- Helpers ---
  const setMode = (m, hint = '') => { state.mode = m; modeEl.textContent = m.toUpperCase(); hintEl.textContent = hint; };
  const findObj = (id) => state.objects.find(o => o.id === id);
  const selectedObjs = () => state.selectedIds.map(findObj).filter(Boolean);
  const firstSelected = () => findObj(state.selectedIds[0]);
  const isSelected = (id) => state.selectedIds.includes(id);
  const selectOnly = (id) => { state.selectedIds = id != null ? [id] : []; };
  const toggleSelect = (id) => {
    if (isSelected(id)) state.selectedIds = state.selectedIds.filter(i => i !== id);
    else state.selectedIds.push(id);
  };

  const applyView = () => {
    const w = svg.clientWidth || window.innerWidth;
    const h = svg.clientHeight || window.innerHeight;
    svg.setAttribute('viewBox', `${state.view.x} ${state.view.y} ${w / state.view.scale} ${h / state.view.scale}`);
  };

  const screenToSvg = (clientX, clientY) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };

  const bbox = (o) => {
    if (o.type === 'arrow') {
      return { x: Math.min(o.x, o.x + o.w), y: Math.min(o.y, o.y + o.h), w: Math.abs(o.w), h: Math.abs(o.h) };
    }
    return { x: o.x, y: o.y, w: o.w, h: o.h };
  };

  const snapGrid = (v) => state.gridSnap ? Math.round(v / GRID) * GRID : v;

  const anchorPoint = (obj, u, v) => {
    const b = bbox(obj);
    return { x: b.x + b.w * u, y: b.y + b.h * v };
  };

  const syncAllArrows = () => {
    for (const a of state.objects) {
      if (a.type !== 'arrow') continue;
      if (a.startAttach) {
        const src = findObj(a.startAttach.objectId);
        if (src) { const p = anchorPoint(src, a.startAttach.u, a.startAttach.v); const ex = a.x + a.w, ey = a.y + a.h; a.x = p.x; a.y = p.y; a.w = ex - p.x; a.h = ey - p.y; }
      }
      if (a.endAttach) {
        const tgt = findObj(a.endAttach.objectId);
        if (tgt) { const p = anchorPoint(tgt, a.endAttach.u, a.endAttach.v); a.w = p.x - a.x; a.h = p.y - a.y; }
      }
    }
  };

  // --- Object creation ---
  const createObject = (type, cx, cy) => {
    const id = state.nextId++;
    let o;
    const half = DEFAULT_SIZE / 2;
    if (type === 'rect') o = { id, type, x: cx - 75, y: cy - 50, w: 150, h: 100 };
    else if (type === 'square') o = { id, type, x: cx - half, y: cy - half, w: DEFAULT_SIZE, h: DEFAULT_SIZE };
    else if (type === 'circle') o = { id, type, x: cx - half, y: cy - half, w: DEFAULT_SIZE, h: DEFAULT_SIZE };
    else if (type === 'diamond') o = { id, type, x: cx - half, y: cy - half, w: DEFAULT_SIZE, h: DEFAULT_SIZE };
    else if (type === 'text') o = { id, type, x: cx - 60, y: cy - 14, w: 120, h: 28, text: 'text' };
    else if (type === 'arrow') o = { id, type, x: cx - half, y: cy, w: DEFAULT_SIZE, h: 0 };
    else return null;
    const cs = getComputedStyle(document.documentElement);
    o.fill = cs.getPropertyValue('--default-fill').trim() || DEFAULT_FILL;
    o.stroke = cs.getPropertyValue('--default-stroke').trim() || '#1f2937';
    o.imageData = null;
    if (o.text === undefined) o.text = '';
    o.connectors = 1;
    o.groupId = null;
    o.lineStyle = 'solid';
    o.lineWidth = 2;
    o.bidirectional = false;
    state.objects.push(o);
    return o;
  };

  const placeObject = (type) => {
    const sel = firstSelected();
    let cx, cy;
    if (sel) {
      const bb = bbox(sel);
      cx = bb.x + bb.w + 60 + DEFAULT_SIZE / 2;
      cy = bb.y + bb.h / 2;
    } else {
      cx = state.mouse.x; cy = state.mouse.y;
    }
    cx = snapGrid(cx); cy = snapGrid(cy);
    const o = createObject(type, cx, cy);
    if (!o) return;
    if (sel && type !== 'arrow' && state.autoConnect) {
      const arrow = createObject('arrow', 0, 0);
      arrow.fill = 'none';
      arrow.startAttach = { objectId: sel.id, u: 1, v: 0.5 };
      arrow.endAttach = { objectId: o.id, u: 0, v: 0.5 };
      syncAllArrows();
    }
    selectOnly(o.id);
    pushHistory();
    render();
  };

  // --- Clipboard ---
  const copySelected = () => {
    state.clipboard = selectedObjs().map(o => JSON.parse(JSON.stringify(o)));
  };
  const paste = () => {
    if (!state.clipboard.length) return;
    const idMap = {};
    const newObjs = state.clipboard.map(o => {
      const copy = JSON.parse(JSON.stringify(o));
      const oldId = copy.id;
      copy.id = state.nextId++;
      copy.x += 20; copy.y += 20;
      idMap[oldId] = copy.id;
      state.objects.push(copy);
      return copy;
    });
    newObjs.forEach(o => {
      if (o.startAttach && idMap[o.startAttach.objectId]) o.startAttach.objectId = idMap[o.startAttach.objectId];
      if (o.endAttach && idMap[o.endAttach.objectId]) o.endAttach.objectId = idMap[o.endAttach.objectId];
      if (o.groupId && idMap[o.groupId]) o.groupId = idMap[o.groupId];
    });
    state.selectedIds = newObjs.map(o => o.id);
    state.clipboard = newObjs.map(o => JSON.parse(JSON.stringify(o)));
    pushHistory();
    render();
  };
  const duplicate = () => { copySelected(); paste(); };

  // --- Z-ordering ---
  const zOrder = (dir) => {
    const ids = new Set(state.selectedIds);
    if (dir === 'back') {
      const sel = state.objects.filter(o => ids.has(o.id));
      const rest = state.objects.filter(o => !ids.has(o.id));
      state.objects = [...sel, ...rest];
    } else {
      const sel = state.objects.filter(o => ids.has(o.id));
      const rest = state.objects.filter(o => !ids.has(o.id));
      state.objects = [...rest, ...sel];
    }
    pushHistory();
    render();
  };

  // --- Grouping ---
  const groupSelected = () => {
    if (state.selectedIds.length < 2) return;
    const gid = state.nextId++;
    for (const id of state.selectedIds) { const o = findObj(id); if (o) o.groupId = gid; }
    pushHistory(); render();
  };
  const ungroupSelected = () => {
    for (const o of selectedObjs()) o.groupId = null;
    pushHistory(); render();
  };
  const expandSelectionToGroup = () => {
    const groupIds = new Set();
    for (const o of selectedObjs()) { if (o.groupId) groupIds.add(o.groupId); }
    if (!groupIds.size) return;
    for (const o of state.objects) { if (o.groupId && groupIds.has(o.groupId) && !isSelected(o.id)) state.selectedIds.push(o.id); }
  };

  // --- Alignment guides ---
  const getGuides = (draggedIds) => {
    const idSet = new Set(draggedIds);
    const guides = [];
    const others = state.objects.filter(o => !idSet.has(o.id) && o.type !== 'arrow');
    if (!others.length) return guides;
    const db = combinedBbox(draggedIds);
    if (!db) return guides;
    const edges = { cx: db.x + db.w / 2, cy: db.y + db.h / 2, l: db.x, r: db.x + db.w, t: db.y, b: db.y + db.h };
    for (const o of others) {
      const ob = bbox(o);
      const oe = { cx: ob.x + ob.w / 2, cy: ob.y + ob.h / 2, l: ob.x, r: ob.x + ob.w, t: ob.y, b: ob.y + ob.h };
      for (const [dk, ok] of [['cx','cx'],['l','l'],['r','r'],['l','r'],['r','l']]) {
        if (Math.abs(edges[dk] - oe[ok]) < SNAP_DIST) guides.push({ axis: 'v', pos: oe[ok] });
      }
      for (const [dk, ok] of [['cy','cy'],['t','t'],['b','b'],['t','b'],['b','t']]) {
        if (Math.abs(edges[dk] - oe[ok]) < SNAP_DIST) guides.push({ axis: 'h', pos: oe[ok] });
      }
    }
    return guides;
  };
  const combinedBbox = (ids) => {
    const objs = ids.map(findObj).filter(Boolean);
    if (!objs.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const o of objs) { const b = bbox(o); x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  // --- Rendering ---
  var renderObjectList = () => {};

  const render = () => {
    while (objectsLayer.firstChild) objectsLayer.removeChild(objectsLayer.firstChild);
    while (overlayLayer.firstChild) overlayLayer.removeChild(overlayLayer.firstChild);
    [...defs.querySelectorAll('pattern, clipPath')].forEach(p => p.remove());
    syncAllArrows();
    for (const o of state.objects) renderObject(o);
    for (const id of state.selectedIds) { const o = findObj(id); if (o) renderSelection(o); }
    if (state.mode === 'endpoint') {
      for (const o of state.objects) { if (o.type === 'arrow' || o.type === 'text') continue; if (state.endpoint && o.id === state.endpoint.id) continue; renderConnectors(o); }
    }
    if (state.marquee) renderMarquee();
    renderObjectList();
    renderProperties();
  };

  const renderObject = (o) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'obj');
    g.dataset.id = o.id;
    const fillVal = o.fill;
    let shape;
    const dashMap = { solid: 'none', dashed: '8 4', dotted: '2 4' };
    if (o.type === 'rect' || o.type === 'square') {
      shape = document.createElementNS(SVG_NS, 'rect');
      shape.setAttribute('x', o.x); shape.setAttribute('y', o.y);
      shape.setAttribute('width', o.w); shape.setAttribute('height', o.h);
      shape.setAttribute('rx', '4');
      shape.setAttribute('fill', fillVal);
      shape.setAttribute('stroke', o.stroke); shape.setAttribute('stroke-width', o.lineWidth || 2);
      shape.setAttribute('stroke-dasharray', dashMap[o.lineStyle] || 'none');
    } else if (o.type === 'circle') {
      shape = document.createElementNS(SVG_NS, 'ellipse');
      shape.setAttribute('cx', o.x + o.w / 2); shape.setAttribute('cy', o.y + o.h / 2);
      shape.setAttribute('rx', Math.abs(o.w / 2)); shape.setAttribute('ry', Math.abs(o.h / 2));
      shape.setAttribute('fill', fillVal);
      shape.setAttribute('stroke', o.stroke); shape.setAttribute('stroke-width', o.lineWidth || 2);
      shape.setAttribute('stroke-dasharray', dashMap[o.lineStyle] || 'none');
    } else if (o.type === 'diamond') {
      shape = document.createElementNS(SVG_NS, 'polygon');
      const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
      shape.setAttribute('points', `${cx},${o.y} ${o.x + o.w},${cy} ${cx},${o.y + o.h} ${o.x},${cy}`);
      shape.setAttribute('fill', fillVal);
      shape.setAttribute('stroke', o.stroke); shape.setAttribute('stroke-width', o.lineWidth || 2);
      shape.setAttribute('stroke-dasharray', dashMap[o.lineStyle] || 'none');
    } else if (o.type === 'text') {
      shape = document.createElementNS(SVG_NS, 'rect');
      shape.setAttribute('x', o.x); shape.setAttribute('y', o.y);
      shape.setAttribute('width', o.w); shape.setAttribute('height', o.h);
      shape.setAttribute('fill', 'transparent'); shape.setAttribute('stroke', 'none');
    } else if (o.type === 'arrow') {
      shape = document.createElementNS(SVG_NS, 'line');
      shape.setAttribute('x1', o.x); shape.setAttribute('y1', o.y);
      shape.setAttribute('x2', o.x + o.w); shape.setAttribute('y2', o.y + o.h);
      shape.setAttribute('stroke', o.stroke || '#1f2937');
      shape.setAttribute('stroke-width', o.lineWidth || 2);
      shape.setAttribute('marker-end', 'url(#arrowhead)');
      if (o.bidirectional) shape.setAttribute('marker-start', 'url(#arrowhead)');
      shape.setAttribute('stroke-dasharray', dashMap[o.lineStyle] || 'none');
      shape.style.color = o.stroke || '#1f2937';
    }
    g.appendChild(shape);

    if (o.imageData && o.type !== 'arrow' && o.type !== 'text') {
      const bb = bbox(o);
      const clipId = `clip-${o.id}`;
      const clip = document.createElementNS(SVG_NS, 'clipPath');
      clip.setAttribute('id', clipId);
      clip.appendChild(shape.cloneNode(false));
      defs.appendChild(clip);
      const img = document.createElementNS(SVG_NS, 'image');
      img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', o.imageData);
      img.setAttribute('href', o.imageData);
      img.setAttribute('x', bb.x); img.setAttribute('y', bb.y);
      img.setAttribute('width', bb.w); img.setAttribute('height', bb.h);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.style.pointerEvents = 'none';
      g.appendChild(img);
    }

    if (o.text && o.type !== 'arrow') {
      const bb = bbox(o);
      const lines = o.text.split('\n');
      const lh = 18;
      const startY = bb.y + bb.h / 2 - ((lines.length - 1) * lh) / 2;
      lines.forEach((ln, i) => {
        const t = document.createElementNS(SVG_NS, 'text');
        t.setAttribute('class', 'obj-text');
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        t.setAttribute('x', bb.x + bb.w / 2);
        t.setAttribute('y', startY + i * lh);
        t.textContent = ln;
        g.appendChild(t);
      });
    } else if (o.text && o.type === 'arrow') {
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('class', 'obj-text');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('dominant-baseline', 'middle');
      t.setAttribute('x', o.x + o.w / 2);
      t.setAttribute('y', o.y + o.h / 2 - 8);
      t.textContent = o.text;
      g.appendChild(t);
    }
    objectsLayer.appendChild(g);
  };

  const connectorPoints = (o) => {
    const n = Math.max(1, o.connectors || 1);
    const bb = bbox(o);
    const pts = [];
    if (o.type === 'circle') {
      const total = n * 4;
      const cx = bb.x + bb.w / 2, cy = bb.y + bb.h / 2;
      for (let i = 0; i < total; i++) { const a = (i / total) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * bb.w / 2, y: cy + Math.sin(a) * bb.h / 2 }); }
    } else {
      for (let i = 1; i <= n; i++) {
        const t = i / (n + 1);
        pts.push({ x: bb.x + bb.w * t, y: bb.y });
        pts.push({ x: bb.x + bb.w, y: bb.y + bb.h * t });
        pts.push({ x: bb.x + bb.w * (1 - t), y: bb.y + bb.h });
        pts.push({ x: bb.x, y: bb.y + bb.h * (1 - t) });
      }
    }
    return pts;
  };

  const renderConnectors = (o) => {
    if (o.type === 'arrow' || o.type === 'text') return;
    for (const p of connectorPoints(o)) {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', 3);
      c.setAttribute('fill', '#10b981'); c.setAttribute('stroke', '#fff'); c.setAttribute('stroke-width', '1');
      c.style.pointerEvents = 'none';
      overlayLayer.appendChild(c);
    }
  };

  const renderSelection = (o) => {
    if (!o) return;
    const bb = bbox(o);
    if (o.type === 'arrow') {
      mkHandle(o.x, o.y, 'endpoint-start', 'endpoint');
      mkHandle(o.x + o.w, o.y + o.h, 'endpoint-end', 'endpoint');
    } else {
      const pad = 4;
      const r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('class', 'selection-outline');
      r.setAttribute('x', bb.x - pad); r.setAttribute('y', bb.y - pad);
      r.setAttribute('width', bb.w + pad * 2); r.setAttribute('height', bb.h + pad * 2);
      overlayLayer.appendChild(r);
      mkHandle(bb.x, bb.y, 'nw'); mkHandle(bb.x + bb.w, bb.y, 'ne');
      mkHandle(bb.x, bb.y + bb.h, 'sw'); mkHandle(bb.x + bb.w, bb.y + bb.h, 'se');
      renderConnectors(o);
    }
  };

  const mkHandle = (x, y, role, cls = 'handle') => {
    const h = document.createElementNS(SVG_NS, 'rect');
    h.setAttribute('class', cls === 'endpoint' ? 'handle endpoint' : 'handle');
    h.setAttribute('x', x - 5); h.setAttribute('y', y - 5);
    h.setAttribute('width', 10); h.setAttribute('height', 10);
    h.dataset.role = role;
    overlayLayer.appendChild(h);
  };

  const renderMarquee = () => {
    const m = state.marquee;
    const r = document.createElementNS(SVG_NS, 'rect');
    r.setAttribute('x', Math.min(m.x1, m.x2)); r.setAttribute('y', Math.min(m.y1, m.y2));
    r.setAttribute('width', Math.abs(m.x2 - m.x1)); r.setAttribute('height', Math.abs(m.y2 - m.y1));
    r.setAttribute('fill', 'rgba(59,130,246,0.1)'); r.setAttribute('stroke', '#3b82f6');
    r.setAttribute('stroke-width', 1); r.setAttribute('stroke-dasharray', '4 2');
    r.style.pointerEvents = 'none';
    overlayLayer.appendChild(r);
  };

  const renderGuides = (guides) => {
    const vb = svg.viewBox.baseVal;
    for (const g of guides) {
      const line = document.createElementNS(SVG_NS, 'line');
      if (g.axis === 'v') { line.setAttribute('x1', g.pos); line.setAttribute('y1', vb.y); line.setAttribute('x2', g.pos); line.setAttribute('y2', vb.y + vb.height); }
      else { line.setAttribute('x1', vb.x); line.setAttribute('y1', g.pos); line.setAttribute('x2', vb.x + vb.width); line.setAttribute('y2', g.pos); }
      line.setAttribute('stroke', '#ef4444'); line.setAttribute('stroke-width', 0.5);
      line.setAttribute('stroke-dasharray', '4 2'); line.style.pointerEvents = 'none';
      overlayLayer.appendChild(line);
    }
  };

  // --- Hit testing ---
  const objectAt = (x, y) => {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (o.type === 'arrow') { if (pointLineDist(x, y, o.x, o.y, o.x + o.w, o.y + o.h) < 8) return o; }
      else if (o.type === 'circle') {
        const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = Math.abs(o.w / 2), ry = Math.abs(o.h / 2);
        if (rx > 0 && ry > 0 && ((x - cx) ** 2) / (rx * rx) + ((y - cy) ** 2) / (ry * ry) <= 1) return o;
      } else { const b = bbox(o); if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return o; }
    }
    return null;
  };

  const objectsInRect = (x1, y1, x2, y2) => {
    const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
    return state.objects.filter(o => {
      const b = bbox(o);
      return b.x >= rx && b.y >= ry && b.x + b.w <= rx + rw && b.y + b.h <= ry + rh;
    });
  };

  const pointLineDist = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(px - x1, py - y1);
    let t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  // --- Menus ---
  const showShapeMenu = () => {
    setMode('shape-menu', 'r=rect s=square c=circle d=diamond a=arrow t=text  esc');
    menuEl.querySelector('.menu-title').textContent = 'Insert shape';
    const ul = menuEl.querySelector('.menu-items'); ul.innerHTML = '';
    for (const [k, label] of [['r','Rectangle'],['s','Square'],['c','Circle'],['d','Diamond'],['a','Arrow'],['t','Text']]) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="key">${k}</span> ${label}`;
      ul.appendChild(li);
    }
    menuEl.style.left = (state.mouse.x + 12) + 'px'; menuEl.style.top = (state.mouse.y + 12) + 'px';
    menuEl.classList.remove('hidden');
  };
  const hideMenu = () => menuEl.classList.add('hidden');

  const showColorPicker = () => {
    const sel = firstSelected(); if (!sel) return;
    setMode('color', 'type hex / pick swatch / esc');
    const bb = bbox(sel);
    colorPickerEl.style.left = (bb.x + bb.w + 16) + 'px'; colorPickerEl.style.top = bb.y + 'px';
    colorPickerEl.classList.remove('hidden');
    colorInput.value = sel.fill || '';
    setTimeout(() => colorInput.focus(), 10);
  };
  const hideColorPicker = () => { colorPickerEl.classList.add('hidden'); colorInput.blur(); };

  // --- Text editing ---
  const startTextEdit = () => {
    const sel = firstSelected(); if (!sel) return;
    setMode('text-edit', 'enter=save  shift+enter=newline  esc=cancel');
    const bb = bbox(sel);
    const ctm = svg.getScreenCTM();
    const rect = svg.getBoundingClientRect();
    textEdit.style.left = (bb.x * ctm.a + ctm.e) + 'px';
    textEdit.style.top = (bb.y * ctm.d + ctm.f) + 'px';
    textEdit.style.width = (bb.w * ctm.a) + 'px';
    textEdit.style.height = (bb.h * ctm.d) + 'px';
    textEdit.value = sel.text || '';
    textEdit.classList.remove('hidden');
    setTimeout(() => { textEdit.focus(); textEdit.select(); }, 10);
  };
  const finishTextEdit = (commit) => {
    const sel = firstSelected();
    if (sel && commit) { sel.text = textEdit.value; pushHistory(); }
    textEdit.classList.add('hidden'); textEdit.blur();
    setMode('idle'); render();
  };

  // --- Image upload ---
  const triggerImageUpload = () => { if (!firstSelected()) return; fileInput.click(); };
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const sel = firstSelected(); if (!sel) return;
    const reader = new FileReader();
    reader.onload = (ev) => { sel.imageData = ev.target.result; pushHistory(); render(); };
    reader.readAsDataURL(f); fileInput.value = '';
  });

  // --- Movement ---
  const moveSelectedObjs = (dx, dy) => {
    for (const o of selectedObjs()) { o.x += dx; o.y += dy; }
    render();
  };
  const shiftMoveSelected = (dir) => {
    for (const o of selectedObjs()) {
      const bb = bbox(o);
      if (dir === 'up') o.y -= bb.h * 1.25;
      if (dir === 'down') o.y += bb.h * 1.25;
      if (dir === 'left') o.x -= bb.w * 1.25;
      if (dir === 'right') o.x += bb.w * 1.25;
    }
    pushHistory(); render();
  };
  const deleteSelected = () => {
    if (!state.selectedIds.length) return;
    const ids = new Set(state.selectedIds);
    state.objects = state.objects.filter(o => !ids.has(o.id));
    state.selectedIds = [];
    pushHistory(); render();
  };

  // --- Navigate to nearest object ---
  const navigateToNearest = (dir) => {
    const sel = firstSelected();
    if (!sel) return;
    const sb = bbox(sel);
    const cx = sb.x + sb.w / 2, cy = sb.y + sb.h / 2;
    let best = null, bestDist = Infinity;
    for (const o of state.objects) {
      if (o.id === sel.id) continue;
      const ob = bbox(o);
      const ox = ob.x + ob.w / 2, oy = ob.y + ob.h / 2;
      const dx = ox - cx, dy = oy - cy;
      let valid = false;
      if (dir === 'right' && dx > 0 && Math.abs(dy) < Math.abs(dx)) valid = true;
      if (dir === 'left' && dx < 0 && Math.abs(dy) < Math.abs(dx)) valid = true;
      if (dir === 'down' && dy > 0 && Math.abs(dx) < Math.abs(dy)) valid = true;
      if (dir === 'up' && dy < 0 && Math.abs(dx) < Math.abs(dy)) valid = true;
      if (valid) {
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) { bestDist = dist; best = o; }
      }
    }
    if (best) { selectOnly(best.id); expandSelectionToGroup(); render(); }
  };

  // --- Auto-layout ---
  const autoLayout = (axis) => {
    const ids = state.selectedIds.filter(id => { const o = findObj(id); return o && o.type !== 'arrow'; });
    if (ids.length < 2) return;
    const objs = ids.map(findObj).filter(Boolean);
    const gap = 40;
    if (axis === 'horizontal') {
      objs.sort((a, b) => a.x - b.x);
      let x = objs[0].x;
      for (const o of objs) { o.x = x; x += bbox(o).w + gap; }
      const avgY = objs.reduce((s, o) => s + o.y + bbox(o).h / 2, 0) / objs.length;
      for (const o of objs) o.y = avgY - bbox(o).h / 2;
    } else if (axis === 'vertical') {
      objs.sort((a, b) => a.y - b.y);
      let y = objs[0].y;
      for (const o of objs) { o.y = y; y += bbox(o).h + gap; }
      const avgX = objs.reduce((s, o) => s + o.x + bbox(o).w / 2, 0) / objs.length;
      for (const o of objs) o.x = avgX - bbox(o).w / 2;
    } else if (axis === 'grid') {
      const cols = state.gridColumns;
      const startX = objs[0].x, startY = objs[0].y;
      const maxW = Math.max(...objs.map(o => bbox(o).w));
      const maxH = Math.max(...objs.map(o => bbox(o).h));
      objs.forEach((o, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        o.x = startX + col * (maxW + gap);
        o.y = startY + row * (maxH + gap);
      });
    }
    syncAllArrows();
    pushHistory(); render();
  };

  // --- Mouse handling ---
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const s = state.zoomSensitivity;
    const factor = e.deltaY < 0 ? (1 + s) : 1 / (1 + s);
    const before = screenToSvg(e.clientX, e.clientY);
    state.view.scale = Math.max(0.1, Math.min(10, state.view.scale * factor));
    applyView();
    const after = screenToSvg(e.clientX, e.clientY);
    state.view.x += before.x - after.x; state.view.y += before.y - after.y;
    applyView();
  }, { passive: false });

  svg.addEventListener('mousemove', (e) => {
    if (state.mode === 'pan' && state.pan) {
      const dx = (e.clientX - state.pan.startClientX) / state.view.scale;
      const dy = (e.clientY - state.pan.startClientY) / state.view.scale;
      state.view.x = state.pan.startViewX - dx; state.view.y = state.pan.startViewY - dy;
      applyView(); return;
    }
    const p = screenToSvg(e.clientX, e.clientY);
    state.mouse.x = p.x; state.mouse.y = p.y;

    if (state.mode === 'drag' && state.drag) {
      const dx = p.x - state.drag.lastX, dy = p.y - state.drag.lastY;
      for (const id of state.drag.ids) { const o = findObj(id); if (o) { o.x += dx; o.y += dy; } }
      state.drag.lastX = p.x; state.drag.lastY = p.y;
      const guides = getGuides(state.drag.ids);
      render();
      renderGuides(guides);
    } else if (state.mode === 'resize' && state.resize) {
      const o = findObj(state.resize.id);
      if (o) {
        const r = state.resize;
        if (r.role === 'se') { o.w = p.x - o.x; o.h = p.y - o.y; }
        else if (r.role === 'ne') { o.w = p.x - o.x; const oh = o.y + o.h; o.y = p.y; o.h = oh - p.y; }
        else if (r.role === 'sw') { const ow = o.x + o.w; o.x = p.x; o.w = ow - p.x; o.h = p.y - o.y; }
        else if (r.role === 'nw') { const ow = o.x + o.w, oh = o.y + o.h; o.x = p.x; o.y = p.y; o.w = ow - p.x; o.h = oh - p.y; }
        render();
      }
    } else if (state.mode === 'endpoint' && state.endpoint) {
      const o = findObj(state.endpoint.id);
      if (o) {
        let snap = null;
        for (const other of state.objects) {
          if (other.id === o.id || other.type === 'arrow' || other.type === 'text') continue;
          for (const cp of connectorPoints(other)) {
            const d = Math.hypot(cp.x - p.x, cp.y - p.y);
            if (d < 22 && (!snap || d < snap.d)) snap = { d, x: cp.x, y: cp.y };
          }
        }
        const tx = snap ? snap.x : p.x, ty = snap ? snap.y : p.y;
        if (state.endpoint.which === 'start') { const ex = o.x + o.w, ey = o.y + o.h; o.x = tx; o.y = ty; o.w = ex - tx; o.h = ey - ty; }
        else { o.w = tx - o.x; o.h = ty - o.y; }
        render();
      }
    } else if (state.mode === 'marquee' && state.marquee) {
      state.marquee.x2 = p.x; state.marquee.y2 = p.y;
      render();
    }
  });

  svg.addEventListener('mousedown', (e) => {
    if (state.mode === 'text-edit' || state.mode === 'color') return;
    if (e.button === 1 || state.spaceHeld) {
      e.preventDefault();
      state.pan = { startClientX: e.clientX, startClientY: e.clientY, startViewX: state.view.x, startViewY: state.view.y };
      setMode('pan', 'panning'); svg.style.cursor = 'grabbing'; return;
    }
    const p = screenToSvg(e.clientX, e.clientY);

    const target = e.target;
    if (target.classList && target.classList.contains('handle')) {
      const role = target.dataset.role;
      const sel = firstSelected(); if (!sel) return;
      if (role === 'endpoint-start') { state.endpoint = { id: sel.id, which: 'start' }; sel.startAttach = null; setMode('endpoint'); }
      else if (role === 'endpoint-end') { state.endpoint = { id: sel.id, which: 'end' }; sel.endAttach = null; setMode('endpoint'); }
      else { state.resize = { id: sel.id, role }; setMode('resize'); }
      return;
    }

    const hit = objectAt(p.x, p.y);
    if (hit) {
      if (e.shiftKey) {
        toggleSelect(hit.id);
      } else if (!isSelected(hit.id)) {
        selectOnly(hit.id);
      }
      expandSelectionToGroup();
      const dragIds = [...state.selectedIds];
      state.drag = { ids: dragIds, lastX: p.x, lastY: p.y };
      setMode('drag');
      render();
    } else {
      if (!e.shiftKey) state.selectedIds = [];
      state.marquee = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      setMode('marquee');
      render();
    }
  });

  window.addEventListener('mouseup', () => {
    if (state.mode === 'endpoint' && state.endpoint) {
      const arrow = findObj(state.endpoint.id);
      const ep = state.endpoint.which === 'start' ? { x: arrow.x, y: arrow.y } : { x: arrow.x + arrow.w, y: arrow.y + arrow.h };
      let best = null;
      for (const o of state.objects) {
        if (o.id === arrow.id || o.type === 'arrow' || o.type === 'text') continue;
        const b = bbox(o);
        for (const cp of connectorPoints(o)) {
          const d = Math.hypot(cp.x - ep.x, cp.y - ep.y);
          if (d < 22 && (!best || d < best.d)) best = { d, objectId: o.id, u: (cp.x - b.x) / b.w, v: (cp.y - b.y) / b.h };
        }
      }
      if (best) { const attach = { objectId: best.objectId, u: best.u, v: best.v }; if (state.endpoint.which === 'start') arrow.startAttach = attach; else arrow.endAttach = attach; }
      pushHistory();
    }
    if (state.mode === 'marquee' && state.marquee) {
      const hits = objectsInRect(state.marquee.x1, state.marquee.y1, state.marquee.x2, state.marquee.y2);
      for (const o of hits) { if (!isSelected(o.id)) state.selectedIds.push(o.id); }
      expandSelectionToGroup();
      state.marquee = null;
      setMode('idle'); render(); return;
    }
    if (state.mode === 'pan') { state.pan = null; setMode('idle'); svg.style.cursor = state.spaceHeld ? 'grab' : 'crosshair'; return; }
    if (state.mode === 'drag') { pushHistory(); }
    if (state.mode === 'resize') { pushHistory(); }
    if (state.mode === 'drag' || state.mode === 'resize' || state.mode === 'endpoint') {
      state.drag = state.resize = state.endpoint = null; setMode('idle'); render();
    }
  });

  // --- Keyboard handling ---
  window.addEventListener('keydown', (e) => {
    if (document.activeElement === textEdit) {
      if (e.key === 'Escape') { e.preventDefault(); finishTextEdit(false); }
      else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finishTextEdit(true); }
      return;
    }
    if (document.activeElement === colorInput) {
      if (e.key === 'Escape') { e.preventDefault(); hideColorPicker(); setMode('idle'); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        for (const o of selectedObjs()) { o.fill = colorInput.value || o.fill; o.imageData = null; }
        pushHistory(); hideColorPicker(); setMode('idle'); render();
      }
      return;
    }
    if (document.activeElement && document.activeElement.tagName === 'SELECT') return;

    const key = e.key;
    const meta = e.metaKey || e.ctrlKey;

    if (key === ' ' && !state.spaceHeld) { state.spaceHeld = true; svg.style.cursor = 'grab'; e.preventDefault(); return; }

    // Undo / Redo
    if (meta && key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (meta && key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (meta && key === 'y') { e.preventDefault(); redo(); return; }

    // Copy / Paste / Duplicate
    if (meta && key === 'c') { e.preventDefault(); copySelected(); return; }
    if (meta && key === 'v') { e.preventDefault(); paste(); return; }
    if (meta && key === 'd') { e.preventDefault(); duplicate(); return; }

    // Group / Ungroup
    if (meta && key === 'g' && !e.shiftKey) { e.preventDefault(); groupSelected(); return; }
    if (meta && e.shiftKey && key.toLowerCase() === 'u') { e.preventDefault(); ungroupSelected(); return; }

    // Auto-layout
    if (meta && e.shiftKey && key.toLowerCase() === 'h') { e.preventDefault(); autoLayout('horizontal'); return; }
    if (meta && e.shiftKey && key.toLowerCase() === 'j') { e.preventDefault(); autoLayout('vertical'); return; }
    if (meta && e.shiftKey && key.toLowerCase() === 'g') { e.preventDefault(); autoLayout('grid'); return; }

    // Zoom
    if (meta && (key === '=' || key === '+' || key === '-' || key === '_' || key === '0')) {
      e.preventDefault();
      if (key === '0') { state.view = { x: 0, y: 0, scale: 1 }; applyView(); return; }
      const factor = (key === '=' || key === '+') ? 1.2 : 1 / 1.2;
      const c = { clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 };
      const before = screenToSvg(c.clientX, c.clientY);
      state.view.scale = Math.max(0.1, Math.min(10, state.view.scale * factor)); applyView();
      const after = screenToSvg(c.clientX, c.clientY);
      state.view.x += before.x - after.x; state.view.y += before.y - after.y; applyView();
      return;
    }

    if (state.mode === 'shape-menu') {
      if (key === 'Escape') { hideMenu(); setMode('idle'); return; }
      const map = { r: 'rect', s: 'square', c: 'circle', a: 'arrow', d: 'diamond', t: 'text' };
      if (map[key.toLowerCase()]) { e.preventDefault(); hideMenu(); placeObject(map[key.toLowerCase()]); setMode('idle'); }
      return;
    }

    if (key === '?' || (key === '/' && e.shiftKey)) { helpPanel.classList.toggle('hidden'); return; }
    if (key === 'Escape') { state.selectedIds = []; hideMenu(); hideColorPicker(); setMode('idle'); render(); return; }
    if (key === 's' && !meta) { e.preventDefault(); showShapeMenu(); return; }
    if (key === 'g' && !meta) { e.preventDefault(); state.gridSnap = !state.gridSnap; updateGridIndicator(); return; }

    // Z-ordering
    if (key === ']') { e.preventDefault(); zOrder('front'); return; }
    if (key === '[') { e.preventDefault(); zOrder('back'); return; }

    const sel = firstSelected();
    if (sel) {
      if (key === 't') { e.preventDefault(); startTextEdit(); return; }
      if (key === 'c' && !meta) { e.preventDefault(); showColorPicker(); return; }
      if (key === 'i') { e.preventDefault(); triggerImageUpload(); return; }
      if (key === 'x') { e.preventDefault(); for (const o of selectedObjs()) o.imageData = null; pushHistory(); render(); return; }
      if (key === '+' || (key === '=' && !meta)) { e.preventDefault(); for (const o of selectedObjs()) o.connectors = (o.connectors || 1) + 1; render(); return; }
      if (key === '-' && !meta) { e.preventDefault(); for (const o of selectedObjs()) o.connectors = Math.max(1, (o.connectors || 1) - 1); render(); return; }
      if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); deleteSelected(); return; }

      // Line style cycling (l key)
      if (key === 'l') {
        e.preventDefault();
        const styles = ['solid', 'dashed', 'dotted'];
        for (const o of selectedObjs()) { const idx = styles.indexOf(o.lineStyle || 'solid'); o.lineStyle = styles[(idx + 1) % styles.length]; }
        pushHistory(); render(); return;
      }
      // Line width (w key cycles 1,2,3,4)
      if (key === 'w') {
        e.preventDefault();
        const widths = [1, 2, 3, 4];
        for (const o of selectedObjs()) { const idx = widths.indexOf(o.lineWidth || 2); o.lineWidth = widths[(idx + 1) % widths.length]; }
        pushHistory(); render(); return;
      }
      // Bidirectional toggle (b key, arrows only)
      if (key === 'b') {
        e.preventDefault();
        for (const o of selectedObjs()) { if (o.type === 'arrow') o.bidirectional = !o.bidirectional; }
        pushHistory(); render(); return;
      }

      // Cmd+Arrow: navigate to nearest object in direction
      if (meta && (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')) {
        e.preventDefault();
        navigateToNearest(key.replace('Arrow', '').toLowerCase());
        return;
      }

      if (e.shiftKey && !meta) {
        if (key === 'ArrowUp') { e.preventDefault(); shiftMoveSelected('up'); return; }
        if (key === 'ArrowDown') { e.preventDefault(); shiftMoveSelected('down'); return; }
        if (key === 'ArrowLeft') { e.preventDefault(); shiftMoveSelected('left'); return; }
        if (key === 'ArrowRight') { e.preventDefault(); shiftMoveSelected('right'); return; }
      } else if (!meta) {
        const step = state.gridSnap ? GRID : 1;
        if (key === 'ArrowUp') { e.preventDefault(); moveSelectedObjs(0, -step); return; }
        if (key === 'ArrowDown') { e.preventDefault(); moveSelectedObjs(0, step); return; }
        if (key === 'ArrowLeft') { e.preventDefault(); moveSelectedObjs(-step, 0); return; }
        if (key === 'ArrowRight') { e.preventDefault(); moveSelectedObjs(step, 0); return; }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') { state.spaceHeld = false; if (state.mode !== 'pan') svg.style.cursor = 'crosshair'; }
  });
  window.addEventListener('resize', applyView);

  // --- Color picker ---
  colorPickerEl.querySelectorAll('.swatches button').forEach(btn => {
    btn.addEventListener('click', () => {
      for (const o of selectedObjs()) { o.fill = btn.dataset.color; o.imageData = null; }
      pushHistory(); render(); hideColorPicker(); setMode('idle');
    });
  });

  helpToggle.addEventListener('click', () => helpPanel.classList.toggle('hidden'));

  // --- Theme ---
  const THEME_KEY = 'keydraw.theme';
  const themeSelect = document.getElementById('theme-select');
  const applyTheme = (theme) => {
    document.documentElement.classList.remove('theme-light', 'theme-dark', 'theme-system');
    document.documentElement.classList.add(`theme-${theme}`);
    if (themeSelect) themeSelect.value = theme;
    try { localStorage.setItem(THEME_KEY, theme); } catch {}
  };
  applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })() || 'system');
  themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (document.documentElement.classList.contains('theme-system')) render(); });

  // --- Zoom sensitivity ---
  const zoomSlider = document.getElementById('zoom-sensitivity');
  if (zoomSlider) {
    const savedZoom = (() => { try { return localStorage.getItem('keydraw.zoom'); } catch { return null; } })();
    if (savedZoom) state.zoomSensitivity = parseFloat(savedZoom);
    zoomSlider.value = state.zoomSensitivity;
    const zoomLabel = document.getElementById('zoom-label');
    if (zoomLabel) zoomLabel.textContent = Math.round(state.zoomSensitivity * 100) + '%';
    zoomSlider.addEventListener('input', (e) => {
      state.zoomSensitivity = parseFloat(e.target.value);
      if (zoomLabel) zoomLabel.textContent = Math.round(state.zoomSensitivity * 100) + '%';
      try { localStorage.setItem('keydraw.zoom', state.zoomSensitivity); } catch {}
    });
  }

  // --- Auto-connect toggle ---
  const autoConnectEl = document.getElementById('auto-connect');
  if (autoConnectEl) {
    const saved = (() => { try { return localStorage.getItem('keydraw.autoconnect'); } catch { return null; } })();
    if (saved !== null) state.autoConnect = saved === 'true';
    autoConnectEl.checked = state.autoConnect;
    autoConnectEl.addEventListener('change', () => {
      state.autoConnect = autoConnectEl.checked;
      try { localStorage.setItem('keydraw.autoconnect', state.autoConnect); } catch {}
    });
  }

  // --- Grid columns ---
  const gridColInput = document.getElementById('grid-columns');
  if (gridColInput) {
    const savedCols = (() => { try { return localStorage.getItem('keydraw.gridcols'); } catch { return null; } })();
    if (savedCols) state.gridColumns = parseInt(savedCols, 10);
    gridColInput.value = state.gridColumns;
    gridColInput.addEventListener('change', (e) => {
      state.gridColumns = Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 4));
      gridColInput.value = state.gridColumns;
      try { localStorage.setItem('keydraw.gridcols', state.gridColumns); } catch {}
    });
  }

  // --- Palette ---
  document.querySelectorAll('.p-item').forEach(btn => btn.addEventListener('click', () => placeObject(btn.dataset.shape)));
  const paletteEl = document.getElementById('palette');
  document.getElementById('palette-toggle').addEventListener('click', () => {
    paletteEl.classList.toggle('collapsed');
    document.getElementById('palette-toggle').textContent = paletteEl.classList.contains('collapsed') ? '+' : '\u2212';
  });
  const objectListEl = document.getElementById('object-list');
  renderObjectList = () => {
    objectListEl.innerHTML = '';
    for (const o of state.objects) {
      const li = document.createElement('li');
      li.textContent = o.type + (o.text ? `: ${o.text.slice(0, 14)}` : '');
      if (isSelected(o.id)) li.classList.add('selected');
      li.addEventListener('click', (e) => { if (e.shiftKey) toggleSelect(o.id); else selectOnly(o.id); expandSelectionToGroup(); render(); });
      objectListEl.appendChild(li);
    }
  };
  document.getElementById('objects-toggle').addEventListener('click', (e) => {
    e.stopPropagation(); objectListEl.classList.toggle('collapsed');
    e.currentTarget.textContent = objectListEl.classList.contains('collapsed') ? '+' : '\u2212';
  });

  // --- Grid indicator ---
  const gridBtn = document.getElementById('grid-toggle');
  const updateGridIndicator = () => { if (gridBtn) gridBtn.classList.toggle('active', state.gridSnap); };

  // --- Properties panel ---
  const propsEl = document.getElementById('properties');
  const propsBody = propsEl.querySelector('.properties-body');
  document.getElementById('properties-toggle').addEventListener('click', () => {
    propsEl.classList.toggle('collapsed');
    document.getElementById('properties-toggle').textContent = propsEl.classList.contains('collapsed') ? '+' : '\u2212';
  });

  function renderProperties() {
    const sel = firstSelected();
    if (!sel) { propsEl.classList.add('hidden'); return; }
    propsEl.classList.remove('hidden');
    const bb = bbox(sel);
    const rows = [['type', sel.type], ['id', sel.id], ['x', Math.round(bb.x)], ['y', Math.round(bb.y)], ['w', Math.round(bb.w)], ['h', Math.round(bb.h)]];
    if (sel.type !== 'arrow' && sel.type !== 'text') {
      rows.push(['fill', sel.fill]); rows.push(['conn', sel.connectors || 1]);
    }
    rows.push(['line', `${sel.lineStyle || 'solid'} ${sel.lineWidth || 2}px`]);
    if (sel.type === 'arrow') {
      rows.push(['start', sel.startAttach ? `\u2192 obj ${sel.startAttach.objectId}` : 'free']);
      rows.push(['end', sel.endAttach ? `\u2192 obj ${sel.endAttach.objectId}` : 'free']);
      rows.push(['bidir', sel.bidirectional ? 'yes' : 'no']);
    }
    if (sel.groupId) rows.push(['group', sel.groupId]);
    if (sel.text) rows.push(['text', sel.text.slice(0, 24)]);
    let html = rows.map(([k, v]) => {
      const val = k === 'fill' ? `<span><span class="swatch" style="background:${v}"></span>${v}</span>` : `<span>${v}</span>`;
      return `<div class="row"><span>${k}</span>${val}</div>`;
    }).join('');
    if (sel.imageData) html += `<img class="thumb" src="${sel.imageData}" alt="fill"/>`;
    if (state.selectedIds.length > 1) html += `<div class="row" style="margin-top:4px"><span>selected</span><span>${state.selectedIds.length} objects</span></div>`;
    html += `<div class="row" style="margin-top:6px;color:var(--muted);font-size:10px">l line · w width · b bidir · c color · +/- conn</div>`;
    propsBody.innerHTML = html;
  }

  // --- Toolbar actions ---
  document.getElementById('btn-save')?.addEventListener('click', exportJSON);
  document.getElementById('btn-load')?.addEventListener('click', importJSON);
  document.getElementById('btn-export-svg')?.addEventListener('click', exportSVG);
  document.getElementById('btn-export-png')?.addEventListener('click', exportPNG);
  document.getElementById('btn-undo')?.addEventListener('click', undo);
  document.getElementById('btn-redo')?.addEventListener('click', redo);
  if (gridBtn) gridBtn.addEventListener('click', () => { state.gridSnap = !state.gridSnap; updateGridIndicator(); });

  // --- Init ---
  autoLoad();
  pushHistory();
  setMode('idle', 'press s to insert a shape  \u2022  ? for help');
  applyView();
  render();
  window.__keydraw = state;
})();
