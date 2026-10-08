/* ================================================================
   WEBCAD 3D ARCHITECTURAL STUDIO — ADDITIVE EXTENSION
   A full-screen 3D workspace toggled alongside the 2D CAD workspace.
   Every tool here is driven entirely by typed numbers/menus (no mouse
   picking in the 3D view is required to build anything), matching the
   quick command-line style of the companion AutoLISP toolkit.
   Geometry uses native Three.js (Shape/ExtrudeGeometry + hand-authored
   BufferGeometry) only — no CSG library dependency anywhere.
================================================================ */
(function () {
    'use strict';

    const NS3D = window.WebCAD3DStudio = window.WebCAD3DStudio || {};
    const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';

    let THREE = null;
    let scene, camera, renderer, stageEl, rootEl, formPanelEl, statusEl;
    let ro; // ResizeObserver
    let objects = [];      // every mesh/group this studio has created
    let walls = [];        // { name, mesh, originX, originZ, length, thickness, height, holes:[{x,y,w,h}] }
    let placementCursor = 0; // auto-advances so repeated "Create" clicks don't stack on each other
    let dragging = false, lastX = 0, lastY = 0;

    // ----------------------------------------------------------------
    // THREE.js loader (shares window.THREE with any other extension)
    // ----------------------------------------------------------------
    function loadThree(done) {
        if (window.THREE) { done(window.THREE); return; }
        const s = document.createElement('script');
        s.src = THREE_CDN;
        s.onload = () => done(window.THREE);
        s.onerror = () => alert('3D engine could not load. Check internet connection.');
        document.head.appendChild(s);
    }

    // ----------------------------------------------------------------
    // DOM: root shell, toolbar, stage, form panel
    // ----------------------------------------------------------------
    function ensureRoot() {
        if (rootEl) return rootEl;
        rootEl = document.createElement('div');
        rootEl.id = 'asaf-3d-studio-root';
        rootEl.innerHTML = `
            <div class="a3d-toolbar">
                <span class="a3d-title"><i class="fas fa-cubes"></i> 3D Architectural Studio</span>
                <button type="button" data-tool="column"><i class="fas fa-grip-lines-vertical"></i> Column</button>
                <button type="button" data-tool="roof"><i class="fas fa-home"></i> Roof</button>
                <button type="button" data-tool="stairs"><i class="fas fa-stairs"></i> Stairs</button>
                <button type="button" data-tool="tiles"><i class="fas fa-th"></i> Tiles</button>
                <button type="button" data-tool="wall"><i class="fas fa-grip-lines"></i> Wall</button>
                <button type="button" data-tool="window"><i class="fas fa-vector-square"></i> Cut Window</button>
                <button type="button" data-tool="frame"><i class="fas fa-square"></i> Frame</button>
                <span class="a3d-toolbar-spacer"></span>
                <button type="button" id="a3d-reset-view" title="Reset camera"><i class="fas fa-crosshairs"></i></button>
                <button type="button" id="a3d-clear-all" title="Remove everything"><i class="fas fa-trash"></i></button>
                <button type="button" id="a3d-close" title="Back to 2D"><i class="fas fa-times"></i></button>
            </div>
            <div class="a3d-body">
                <div class="a3d-stage" id="a3d-stage"></div>
                <div class="a3d-form-panel" id="a3d-form-panel">
                    <div class="a3d-form-empty">Pick a tool above. Every tool here is driven purely by typed
                    numbers and menus — nothing needs to be clicked in the 3D view.</div>
                </div>
            </div>
            <div class="a3d-status" id="a3d-status">0 objects</div>
        `;
        document.body.appendChild(rootEl);

        rootEl.querySelectorAll('[data-tool]').forEach((btn) => {
            btn.addEventListener('click', () => showForm(btn.dataset.tool));
        });
        document.getElementById('a3d-reset-view').addEventListener('click', resetView);
        document.getElementById('a3d-clear-all').addEventListener('click', clearAll);
        document.getElementById('a3d-close').addEventListener('click', () => NS3D.close());

        stageEl = rootEl.querySelector('#a3d-stage');
        formPanelEl = rootEl.querySelector('#a3d-form-panel');
        statusEl = rootEl.querySelector('#a3d-status');
        return rootEl;
    }

    function refreshStatus() {
        if (statusEl) statusEl.textContent = `${objects.length} object${objects.length === 1 ? '' : 's'}` +
            (walls.length ? ` · ${walls.length} wall${walls.length === 1 ? '' : 's'}` : '');
    }

    // ----------------------------------------------------------------
    // Scene setup (built once, reused across open/close)
    // ----------------------------------------------------------------
    function initScene() {
        if (scene) return;
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0f172a);

        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100000);
        resetView();

        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        stageEl.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dl = new THREE.DirectionalLight(0xffffff, 1.1);
        dl.position.set(3000, 4000, 2000);
        scene.add(dl);

        const grid = new THREE.GridHelper(20000, 40, 0x475569, 0x263244);
        scene.add(grid);

        stageEl.addEventListener('pointerdown', (e) => {
            dragging = true; lastX = e.clientX; lastY = e.clientY;
            stageEl.setPointerCapture(e.pointerId);
        });
        stageEl.addEventListener('pointerup', () => { dragging = false; });
        stageEl.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            const target = new THREE.Vector3(0, 0, 0);
            const off = camera.position.clone().sub(target);
            const sph = new THREE.Spherical().setFromVector3(off);
            sph.theta -= dx * 0.01;
            sph.phi = Math.max(0.1, Math.min(3.0, sph.phi + dy * 0.01));
            off.setFromSpherical(sph);
            camera.position.copy(target).add(off);
            camera.lookAt(target);
        });
        stageEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            const v = camera.position.clone();
            v.multiplyScalar(e.deltaY > 0 ? 1.08 : 0.92);
            camera.position.copy(v);
            camera.lookAt(0, 0, 0);
        }, { passive: false });

        ro = new ResizeObserver(resizeStage);
        ro.observe(stageEl);
        resizeStage();
        (function loop() {
            requestAnimationFrame(loop);
            renderer.render(scene, camera);
        })();
    }

    function resizeStage() {
        if (!renderer || !stageEl) return;
        const r = stageEl.getBoundingClientRect();
        const w = Math.max(240, r.width), h = Math.max(240, r.height);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }

    function resetView() {
        if (!camera) return;
        camera.position.set(9000, 7000, 11000);
        camera.lookAt(0, 0, 0);
    }

    function clearAll() {
        if (!confirm('Remove every object from the 3D studio? This cannot be undone.')) return;
        objects.forEach((o) => scene.remove(o));
        objects = [];
        walls = [];
        placementCursor = 0;
        refreshStatus();
    }

    function addObject(obj) {
        scene.add(obj);
        objects.push(obj);
        refreshStatus();
        return obj;
    }

    function nextPlacementX() {
        const x = placementCursor;
        placementCursor += 3000; // auto-space successive creations 3m apart
        return x;
    }

    // ----------------------------------------------------------------
    // Geometry helpers
    // NOTE ON AXES: Three.js is Y-up here (matches the existing simple 3D
    // panel). Every form below asks for "Position X" / "Position Y (plan)" —
    // the plan Y typed by the user maps to world Z internally; world Y is
    // always height/"up". This keeps the UI intuitive for an architect
    // without exposing the Y-up/Z-plan quirk.
    // ----------------------------------------------------------------

    // Build a THREE.Mesh by extruding a 2D plan shape (with optional holes)
    // straight up (world +Y) from y0 by `height`.
    function extrudeUp(points2D, holes2D, height, material, x0, y0, z0) {
        const shape = new THREE.Shape();
        points2D.forEach((p, i) => (i === 0 ? shape.moveTo(p[0], p[1]) : shape.lineTo(p[0], p[1])));
        shape.closePath();
        (holes2D || []).forEach((hole) => {
            const path = new THREE.Path();
            hole.forEach((p, i) => (i === 0 ? path.moveTo(p[0], p[1]) : path.lineTo(p[0], p[1])));
            path.closePath();
            shape.holes.push(path);
        });
        const geom = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 24 });
        const mesh = new THREE.Mesh(geom, material || defaultMaterial());
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x0, y0, z0);
        return mesh;
    }

    function defaultMaterial(hex) {
        return new THREE.MeshStandardMaterial({ color: hex || 0x94a3b8, roughness: 0.7, metalness: 0.1 });
    }

    function boxMesh(w, h, d, material) {
        return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material || defaultMaterial());
    }

    // Hand-authored triangular-prism roof segment (ridge along world X),
    // base = width along world Z, apex height = rise, extruded along X by
    // `run`. Origin (x0,y0,z0) is the front-bottom-left corner.
    function trianglePrism(x0, y0, z0, width, rise, run, material) {
        const p = (x, y, z) => [x, y, z];
        const A1 = p(x0, y0, z0), A2 = p(x0, y0, z0 + width), A3 = p(x0, y0 + rise, z0 + width / 2);
        const B1 = p(x0 + run, y0, z0), B2 = p(x0 + run, y0, z0 + width), B3 = p(x0 + run, y0 + rise, z0 + width / 2);
        const tris = [
            [A1, A3, A2], [B1, B2, B3],            // two end triangles
            [A1, B1, A3], [B1, B3, A3],             // slope 1
            [A3, B3, A2], [B3, B2, A2],             // slope 2
            [A1, A2, B1], [A2, B2, B1]              // bottom
        ];
        return trisToMesh(tris, material);
    }

    // Hand-authored hip-end wedge: tapers from a full eave edge (xOuter) to a
    // single ridge-end point (xInner). Mirrors make-hip-end-solid from the
    // companion AutoLISP toolkit, but authored directly (no CSG needed).
    function hipEndWedge(xOuter, xInner, y0, width, z0, rise, material) {
        const p1 = [xOuter, y0, z0], p2 = [xOuter, y0, z0 + width];
        const p3 = [xInner, y0, z0], p4 = [xInner, y0, z0 + width];
        const p5 = [xInner, y0 + rise, z0 + width / 2];
        const tris = [
            [p1, p2, p4], [p1, p4, p3],   // base rectangle
            [p1, p2, p5],                  // outer gable-end face
            [p1, p3, p5],                  // hip slope 1
            [p2, p4, p5]                   // hip slope 2 (winding kept consistent below by normals fix)
        ];
        return trisToMesh(tris, material);
    }

    function trisToMesh(tris, material) {
        const positions = [];
        tris.forEach((tri) => tri.forEach((v) => positions.push(v[0], v[1], v[2])));
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, material || defaultMaterial());
        mesh.material.side = THREE.DoubleSide; // hand-authored winding isn't guaranteed consistent
        return mesh;
    }

    // Hand-authored wedge slab (used for Shed roofs): full-height edge at
    // x0, tapering to zero rise at x0+length, constant across width (z0..z0+width).
    function wedgeSlab(x0, y0, z0, length, width, rise, material) {
        const A1 = [x0, y0, z0], A2 = [x0, y0 + rise, z0], A3 = [x0 + length, y0, z0];
        const B1 = [x0, y0, z0 + width], B2 = [x0, y0 + rise, z0 + width], B3 = [x0 + length, y0, z0 + width];
        const tris = [
            [A1, A2, A3], [B1, B3, B2],  // end triangles (front / back)
            [A1, A3, B3], [A1, B3, B1],  // bottom face
            [A1, B1, B2], [A1, B2, A2],  // vertical back face at x0
            [A2, B2, B3], [A2, B3, A3]   // sloped top face
        ];
        return trisToMesh(tris, material);
    }

    function ibeamPoints(D, Bf, Tf, Tw) {
        const hw = Bf / 2, hd = D / 2, tw2 = Tw / 2;
        const x1 = -hw, x2 = -tw2, x3 = tw2, x4 = hw;
        const y1 = -hd, y2 = -hd + Tf, y3 = hd - Tf, y4 = hd;
        return [[x1, y1], [x4, y1], [x4, y2], [x3, y2], [x3, y3], [x4, y3],
                [x4, y4], [x1, y4], [x1, y3], [x2, y3], [x2, y2], [x1, y2]];
    }

    function tshapePoints(Bf, Tf, Dw, Tw) {
        const hw = Bf / 2, tw2 = Tw / 2;
        const x1 = -hw, x2 = -tw2, x3 = tw2, x4 = hw;
        const y0 = 0, y1 = Dw, y2 = Dw + Tf;
        return [[x2, y0], [x3, y0], [x3, y1], [x4, y1], [x4, y2], [x1, y2], [x1, y1], [x2, y1]];
    }

    function flutedProfile(radius, flutes, segsPerFlute) {
        // A circle with small scalloped grooves cut into it — avoids CSG
        // entirely by baking the flutes directly into the outline.
        const pts = [];
        const grooveDepth = radius * 0.12;
        const totalSegs = flutes * segsPerFlute;
        for (let i = 0; i <= totalSegs; i++) {
            const t = (i / totalSegs) * Math.PI * 2;
            const grooveWave = Math.cos(t * flutes) * 0.5 + 0.5; // 0..1
            const r = radius - grooveDepth * Math.pow(grooveWave, 3);
            pts.push([r * Math.cos(t), r * Math.sin(t)]);
        }
        return pts;
    }

    function parseTileSize(str) {
        const s = (str || '').toUpperCase().trim();
        let w, l;
        if (s.indexOf('X') >= 0) {
            const parts = s.split('X');
            w = parseFloat(parts[0]); l = parseFloat(parts[1]);
        } else if (s.indexOf(',') >= 0) {
            const parts = s.split(',');
            w = parseFloat(parts[0]); l = parseFloat(parts[1]);
        } else {
            w = l = parseFloat(s);
        }
        if (!isFinite(w) || w <= 0) w = 600;
        if (!isFinite(l) || l <= 0) l = w;
        return [w, l];
    }

    // ----------------------------------------------------------------
    // Form rendering + tool builders
    // ----------------------------------------------------------------
    function field(label, id, value, type) {
        return `<label class="a3d-field">${label}<input type="${type || 'number'}" id="${id}" value="${value}"></label>`;
    }

    function showForm(tool) {
        const forms = {
            column: columnForm,
            roof: roofForm,
            stairs: stairsForm,
            tiles: tilesForm,
            wall: wallForm,
            window: windowForm,
            frame: frameForm
        };
        if (forms[tool]) forms[tool]();
    }

    function num(id, fallback) {
        const el = document.getElementById(id);
        const v = el ? parseFloat(el.value) : NaN;
        return isFinite(v) ? v : fallback;
    }
    function str(id, fallback) {
        const el = document.getElementById(id);
        return el && el.value !== '' ? el.value : fallback;
    }

    // ---- Column ----
    function columnForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Add Column</h3>
            <label class="a3d-field">Profile
                <select id="col-profile">
                    <option value="Square">Square</option>
                    <option value="Rectangular">Rectangular</option>
                    <option value="Round">Round</option>
                    <option value="Fluted">Fluted</option>
                    <option value="IBeam">I-Beam</option>
                    <option value="TShape">T-Shape</option>
                </select>
            </label>
            ${field('Position X', 'col-x', startX)}
            ${field('Position Y (plan)', 'col-y', 0)}
            ${field('Height', 'col-h', 3000)}
            <div id="col-dims"></div>
            <button type="button" class="a3d-create" id="col-create">Create Column</button>
        `;
        const profileSel = document.getElementById('col-profile');
        const dimsEl = document.getElementById('col-dims');
        function renderDims() {
            const p = profileSel.value;
            const dims = {
                Square: field('Width', 'col-w', 400),
                Rectangular: field('Width', 'col-w', 400) + field('Depth', 'col-d', 600),
                Round: field('Radius', 'col-r', 250),
                Fluted: field('Radius', 'col-r', 250) + field('Flutes', 'col-flutes', 12),
                IBeam: field('Overall Depth', 'col-D', 400) + field('Flange Width', 'col-Bf', 300) +
                       field('Flange Thickness', 'col-Tf', 30) + field('Web Thickness', 'col-Tw', 20),
                TShape: field('Flange Width', 'col-Bf', 400) + field('Flange Thickness', 'col-Tf', 40) +
                        field('Web Depth', 'col-Dw', 400) + field('Web Thickness', 'col-Tw', 40)
            };
            dimsEl.innerHTML = dims[p];
        }
        profileSel.addEventListener('change', renderDims);
        renderDims();
        document.getElementById('col-create').addEventListener('click', () => {
            const x = num('col-x', 0), y = num('col-y', 0), h = num('col-h', 3000);
            const profile = profileSel.value;
            let mesh;
            if (profile === 'Square') {
                const w = num('col-w', 400);
                mesh = boxMesh(w, h, w);
                mesh.position.set(x, h / 2, y);
            } else if (profile === 'Rectangular') {
                const w = num('col-w', 400), d = num('col-d', 600);
                mesh = boxMesh(w, h, d);
                mesh.position.set(x, h / 2, y);
            } else if (profile === 'Round') {
                const r = num('col-r', 250);
                mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 32), defaultMaterial());
                mesh.position.set(x, h / 2, y);
            } else if (profile === 'Fluted') {
                const r = num('col-r', 250), flutes = Math.max(3, Math.round(num('col-flutes', 12)));
                mesh = extrudeUp(flutedProfile(r, flutes, 8), null, h, defaultMaterial(), x, 0, y);
            } else if (profile === 'IBeam') {
                const D = num('col-D', 400), Bf = num('col-Bf', 300), Tf = num('col-Tf', 30), Tw = num('col-Tw', 20);
                mesh = extrudeUp(ibeamPoints(D, Bf, Tf, Tw), null, h, defaultMaterial(), x, 0, y);
            } else if (profile === 'TShape') {
                const Bf = num('col-Bf', 400), Tf = num('col-Tf', 40), Dw = num('col-Dw', 400), Tw = num('col-Tw', 40);
                mesh = extrudeUp(tshapePoints(Bf, Tf, Dw, Tw), null, h, defaultMaterial(), x, 0, y);
            }
            addObject(mesh);
        });
    }

    // ---- Roof ----
    function roofForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Add Roof</h3>
            <label class="a3d-field">Style
                <select id="roof-style">
                    <option value="Flat">Flat Slab</option>
                    <option value="Gable">Gable</option>
                    <option value="Hip">Hip</option>
                    <option value="Shed">Shed</option>
                </select>
            </label>
            ${field('Position X', 'roof-x', startX)}
            ${field('Position Y (plan)', 'roof-y', 0)}
            ${field('Elevation (base height)', 'roof-z', 3000)}
            ${field('Length (long / ridge dim.)', 'roof-length', 8000)}
            ${field('Width (short dim.)', 'roof-width', 6000)}
            ${field('Slab Thickness', 'roof-thickness', 200)}
            <div id="roof-pitch-wrap">${field('Pitch (degrees)', 'roof-pitch', 25)}</div>
            <button type="button" class="a3d-create" id="roof-create">Create Roof</button>
        `;
        const styleSel = document.getElementById('roof-style');
        const pitchWrap = document.getElementById('roof-pitch-wrap');
        function togglePitch() { pitchWrap.style.display = (styleSel.value === 'Flat') ? 'none' : 'block'; }
        styleSel.addEventListener('change', togglePitch);
        togglePitch();

        document.getElementById('roof-create').addEventListener('click', () => {
            let L = num('roof-length', 8000), W = num('roof-width', 6000);
            if (W > L) { const t = L; L = W; W = t; }
            const x0 = num('roof-x', 0), z0 = num('roof-y', 0), y0 = num('roof-z', 3000);
            const thickness = num('roof-thickness', 200);
            const pitch = num('roof-pitch', 25);
            const style = styleSel.value;
            const group = new THREE.Group();

            const slab = boxMesh(L, thickness, W);
            slab.position.set(x0 + L / 2, y0 + thickness / 2, z0 + W / 2);
            group.add(slab);

            if (style === 'Shed') {
                const rise = L * Math.tan(pitch * Math.PI / 180);
                group.add(wedgeSlab(x0, y0 + thickness, z0, L, W, rise));
            } else if (style === 'Gable') {
                const rise = (L / 2) * Math.tan(pitch * Math.PI / 180);
                const prism = trianglePrism(x0, y0 + thickness, z0, W, rise, L);
                group.add(prism);
            } else if (style === 'Hip') {
                const rise = (W / 2) * Math.tan(pitch * Math.PI / 180);
                const ridgeLen = L - W;
                if (ridgeLen > 1) {
                    group.add(trianglePrism(x0 + W / 2, y0 + thickness, z0, W, rise, ridgeLen));
                }
                group.add(hipEndWedge(x0, x0 + W / 2, y0 + thickness, W, z0, rise));
                group.add(hipEndWedge(x0 + L, x0 + L - W / 2, y0 + thickness, W, z0, rise));
            }
            addObject(group);
        });
    }

    // ---- Stairs ----
    function stairsForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Add Staircase</h3>
            ${field('Position X', 'st-x', startX)}
            ${field('Position Y (plan)', 'st-y', 0)}
            ${field('How many steps/treads?', 'st-steps', 12)}
            ${field('Total Rise Height', 'st-rise', 3000)}
            ${field('Stair Width', 'st-width', 1200)}
            ${field('Tread Depth (going)', 'st-tread', 280)}
            <button type="button" class="a3d-create" id="st-create">Create Staircase</button>
        `;
        document.getElementById('st-create').addEventListener('click', () => {
            const x0 = num('st-x', 0), z0 = num('st-y', 0);
            const steps = Math.max(1, Math.round(num('st-steps', 12)));
            const totalRise = num('st-rise', 3000), width = num('st-width', 1200), tread = num('st-tread', 280);
            const riserH = totalRise / steps;
            const group = new THREE.Group();
            for (let i = 0; i < steps; i++) {
                const stepH = (i + 1) * riserH;
                const mesh = boxMesh(tread, stepH, width);
                mesh.position.set(x0 + i * tread + tread / 2, stepH / 2, z0 + width / 2);
                group.add(mesh);
            }
            addObject(group);
        });
    }

    // ---- Tiles ----
    function tilesForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Tile a Floor Area</h3>
            ${field('Position X (corner)', 'tl-x', startX)}
            ${field('Position Y (plan corner)', 'tl-y', 0)}
            ${field('Area Width', 'tl-areaw', 3000)}
            ${field('Area Length', 'tl-areal', 3000)}
            ${field('Tile Size, e.g. 600x600', 'tl-size', '600x600', 'text')}
            ${field('Tile Thickness', 'tl-thick', 10)}
            ${field('Grout Gap', 'tl-gap', 3)}
            <button type="button" class="a3d-create" id="tl-create">Place Tiles</button>
        `;
        document.getElementById('tl-create').addEventListener('click', () => {
            const x0 = num('tl-x', 0), z0 = num('tl-y', 0);
            const areaW = num('tl-areaw', 3000), areaL = num('tl-areal', 3000);
            const [tw, tl] = parseTileSize(str('tl-size', '600x600'));
            const thickness = num('tl-thick', 10), gap = num('tl-gap', 3);
            const cols = Math.max(0, Math.floor(areaW / (tw + gap)));
            const rows = Math.max(0, Math.floor(areaL / (tl + gap)));
            if (cols < 1 || rows < 1) { alert('Area too small for the given tile size.'); return; }
            const group = new THREE.Group();
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const mesh = boxMesh(tw, thickness, tl);
                    mesh.position.set(
                        x0 + c * (tw + gap) + tw / 2,
                        thickness / 2,
                        z0 + r * (tl + gap) + tl / 2
                    );
                    group.add(mesh);
                }
            }
            addObject(group);
        });
    }

    // ---- Wall ----
    function wallForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Add Wall</h3>
            ${field('Position X (start)', 'wl-x', startX)}
            ${field('Position Y (plan start)', 'wl-y', 0)}
            ${field('Length', 'wl-length', 4000)}
            ${field('Thickness', 'wl-thickness', 200)}
            ${field('Height', 'wl-height', 2700)}
            ${field('Wall Name', 'wl-name', 'Wall ' + (walls.length + 1), 'text')}
            <button type="button" class="a3d-create" id="wl-create">Create Wall</button>
        `;
        document.getElementById('wl-create').addEventListener('click', () => {
            const x0 = num('wl-x', 0), z0 = num('wl-y', 0);
            const length = num('wl-length', 4000), thickness = num('wl-thickness', 200), height = num('wl-height', 2700);
            const name = str('wl-name', 'Wall ' + (walls.length + 1));
            const shapePts = [[0, 0], [length, 0], [length, thickness], [0, thickness]];
            const mesh = extrudeUp(shapePts, [], height, defaultMaterial(0xcbd5e1), x0, 0, z0);
            addObject(mesh);
            walls.push({ name, mesh, shapePts, holes: [], x0, z0, length, thickness, height });
            refreshStatus();
        });
    }

    // ---- Cut Window ----
    // NOTE: this simplified (no-CSG) approach rebuilds the wall as three
    // stacked slices (below sill / opening band / above opening), so only
    // ONE opening band per wall is supported per rebuild — cutting a second
    // opening on the same wall replaces the first rather than adding to it.
    function windowForm() {
        formPanelEl.innerHTML = `
            <h3>Cut Window / Door Opening</h3>
            <p class="a3d-form-note">Note: one opening per wall is supported; cutting again on the
            same wall replaces its previous opening.</p>
            <label class="a3d-field">Wall
                <select id="wn-wall">${walls.map((w, i) => `<option value="${i}">${w.name}</option>`).join('') || '<option>No walls yet</option>'}</select>
            </label>
            ${field('Offset along wall', 'wn-offset', 500)}
            ${field('Sill Height (from wall base)', 'wn-sill', 900)}
            ${field('Opening Width', 'wn-width', 1200)}
            ${field('Opening Height', 'wn-height', 1200)}
            <button type="button" class="a3d-create" id="wn-create" ${walls.length ? '' : 'disabled'}>Cut Opening</button>
        `;
        document.getElementById('wn-create').addEventListener('click', () => {
            const wallIdx = parseInt(document.getElementById('wn-wall').value, 10);
            const wall = walls[wallIdx];
            if (!wall) { alert('No wall selected.'); return; }
            const offset = num('wn-offset', 500), width = num('wn-width', 1200);
            const holeShapePts = [
                [offset, 0], [offset + width, 0], [offset + width, wall.thickness], [offset, wall.thickness]
            ];
            wall.holes = [holeShapePts]; // replaces any earlier opening on this wall (see note above)
            scene.remove(wall.mesh);
            objects = objects.filter((o) => o !== wall.mesh);
            const sill = num('wn-sill', 900), openH = num('wn-height', 1200);
            const group = new THREE.Group();
            // Below the sill: solid wall slice
            if (sill > 0) {
                const below = extrudeUp(wall.shapePts, [], sill, defaultMaterial(0xcbd5e1), wall.x0, 0, wall.z0);
                group.add(below);
            }
            // At sill..sill+openH: wall slice WITH the opening hole
            const midHeight = Math.min(openH, wall.height - sill);
            if (midHeight > 0) {
                const mid = extrudeUp(wall.shapePts, [holeShapePts], midHeight, defaultMaterial(0xcbd5e1), wall.x0, sill, wall.z0);
                group.add(mid);
            }
            // Above the opening: solid wall slice up to full height
            const aboveStart = sill + midHeight;
            if (aboveStart < wall.height) {
                const above = extrudeUp(wall.shapePts, [], wall.height - aboveStart, defaultMaterial(0xcbd5e1), wall.x0, aboveStart, wall.z0);
                group.add(above);
            }
            wall.mesh = group;
            addObject(group);
            refreshStatus();
        });
    }

    // ---- Frame ----
    function frameForm() {
        const startX = nextPlacementX();
        formPanelEl.innerHTML = `
            <h3>Add Door / Window Frame</h3>
            ${field('Position X (opening center)', 'fr-x', startX)}
            ${field('Position Y (plan)', 'fr-y', 0)}
            ${field('Elevation (sill height)', 'fr-z', 900)}
            ${field('Opening Width', 'fr-width', 1200)}
            ${field('Opening Height', 'fr-height', 1200)}
            ${field('Frame Bar Width', 'fr-barw', 60)}
            ${field('Frame Bar Depth', 'fr-bard', 100)}
            <button type="button" class="a3d-create" id="fr-create">Create Frame</button>
        `;
        document.getElementById('fr-create').addEventListener('click', () => {
            const x0 = num('fr-x', 0), y0 = num('fr-z', 900), z0 = num('fr-y', 0);
            const w = num('fr-width', 1200), h = num('fr-height', 1200);
            const barW = num('fr-barw', 60), barD = num('fr-bard', 100);
            const group = new THREE.Group();
            const mat = defaultMaterial(0x8b5e34);
            const top = boxMesh(w + barW * 2, barW, barD, mat);
            top.position.set(x0, y0 + h + barW / 2, z0);
            const bottom = boxMesh(w + barW * 2, barW, barD, mat);
            bottom.position.set(x0, y0 - barW / 2, z0);
            const left = boxMesh(barW, h, barD, mat);
            left.position.set(x0 - w / 2 - barW / 2, y0 + h / 2, z0);
            const right = boxMesh(barW, h, barD, mat);
            right.position.set(x0 + w / 2 + barW / 2, y0 + h / 2, z0);
            group.add(top, bottom, left, right);
            addObject(group);
        });
    }

    // ----------------------------------------------------------------
    // Open / close + header toggle button
    // ----------------------------------------------------------------
    NS3D.open = function () {
        ensureRoot();
        document.body.classList.add('asaf-mode-3d');
        loadThree((T) => {
            THREE = T;
            initScene();
            requestAnimationFrame(resizeStage);
        });
        updateToggleButton();
    };
    NS3D.close = function () {
        document.body.classList.remove('asaf-mode-3d');
        updateToggleButton();
        if (window.ArchitectSAFCore && window.ArchitectSAFCore.resizeCanvas) {
            requestAnimationFrame(() => window.ArchitectSAFCore.resizeCanvas());
        }
    };
    NS3D.toggle = function () {
        if (document.body.classList.contains('asaf-mode-3d')) NS3D.close(); else NS3D.open();
    };

    let toggleBtn = null;
    function injectToggleButton() {
        const headerRight = document.querySelector('.header-right');
        if (!headerRight || toggleBtn) return;
        toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.id = 'asaf-3d-toggle';
        toggleBtn.title = 'Toggle 2D / 3D';
        toggleBtn.innerHTML = '<i class="fas fa-cube"></i> <span>3D</span>';
        toggleBtn.addEventListener('click', () => NS3D.toggle());
        headerRight.insertBefore(toggleBtn, headerRight.firstChild);
        updateToggleButton();
    }
    function updateToggleButton() {
        if (!toggleBtn) return;
        const is3D = document.body.classList.contains('asaf-mode-3d');
        toggleBtn.innerHTML = is3D
            ? '<i class="fas fa-draw-polygon"></i> <span>2D</span>'
            : '<i class="fas fa-cube"></i> <span>3D</span>';
        toggleBtn.classList.toggle('active', is3D);
    }

    function init() {
        injectToggleButton();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
