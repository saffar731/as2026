/**
 * main.js
 * ----------------------------------------------------------------
 * Orchestration only: every real algorithm lives in its own module
 * (scene-engine, room-graph, cost-matrix, luckysheet-bridge,
 * layout-manager, sync-state, room-modal). This file just wires DOM
 * buttons to those modules and defines the end-to-end estimation flow.
 * ----------------------------------------------------------------
 */
import { SceneEngine } from './scene-engine.js';
import { RoomGraph, polygonArea, polygonPerimeter } from './room-graph.js';
import { COST_MATRIX, calculateWallCost, calculateFloorCost } from './cost-matrix.js';
import { LuckysheetBridge } from './luckysheet-bridge.js';
import { LayoutManager } from './layout-manager.js';
import { promptRoomName } from './room-modal.js';
import { pushWallState, pushRoomState, getStateForSheet } from './sync-state.js';

const WALL_HEIGHT_M = 2.7;
const WALL_THICKNESS_M = 0.2;
const SNAP_GRID_M = 0.1;

let sceneEngine = null;
let bridge = null;
let layoutManager = null;
let luckysheetReady = false;
let selectedMaterialId = 'brickwork';
let wallCounter = 0;

// ---------------------------------------------------------------
// Luckysheet lazy init (instantiated on first need, then only toggled)
// ---------------------------------------------------------------
function ensureLuckysheet() {
    if (luckysheetReady) return;
    luckysheetReady = true;

    // eslint-disable-next-line no-undef -- luckysheet is a global from the CDN script
    luckysheet.create({
        container: 'luckysheet-container',
        showinfobar: false,
        lang: 'en',
        data: [{ name: 'Layout 1', status: 1, order: 0, celldata: [] }]
    });

    // eslint-disable-next-line no-undef
    bridge = new LuckysheetBridge(window.luckysheet);
    layoutManager = new LayoutManager(sceneEngine, bridge, () => new RoomGraph(SNAP_GRID_M * 0.8));
    layoutManager.onLayoutSwitched = renderLayoutTabs;
    layoutManager.createInitialLayout('Layout 1');
}

// ---------------------------------------------------------------
// Scene setup
// ---------------------------------------------------------------
function initScene() {
    const container = document.getElementById('scene-container');
    sceneEngine = new SceneEngine(container, {
        wallHeightM: WALL_HEIGHT_M,
        wallThicknessM: WALL_THICKNESS_M,
        snapToGridM: SNAP_GRID_M
    });
    sceneEngine.onSegmentCommitted = handleSegmentCommitted;
    sceneEngine.onLiveDimension = handleLiveDimension;
    sceneEngine.onModeChanged = (mode) => {
        document.getElementById('btn-mode-2d').classList.toggle('active', mode === '2d');
        document.getElementById('btn-mode-3d').classList.toggle('active', mode === '3d');
    };
}

// ---------------------------------------------------------------
// Core estimation pipeline: wall committed -> cost -> sheet row -> loop check
// ---------------------------------------------------------------
async function handleSegmentCommitted(segment) {
    wallCounter += 1;
    const label = `Wall ${wallCounter}`;
    const rate = COST_MATRIX[selectedMaterialId];
    const dims = { lengthM: segment.lengthM, heightM: WALL_HEIGHT_M, thicknessM: WALL_THICKNESS_M };
    const cost = calculateWallCost(rate, dims);

    const layout = layoutManager.activeLayout;
    const row = bridge.writeWallRow(
        layout.sheetOrder,
        { label, ...dims },
        { materialLabel: rate.label, materialSubtotal: cost.materialSubtotal, laborSubtotal: cost.laborSubtotal, total: cost.total }
    );
    pushWallState({ threeRef: segment.mesh, sheetOrder: layout.sheetOrder, row, label, materialId: selectedMaterialId, ...dims });
    refreshRunningTotal();

    const result = layoutManager.roomGraph.addSegment(segment.x1, segment.z1, segment.x2, segment.z2, segment.mesh);
    if (result.closesLoop) {
        await handleClosedLoop(result.loopNodeIndices, layout);
    }
}

