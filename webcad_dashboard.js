/* ================================================================
   WEBCAD DASHBOARD — ADDITIVE EXTENSION
   A file-management dashboard that renders in front of the CAD
   workspace. Does not edit the core engine's drawing logic — it
   only talks to it through window.ArchitectSAFCore (see the small
   bridge object added at the bottom of architectsaf_cad.js).
================================================================ */
(function () {
    'use strict';

    const STORAGE_KEY = 'architectCAD_files';
    const LEGACY_KEY = 'architectCAD'; // the app's original single-document key

    // ---------------------------------------------------------------
    // Unique ID generation
    // Structured, human-legible, and collision-checked: CAD-YYYYMMDD-XXXXXX
    // where XXXXXX is 6 cryptographically-random base36 characters
    // (36^6 ≈ 2.2 billion combinations per calendar day). Every candidate
    // is checked against every ID already on record before being accepted,
    // and on the astronomically unlikely event of a collision we fall back
    // to a full RFC4122 UUID v4 suffix, which is effectively guaranteed
    // unique. No two files can ever end up sharing an id.
    // ---------------------------------------------------------------
    const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

    function randomBase36(len) {
        const bytes = new Uint8Array(len);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        let out = '';
        for (let i = 0; i < len; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
        return out;
    }

    function uuidV4() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        // Manual RFC4122 v4 fallback for older browsers.
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            const v = c === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }

    function datestamp() {
        const d = new Date();
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    }

    function generateFileId(existingIds) {
        let id;
        let attempts = 0;
        do {
            id = `CAD-${datestamp()}-${randomBase36(6)}`;
            attempts++;
        } while (existingIds.has(id) && attempts < 50);
        if (existingIds.has(id)) {
            // Should never happen, but guarantee uniqueness absolutely.
            id = `CAD-${datestamp()}-${uuidV4()}`;
        }
        return id;
    }

    // ---------------------------------------------------------------
    // Persistence layer — file metadata + document body, all keyed by id.
    // ---------------------------------------------------------------
    const Store = {
        _read() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (raw) return JSON.parse(raw);
            } catch (e) {
                console.error('[Dashboard] Failed to read file store:', e);
            }
            return { files: {}, lastOpenedId: null };
        },
        _write(db) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
                return true;
            } catch (e) {
                console.error('[Dashboard] Failed to persist file store:', e);
                return false;
            }
        },
        load() {
            const db = this._read();
            this._migrateLegacyIfNeeded(db);
            return db;
        },
        // One-time recovery: if this browser has an old single-document save
        // from before the dashboard existed, adopt it as a real file record
        // instead of silently losing access to it.
        _migrateLegacyIfNeeded(db) {
            if (db._legacyChecked) return;
            db._legacyChecked = true;
            try {
                const legacyRaw = localStorage.getItem(LEGACY_KEY);
                if (legacyRaw && Object.keys(db.files).length === 0) {
                    const data = JSON.parse(legacyRaw);
                    const id = generateFileId(new Set());
                    const now = new Date().toISOString();
                    let thumbnail = null;
                    try { thumbnail = renderThumbnail(data); } catch (e) { thumbnail = null; }
                    db.files[id] = {
                        id,
                        name: 'Untitled Drawing (Recovered)',
                        createdAt: data.savedAt || now,
                        updatedAt: data.savedAt || now,
                        savedAt: data.savedAt || now,
                        entityCount: Array.isArray(data.entities) ? data.entities.length : 0,
                        thumbnail,
                        data
                    };
                }
            } catch (e) {
                console.warn('[Dashboard] Legacy drawing could not be recovered:', e);
            }
            this._write(db);
        },
        allFiles(db) {
            return Object.values(db.files).filter((f) => f && f.id);
        },
        createFile(db, name) {
            const existingIds = new Set(Object.keys(db.files));
            const id = generateFileId(existingIds);
            const now = new Date().toISOString();
            const file = {
                id,
                name: (name || 'Untitled Drawing').slice(0, 120),
                createdAt: now,
                updatedAt: now,
                savedAt: null,
                entityCount: 0,
                thumbnail: null,
                data: null
            };
            db.files[id] = file;
            this._write(db);
            return file;
        },
        updateFileData(db, id, projectData) {
            const file = db.files[id];
            if (!file) return null;
            const now = new Date().toISOString();
            file.data = projectData;
            file.updatedAt = now;
            file.savedAt = now;
            file.entityCount = Array.isArray(projectData.entities) ? projectData.entities.length : 0;

            let thumbnail = null;
            try { thumbnail = renderThumbnail(projectData); } catch (e) { thumbnail = null; }
            file.thumbnail = thumbnail;

            let ok = this._write(db);
            if (!ok && thumbnail) {
                // Storage is tight — the drawing itself matters far more
                // than its preview image, so drop the thumbnail and retry.
                file.thumbnail = null;
                ok = this._write(db);
            }
            return file;
        },
        rename(db, id, name) {
            const file = db.files[id];
            if (!file) return;
            file.name = (name || file.name).slice(0, 120);
            this._write(db);
        },
        remove(db, id) {
            delete db.files[id];
            if (db.lastOpenedId === id) db.lastOpenedId = null;
            this._write(db);
        },
        setLastOpened(db, id) {
            db.lastOpenedId = id;
            this._write(db);
        }
    };

    // ---------------------------------------------------------------
    // Small helpers
    // ---------------------------------------------------------------
    function timeAgo(iso) {
        if (!iso) return '—';
        const diffMs = Date.now() - new Date(iso).getTime();
        const s = Math.floor(diffMs / 1000);
        if (s < 5) return 'Just now';
        if (s < 60) return `${s}s ago`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        const d = Math.floor(h / 24);
        if (d < 30) return `${d}d ago`;
        return new Date(iso).toLocaleDateString();
    }

    function esc(str) {
        return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------------------------------------------------------------
    // Lightweight thumbnail renderer
    // Draws a small preview of a project's geometry without touching the
    // core engine's drawing code — it understands the same entity shapes
    // (line, polyline, circle, etc.) but only enough to sketch an outline.
    // ---------------------------------------------------------------
    function computeBounds(entities) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const extend = (x, y) => {
            if (!isFinite(x) || !isFinite(y)) return;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        };
        (entities || []).forEach((ent) => {
            switch (ent.type) {
                case 'line': case 'measure': case 'dimension':
                    extend(ent.x1, ent.y1); extend(ent.x2, ent.y2); break;
                case 'polyline': case 'spline': case 'hatch':
                    (ent.points || []).forEach((p) => extend(p.x, p.y)); break;
                case 'circle': case 'arc': case 'arc-length-dimension':
                    extend(ent.x - (ent.radius || 0), ent.y - (ent.radius || 0));
                    extend(ent.x + (ent.radius || 0), ent.y + (ent.radius || 0));
                    break;
                case 'ellipse': {
                    const rx = ent.radiusX || ent.rx || 0, ry = ent.radiusY || ent.ry || 0;
                    extend(ent.x - rx, ent.y - ry); extend(ent.x + rx, ent.y + ry);
                    break;
                }
                case 'rect':
                    extend(ent.x, ent.y); extend(ent.x + (ent.w || 0), ent.y + (ent.h || 0)); break;
                case 'text':
                    extend(ent.x, ent.y); break;
            }
        });
        return isFinite(minX) ? { minX, minY, maxX, maxY } : null;
    }

    function renderThumbnail(projectData) {
        const entities = (projectData && projectData.entities) || [];
        if (!entities.length) return null;
        const bounds = computeBounds(entities);
        if (!bounds) return null;

        const W = 240, H = 150, margin = 14;
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);

        const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
        const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
        const scale = Math.min((W - margin * 2) / bw, (H - margin * 2) / bh);
        const offX = margin - bounds.minX * scale + ((W - margin * 2) - bw * scale) / 2;
        const offY = margin - bounds.minY * scale + ((H - margin * 2) - bh * scale) / 2;
        const tx = (x) => x * scale + offX;
        const ty = (y) => y * scale + offY;

        ctx.lineWidth = 1;
        entities.slice(0, 4000).forEach((ent) => {
            const color = ent.color || '#94a3b8';
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.beginPath();
            switch (ent.type) {
                case 'line': case 'measure': case 'dimension':
                    ctx.moveTo(tx(ent.x1), ty(ent.y1)); ctx.lineTo(tx(ent.x2), ty(ent.y2)); ctx.stroke(); break;
                case 'polyline': case 'spline':
                    if (ent.points && ent.points.length) {
                        ctx.moveTo(tx(ent.points[0].x), ty(ent.points[0].y));
                        ent.points.slice(1).forEach((p) => ctx.lineTo(tx(p.x), ty(p.y)));
                        if (ent.closed) ctx.closePath();
                        ctx.stroke();
                    }
                    break;
                case 'hatch':
                    if (ent.points && ent.points.length) {
                        ctx.moveTo(tx(ent.points[0].x), ty(ent.points[0].y));
                        ent.points.slice(1).forEach((p) => ctx.lineTo(tx(p.x), ty(p.y)));
                        ctx.closePath();
                        ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
                        ctx.stroke();
                    }
                    break;
                case 'circle':
                    ctx.arc(tx(ent.x), ty(ent.y), Math.max(0.5, (ent.radius || 0) * scale), 0, Math.PI * 2);
                    ctx.stroke(); break;
                case 'arc': case 'arc-length-dimension':
                    ctx.arc(tx(ent.x), ty(ent.y), Math.max(0.5, (ent.radius || 0) * scale), ent.startAngle || 0, ent.endAngle || Math.PI);
                    ctx.stroke(); break;
                case 'ellipse': {
                    const rx = Math.max(0.5, (ent.radiusX || ent.rx || 0) * scale);
                    const ry = Math.max(0.5, (ent.radiusY || ent.ry || 0) * scale);
                    if (ctx.ellipse) ctx.ellipse(tx(ent.x), ty(ent.y), rx, ry, 0, 0, Math.PI * 2);
                    else ctx.arc(tx(ent.x), ty(ent.y), rx, 0, Math.PI * 2);
                    ctx.stroke(); break;
                }
                case 'rect':
                    ctx.rect(tx(ent.x), ty(ent.y), (ent.w || 0) * scale, (ent.h || 0) * scale); ctx.stroke(); break;
                case 'text':
                    ctx.fillRect(tx(ent.x) - 1, ty(ent.y) - 1, 2, 2); break;
            }
        });

        try {
            return canvas.toDataURL('image/png');
        } catch (e) {
            return null;
        }
    }

    // ---------------------------------------------------------------
    // Dashboard UI
    // ---------------------------------------------------------------
    let root = null;
    let currentFileId = null; // the file currently loaded into the workspace, if any
    let searchQuery = '';
    let sortMode = 'date'; // 'date' | 'name'

    function ensureRoot() {
        if (root) return root;
        root = document.createElement('div');
        root.id = 'asaf-dashboard-root';
        root.innerHTML = `
            <div class="asaf-dash-header">
                <div class="asaf-dash-logo">
                    <h1>Architect<span>SAF</span></h1>
                    <span class="asaf-dash-subtitle">DASHBOARD</span>
                </div>
                <div class="asaf-dash-controls">
                    <div class="asaf-dash-search">
                        <i class="fas fa-search"></i>
                        <input type="text" id="asaf-search-input" placeholder="Search drawings by name or ID…">
                    </div>
                    <select id="asaf-sort-select" class="asaf-dash-sort" title="Sort order">
                        <option value="date">Sort: Most recent</option>
                        <option value="name">Sort: Name (A–Z)</option>
                    </select>
                    <button type="button" id="asaf-new-file-btn" class="asaf-dash-newbtn">
                        <i class="fas fa-plus"></i> New Drawing
                    </button>
                </div>
            </div>
            <div class="asaf-dash-summary" id="asaf-dash-summary"></div>
            <div class="asaf-dash-body custom-scrollbar">
                <section class="asaf-dash-section" data-category="edited">
                    <h2>Recently Edited <span class="asaf-count" data-count="edited"></span></h2>
                    <div class="asaf-card-grid" data-grid="edited"></div>
                </section>
                <section class="asaf-dash-section" data-category="saved">
                    <h2>Saved <span class="asaf-count" data-count="saved"></span></h2>
                    <div class="asaf-card-grid" data-grid="saved"></div>
                </section>
                <section class="asaf-dash-section" data-category="created">
                    <h2>Newly Created <span class="asaf-count" data-count="created"></span></h2>
                    <div class="asaf-card-grid" data-grid="created"></div>
                </section>
            </div>
        `;
        document.body.appendChild(root);
        root.querySelector('#asaf-new-file-btn').addEventListener('click', createNewFile);
        root.querySelector('#asaf-search-input').addEventListener('input', (e) => {
            searchQuery = e.target.value || '';
            renderDashboard();
        });
        root.querySelector('#asaf-sort-select').addEventListener('change', (e) => {
            sortMode = e.target.value;
            renderDashboard();
        });
        return root;
    }

    function cardHtml(file) {
        const thumb = file.thumbnail
            ? `<img src="${file.thumbnail}" alt="" draggable="false">`
            : `<i class="fas fa-draw-polygon"></i>`;
        return `
            <div class="asaf-file-card" data-id="${esc(file.id)}">
                <div class="asaf-file-card-main" data-action="open">
                    <div class="asaf-file-card-thumb">${thumb}</div>
                    <div class="asaf-file-card-info">
                        <div class="asaf-file-card-name">${esc(file.name)}</div>
                        <div class="asaf-file-card-id">${esc(file.id)}</div>
                        <div class="asaf-file-card-meta">
                            ${file.entityCount || 0} objects · edited ${esc(timeAgo(file.updatedAt))}
                            ${file.savedAt ? '' : ' · <span class="asaf-unsaved-tag">unsaved</span>'}
                        </div>
                    </div>
                </div>
                <div class="asaf-file-card-actions">
                    <button type="button" title="Duplicate" data-action="duplicate"><i class="fas fa-copy"></i></button>
                    <button type="button" title="Rename" data-action="rename"><i class="fas fa-pen"></i></button>
                    <button type="button" title="Delete" data-action="delete"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }

    function emptyHtml(label) {
        return `<div class="asaf-empty">${esc(label)}</div>`;
    }

    function formatBytes(n) {
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function sortFiles(files, dateField) {
        const arr = [...files];
        if (sortMode === 'name') {
            arr.sort((a, b) => a.name.localeCompare(b.name));
        } else {
            arr.sort((a, b) => new Date(b[dateField] || 0) - new Date(a[dateField] || 0));
        }
        return arr;
    }

    function matchesSearch(file) {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        return file.name.toLowerCase().includes(q) || file.id.toLowerCase().includes(q);
    }

    function renderDashboard() {
        ensureRoot();
        const db = Store.load();
        const allFiles = Store.allFiles(db);
        const files = allFiles.filter(matchesSearch);

        const edited = sortFiles(files, 'updatedAt');
        const saved = sortFiles(files.filter((f) => f.savedAt), 'savedAt');
        const created = sortFiles(files, 'createdAt');

        const editedGrid = root.querySelector('[data-grid="edited"]');
        const savedGrid = root.querySelector('[data-grid="saved"]');
        const createdGrid = root.querySelector('[data-grid="created"]');

        const noMatchMsg = 'No drawings match your search.';
        editedGrid.innerHTML = edited.length ? edited.map(cardHtml).join('')
            : emptyHtml(allFiles.length ? noMatchMsg : 'No files yet — start a new drawing.');
        savedGrid.innerHTML = saved.length ? saved.map(cardHtml).join('')
            : emptyHtml(allFiles.length ? (files.length ? 'Nothing explicitly saved yet.' : noMatchMsg) : 'Nothing explicitly saved yet.');
        createdGrid.innerHTML = created.length ? created.map(cardHtml).join('')
            : emptyHtml(allFiles.length ? noMatchMsg : 'No files yet — start a new drawing.');

        root.querySelector('[data-count="edited"]').textContent = edited.length ? `(${edited.length})` : '';
        root.querySelector('[data-count="saved"]').textContent = saved.length ? `(${saved.length})` : '';
        root.querySelector('[data-count="created"]').textContent = created.length ? `(${created.length})` : '';

        const bytes = JSON.stringify(db).length;
        const summaryEl = root.querySelector('#asaf-dash-summary');
        summaryEl.textContent = allFiles.length
            ? `${allFiles.length} drawing${allFiles.length === 1 ? '' : 's'} · ${formatBytes(bytes)} used in this browser`
            : '';

        root.querySelectorAll('.asaf-file-card').forEach((card) => {
            const id = card.dataset.id;
            card.querySelector('[data-action="open"]').addEventListener('click', () => openFile(id));
            card.querySelector('[data-action="duplicate"]').addEventListener('click', (e) => {
                e.stopPropagation();
                duplicateFile(id);
            });
            card.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
                e.stopPropagation();
                renameFile(id);
            });
            card.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteFile(id);
            });
        });
    }

    function createNewFile() {
        const name = prompt('Name this drawing:', 'Untitled Drawing');
        if (name === null) return; // cancelled
        const db = Store.load();
        const file = Store.createFile(db, name.trim() || 'Untitled Drawing');
        window.location.hash = '#/file/' + encodeURIComponent(file.id);
    }

    function renameFile(id) {
        const db = Store.load();
        const file = db.files[id];
        if (!file) return;
        const name = prompt('Rename drawing:', file.name);
        if (name === null) return;
        Store.rename(db, id, name.trim() || file.name);
        renderDashboard();
    }

    function duplicateFile(id) {
        const db = Store.load();
        const original = db.files[id];
        if (!original) return;
        const copy = Store.createFile(db, original.name + ' (copy)');
        if (original.data) {
            Store.updateFileData(db, copy.id, JSON.parse(JSON.stringify(original.data)));
        }
        renderDashboard();
    }

    function deleteFile(id) {
        const db = Store.load();
        const file = db.files[id];
        if (!file) return;
        if (!confirm(`Delete "${file.name}"? This can't be undone.`)) return;
        Store.remove(db, id);
        renderDashboard();
    }

    function openFile(id) {
        window.location.hash = '#/file/' + encodeURIComponent(id);
    }

    // ---------------------------------------------------------------
    // Persisting live workspace edits back into the file record.
    // Fires on every explicit save (toolbar Save / Ctrl+S) and on every
    // 30s autosave, both of which flow through the core's saveToStorage().
    // ---------------------------------------------------------------
    window.addEventListener('architectsaf:save', (e) => {
        if (!currentFileId || !e.detail || !e.detail.projectData) return;
        const db = Store.load();
        if (!db.files[currentFileId]) return;
        Store.updateFileData(db, currentFileId, e.detail.projectData);
    });

    // Best-effort flush of in-memory state into the file record — used when
    // navigating back to the dashboard or closing the tab, so switching
    // files never silently drops work that hasn't hit the 30s autosave yet.
    function flushCurrentFile() {
        if (!currentFileId || !window.ArchitectSAFCore) return;
        try {
            const db = Store.load();
            if (!db.files[currentFileId]) return;
            const projectData = window.ArchitectSAFCore.getProjectData();
            Store.updateFileData(db, currentFileId, projectData);
        } catch (e) {
            console.error('[Dashboard] Failed to flush current file:', e);
        }
    }
    window.addEventListener('beforeunload', flushCurrentFile);

    // ---------------------------------------------------------------
    // View switching + deep-linking via #/file/<id>
    // ---------------------------------------------------------------
    function showDashboardView() {
        flushCurrentFile();
        currentFileId = null;
        document.body.classList.remove('asaf-workspace-active');
        document.body.classList.add('asaf-dashboard-active');
        renderDashboard();
    }

    function showWorkspaceView(id) {
        const db = Store.load();
        const file = db.files[id];
        if (!file) {
            alert('That drawing could not be found (id: ' + id + ').');
            window.location.hash = '';
            return;
        }
        if (currentFileId && currentFileId !== id) flushCurrentFile();
        currentFileId = id;
        Store.setLastOpened(db, id);

        document.body.classList.remove('asaf-dashboard-active');
        document.body.classList.add('asaf-workspace-active');

        const applyFile = () => {
            if (!window.ArchitectSAFCore) { setTimeout(applyFile, 30); return; }
            if (file.data) {
                window.ArchitectSAFCore.loadProject(file.data);
            } else {
                window.ArchitectSAFCore.newProject();
            }
            // The workspace was hidden (display:none) while the core engine
            // initialized, so the canvas buffer needs a real resize now that
            // it has actual dimensions to measure.
            requestAnimationFrame(() => window.ArchitectSAFCore.resizeCanvas());
            updateWorkspaceFileBadge(file);
        };
        applyFile();
    }

    function route() {
        const match = window.location.hash.match(/^#\/file\/([^/]+)$/);
        if (match) {
            showWorkspaceView(decodeURIComponent(match[1]));
        } else {
            showDashboardView();
        }
    }
    window.addEventListener('hashchange', route);

    // ---------------------------------------------------------------
    // A small "back to dashboard" control + current file name, injected
    // into the existing header so the workspace is still reachable and
    // navigable without editing header markup by hand.
    // ---------------------------------------------------------------
    let badgeEl = null;
    function injectHeaderBadge() {
        const headerRight = document.querySelector('.header-right');
        if (!headerRight || badgeEl) return;
        badgeEl = document.createElement('div');
        badgeEl.className = 'asaf-file-badge';
        badgeEl.innerHTML = `
            <button type="button" id="asaf-back-to-dashboard" title="Back to Dashboard">
                <i class="fas fa-th-large"></i>
            </button>
            <span id="asaf-current-file-name" class="asaf-current-file-name"></span>
        `;
        headerRight.insertBefore(badgeEl, headerRight.firstChild);
        document.getElementById('asaf-back-to-dashboard').addEventListener('click', () => {
            window.location.hash = '';
        });
    }

    function updateWorkspaceFileBadge(file) {
        injectHeaderBadge();
        const nameEl = document.getElementById('asaf-current-file-name');
        if (nameEl) nameEl.textContent = file.name + '  ·  ' + file.id;
    }

    // ---------------------------------------------------------------
    // Boot
    // ---------------------------------------------------------------
    function init() {
        ensureRoot();

        // Adopt a project that just came in via a `?project=` share link
        // (decoded by the core engine before this script ran) as a real,
        // addressable file instead of leaving it stranded in memory with
        // no id and no way to return to it.
        if (window.__architectSAFPendingSharedProject) {
            const shared = window.__architectSAFPendingSharedProject;
            delete window.__architectSAFPendingSharedProject;
            const db = Store.load();
            const file = Store.createFile(db, 'Shared Drawing');
            Store.updateFileData(db, file.id, shared);
            window.location.hash = '#/file/' + encodeURIComponent(file.id);
            return; // the resulting hashchange drives the rest of routing
        }

        route();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
