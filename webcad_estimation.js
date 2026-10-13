/* ================================================================
   WEBCAD ESTIMATION — integrated CAD -> Luckysheet estimate
   ----------------------------------------------------------------
   Reads the live 2D drawing through window.ArchitectSAFCore.getEntities(),
   turns lines/polylines into wall segments, detects closed rooms, prices
   everything from the rate table below, and renders the result into a
   Luckysheet grid docked beside the drawing.

   UNITS: 2D CAD coordinates are millimetres (see unitFactors in the CAD).
   All estimate quantities are converted to metres / m² here.

   RATES ARE PLACEHOLDERS. Replace RATES with your real price list.

   LUCKYSHEET: loaded on demand from the pinned 2.1.13 npm build. The sheet
   is rebuilt from computed values on each recalculation, so anything typed
   into the grid is replaced on the next recalculation. Copy any notes out first.
================================================================ */
(function () {
    'use strict';

    const NS = window.WebCADEstimation = window.WebCADEstimation || {};
    const MM_PER_M = 1000;
    const LS_BASE = 'https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/';
    const LS_CSS = ['plugins/css/pluginsCss.css', 'plugins/plugins.css', 'css/luckysheet.css', 'assets/iconfont/iconfont.css'];
    const LS_JS = ['plugins/js/plugin.js', 'luckysheet.umd.js'];

    // ---------------------------------------------------------------
    // Rate table (per unit). unit: 'linear' = per m run, 'area' = per m² face, 'volume' = per m³
    // ---------------------------------------------------------------
    const RATES = {
        concrete_wall:  { label: 'Concrete Wall (cast in place)', unit: 'volume', material: 145.0, labor: 65.0 },
        brickwork:      { label: 'Brickwork Wall',                unit: 'area',   material: 38.0,  labor: 22.0 },
        framing_timber: { label: 'Timber Stud Framing',           unit: 'linear', material: 14.5,  labor: 9.0 },
        plastering:     { label: 'Plastering / Rendering',        unit: 'area',   material: 9.2,   labor: 7.8 }
    };
    const FLOOR_RATE = { label: 'Floor Tiling', material: 27.0, labor: 16.0 };
    const PAINT_RATE = { label: 'Interior Paint (2 coats)', material: 3.1, labor: 4.4 };

    const state = {
        open: false,
        material: 'brickwork',
        heightM: 2.7,
        thicknessM: 0.2,
        snapMm: 10,
        lsReady: null,
        sheetCreated: false,
        lastResult: null
    };

    // ---------------------------------------------------------------
    // Pure logic (no DOM) — exported on NS._test for automated tests
    // ---------------------------------------------------------------

    /** Turns CAD entities into straight segments in mm. Skips anything that isn't a wall-like line. */
    function segmentsFrom(entities) {
        const segs = [];
        const skipped = {};
        entities.forEach((e) => {
            if (e.type === 'line' && [e.x, e.y, e.x2, e.y2].every(Number.isFinite)) {
                segs.push({ x1: e.x, y1: e.y, x2: e.x2, y2: e.y2 });
            } else if (e.type === 'polyline' && Array.isArray(e.points) && e.points.length > 1) {
                for (let i = 1; i < e.points.length; i++) {
                    const a = e.points[i - 1], b = e.points[i];
                    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
                }
                if (e.closed && e.points.length > 2) {
                    const a = e.points[e.points.length - 1], b = e.points[0];
                    segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
                }
            } else {
                skipped[e.type] = (skipped[e.type] || 0) + 1;
            }
        });
        return { segs, skipped };
    }

    /**
     * Splits every segment wherever another segment's endpoint touches it (T-junctions).
     * In CAD a new wall often starts in the middle of an existing wall. Without this split
     * no room closes there.
     */
    function splitAtJunctions(segs, snap) {
        const out = [];
        segs.forEach((s, i) => {
            const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
            const len2 = dx * dx + dy * dy;
            const ts = [0, 1];
            if (len2 > 0) {
                segs.forEach((o, j) => {
                    if (j === i) return;
                    [[o.x1, o.y1], [o.x2, o.y2]].forEach(([px, py]) => {
                        const t = ((px - s.x1) * dx + (py - s.y1) * dy) / len2;
                        if (t <= 1e-9 || t >= 1 - 1e-9) return;
                        const qx = s.x1 + t * dx, qy = s.y1 + t * dy;
                        if (Math.hypot(px - qx, py - qy) <= snap) ts.push(t);
                    });
                });
            }
            ts.sort((a, b) => a - b);
            for (let k = 1; k < ts.length; k++) {
                const a = ts[k - 1], b = ts[k];
                out.push({
                    x1: s.x1 + a * dx, y1: s.y1 + a * dy,
                    x2: s.x1 + b * dx, y2: s.y1 + b * dy
                });
            }
        });
        return out;
    }

    /**
     * Builds an undirected planar wall graph. Endpoints closer than `snap` are welded
     * into one node (grid-hashed lookup, so this stays fast on large drawings).
     * Duplicate and zero-length edges are dropped.
     */
    function buildPlanarGraph(segs, snap) {
        const nodes = [];
        const cells = new Map();
        const nodeAt = (x, y) => {
            const ix = Math.floor(x / snap), iy = Math.floor(y / snap);
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                const ids = cells.get((ix + dx) + ',' + (iy + dy));
                if (!ids) continue;
                for (const id of ids) if (Math.hypot(nodes[id].x - x, nodes[id].y - y) <= snap) return id;
            }
            const id = nodes.length;
            nodes.push({ x, y, adj: [] });
            const key = ix + ',' + iy;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(id);
            return id;
        };
        const edgeSet = new Set();
        segs.forEach((s) => {
            const a = nodeAt(s.x1, s.y1), b = nodeAt(s.x2, s.y2);
            if (a === b) return;
            const k = a < b ? a + '-' + b : b + '-' + a;
            if (edgeSet.has(k)) return;
            edgeSet.add(k);
            nodes[a].adj.push(b);
            nodes[b].adj.push(a);
        });
        // Sort each node's neighbours by angle (ascending) for face tracing.
        nodes.forEach((n, i) => {
            n.adj.sort((p, q) =>
                Math.atan2(nodes[p].y - n.y, nodes[p].x - n.x) - Math.atan2(nodes[q].y - n.y, nodes[q].x - n.x));
        });
        return nodes;
    }

    /**
     * Finds every bounded face (room) of the wall network.
     * Half-edge traversal: at each node we turn to the neighbour just before the arrival
     * edge in angular order, which walks each face's boundary. Faces with positive signed
     * area are bounded interior faces. The outer boundary has negative area and is discarded.
     * Walls that split a room produce separate rooms, and the outer shell is not counted as one.
     */
    function detectRooms(segs, snapMm) {
        const nodes = buildPlanarGraph(splitAtJunctions(segs, snapMm), snapMm);
        const visited = new Set(); // "u>v" half-edges already used
        const rooms = [];
        for (let u = 0; u < nodes.length; u++) {
            for (const v of nodes[u].adj) {
                if (visited.has(u + '>' + v)) continue;
                const loop = [];
                let a = u, b = v, guard = 0;
                let closed = false;
                while (guard++ < 100000) {
                    visited.add(a + '>' + b);
                    loop.push({ x: nodes[a].x, y: nodes[a].y });
                    const nb = nodes[b].adj;
                    const i = nb.indexOf(a);
                    const next = nb[(i - 1 + nb.length) % nb.length];
                    a = b; b = next;
                    if (a === u && b === v) { closed = true; break; }
                }
                if (!closed || loop.length < 3) continue;
                if (signedAreaMm2(loop) > 0) rooms.push(loop);
            }
        }
        return rooms;
    }

    function signedAreaMm2(pts) {
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            s += p.x * q.y - q.x * p.y;
        }
        return s / 2;
    }

    function polygonAreaMm2(pts) {
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            s += p.x * q.y - q.x * p.y;
        }
        return Math.abs(s) / 2;
    }
    function polygonPerimeterMm(pts) {
        let s = 0;
        for (let i = 0; i < pts.length; i++) {
            const p = pts[i], q = pts[(i + 1) % pts.length];
            s += Math.hypot(q.x - p.x, q.y - p.y);
        }
        return s;
    }

    function quantityFor(unit, lengthM, heightM, thicknessM) {
        switch (unit) {
            case 'linear': return lengthM;
            case 'area':   return lengthM * heightM;
            case 'volume': return lengthM * heightM * thicknessM;
            default: throw new Error('Unknown rate unit: ' + unit);
        }
    }

    /**
     * Pure estimate. Input: CAD entities + settings. Output: wall rows, room rows, totals.
     * No DOM and no Luckysheet, so it can be tested directly.
     */
    function estimate(entities, settings) {
        const rate = RATES[settings.material] || RATES.brickwork;
        const H = settings.heightM, T = settings.thicknessM;
        const { segs, skipped } = segmentsFrom(entities);

        const walls = [];
        segs.forEach((s) => {
            const lengthM = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / MM_PER_M;
            if (lengthM <= 0) return;
            const qty = quantityFor(rate.unit, lengthM, H, T);
            const material = qty * rate.material;
            const labor = qty * rate.labor;
            walls.push({ label: 'Wall ' + (walls.length + 1), lengthM, qty, material, labor, total: material + labor });
        });

        const loops = detectRooms(segs, settings.snapMm);
        const rooms = loops.map((loop, i) => {
            const areaM2 = polygonAreaMm2(loop) / (MM_PER_M * MM_PER_M);
            const perimeterM = polygonPerimeterMm(loop) / MM_PER_M;
            const paintM2 = perimeterM * H;
            const floorMat = areaM2 * FLOOR_RATE.material, floorLab = areaM2 * FLOOR_RATE.labor;
            const paintMat = paintM2 * PAINT_RATE.material, paintLab = paintM2 * PAINT_RATE.labor;
            const total = floorMat + floorLab + paintMat + paintLab;
            return { name: 'Room ' + (i + 1), areaM2, perimeterM, paintM2, floorTotal: floorMat + floorLab, paintTotal: paintMat + paintLab, total };
        });

        const wallTotal = walls.reduce((s, w) => s + w.total, 0);
        const roomTotal = rooms.reduce((s, r) => s + r.total, 0);
        return {
            walls, rooms, skipped,
            totals: { walls: wallTotal, rooms: roomTotal, grand: wallTotal + roomTotal },
            settings: { material: settings.material, heightM: H, thicknessM: T, snapMm: settings.snapMm }
        };
    }

    // ---------------------------------------------------------------
    // Luckysheet: load on demand, then render the result as cell data
    // ---------------------------------------------------------------
    function loadCss(href) {
        return new Promise((res, rej) => {
            const l = document.createElement('link');
            l.rel = 'stylesheet'; l.href = href;
            l.onload = res; l.onerror = () => rej(new Error('stylesheet failed: ' + href));
            document.head.appendChild(l);
        });
    }
    function loadJs(src) {
        return new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = src; s.onload = res;
            s.onerror = () => rej(new Error('script failed: ' + src));
            document.head.appendChild(s);
        });
    }
    function loadLuckysheet() {
        if (state.lsReady) return state.lsReady;
        state.lsReady = Promise.all(LS_CSS.map((p) => loadCss(LS_BASE + p)))
            .then(() => LS_JS.reduce((p, f) => p.then(() => loadJs(LS_BASE + f)), Promise.resolve()))
            .then(() => { if (!window.luckysheet) throw new Error('Luckysheet did not register'); })
            .catch((e) => { state.lsReady = null; throw e; });
        return state.lsReady;
    }

    function cellsFor(result) {
        const cells = [];
        const H = result.settings.heightM;
        const put = (r, c, v) => cells.push({ r, c, v: { v } });
        const headers = ['Type', 'Label', 'Length (m)', 'Area (m²)', 'Perimeter (m)', 'Height (m)', 'Material', 'Cost'];
        headers.forEach((h, c) => put(0, c, h));
        let r = 1;
        result.walls.forEach((w) => {
            put(r, 0, 'Wall'); put(r, 1, w.label); put(r, 2, round2(w.lengthM));
            put(r, 5, round2(H)); put(r, 6, RATES[result.settings.material].label); put(r, 7, round2(w.total));
            r++;
        });
        result.rooms.forEach((rm) => {
            put(r, 0, 'Room'); put(r, 1, rm.name); put(r, 3, round2(rm.areaM2));
            put(r, 4, round2(rm.perimeterM)); put(r, 5, round2(H));
            put(r, 6, FLOOR_RATE.label + ' + ' + PAINT_RATE.label); put(r, 7, round2(rm.total));
            r++;
        });
        r++;
        put(r, 1, 'Walls subtotal'); put(r, 7, round2(result.totals.walls)); r++;
        put(r, 1, 'Rooms subtotal'); put(r, 7, round2(result.totals.rooms)); r++;
        put(r, 1, 'GRAND TOTAL'); put(r, 7, round2(result.totals.grand));
        return { cells, rows: r + 1 };
    }

    function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

    function sheetName() {
        const el = document.getElementById('asaf-current-file-name');
        const base = el && el.textContent ? el.textContent.split('·')[0].trim() : 'Current drawing';
        return ('Estimate - ' + base).replace(/[\[\]:*?\/\\]/g, ' ').slice(0, 31);
    }

    function renderSheet(result) {
        const { cells, rows } = cellsFor(result);
        const data = [{
            name: sheetName(), index: 0, order: 0, status: 1,
            row: Math.max(40, rows + 5), column: 12, celldata: cells
        }];
        if (state.sheetCreated && window.luckysheet.destroy) {
            try { window.luckysheet.destroy(); } catch (e) { /* ignore: rebuilding anyway */ }
        }
        window.luckysheet.create({
            container: 'asaf-est-sheet', lang: 'en', showinfobar: false, data
        });
        state.sheetCreated = true;
    }

    // ---------------------------------------------------------------
    // Panel UI
    // ---------------------------------------------------------------
    let panelEl = null;
    function $(id) { return document.getElementById(id); }

    function buildPanel() {
        if (panelEl) return;
        panelEl = document.createElement('div');
        panelEl.id = 'asaf-est-panel';
        panelEl.innerHTML = `
            <div class="asaf-est-head">
                <b>Estimate</b>
                <span id="asaf-est-status" class="asaf-est-status"></span>
                <button type="button" id="asaf-est-close" title="Close estimate">×</button>
            </div>
            <div class="asaf-est-controls">
                <label>Material <select id="asaf-est-material"></select></label>
                <label>Height (m) <input id="asaf-est-h" type="number" step="0.1" min="0" value="${state.heightM}"></label>
                <label>Thickness (m) <input id="asaf-est-t" type="number" step="0.01" min="0" value="${state.thicknessM}"></label>
                <button type="button" id="asaf-est-recalc" class="asaf-est-btn">Recalculate</button>
                <span class="asaf-est-total">Total <b id="asaf-est-total">—</b></span>
            </div>
            <div id="asaf-est-sheet" class="asaf-est-sheet"></div>`;
        document.body.appendChild(panelEl);

        const sel = $('asaf-est-material');
        Object.keys(RATES).forEach((k) => {
            const o = document.createElement('option');
            o.value = k; o.textContent = RATES[k].label + ' (per ' + RATES[k].unit + ')';
            sel.appendChild(o);
        });
        sel.value = state.material;
        sel.addEventListener('change', () => { state.material = sel.value; recalc(); });
        $('asaf-est-h').addEventListener('change', (e) => { state.heightM = Math.max(0, parseFloat(e.target.value) || 0); recalc(); });
        $('asaf-est-t').addEventListener('change', (e) => { state.thicknessM = Math.max(0, parseFloat(e.target.value) || 0); recalc(); });
        $('asaf-est-recalc').addEventListener('click', recalc);
        $('asaf-est-close').addEventListener('click', close);
    }

    function setStatus(msg, isError) {
        const el = $('asaf-est-status');
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('error', !!isError);
    }

    function money(n) {
        return '$' + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function recalc() {
        if (!state.open) return;
        if (!window.ArchitectSAFCore || !window.ArchitectSAFCore.getEntities) {
            setStatus('CAD bridge not available', true);
            return;
        }
        const entities = window.ArchitectSAFCore.getEntities();
        const result = estimate(entities, { material: state.material, heightM: state.heightM, thicknessM: state.thicknessM, snapMm: state.snapMm });
        state.lastResult = result;
        $('asaf-est-total').textContent = money(result.totals.grand);

        const parts = [result.walls.length + ' wall' + (result.walls.length === 1 ? '' : 's'),
                       result.rooms.length + ' room' + (result.rooms.length === 1 ? '' : 's')];
        const ignored = Object.keys(result.skipped).map((t) => result.skipped[t] + ' ' + t);
        setStatus(parts.join(' · ') + (ignored.length ? ' · not priced: ' + ignored.join(', ') : ''));

        loadLuckysheet()
            .then(() => renderSheet(result))
            .catch((e) => setStatus('Spreadsheet unavailable (' + e.message + '). Check the internet connection.', true));
    }

    function open() {
        state.open = true;
        buildPanel();
        document.body.classList.add('asaf-est-visible');
        $('asaf-est-toggle') && $('asaf-est-toggle').classList.add('active');
        recalc();
    }

    function close() {
        state.open = false;
        document.body.classList.remove('asaf-est-visible', 'asaf-est-full');
        $('asaf-est-toggle') && $('asaf-est-toggle').classList.remove('active');
    }

    NS.open = open;
    NS.close = close;
    NS.recalculate = recalc;
    NS.toggle = () => (state.open ? close() : open());
    NS.setFull = setFull;
    NS._test = { segmentsFrom, splitAtJunctions, detectRooms, estimate, cellsFor, polygonAreaMm2, polygonPerimeterMm, RATES, state };

    // ---------------------------------------------------------------
    // Wiring: header button + refresh when the drawing is saved
    // ---------------------------------------------------------------
    function injectToggle() {
        const right = document.querySelector('.header-right');
        if (!right || $('asaf-est-toggle')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.id = 'asaf-est-toggle';
        b.title = 'Show the live cost estimate beside the drawing';
        b.textContent = 'Estimate';
        b.addEventListener('click', () => NS.toggle());
        right.insertBefore(b, right.firstChild);
    }

    // Refresh the estimate after every save / autosave while it is open.
    window.addEventListener('architectsaf:save', () => { if (state.open) recalc(); });

    /** Full-width mode, used by the Estimation layout tab. The drawing is hidden while it is active. */
    function setFull(on) {
        if (on) {
            state.open = true;
            buildPanel();
            document.body.classList.add('asaf-est-visible', 'asaf-est-full');
            recalc();
        } else if (document.body.classList.contains('asaf-est-full')) {
            close();
        }
    }

    // Layout tabs: "Estimation" opens the full-width view; any other tab returns to the drawing.
    document.addEventListener('click', (e) => {
        const tab = e.target.closest ? e.target.closest('.layout-tab') : null;
        if (!tab) return;
        setFull(tab.dataset.layout === 'estimation');
    });

    function init() { /* the ribbon provides the "View Estimation" button */ }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