async function handleClosedLoop(loopNodeIndices, layout) {
    const loopPoints = layoutManager.roomGraph.resolvePositions(loopNodeIndices);
    const name = await promptRoomName();
    if (!name) return; // user cancelled — loop stays geometrically closed, just unnamed/unrecorded

    const areaM2 = polygonArea(loopPoints);
    const perimeterM = polygonPerimeter(loopPoints);
    const floorCost = calculateFloorCost(areaM2);

    const row = bridge.writeRoomRow(
        layout.sheetOrder,
        { name, perimeterM, areaM2, wallHeightM: WALL_HEIGHT_M },
        floorCost
    );
    const roomRecord = {
        name, loopPoints, areaM2, perimeterM, wallHeightM: WALL_HEIGHT_M,
        sheetOrder: layout.sheetOrder, row
    };
    layoutManager.recordRoom(roomRecord);
    pushRoomState(roomRecord);
    refreshRunningTotal();
}

function refreshRunningTotal() {
    if (!layoutManager?.activeLayout) return;
    const layout = layoutManager.activeLayout;
    const entries = getStateForSheet(layout.sheetOrder);
    // Each wall/room row already carries its own total implicitly via the
    // cost module; recomputing here keeps the grand total trivially correct
    // even if individual entries' materials are changed later.
    const total = entries.reduce((sum, e) => {
        if (e.type === 'wall') {
            // Use the material that was actually selected when THIS wall was
            // drawn, not whatever the dropdown currently shows.
            const rate = COST_MATRIX[e.materialId] || COST_MATRIX[selectedMaterialId];
            return sum + calculateWallCost(rate, e).total;
        }
        if (e.type === 'room') {
            return sum + calculateFloorCost(e.areaM2).total;
        }
        return sum;
    }, 0);
    document.getElementById('running-total').textContent = `$${total.toFixed(2)}`;
}

function handleLiveDimension(lengthM) {
    const el = document.getElementById('live-dimension-readout');
    if (!el) return;
    el.textContent = lengthM == null ? '' : `Length: ${lengthM.toFixed(2)} m`;
}

// ---------------------------------------------------------------
// Layout tabs UI
// ---------------------------------------------------------------
function renderLayoutTabs() {
    const wrap = document.getElementById('layout-tabs');
    wrap.innerHTML = '';
    layoutManager.layouts.forEach((l) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'layout-tab' + (l.id === layoutManager.activeLayout.id ? ' active' : '');
        btn.textContent = l.name;
        btn.addEventListener('click', () => layoutManager.switchToLayout(l.id));
        wrap.appendChild(btn);
    });
}

// ---------------------------------------------------------------
// Static DOM wiring
// ---------------------------------------------------------------
function populateMaterialSelect() {
    const select = document.getElementById('material-select');
    Object.values(COST_MATRIX).forEach((rate) => {
        const opt = document.createElement('option');
        opt.value = rate.id;
        opt.textContent = `${rate.label} (${rate.unit})`;
        select.appendChild(opt);
    });
    select.value = selectedMaterialId;
    select.addEventListener('change', (e) => { selectedMaterialId = e.target.value; });
}

function wireButtons() {
    document.getElementById('btn-view-estimation').addEventListener('click', () => {
        ensureLuckysheet(); // first click: real init; later clicks: no-op
        document.body.classList.toggle('estimation-visible');
    });

    document.getElementById('btn-mode-2d').addEventListener('click', () => sceneEngine.setMode('2d'));
    document.getElementById('btn-mode-3d').addEventListener('click', () => sceneEngine.setMode('3d'));

    document.getElementById('btn-draw-wall').addEventListener('click', (e) => {
        ensureLuckysheet(); // drawing needs a layout/sheet to write into
        const enabled = !sceneEngine.drawingEnabled;
        sceneEngine.setDrawingEnabled(enabled);
        e.currentTarget.classList.toggle('active', enabled);
    });

    document.getElementById('btn-new-layout').addEventListener('click', async () => {
        ensureLuckysheet();
        const suggested = `Layout ${layoutManager.layouts.length + 1}`;
        const name = prompt('Name this layout:', suggested);
        if (name === null) return;
        await layoutManager.createNewLayout(name.trim() || suggested);
    });
}

// ---------------------------------------------------------------
// Boot
// ---------------------------------------------------------------
initScene();
populateMaterialSelect();
wireButtons();
