/* ================================================================
   WEBCAD RIBBON — always visible in the workspace
   ----------------------------------------------------------------
   * Tabs: Home, Modify, Annotate, View. Each button clicks the ORIGINAL
     toolbar button with the same id, so CAD tool logic is unchanged.
   * "View Estimation" lives in a permanent group on the right, so it is
     visible on every tab.
   * Measures the real header and ribbon heights and publishes them as CSS
     variables, so the canvas, side panels and estimation panel always
     start below the ribbon, whatever the screen size.
   ================================================================ */
(function () {
    'use strict';

    const TABS = [
        {
            key: 'home', label: 'Home',
            groups: [
                { caption: 'Navigate', items: [
                    { id: 'mode-pan', icon: 'fa-hand-paper', label: 'Pan' },
                    { id: 'mode-zoom-in', icon: 'fa-search-plus', label: 'Zoom In' },
                    { id: 'mode-zoom-out', icon: 'fa-search-minus', label: 'Zoom Out' },
                    { id: 'mode-zoom-extents', icon: 'fa-expand-arrows-alt', label: 'Extents' },
                    { id: 'mode-measure', icon: 'fa-ruler-combined', label: 'Measure' }
                ] },
                { caption: 'Draw', items: [
                    { id: 'mode-continuous-line', icon: 'fa-minus', label: 'Line' },
                    { id: 'mode-polyline', icon: 'fa-draw-polygon', label: 'Polyline' },
                    { id: 'mode-spline', icon: 'fa-wave-square', label: 'Spline' },
                    { id: 'mode-arc', icon: 'fa-spinner', label: 'Arc' },
                    { id: 'mode-circle', icon: 'fa-circle', label: 'Circle' },
                    { id: 'mode-ellipse', icon: 'fa-chart-line', label: 'Ellipse' },
                    { id: 'mode-rect', icon: 'fa-square', label: 'Rectangle' },
                    { id: 'mode-hatch', icon: 'fa-fill-drip', label: 'Hatch' }
                ] }
            ]
        },
        {
            key: 'modify', label: 'Modify',
            groups: [
                { caption: 'Edit', items: [
                    { id: 'mode-move', icon: 'fa-arrows-alt', label: 'Move' },
                    { id: 'mode-clone', icon: 'fa-copy', label: 'Copy' },
                    { id: 'mode-mirror', icon: 'fa-columns', label: 'Mirror' },
                    { id: 'mode-rotate', icon: 'fa-sync-alt', label: 'Rotate' },
                    { id: 'mode-scale', icon: 'fa-expand', label: 'Scale' },
                    { id: 'mode-stretch', icon: 'fa-arrows-alt-h', label: 'Stretch' }
                ] },
                { caption: 'Geometry', items: [
                    { id: 'mode-trim', icon: 'fa-cut', label: 'Trim' },
                    { id: 'mode-extend', icon: 'fa-arrows-alt-h', label: 'Extend' },
                    { id: 'mode-fillet', icon: 'fa-border-all', label: 'Fillet' },
                    { id: 'mode-chamfer', icon: 'fa-border-all', label: 'Chamfer' },
                    { id: 'mode-offset', icon: 'fa-arrows-alt-v', label: 'Offset' },
                    { id: 'mode-array', icon: 'fa-th', label: 'Array' },
                    { id: 'mode-break', icon: 'fa-cut', label: 'Break' },
                    { id: 'mode-join', icon: 'fa-link', label: 'Join' }
                ] },
                { caption: 'Remove', items: [
                    { id: 'mode-delete', icon: 'fa-trash', label: 'Delete' },
                    { id: 'mode-clear', icon: 'fa-eraser', label: 'Clear All' }
                ] }
            ]
        },
        {
            key: 'annotate', label: 'Annotate',
            groups: [
                { caption: 'Text & Dimensions', items: [
                    { id: 'mode-text', icon: 'fa-font', label: 'Text' },
                    { id: 'mode-dim', icon: 'fa-ruler', label: 'Dimension' },
                    { id: 'mode-dim-arc', icon: 'fa-circle-notch', label: 'Arc Length' }
                ] }
            ]
        },
        {
            key: 'view', label: 'View',
            groups: [
                { caption: 'Drafting Aids', items: [
                    { id: 'mode-ortho', icon: 'fa-ruler-vertical', label: 'Ortho' },
                    { id: 'mode-polar', icon: 'fa-angle-double-up', label: 'Polar' },
                    { id: 'mode-osnap', icon: 'fa-magnet', label: 'Snap' },
                    { id: 'mode-grid', icon: 'fa-border-none', label: 'Grid' }
                ] },
                { caption: 'Settings', items: [
                    { id: 'set-fillet-radius', icon: 'fa-border-all', label: 'Fillet R' },
                    { id: 'set-chamfer-distance', icon: 'fa-border-all', label: 'Chamfer D' },
                    { id: 'set-offset-distance', icon: 'fa-arrows-alt-v', label: 'Offset D' },
                    { id: 'set-polar-angle', icon: 'fa-angle-double-up', label: 'Polar °' }
                ] }
            ]
        }
    ];

    let root = null;
    let activeKey = 'home';

    function buttonHtml(item) {
        const original = document.getElementById(item.id);
        const tip = (original && original.getAttribute('title')) || item.label;
        return `<button type="button" class="asaf-rb-btn" data-target="${item.id}" title="${tip}">
                    <i class="fas ${item.icon}" aria-hidden="true"></i><span>${item.label}</span>
                </button>`;
    }

    function groupHtml(g) {
        return `<div class="asaf-rb-group">
                    <div class="asaf-rb-buttons">${g.items.map(buttonHtml).join('')}</div>
                    <div class="asaf-rb-caption">${g.caption}</div>
                </div>`;
    }

    function build() {
        document.body.classList.add('asaf-ribbon-active');
        root = document.createElement('div');
        root.id = 'asaf-ribbon-root';
        root.setAttribute('role', 'toolbar');
        root.setAttribute('aria-label', 'Ribbon');
        root.innerHTML = `
            <div class="asaf-rb-tabs" role="tablist">
                ${TABS.map((t) => `<button type="button" class="asaf-rb-tab" role="tab" data-tab="${t.key}">${t.label}</button>`).join('')}
                <div class="asaf-rb-tabs-spacer"></div>
                <button type="button" id="asaf-rb-estimate" class="asaf-rb-estimate" title="Show the live cost estimate beside the drawing">
                    <i class="fas fa-table" aria-hidden="true"></i><span>View Estimation</span>
                </button>
            </div>
            <div class="asaf-rb-panels">
                ${TABS.map((t) => `<div class="asaf-rb-panel" data-panel="${t.key}" role="tabpanel">
                    ${t.groups.map(groupHtml).join('')}
                </div>`).join('')}
            </div>`;

        const header = document.querySelector('.header');
        if (header && header.parentNode) header.parentNode.insertBefore(root, header.nextSibling);
        else document.body.appendChild(root);

        root.querySelectorAll('.asaf-rb-tab').forEach((b) =>
            b.addEventListener('click', () => setTab(b.dataset.tab)));
        root.querySelectorAll('.asaf-rb-btn').forEach((b) =>
            b.addEventListener('click', () => {
                const original = document.getElementById(b.dataset.target);
                if (original) original.click();
            }));
        document.getElementById('asaf-rb-estimate').addEventListener('click', () => {
            if (window.WebCADEstimation) window.WebCADEstimation.toggle();
        });

        setTab(activeKey);
        syncActiveStates();
        observeOriginalToolbar();
        observeEstimationState();
        measure();
    }

    function setTab(key) {
        activeKey = key;
        root.querySelectorAll('.asaf-rb-tab').forEach((b) => {
            const on = b.dataset.tab === key;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        root.querySelectorAll('.asaf-rb-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === key));
        measure();
    }

    // Highlight the ribbon button for the currently active CAD tool.
    function syncActiveStates() {
        root.querySelectorAll('.asaf-rb-btn').forEach((b) => {
            const original = document.getElementById(b.dataset.target);
            b.classList.toggle('active', !!(original && original.classList.contains('active')));
        });
    }

    function observeOriginalToolbar() {
        const src = document.getElementById('draggable-toolbar');
        if (!src) return;
        new MutationObserver(syncActiveStates).observe(src, { subtree: true, attributes: true, attributeFilter: ['class'] });
    }

    function observeEstimationState() {
        const btn = document.getElementById('asaf-rb-estimate');
        new MutationObserver(() => {
            btn.classList.toggle('active', document.body.classList.contains('asaf-est-visible'));
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    // Position the ribbon directly under the header and tell the canvas to reflow.
    // The header height comes from the CSS variable (48px). It is READ, never written.
    // Writing it from the header's own measured height created a feedback loop that
    // could collapse the header to 1px and clip the whole top bar.
    function headerHeight() {
        const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-height'));
        return isFinite(v) && v >= 40 ? v : 48;
    }
    function measure() {
        if (!root) return;
        const headerH = headerHeight();
        root.style.top = headerH + 'px';
        document.documentElement.style.setProperty('--ribbon-height', root.offsetHeight + 'px');
        if (window.ArchitectSAFCore && window.ArchitectSAFCore.resizeCanvas) {
            window.ArchitectSAFCore.resizeCanvas();
        }
    }

    function init() {
        build();
        window.addEventListener('resize', measure);
        if (window.ResizeObserver) new ResizeObserver(measure).observe(root);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
