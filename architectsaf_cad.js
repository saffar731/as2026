(function() {
    
    // ==========================================
// ADD THIS: Domain Configuration & Exporter
// ==========================================
const SAFWAT_EXCEL_URL = 'https://safwat-excel.netlify.app';

function exportToSafwatExcel() {
  const elements = getArchitectDrawings(); 
  
  if (!elements || elements.length === 0) {
    alert("No drawings found on canvas!");
    return;
  }

  const estimationData = elements.map((item, index) => {
    const width = item.width || 0;
    const height = item.height || 0;
    const areaSqFt = width * height;
    const unitPrice = item.unitPrice || 15; 

    return {
      id: index + 1,
      elementName: item.type || "Wall / Structure",
      dimensions: `${width}ft x ${height}ft`,
      quantity: item.count || 1,
      estimatedCost: areaSqFt * unitPrice
    };
  });

  const payload = {
    source: 'ArchitectSAF',
    rows: estimationData
  };

  // 1. Open or focus SafwatExcel tab window
  const excelWin = window.open(SAFWAT_EXCEL_URL, 'SafwatExcelWindow');

  // 2. Send cross-domain postMessage
  const sendMessage = () => {
    excelWin.postMessage(payload, SAFWAT_EXCEL_URL);
  };

  // Send immediately (if tab is already open) and retry after 1.5s (if opening fresh)
  sendMessage();
  setTimeout(sendMessage, 1500);
}

// ==========================================
// CHANGE THIS: Canvas Array Selector
// ==========================================
// ==========================================
// CHANGE THIS: Updated Drawing Extractor Function
// ==========================================
function getArchitectDrawings() {
  // Option A: If using custom array or active canvas (Fabric.js / Konva / Custom Engine)
  // Replace 'window.architectCanvasElements' with your canvas instance (e.g., canvas.getObjects())
  const rawCanvasObjects = window.architectCanvasElements || window.canvas?.getObjects() || [];

  if (rawCanvasObjects.length === 0) {
    // Mock fallback showing dynamic tool names
    return [
      { toolName: "Wall Tool", width: 25, height: 10, unitPrice: 20 },
      { toolName: "Window Tool", width: 4, height: 5, unitPrice: 45 },
      { toolName: "Door Tool", width: 3, height: 7, unitPrice: 60 }
    ];
  }

  // Map canvas objects to extract exact tool names
  return rawCanvasObjects.map(obj => ({
    // Check common properties where your tool name or shape type is stored
    toolName: obj.toolName || obj.type || obj.name || obj.label || "Drawing Tool",
    width: obj.width || obj.getScaledWidth?.() || 0,
    height: obj.height || obj.getScaledHeight?.() || 0,
    unitPrice: obj.unitPrice || 15,
    count: obj.count || 1
  }));
}

// ==========================================
// CHANGE THIS: Exporter Mapping Function
// ==========================================
function exportToSafwatExcel() {
  const elements = getArchitectDrawings(); 
  
  if (!elements || elements.length === 0) {
    alert("No elements drawn to estimate!");
    return;
  }

  // Process data with exact tool names included
  const estimationData = elements.map((item, index) => {
    const width = Math.round(item.width);
    const height = Math.round(item.height);
    const areaSqFt = width * height;
    const unitPrice = item.unitPrice || 15; 

    return {
      id: index + 1,
      elementName: item.toolName, // Exact tool name printed here
      dimensions: `${width}ft x ${height}ft`,
      quantity: item.count || 1,
      estimatedCost: areaSqFt * unitPrice
    };
  });

  const payload = {
    source: 'ArchitectSAF',
    rows: estimationData
  };

  const excelWin = window.open('https://safwat-excel.netlify.app', 'SafwatExcelWindow');

  const sendMessage = () => {
    excelWin.postMessage(payload, 'https://safwat-excel.netlify.app');
  };

  sendMessage();
  setTimeout(sendMessage, 1500);
}
    // ===== DOM Elements =====
    const canvas = document.getElementById('infinite-canvas');
    const ctx = canvas.getContext('2d');
    const livePoint = document.getElementById('live-point');
    const snapIndicator = document.getElementById('snap-indicator');
    const orthoH = document.getElementById('ortho-h');
    const orthoV = document.getElementById('ortho-v');
    const endpointContainer = document.getElementById('endpoint-container');
    const tooltip = document.getElementById('tooltip');
    const quickProps = document.getElementById('quick-props');
    const measureResult = document.getElementById('measure-result');

    // ===== Draggable Toolbar =====
    const toolbar = document.getElementById('draggable-toolbar');
    const toolbarHandle = document.getElementById('toolbar-handle');
    let isDraggingToolbar = false;
    let toolbarOffsetX = 0, toolbarOffsetY = 0;

    if (toolbarHandle) {
        toolbarHandle.addEventListener('mousedown', (e) => {
            isDraggingToolbar = true;
            const rect = toolbar.getBoundingClientRect();
            toolbarOffsetX = e.clientX - rect.left;
            toolbarOffsetY = e.clientY - rect.top;
            toolbar.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (isDraggingToolbar) {
                let newLeft = e.clientX - toolbarOffsetX;
                let newTop = e.clientY - toolbarOffsetY;

                newLeft = Math.max(10, Math.min(window.innerWidth - toolbar.offsetWidth - 10, newLeft));
                newTop = Math.max(80, Math.min(window.innerHeight - toolbar.offsetHeight - 50, newTop));

                toolbar.style.left = newLeft + 'px';
                toolbar.style.top = newTop + 'px';
                toolbar.style.right = 'auto';
            }
        });

        document.addEventListener('mouseup', () => {
            if (isDraggingToolbar) {
                isDraggingToolbar = false;
                toolbar.style.cursor = '';
            }
        });
    }

    // ===== State Variables =====
    let entities = [];
    let currentTool = 'select';
    let drawing = false;
    let startX = 0, startY = 0;
    let tempEntity = null;
    let selectedEntityIndices = [];
    let polylinePoints = [];
    let lineDistanceInput = null;
    let isInputActive = false;
    let pendingLinePoint = null;
    let lineAngle = 0;

    // Dynamic input for length and angle
    let dynamicInputActive = false;
    let dynamicInputValue = '';
    let dynamicInputX = 0, dynamicInputY = 0;
    let lastDrawPoint = null;
    let currentDrawAngle = 0;
    let pendingLength = null;
    let pendingAngle = null;

    // OSNAP settings
    let osnapEnabled = true;
    let osnapEndpoints = true;
    let osnapMidpoints = true;
    let osnapCenters = true;
    let osnapIntersections = true;
    let osnapPerpendicular = false;
    let osnapTangent = false;
    let snapPreviewPoint = null;

    // Ortho mode state
    let orthoMode = false;
    let polarMode = false;
    let polarAngle = 45;
    let gridSnap = true;

    // UI Menu state
    let menuOpen = false;
    let contextMenuOpen = false;
    let contextMenuX = 0, contextMenuY = 0;

    // Author info
    const APP_NAME = "Architect CAD";
    const VERSION = "2.0";

    // Hover state
    let hoveredEntityIndex = -1;
    let hoveredSnapPoint = null;

    // Selection box
    let isSelecting = false;
    let selectionStart = null;
    let selectionEnd = null;
    let selectionBox = null;

    // Continuous Line drawing state
    let continuousLinePoints = [];
    let isDrawingContinuousLine = false;
    let continuousLineStartPoint = null;

    // Dimension tool state
    let dimensionStartPoint = null;
    let isDrawingDimension = false;

    // Arc Length Dimension state
    let arcLengthStartPoint = null;
    let isDrawingArcLength = false;
    let selectedArcEntity = null;
    let arcLengthPreview = null;
    let currentDimensionType = 'linear';

    // Advanced Drawing Tools
    let splinePoints = [];
    let isDrawingSpline = false;
    let ellipseCenter = null;
    let isDrawingEllipse = false;
    let ellipseRadiusX = 0;
    let ellipseRadiusY = 0;
    let hatchPoints = [];
    let isDrawingHatch = false;
    let textInputActive = false;
    let textPosition = null;

    // Measure tool
    let measureStartPoint = null;
    let isMeasuring = false;

    // Store the current drawing points for persistence
    let currentPolylinePoints = [];
    let currentSplinePoints = [];
    let currentHatchPoints = [];

    // Modify Tools State
    let trimReference = null;
    let isTrimming = false;
    let extendBoundary = null;
    let isExtending = false;
    let filletRadius = 10;
    let chamferDistance = 5;
    let offsetDistance = 10;
    let arrayCount = 4;
    let arraySpacing = 20;
    let alignSourcePoints = [];
    let alignTargetPoints = [];

    // Pan and zoom state
    let panX = 0, panY = 0;
    let zoom = 1;
    let isPanning = false;
    let lastPanX = 0, lastPanY = 0;
    let panMode = false;

    // Constants
    let snapGrid = 5;
    let currentUnit = 'cm';

    // Layers
    let layers = [
        { id: '0', name: 'Layer 0', color: '#94a3b8', visible: true, locked: false, transparency: 0 },
        { id: '1', name: 'Walls', color: '#ef4444', visible: true, locked: false, transparency: 0 },
        { id: '2', name: 'Doors', color: '#3b82f6', visible: true, locked: false, transparency: 0 },
        { id: '3', name: 'Windows', color: '#10b981', visible: true, locked: false, transparency: 0 },
        { id: '4', name: 'Furniture', color: '#f59e0b', visible: true, locked: false, transparency: 0 }
    ];
    let currentLayer = '0';

    // Materials
    let materials = [
        { id: '1', name: 'Concrete', color: '#94a3b8', pattern: 'solid', density: 2400, cost: 100 },
        { id: '2', name: 'Brick', color: '#b91c1c', pattern: 'hatch1', density: 1900, cost: 80 },
        { id: '3', name: 'Wood', color: '#92400e', pattern: 'hatch2', density: 600, cost: 150 },
        { id: '4', name: 'Glass', color: '#7dd3fc', pattern: 'solid', density: 2500, cost: 200 },
        { id: '5', name: 'Steel', color: '#475569', pattern: 'solid', density: 7850, cost: 300 }
    ];
    let currentMaterial = '1';

    // Operation states
    let mirrorPoint1 = null;
    let rotateCenter = null;
    let rotateStartAngle = 0;
    let cloneBasePoint = null;
    let isCloning = false;
    let moveBasePoint = null;
    let isMoving = false;
    let copyCount = 1;
    let stretchBasePoint = null;
    let isStretching = false;
    let scaleBasePoint = null;
    let isScaling = false;

    // Undo/Redo system
    let undoStack = [];
    let redoStack = [];
    const MAX_HISTORY = 50;

    // Clipboard
    let clipboard = [];

    // Groups
    let groups = [];
    let nextGroupId = 1;

    // Blocks
    let blocks = {};
    let nextBlockId = 1;

    // Recent files
    let recentFiles = [];

    // Theme
    let isDarkTheme = true;

    // Command history
    let commandHistory = [];
    let commandHistoryIndex = -1;

    // Annotation scale
    let annoScale = 1;

    // Layouts
    let layouts = {
        model: { entities: [], panX: 0, panY: 0, zoom: 1 },
        layout1: { entities: [], panX: 0, panY: 0, zoom: 1 },
        layout2: { entities: [], panX: 0, panY: 0, zoom: 1 }
    };
    let currentLayout = 'model';

    // Auto-save
    let autoSaveInterval = null;

    // ===== Unit Conversion =====
    const unitFactors = {
        'mm': 1,
        'cm': 10,
        'm': 1000,
        'in': 25.4,
        'ft': 304.8
    };

    // ===== CRITICAL: drawAllEntities Function =====
    function drawAllEntities() {
        if (!ctx || !canvas) return;

        // Reset to identity so the clear always wipes the full raw buffer,
        // regardless of any transform left over from a previous frame.
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // FIX: apply the pan/zoom camera transform once, here, before anything
        // world-space gets drawn. Every draw* function below (grid, entities,
        // dimensions, previews) already draws using raw world coordinates and
        // divides line widths/offsets by `zoom` on the assumption that this
        // transform is active — that assumption was never satisfied before,
        // which is why panning/zooming moved the crosshair and grid but left
        // drawn geometry and dimensions stuck in place.
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);

        // Draw grid
        drawGrid(ctx);

        // Draw all saved entities
        entities.forEach((ent, index) => {
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer || !layer.visible) return;

            ctx.save();

            // Apply layer transparency
            if (layer.transparency > 0) {
                ctx.globalAlpha = 1 - (layer.transparency / 100);
            }
            if (ent.transparency > 0) {
                ctx.globalAlpha = 1 - (ent.transparency / 100);
            }

            // Apply linetype
            if (ent.linetype === 'dashed') {
                ctx.setLineDash([10 / zoom, 5 / zoom]);
            } else if (ent.linetype === 'dotted') {
                ctx.setLineDash([2 / zoom, 4 / zoom]);
            } else if (ent.linetype === 'dashdot') {
                ctx.setLineDash([10 / zoom, 3 / zoom, 2 / zoom, 3 / zoom]);
            } else {
                ctx.setLineDash([]);
            }

            // Set selection highlight
            const isSelected = selectedEntityIndices.includes(index);
            const isHovered = (index === hoveredEntityIndex);

            if (isSelected) {
                ctx.shadowColor = '#4f46e5';
                ctx.shadowBlur = 15 / zoom;
            } else if (isHovered) {
                ctx.shadowColor = '#fbbf24';
                ctx.shadowBlur = 10 / zoom;
            }

            // Draw based on entity type
            switch(ent.type) {
                case 'line':
                    drawLine(ctx, ent);
                    break;
                case 'polyline':
                    drawPolyline(ctx, ent);
                    break;
                case 'spline':
                    drawSpline(ctx, ent);
                    break;
                case 'circle':
                    drawCircle(ctx, ent);
                    break;
                case 'ellipse':
                    drawEllipse(ctx, ent);
                    break;
                case 'rect':
                    drawRect(ctx, ent);
                    break;
                case 'arc':
                    drawArc(ctx, ent);
                    break;
                case 'text':
                    drawText(ctx, ent);
                    break;
                case 'dimension':
                    drawDimension(ctx, ent);
                    break;
                case 'arc-length-dimension':
                    drawArcLengthDimension(ctx, ent);
                    break;
                case 'hatch':
                    drawHatch(ctx, ent);
                    break;
                case 'measure':
                    drawMeasureLine(ctx, ent);
                    break;
            }

            ctx.restore();
        });

        // Draw selection box
        drawSelectionBox(ctx);

        // Draw temp entity (preview)
        if (tempEntity) {
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.setLineDash([5 / zoom, 5 / zoom]);

            switch(tempEntity.type) {
                case 'rect':
                    drawRect(ctx, tempEntity);
                    break;
                case 'circle':
                    drawCircle(ctx, tempEntity);
                    break;
                case 'arc':
                    drawArc(ctx, tempEntity);
                    break;
                case 'ellipse':
                    drawEllipse(ctx, tempEntity);
                    break;
                case 'line':
                case 'measure':
                    drawLine(ctx, tempEntity);
                    break;
            }
            ctx.restore();
        }

        // Draw tool-specific previews
        drawContinuousLinePreview(ctx);
        drawPolylinePreview(ctx);
        drawSplinePreview(ctx);
        drawDimensionPreview(ctx);
        drawArcLengthPreview(ctx);
        drawClonePreview(ctx);
        drawMovePreview(ctx);
        drawMirrorPreview(ctx);
        drawRotatePreview(ctx);
        drawStretchPreview(ctx);

        // Done drawing world-space content; return the context to identity
        // (screen space) before any DOM/UI code below runs.
        ctx.restore();

        // Update UI
        updateEndpointMarkers();
        const countDisplay = document.getElementById('entity-count');
        if (countDisplay) countDisplay.textContent = entities.length;

        // Optional hook for additive extensions (e.g. the 3D workspace) that
        // want to stay in sync with the 2D drawing without touching this file.
        if (window.WebCADExtension && typeof window.WebCADExtension.onRedraw === 'function') {
            try { window.WebCADExtension.onRedraw(); } catch (e) { /* extension error must never break the 2D CAD */ }
        }
    }

    // ===== Entity Drawing Functions =====
    function drawLine(ctx, ent) {
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1) / zoom;
        ctx.beginPath();
        ctx.moveTo(ent.x, ent.y);
        ctx.lineTo(ent.x2, ent.y2);
        ctx.stroke();
    }

    function drawPolyline(ctx, ent) {
        if (!ent.points || ent.points.length < 2) return;
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1) / zoom;
        ctx.beginPath();
        ctx.moveTo(ent.points[0].x, ent.points[0].y);
        for (let i = 1; i < ent.points.length; i++) {
            ctx.lineTo(ent.points[i].x, ent.points[i].y);
        }
        if (ent.closed) ctx.closePath();
        ctx.stroke();
    }

    function drawSpline(ctx, ent) {
        if (!ent.points || ent.points.length < 2) return;
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1.8) / zoom;
        ctx.beginPath();
        ctx.moveTo(ent.points[0].x, ent.points[0].y);
        for (let i = 1; i < ent.points.length; i++) {
            ctx.lineTo(ent.points[i].x, ent.points[i].y);
        }
        ctx.stroke();
    }

    function drawCircle(ctx, ent) {
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1.5) / zoom;
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, ent.radius, 0, 2 * Math.PI);
        ctx.stroke();
    }

    function drawEllipse(ctx, ent) {
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1.5) / zoom;
        ctx.beginPath();
        const rx = ent.radiusX || ent.rx || 0;
        const ry = ent.radiusY || ent.ry || 0;
        const steps = 50;
        for (let i = 0; i <= steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const x = ent.x + rx * Math.cos(angle);
            const y = ent.y + ry * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
    }

    function drawRect(ctx, ent) {
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1.5) / zoom;
        ctx.strokeRect(ent.x, ent.y, ent.w, ent.h);
    }

    function drawArc(ctx, ent) {
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = (ent.lineweight || 1.5) / zoom;
        ctx.beginPath();
        ctx.arc(ent.x, ent.y, ent.radius, ent.startAngle || 0, ent.endAngle || Math.PI);
        ctx.stroke();
    }

    function drawText(ctx, ent) {
        ctx.fillStyle = ent.color || '#ffffff';
        ctx.font = `${(ent.fontSize || 12) / zoom}px "JetBrains Mono", monospace`;
        ctx.fillText(ent.text, ent.x, ent.y);
    }

    function drawHatch(ctx, ent) {
        if (!ent.points || ent.points.length < 3) return;
        ctx.beginPath();
        ctx.moveTo(ent.points[0].x, ent.points[0].y);
        for (let i = 1; i < ent.points.length; i++) {
            ctx.lineTo(ent.points[i].x, ent.points[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = ent.color || '#94a3b8';
        ctx.globalAlpha *= 0.55;
        ctx.fill();
        ctx.globalAlpha /= 0.55;
        ctx.strokeStyle = ent.color || '#94a3b8';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
    }

    function drawMeasureLine(ctx, ent) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        ctx.beginPath();
        ctx.moveTo(ent.x1, ent.y1);
        ctx.lineTo(ent.x2, ent.y2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw X marks at endpoints
        const size = 6 / zoom;
        ctx.strokeStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(ent.x1 - size, ent.y1 - size);
        ctx.lineTo(ent.x1 + size, ent.y1 + size);
        ctx.moveTo(ent.x1 + size, ent.y1 - size);
        ctx.lineTo(ent.x1 - size, ent.y1 + size);
        ctx.moveTo(ent.x2 - size, ent.y2 - size);
        ctx.lineTo(ent.x2 + size, ent.y2 + size);
        ctx.moveTo(ent.x2 + size, ent.y2 - size);
        ctx.lineTo(ent.x2 - size, ent.y2 + size);
        ctx.stroke();
    }

    // ===== Mode Display Update =====
    function updateModeDisplay() {
        const modeDisplay = document.getElementById('mode-display');
        if (modeDisplay) {
            const modeNames = {
                'select': 'SELECT',
                'continuous-line': 'LINE',
                'polyline': 'POLYLINE',
                'spline': 'SPLINE',
                'arc': 'ARC',
                'circle': 'CIRCLE',
                'ellipse': 'ELLIPSE',
                'rect': 'RECTANGLE',
                'hatch': 'HATCH',
                'text': 'TEXT',
                'dimension': 'DIMENSION',
                'arc-length-dimension': 'ARC DIM',
                'mirror': 'MIRROR',
                'rotate': 'ROTATE',
                'move': 'MOVE',
                'clone': 'COPY',
                'scale': 'SCALE',
                'stretch': 'STRETCH',
                'trim': 'TRIM',
                'extend': 'EXTEND',
                'fillet': 'FILLET',
                'chamfer': 'CHAMFER',
                'offset': 'OFFSET',
                'array': 'ARRAY',
                'break': 'BREAK',
                'join': 'JOIN',
                'pan': 'PAN',
                'measure': 'MEASURE',
                'group': 'GROUP',
                'ungroup': 'UNGROUP'
            };
            modeDisplay.textContent = modeNames[currentTool] || currentTool.toUpperCase();
        }

        const orthoStatus = document.getElementById('status-ortho');
        const polarStatus = document.getElementById('status-polar');
        const osnapStatus = document.getElementById('status-osnap');

        if (orthoStatus) orthoStatus.style.display = orthoMode ? 'flex' : 'none';
        if (polarStatus) polarStatus.style.display = polarMode ? 'flex' : 'none';
        if (osnapStatus) osnapStatus.style.display = osnapEnabled ? 'flex' : 'none';
    }

    // ===== UNDO/REDO SYSTEM =====
    function saveState() {
        const state = JSON.stringify({
            entities: entities,
            layers: layers,
            materials: materials,
            currentLayer: currentLayer,
            currentMaterial: currentMaterial,
            unit: currentUnit,
            snap: snapGrid
        });
        /**
 * Synchronizes newly drawn CAD shapes from ArchitectSAF directly to SafwatExcel.
 * Extracts the geometric names and precise dimension properties.
 */
function syncShapeToSafwatExcel(entity) {
    // 1. Establish cross-window communication if SafwatExcel is open as a parent frame or window reference
    const excelWindow = window.opener || window.parent;
    if (!excelWindow) return;

    // 2. Define the exact measurements based on the entity type
    let shapeName = (entity.type || 'Unknown').toUpperCase();
    let dimensionDetails = '';

    // Calculate dimensions based on unit factors established in ArchitectSAF
    const factor = unitFactors[currentUnit] || 10; 

    switch(entity.type) {
        case 'line':
            const dx = entity.x2 - entity.x;
            const dy = entity.y2 - entity.y;
            const distance = Math.hypot(dx, dy);
            dimensionDetails = `Length: ${(distance / factor).toFixed(2)} ${currentUnit}`;
            break;
            
        case 'circle':
            dimensionDetails = `Radius: ${(entity.radius / factor).toFixed(2)} ${currentUnit}, Dia: ${((entity.radius * 2) / factor).toFixed(2)} ${currentUnit}`;
            break;
            
        case 'rect':
            dimensionDetails = `Width: ${(entity.w / factor).toFixed(2)}, Height: ${(entity.h / factor).toFixed(2)} ${currentUnit}`;
            break;
            
        case 'ellipse':
            const rx = entity.radiusX || entity.rx || 0;
            const ry = entity.radiusY || entity.ry || 0;
            dimensionDetails = `RadiusX: ${(rx / factor).toFixed(2)}, RadiusY: ${(ry / factor).toFixed(2)} ${currentUnit}`;
            break;
            
        case 'polyline':
        case 'spline':
            if (entity.points) {
                dimensionDetails = `Points: ${entity.points.length}`;
            }
            break;
            
        default:
            dimensionDetails = `Coords X: ${(entity.x / factor).toFixed(2)}, Y: ${(entity.y / factor).toFixed(2)}`;
            break;
    }

    // 3. Fallback postMessage approach maps cleanly through cross-domain environments
    excelWindow.postMessage({
        type: 'CAD_SHAPE_ADDED',
        data: { name: shapeName, measurements: dimensionDetails, layer: entity.layer }
    }, '*');
}
        undoStack.push(state);
        if (undoStack.length > MAX_HISTORY) undoStack.shift();
        redoStack = [];
        updateHistoryButtons();

    }

    function undo() {
        if (undoStack.length === 0) return;

        const currentState = JSON.stringify({
            entities: entities,
            layers: layers,
            materials: materials,
            currentLayer: currentLayer,
            currentMaterial: currentMaterial,
            unit: currentUnit,
            snap: snapGrid
        });
        redoStack.push(currentState);

        const state = JSON.parse(undoStack.pop());
        entities = state.entities || [];
        layers = state.layers || layers;
        materials = state.materials || materials;
        currentLayer = state.currentLayer || '0';
        currentMaterial = state.currentMaterial || '1';
        currentUnit = state.unit || 'cm';
        snapGrid = state.snap || 5;

        drawAllEntities();
        updateHistoryButtons();
        showSaveIndicator('Undo');
    }

    function redo() {
        if (redoStack.length === 0) return;

        const currentState = JSON.stringify({
            entities: entities,
            layers: layers,
            materials: materials,
            currentLayer: currentLayer,
            currentMaterial: currentMaterial,
            unit: currentUnit,
            snap: snapGrid
        });
        undoStack.push(currentState);

        const state = JSON.parse(redoStack.pop());
        entities = state.entities || [];
        layers = state.layers || layers;
        materials = state.materials || materials;
        currentLayer = state.currentLayer || '0';
        currentMaterial = state.currentMaterial || '1';
        currentUnit = state.unit || 'cm';
        snapGrid = state.snap || 5;

        drawAllEntities();
        updateHistoryButtons();
        showSaveIndicator('Redo');
    }

    function updateHistoryButtons() {
        const undoBtn = document.getElementById('btn-undo');
        const redoBtn = document.getElementById('btn-redo');
        if (undoBtn) undoBtn.disabled = undoStack.length === 0;
        if (redoBtn) redoBtn.disabled = redoStack.length === 0;
    }

    // ===== CLIPBOARD =====
    function copySelected() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Nothing selected to copy');
            return;
        }

        clipboard = selectedEntityIndices.map(idx => JSON.parse(JSON.stringify(entities[idx])));
        showSaveIndicator(`${clipboard.length} item(s) copied`);
    }

    function cutSelected() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Nothing selected to cut');
            return;
        }

        saveState();
        clipboard = selectedEntityIndices.map(idx => JSON.parse(JSON.stringify(entities[idx])));
        selectedEntityIndices.sort((a, b) => b - a).forEach(idx => entities.splice(idx, 1));
        selectedEntityIndices = [];
        drawAllEntities();
        showSaveIndicator(`${clipboard.length} item(s) cut`);
    }

    function pasteClipboard() {
        if (clipboard.length === 0) {
            showSaveIndicator('Clipboard is empty');
            return;
        }

        saveState();
        const offset = 20;
        const newEntities = clipboard.map(ent => {
            const cloned = JSON.parse(JSON.stringify(ent));
            if (cloned.type === 'line') {
                cloned.x += offset; cloned.y += offset;
                cloned.x2 += offset; cloned.y2 += offset;
            } else if (cloned.type === 'polyline' || cloned.type === 'spline') {
                cloned.points = cloned.points.map(p => ({ x: p.x + offset, y: p.y + offset }));
                if (cloned.controlPoints) {
                    cloned.controlPoints = cloned.controlPoints.map(p => ({ x: p.x + offset, y: p.y + offset }));
                }
            } else if (cloned.type === 'rect') {
                cloned.x += offset; cloned.y += offset;
            } else if (cloned.type === 'circle' || cloned.type === 'ellipse') {
                cloned.x += offset; cloned.y += offset;
            } else if (cloned.type === 'text') {
                cloned.x += offset; cloned.y += offset;
            }
            return cloned;
        });

        entities.push(...newEntities);
        selectedEntityIndices = newEntities.map((_, i) => entities.length - newEntities.length + i);
        drawAllEntities();
        showSaveIndicator(`${newEntities.length} item(s) pasted`);
    }

    // ===== GROUPS =====
    function groupSelected() {
        if (selectedEntityIndices.length < 2) {
            showSaveIndicator('Select at least 2 entities to group');
            return;
        }

        saveState();
        const groupId = nextGroupId++;
        const groupEntities = selectedEntityIndices.map(idx => entities[idx]);
        groups.push({
            id: groupId,
            entities: groupEntities,
            indices: [...selectedEntityIndices]
        });

        selectedEntityIndices.forEach(idx => {
            entities[idx].groupId = groupId;
        });

        showSaveIndicator(`Group ${groupId} created`);
        drawAllEntities();
    }

    function ungroupSelected() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select a group to ungroup');
            return;
        }

        saveState();
        const groupIds = new Set();
        selectedEntityIndices.forEach(idx => {
            if (entities[idx].groupId) groupIds.add(entities[idx].groupId);
        });

        groupIds.forEach(gid => {
            const group = groups.find(g => g.id === gid);
            if (group) {
                group.entities.forEach(ent => delete ent.groupId);
                groups = groups.filter(g => g.id !== gid);
            }
        });

        showSaveIndicator('Ungrouped');
        drawAllEntities();
    }

    // ===== BLOCKS =====
    function createBlock() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities to create a block');
            return;
        }

        const name = prompt('Enter block name:');
        if (!name) return;

        const blockEntities = selectedEntityIndices.map(idx => JSON.parse(JSON.stringify(entities[idx])));
        blocks[name] = {
            id: nextBlockId++,
            name: name,
            entities: blockEntities,
            basePoint: { x: 0, y: 0 }
        };

        showSaveIndicator(`Block "${name}" created`);
    }

    // ===== MEASURE TOOL =====
    function startMeasureTool(world) {
        measureStartPoint = { x: world.x, y: world.y };
        isMeasuring = true;
        showSaveIndicator('Click second point to measure distance');
    }

    function updateMeasurePreview(world) {
        if (!isMeasuring || !measureStartPoint) return;

        const dx = world.x - measureStartPoint.x;
        const dy = world.y - measureStartPoint.y;
        const distance = Math.hypot(dx, dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const factor = unitFactors[currentUnit] || 10;
        const displayDist = (distance / factor).toFixed(2);

        const midX = (measureStartPoint.x + world.x) / 2;
        const midY = (measureStartPoint.y + world.y) / 2;
        const screen = worldToScreen(midX, midY);

        measureResult.style.display = 'block';
        measureResult.style.left = (screen.x + 10) + 'px';
        measureResult.style.top = (screen.y - 30) + 'px';
        measureResult.innerHTML = `
            <div>Distance: ${displayDist} ${currentUnit}</div>
            <div class="text-[10px] opacity-75">Angle: ${angle.toFixed(1)}° | ΔX: ${(dx/factor).toFixed(2)} | ΔY: ${(dy/factor).toFixed(2)}</div>
        `;

        tempEntity = { type: 'measure', x1: measureStartPoint.x, y1: measureStartPoint.y, x2: world.x, y2: world.y };
        drawAllEntities();
    }

    function finishMeasureTool(world) {
        if (!isMeasuring || !measureStartPoint) return;

        const dx = world.x - measureStartPoint.x;
        const dy = world.y - measureStartPoint.y;
        const distance = Math.hypot(dx, dy);
        const factor = unitFactors[currentUnit] || 10;
        const displayDist = (distance / factor).toFixed(2);

        showSaveIndicator(`Measured: ${displayDist} ${currentUnit}`);

        measureStartPoint = null;
        isMeasuring = false;
        tempEntity = null;
        measureResult.style.display = 'none';
        setTool('select');
    }

    // ===== THEME TOGGLE =====
    function toggleTheme() {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('theme-light', !isDarkTheme);
        const themeBtn = document.getElementById('btn-theme');
        if (themeBtn) {
            themeBtn.innerHTML = isDarkTheme ? '<i class="fas fa-moon text-slate-400"></i>' : '<i class="fas fa-sun text-yellow-400"></i>';
        }
        drawAllEntities();
        showSaveIndicator(isDarkTheme ? 'Dark theme' : 'Light theme');
    }

    // ===== COORDINATE INPUT =====
    function showCoordInput(callback) {
        const dialog = document.getElementById('coord-dialog');
        const xInput = document.getElementById('coord-x');
        const yInput = document.getElementById('coord-y');

        dialog.style.display = 'block';
        xInput.value = '';
        yInput.value = '';
        xInput.focus();

        function handleOK() {
            const x = parseFloat(xInput.value);
            const y = parseFloat(yInput.value);
            if (!isNaN(x) && !isNaN(y)) {
                dialog.style.display = 'none';
                callback({ x, y });
            }
        }

        function handleCancel() {
            dialog.style.display = 'none';
        }

        document.getElementById('coord-ok').onclick = handleOK;
        document.getElementById('coord-cancel').onclick = handleCancel;

        yInput.onkeydown = (e) => {
            if (e.key === 'Enter') handleOK();
            if (e.key === 'Escape') handleCancel();
        };
    }

    // ===== RECENT FILES =====
    function addRecentFile(name) {
        recentFiles = recentFiles.filter(f => f !== name);
        recentFiles.unshift(name);
        if (recentFiles.length > 5) recentFiles.pop();
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
    }

    function loadRecentFiles() {
        try {
            const saved = localStorage.getItem('recentFiles');
            if (saved) recentFiles = JSON.parse(saved);
        } catch(e) {}
    }

    function showRecentFiles() {
        const modal = document.getElementById('recent-files-modal');
        const list = document.getElementById('recent-files-list');

        if (recentFiles.length === 0) {
            list.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No recent files</p>';
        } else {
            list.innerHTML = recentFiles.map(file => `
                <div class="recent-file-item" data-file="${file}">
                    <i class="fas fa-file-code text-indigo-400"></i>
                    <span>${file}</span>
                </div>
            `).join('');

            list.querySelectorAll('.recent-file-item').forEach(item => {
                item.addEventListener('click', () => {
                    showSaveIndicator(`Opening ${item.dataset.file}...`);
                    modal.classList.remove('active');
                    setTimeout(() => modal.style.display = 'none', 300);
                });
            });
        }

        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
    }

    // ===== COMMAND HISTORY =====
    function addCommandHistory(command, success = true) {
        commandHistory.unshift({ command, success, time: new Date() });
        if (commandHistory.length > 20) commandHistory.pop();
        updateCommandHistoryDisplay();
    }

    function updateCommandHistoryDisplay() {
        const historyEl = document.getElementById('command-history');
        historyEl.innerHTML = commandHistory.map(item => `
            <div class="command-history-item ${item.success ? 'success' : 'error'}">
                <span class="text-slate-500">[${item.time.toLocaleTimeString()}]</span> ${item.command}
            </div>
        `).join('');
    }

    // ===== AUTO SAVE =====
    function startAutoSave() {
        autoSaveInterval = setInterval(() => {
            saveToStorage();
            const indicator = document.getElementById('auto-save-indicator');
            if (indicator) {
                indicator.style.animation = 'none';
                indicator.offsetHeight;
                indicator.style.animation = 'autoSavePulse 2s ease';
            }
        }, 30000);
    }

    // ===== OSNAP Functions =====
    function findSnapPoint(x, y) {
        if (!osnapEnabled) return null;

        let snapPoint = null;
        let minDist = 20 / zoom;

        entities.forEach((ent) => {
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible || layer.locked) return;

            if (osnapEndpoints) {
                if (ent.type === 'line') {
                    checkPoint(ent.x, ent.y, x, y);
                    checkPoint(ent.x2, ent.y2, x, y);
                } else if (ent.type === 'polyline') {
                    ent.points.forEach(p => checkPoint(p.x, p.y, x, y));
                } else if (ent.type === 'rect') {
                    checkPoint(ent.x, ent.y, x, y);
                    checkPoint(ent.x + ent.w, ent.y, x, y);
                    checkPoint(ent.x + ent.w, ent.y + ent.h, x, y);
                    checkPoint(ent.x, ent.y + ent.h, x, y);
                } else if (ent.type === 'circle') {
                    checkPoint(ent.x + ent.radius, ent.y, x, y);
                    checkPoint(ent.x - ent.radius, ent.y, x, y);
                    checkPoint(ent.x, ent.y + ent.radius, x, y);
                    checkPoint(ent.x, ent.y - ent.radius, x, y);
                } else if (ent.type === 'arc') {
                    checkPoint(ent.x + ent.radius, ent.y, x, y);
                    checkPoint(ent.x - ent.radius, ent.y, x, y);
                }
            }

            if (osnapMidpoints) {
                if (ent.type === 'line') {
                    const midX = (ent.x + ent.x2) / 2;
                    const midY = (ent.y + ent.y2) / 2;
                    checkPoint(midX, midY, x, y);
                } else if (ent.type === 'polyline' && ent.points.length >= 2) {
                    for (let i = 0; i < ent.points.length - 1; i++) {
                        const midX = (ent.points[i].x + ent.points[i+1].x) / 2;
                        const midY = (ent.points[i].y + ent.points[i+1].y) / 2;
                        checkPoint(midX, midY, x, y);
                    }
                } else if (ent.type === 'rect') {
                    checkPoint(ent.x + ent.w/2, ent.y + ent.h/2, x, y);
                }
            }

            if (osnapCenters) {
                if (ent.type === 'circle' || ent.type === 'arc') {
                    checkPoint(ent.x, ent.y, x, y);
                }
            }

            if (osnapIntersections) {
                if (ent.type === 'line') {
                    entities.forEach((ent2) => {
                        if (ent2.type === 'line' && ent2 !== ent) {
                            const intersection = lineIntersection(
                                ent.x, ent.y, ent.x2, ent.y2,
                                ent2.x, ent2.y, ent2.x2, ent2.y2
                            );
                            if (intersection) {
                                checkPoint(intersection.x, intersection.y, x, y);
                            }
                        }
                    });
                }
            }

            if (osnapPerpendicular) {
                if (ent.type === 'line') {
                    const perpPoint = perpendicularPoint(x, y, ent.x, ent.y, ent.x2, ent.y2);
                    if (perpPoint) checkPoint(perpPoint.x, perpPoint.y, x, y);
                }
            }

            function checkPoint(px, py, cx, cy) {
                const dist = Math.hypot(px - cx, py - cy);
                if (dist < minDist) {
                    minDist = dist;
                    snapPoint = { x: px, y: py, type: 'snap' };
                }
            }
        });

        return snapPoint;
    }

    function perpendicularPoint(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.hypot(dx, dy);
        if (len === 0) return null;

        const u = ((px - x1) * dx + (py - y1) * dy) / (len * len);
        if (u >= 0 && u <= 1) {
            return {
                x: x1 + u * dx,
                y: y1 + u * dy
            };
        }
        return null;
    }

    function lineIntersection(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denominator = ((x2 - x1) * (y4 - y3)) - ((y2 - y1) * (x4 - x3));
        if (Math.abs(denominator) < 1e-6) return null;

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denominator;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denominator;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }
        return null;
    }

    function applyOrthoConstraint(start, end) {
        if (!orthoMode) return { x: end.x, y: end.y };

        const dx = Math.abs(end.x - start.x);
        const dy = Math.abs(end.y - start.y);

        if (dx > dy) {
            return { x: end.x, y: start.y };
        } else {
            return { x: start.x, y: end.y };
        }
    }

    function applyPolarConstraint(start, end, angleStep) {
        if (!polarMode) return end;

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        const roundedAngle = Math.round(angle / angleStep) * angleStep;
        const radAngle = roundedAngle * Math.PI / 180;
        const distance = Math.hypot(dx, dy);

        return {
            x: start.x + Math.cos(radAngle) * distance,
            y: start.y + Math.sin(radAngle) * distance
        };
    }

    // ===== Initialization =====
    function resizeCanvas() {
        const container = document.getElementById('cad2d-canvas-container');
        // FIX: size the drawing buffer in real device pixels (using
        // devicePixelRatio) instead of raw CSS pixels, so the canvas stays
        // sharp on high-DPI/retina screens. canvas.style is still 100% of the
        // container via CSS, so this is purely a buffer-resolution change;
        // getMouseCoord()/worldToScreen() already convert through
        // (canvas.width / rect.width), so no other code needs to change.
        const dpr = window.devicePixelRatio || 1;
        let cssWidth, cssHeight;
        if (container) {
            cssWidth = container.clientWidth;
            cssHeight = container.clientHeight;
        } else {
            cssWidth = window.innerWidth - 280;
            cssHeight = window.innerHeight - 60;
        }
        canvas.width = Math.max(1, Math.round(cssWidth * dpr));
        canvas.height = Math.max(1, Math.round(cssHeight * dpr));
        drawAllEntities();
        updateEndpointMarkers();
    }
    window.addEventListener('resize', resizeCanvas);

    // FIX: the canvas container can also change size without a window
    // resize event firing (side panels, orientation changes, the layout
    // shifting on some mobile browsers when the address bar hides/shows).
    // Watch the container itself so the canvas buffer never goes stale,
    // which is what made the CAD feel "unresponsive" on those layout changes.
    if (window.ResizeObserver) {
        const cad2dResizeObserver = new ResizeObserver(() => resizeCanvas());
        const resizeObserverTarget = document.getElementById('cad2d-canvas-container');
        if (resizeObserverTarget) cad2dResizeObserver.observe(resizeObserverTarget);
    }

    // ===== Coordinate Conversion =====
    function screenToWorld(screenX, screenY) {
        return {
            x: (screenX - panX) / zoom,
            y: (screenY - panY) / zoom
        };
    }

    function worldToScreen(worldX, worldY) {
        return {
            x: worldX * zoom + panX,
            y: worldY * zoom + panY
        };
    }

    function getMouseCoord(e, snapToGrid = true, snapToEndpoint = false) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let screenX = (e.clientX - rect.left) * scaleX;
        let screenY = (e.clientY - rect.top) * scaleY;

        let world = screenToWorld(screenX, screenY);
        let x = world.x;
        let y = world.y;

        if (osnapEnabled && snapToEndpoint && !e.shiftKey && !panMode && !isPanning) {
            const snapPoint = findSnapPoint(x, y);
            if (snapPoint) {
                snapPreviewPoint = snapPoint;

                const snapScreen = worldToScreen(snapPoint.x, snapPoint.y);
                const snapScreenX = (snapScreen.x / scaleX) + rect.left;
                const snapScreenY = (snapScreen.y / scaleY) + rect.top;
                snapIndicator.style.display = 'block';
                snapIndicator.style.left = snapScreenX + 'px';
                snapIndicator.style.top = snapScreenY + 'px';

                return snapPoint;
            }
        }
        snapPreviewPoint = null;
        snapIndicator.style.display = 'none';

        if (snapToGrid && gridSnap && !e.shiftKey && !panMode && !isPanning) {
            x = Math.round(x / snapGrid) * snapGrid;
            y = Math.round(y / snapGrid) * snapGrid;
        }
        return { x, y };
    }

    // ===== Update Functions =====
    function updateLivePoint(e) {
        if (!e) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const world = getMouseCoord(e, true, true);
        let worldX = world.x;
        let worldY = world.y;

        const screen = worldToScreen(worldX, worldY);
        const screenX = (screen.x / scaleX) + rect.left;
        const screenY = (screen.y / scaleY) + rect.top;

        livePoint.style.left = screenX + 'px';
        livePoint.style.top = screenY + 'px';
        livePoint.style.display = 'block';

        if (orthoMode && (drawing || isDrawingContinuousLine || isDrawingSpline || isDrawingPolyline)) {
            orthoH.style.display = 'block';
            orthoV.style.display = 'block';
            orthoH.style.left = '0';
            orthoH.style.top = screenY + 'px';
            orthoH.style.width = window.innerWidth + 'px';
            orthoV.style.left = screenX + 'px';
            orthoV.style.top = '0';
            orthoV.style.height = window.innerHeight + 'px';
        } else {
            orthoH.style.display = 'none';
            orthoV.style.display = 'none';
        }

        const coordDisplay = document.getElementById('coord-display');
        if (coordDisplay) coordDisplay.innerText = `${worldX.toFixed(2)} , ${worldY.toFixed(2)}`;

        const panDisplay = document.getElementById('pan-display');
        if (panDisplay) panDisplay.innerText = `X:${Math.round(panX)} Y:${Math.round(panY)} Zoom:${zoom.toFixed(2)}x`;

        const unitDisplay = document.getElementById('unit-display');
        if (unitDisplay) unitDisplay.innerText = currentUnit;

        const snapSizeDisplay = document.getElementById('snap-size');
        if (snapSizeDisplay) snapSizeDisplay.innerText = snapGrid;

        if (hoveredEntityIndex >= 0) {
            const ent = entities[hoveredEntityIndex];
            const layer = layers.find(l => l.id === ent.layer);
            quickProps.style.display = 'block';
            quickProps.style.left = (e.clientX + 15) + 'px';
            quickProps.style.top = (e.clientY + 15) + 'px';
            quickProps.innerHTML = `
                <div class="text-indigo-400 font-bold text-[10px] uppercase">${ent.type}</div>
                <div class="text-slate-300">Layer: ${layer?.name || '0'}</div>
                ${ent.lineweight ? `<div class="text-slate-400">Weight: ${ent.lineweight}mm</div>` : ''}
            `;
        } else {
            quickProps.style.display = 'none';
        }

        const btn = e.target.closest('.mode-btn');
        if (btn && btn.title) {
            tooltip.style.display = 'block';
            tooltip.style.left = (e.clientX + 10) + 'px';
            tooltip.style.top = (e.clientY - 30) + 'px';
            tooltip.textContent = btn.title;
        } else if (!e.target.closest('.menu-item')) {
            tooltip.style.display = 'none';
        }
    }

    function updateEndpointMarkers() {
        endpointContainer.innerHTML = '';
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        entities.forEach((ent) => {
            if (!layers.find(l => l.id === ent.layer)?.visible) return;

            const addMarker = (x, y) => {
                const screen = worldToScreen(x, y);
                const screenX = (screen.x / scaleX) + rect.left;
                const screenY = (screen.y / scaleY) + rect.top;

                if (screenX > -20 && screenX < rect.width + 20 && screenY > -20 && screenY < rect.height + 20) {
                    const marker = document.createElement('div');
                    marker.className = 'endpoint-marker';
                    marker.style.left = screenX + 'px';
                    marker.style.top = screenY + 'px';
                    marker.style.display = 'block';
                    endpointContainer.appendChild(marker);
                }
            };

            if (ent.type === 'line') {
                addMarker(ent.x, ent.y);
                addMarker(ent.x2, ent.y2);
            } else if (ent.type === 'polyline') {
                ent.points.forEach(p => addMarker(p.x, p.y));
            } else if (ent.type === 'rect') {
                addMarker(ent.x, ent.y);
                addMarker(ent.x + ent.w, ent.y);
                addMarker(ent.x + ent.w, ent.y + ent.h);
                addMarker(ent.x, ent.y + ent.h);
            } else if (ent.type === 'circle') {
                addMarker(ent.x, ent.y);
                addMarker(ent.x + ent.radius, ent.y);
                addMarker(ent.x - ent.radius, ent.y);
                addMarker(ent.x, ent.y + ent.radius);
                addMarker(ent.x, ent.y - ent.radius);
            } else if (ent.type === 'arc') {
                addMarker(ent.x, ent.y);
            } else if (ent.type === 'dimension') {
                addMarker(ent.x1, ent.y1);
                addMarker(ent.x2, ent.y2);
                addMarker(ent.textX, ent.textY);
            } else if (ent.type === 'arc-length-dimension') {
                addMarker(ent.startPoint.x, ent.startPoint.y);
                addMarker(ent.endPoint.x, ent.endPoint.y);
                addMarker(ent.textX, ent.textY);
            }
        });
    }

    // ===== DYNAMIC INPUT =====
    function createDynamicInput() {
        if (lineDistanceInput) return;

        const box = document.createElement('div');
        box.id = 'dynamic-input-box';
        box.className = 'dynamic-input-box';
        box.style.display = 'none';

        const label = document.createElement('div');
        label.style.color = '#fcd34d';
        label.style.fontSize = '10px';
        label.style.marginBottom = '4px';
        label.style.textTransform = 'uppercase';
        label.style.letterSpacing = '1px';
        label.textContent = 'SPECIFY LENGTH';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Enter length (or <angle)';

        const angleHint = document.createElement('div');
        angleHint.style.color = '#94a3b8';
        angleHint.style.fontSize = '9px';
        angleHint.style.marginTop = '4px';
        angleHint.innerHTML = 'Tip: &lt;45 for angle, or 100&lt;45 for length@angle';

        box.appendChild(label);
        box.appendChild(input);
        box.appendChild(angleHint);
        document.body.appendChild(box);

        lineDistanceInput = box;
        const inputField = lineDistanceInput.querySelector('input');

        inputField.addEventListener('input', () => {
            updateDynamicPreview();
        });

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyDynamicInput();
                hideDynamicInput();
            }
            if (e.key === 'Escape') {
                hideDynamicInput();
                cancelCurrentDrawing();
            }
        });

        const angleIndicator = document.createElement('div');
        angleIndicator.id = 'angle-indicator';
        angleIndicator.style.position = 'absolute';
        angleIndicator.style.right = '-80px';
        angleIndicator.style.top = '50%';
        angleIndicator.style.transform = 'translateY(-50%)';
        angleIndicator.style.background = '#1e293b';
        angleIndicator.style.border = '1px solid #f97316';
        angleIndicator.style.borderRadius = '4px';
        angleIndicator.style.padding = '4px 8px';
        angleIndicator.style.fontSize = '11px';
        angleIndicator.style.color = '#fcd34d';
        angleIndicator.style.fontFamily = 'monospace';
        angleIndicator.style.display = 'none';
        box.appendChild(angleIndicator);
    }

    function showDynamicInput(x, y, startPoint, currentAngle = null) {
        createDynamicInput();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const screenPoint = worldToScreen(x, y);
        const screenX = (screenPoint.x / scaleX) + rect.left;
        const screenY = (screenPoint.y / scaleY) + rect.top;

        lineDistanceInput.style.left = (screenX + 20) + 'px';
        lineDistanceInput.style.top = (screenY - 40) + 'px';
        lineDistanceInput.style.display = 'block';

        const input = lineDistanceInput.querySelector('input');
        input.value = '';
        input.focus();

        lastDrawPoint = startPoint;
        pendingLength = null;
        pendingAngle = currentAngle;
        dynamicInputActive = true;

        const angleIndicator = document.getElementById('angle-indicator');
        if (angleIndicator && currentAngle !== null) {
            angleIndicator.style.display = 'block';
            angleIndicator.textContent = `∠ ${(currentAngle * 180 / Math.PI).toFixed(1)}°`;
        } else if (angleIndicator) {
            angleIndicator.style.display = 'none';
        }
    }

    function hideDynamicInput() {
        if (lineDistanceInput) {
            lineDistanceInput.style.display = 'none';
            const input = lineDistanceInput.querySelector('input');
            if (input) input.value = '';
        }
        dynamicInputActive = false;
        pendingLength = null;
        pendingAngle = null;
    }

    function parseDynamicInput(inputStr) {
        inputStr = inputStr.trim();

        const angleMatch = inputStr.match(/^(<?)([\d.]+)(?:<([\d.]+))?$/);
        const coordMatch = inputStr.match(/^([\d.-]+)[,;]([\d.-]+)$/);

        if (coordMatch) {
            const dx = parseFloat(coordMatch[1]);
            const dy = parseFloat(coordMatch[2]);
            if (!isNaN(dx) && !isNaN(dy)) {
                return { type: 'relative', dx: dx, dy: dy };
            }
        }

        if (angleMatch) {
            const hasAnglePrefix = angleMatch[1] === '<';
            const num1 = parseFloat(angleMatch[2]);
            const num2 = angleMatch[3] ? parseFloat(angleMatch[3]) : null;

            if (hasAnglePrefix && num2 === null) {
                return { type: 'angle', angle: num1 * Math.PI / 180 };
            } else if (num2 !== null) {
                return { type: 'polar', length: num1, angle: num2 * Math.PI / 180 };
            } else if (!hasAnglePrefix && num2 === null) {
                return { type: 'length', length: num1 };
            }
        }

        return null;
    }

    function updateDynamicPreview() {
        if (!dynamicInputActive || !lastDrawPoint) return;

        const input = lineDistanceInput.querySelector('input');
        if (!input) return;

        const parsed = parseDynamicInput(input.value);

        if (parsed) {
            let endPoint = null;

            if (parsed.type === 'length' && pendingAngle !== null) {
                const factor = unitFactors[currentUnit] || 10;
                const lengthInWorld = parsed.length * factor;
                endPoint = {
                    x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                    y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                };
            } else if (parsed.type === 'angle') {
                pendingAngle = parsed.angle;
                const angleIndicator = document.getElementById('angle-indicator');
                if (angleIndicator) {
                    angleIndicator.textContent = `∠ ${(pendingAngle * 180 / Math.PI).toFixed(1)}°`;
                }
                if (pendingLength !== null) {
                    const factor = unitFactors[currentUnit] || 10;
                    const lengthInWorld = pendingLength * factor;
                    endPoint = {
                        x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                        y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                    };
                }
            } else if (parsed.type === 'polar') {
                pendingLength = parsed.length;
                pendingAngle = parsed.angle;
                const factor = unitFactors[currentUnit] || 10;
                const lengthInWorld = pendingLength * factor;
                endPoint = {
                    x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                    y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                };
                const angleIndicator = document.getElementById('angle-indicator');
                if (angleIndicator) {
                    angleIndicator.textContent = `∠ ${(pendingAngle * 180 / Math.PI).toFixed(1)}°`;
                }
            } else if (parsed.type === 'relative') {
                const factor = unitFactors[currentUnit] || 10;
                endPoint = {
                    x: lastDrawPoint.x + parsed.dx * factor,
                    y: lastDrawPoint.y + parsed.dy * factor
                };
            }

            if (endPoint) {
                if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
                    continuousLineStartPoint = endPoint;
                    drawAllEntities();
                } else if (currentTool === 'polyline' && drawing) {
                    tempEntity = endPoint;
                    drawAllEntities();
                }
            }
        }
    }

    function applyDynamicInput() {
        if (!dynamicInputActive || !lastDrawPoint) return;

        const input = lineDistanceInput.querySelector('input');
        if (!input) return;

        const parsed = parseDynamicInput(input.value);

        if (parsed) {
            let endPoint = null;

            if (parsed.type === 'length' && pendingAngle !== null) {
                const factor = unitFactors[currentUnit] || 10;
                const lengthInWorld = parsed.length * factor;
                endPoint = {
                    x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                    y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                };
                pendingLength = parsed.length;
            } else if (parsed.type === 'angle') {
                pendingAngle = parsed.angle;
                if (pendingLength !== null) {
                    const factor = unitFactors[currentUnit] || 10;
                    const lengthInWorld = pendingLength * factor;
                    endPoint = {
                        x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                        y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                    };
                }
                return;
            } else if (parsed.type === 'polar') {
                pendingLength = parsed.length;
                pendingAngle = parsed.angle;
                const factor = unitFactors[currentUnit] || 10;
                const lengthInWorld = pendingLength * factor;
                endPoint = {
                    x: lastDrawPoint.x + Math.cos(pendingAngle) * lengthInWorld,
                    y: lastDrawPoint.y + Math.sin(pendingAngle) * lengthInWorld
                };
            } else if (parsed.type === 'relative') {
                const factor = unitFactors[currentUnit] || 10;
                endPoint = {
                    x: lastDrawPoint.x + parsed.dx * factor,
                    y: lastDrawPoint.y + parsed.dy * factor
                };
            }

            if (endPoint) {
                if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
                    const lastPoint = continuousLinePoints[continuousLinePoints.length - 1];
                    const newLine = {
                        type: 'line',
                        x: lastPoint.x,
                        y: lastPoint.y,
                        x2: endPoint.x,
                        y2: endPoint.y,
                        layer: currentLayer,
                        material: currentMaterial,
                        color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
                        lineweight: 1.5,
                        linetype: 'solid'
                    };
                    entities.push(newLine);
                    continuousLinePoints.push(endPoint);
                    continuousLineStartPoint = endPoint;
                    lastDrawPoint = endPoint;
                    saveToStorage();
                    drawAllEntities();
                    showSaveIndicator(`Line: ${parsed.type === 'polar' ? parsed.length : (parsed.type === 'relative' ? Math.hypot(parsed.dx, parsed.dy) : parsed.length)} ${currentUnit}`);
                } else if (currentTool === 'polyline' && drawing) {
                    const lastPoint = polylinePoints[polylinePoints.length - 1];
                    polylinePoints.push(endPoint);
                    lastDrawPoint = endPoint;
                    drawAllEntities();
                    showSaveIndicator(`Polyline segment: ${parsed.type === 'polar' ? parsed.length : (parsed.type === 'relative' ? Math.hypot(parsed.dx, parsed.dy) : parsed.length)} ${currentUnit}`);
                }
            }
        }

        const inputField = lineDistanceInput.querySelector('input');
        if (inputField) inputField.value = '';
    }

    function cancelCurrentDrawing() {
        if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
            isDrawingContinuousLine = false;
            continuousLinePoints = [];
            continuousLineStartPoint = null;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
         } else if (currentTool === 'polyline' && drawing) {
            if (polylinePoints.length >= 2) {
                finishPolylineTool();
            } else {
                cancelPolylineTool();
            }
        } else if (currentTool === 'spline' && isDrawingSpline) {
            if (splinePoints.length >= 3) {
                finishSplineTool();
            } else {
                cancelSplineTool();
            }
        } else if (currentTool === 'hatch' && isDrawingHatch) {
            if (hatchPoints.length >= 3) {
                finishHatchTool();
            } else {
                cancelHatchTool();
            }
        } else if (currentTool === 'ellipse' && isDrawingEllipse) {
            isDrawingEllipse = false;
            ellipseCenter = null;
            ellipseRadiusX = 0;
            ellipseRadiusY = 0;
            drawing = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'dimension' && isDrawingDimension) {
            dimensionStartPoint = null;
            isDrawingDimension = false;
            drawing = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'arc-length-dimension' && isDrawingArcLength) {
            selectedArcEntity = null;
            isDrawingArcLength = false;
            arcLengthPreview = null;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'measure' && isMeasuring) {
            measureStartPoint = null;
            isMeasuring = false;
            tempEntity = null;
            measureResult.style.display = 'none';
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'select' && isSelecting) {
            isSelecting = false;
            selectionBox = null;
            drawAllEntities();
        } else if (currentTool === 'clone' && isCloning) {
            cloneBasePoint = null;
            isCloning = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'move' && isMoving) {
            moveBasePoint = null;
            isMoving = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'stretch' && isStretching) {
            stretchBasePoint = null;
            isStretching = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'mirror' && mirrorPoint1) {
            mirrorPoint1 = null;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'rotate' && rotateCenter) {
            rotateCenter = null;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'trim' && trimReference) {
            trimReference = null;
            drawAllEntities();
            setTool('select');
        } else if (currentTool === 'extend' && extendBoundary) {
            extendBoundary = null;
            drawAllEntities();
            setTool('select');
        } else if ((currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arc') && drawing) {
            drawing = false;
            tempEntity = null;
            drawAllEntities();
            setTool('select');
        } else {
            deselectAll();
            setTool('select');
        }

        hideDynamicInput();
        showSaveIndicator('Selection mode activated');
    }

    // ===== SELECT TOOL FUNCTIONS =====
    function startSelectionBox(world) {
        isSelecting = true;
        selectionStart = { x: world.x, y: world.y };
        selectionBox = {
            x1: world.x,
            y1: world.y,
            x2: world.x,
            y2: world.y
        };
    }

    function updateSelectionBox(world) {
        if (!isSelecting || !selectionBox) return;
        selectionBox.x2 = world.x;
        selectionBox.y2 = world.y;
        drawAllEntities();
    }

    function finishSelectionBox(addToSelection = false) {
        if (!isSelecting || !selectionBox) return;

        const x1 = Math.min(selectionBox.x1, selectionBox.x2);
        const y1 = Math.min(selectionBox.y1, selectionBox.y2);
        const x2 = Math.max(selectionBox.x1, selectionBox.x2);
        const y2 = Math.max(selectionBox.y1, selectionBox.y2);

        const isWindow = (selectionBox.x2 > selectionBox.x1);

        if (!addToSelection) {
            selectedEntityIndices = [];
        }

        entities.forEach((ent, idx) => {
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible || layer.locked) return;

            let select = false;

            if (ent.type === 'line') {
                const entX1 = ent.x, entY1 = ent.y;
                const entX2 = ent.x2, entY2 = ent.y2;

                if (isWindow) {
                    select = (entX1 >= x1 && entX1 <= x2 && entY1 >= y1 && entY1 <= y2) &&
                            (entX2 >= x1 && entX2 <= x2 && entY2 >= y1 && entY2 <= y2);
                } else {
                    select = lineIntersectsRect(entX1, entY1, entX2, entY2, x1, y1, x2, y2) ||
                            (entX1 >= x1 && entX1 <= x2 && entY1 >= y1 && entY1 <= y2) ||
                            (entX2 >= x1 && entX2 <= x2 && entY2 >= y1 && entY2 <= y2);
                }
            } else if (ent.type === 'rect') {
                const rX1 = ent.x, rY1 = ent.y;
                const rX2 = ent.x + ent.w, rY2 = ent.y + ent.h;

                if (isWindow) {
                    select = rX1 >= x1 && rX2 <= x2 && rY1 >= y1 && rY2 <= y2;
                } else {
                    select = rectIntersectsRect(rX1, rY1, rX2, rY2, x1, y1, x2, y2);
                }
            } else if (ent.type === 'circle') {
                const cX = ent.x, cY = ent.y, r = ent.radius;

                if (isWindow) {
                    select = (cX - r) >= x1 && (cX + r) <= x2 && (cY - r) >= y1 && (cY + r) <= y2;
                } else {
                    select = circleIntersectsRect(cX, cY, r, x1, y1, x2, y2);
                }
            } else if (ent.type === 'polyline') {
                for (let i = 0; i < ent.points.length; i++) {
                    const p = ent.points[i];
                    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
                        select = true;
                        break;
                    }
                }
            } else if (ent.type === 'spline') {
                for (let i = 0; i < ent.points.length; i++) {
                    const p = ent.points[i];
                    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
                        select = true;
                        break;
                    }
                }
            } else if (ent.type === 'hatch') {
                for (let i = 0; i < ent.points.length; i++) {
                    const p = ent.points[i];
                    if (p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2) {
                        select = true;
                        break;
                    }
                }
            } else if (ent.type === 'dimension') {
                if (ent.textX >= x1 && ent.textX <= x2 && ent.textY >= y1 && ent.textY <= y2) {
                    select = true;
                }
            } else if (ent.type === 'arc-length-dimension') {
                if (ent.textX >= x1 && ent.textX <= x2 && ent.textY >= y1 && ent.textY <= y2) {
                    select = true;
                }
            }

            if (select && !selectedEntityIndices.includes(idx)) {
                selectedEntityIndices.push(idx);
            }
        });

        isSelecting = false;
        selectionBox = null;
        selectionStart = null;
        drawAllEntities();
        updatePropertiesPanel();
    }

    function handleSelection(worldX, worldY, addToSelection = false) {
        if (!addToSelection) {
            selectedEntityIndices = [];
        }

        for (let i = entities.length - 1; i >= 0; i--) {
            const ent = entities[i];
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible || layer.locked) continue;

            let hit = false;
            const threshold = 8 / zoom;

            if (ent.type === 'line') {
                if (Math.hypot(worldX - ent.x, worldY - ent.y) < threshold) hit = true;
                else if (Math.hypot(worldX - ent.x2, worldY - ent.y2) < threshold) hit = true;
                else {
                    const d = distanceToSegment(worldX, worldY, ent.x, ent.y, ent.x2, ent.y2);
                    if (d < threshold) hit = true;
                }
            } else if (ent.type === 'polyline') {
                for (let j = 0; j < ent.points.length - 1; j++) {
                    const d = distanceToSegment(worldX, worldY, ent.points[j].x, ent.points[j].y, ent.points[j+1].x, ent.points[j+1].y);
                    if (d < threshold) {
                        hit = true;
                        break;
                    }
                }
            } else if (ent.type === 'spline') {
                for (let j = 0; j < ent.points.length - 1; j++) {
                    const d = distanceToSegment(worldX, worldY, ent.points[j].x, ent.points[j].y, ent.points[j+1].x, ent.points[j+1].y);
                    if (d < threshold) {
                        hit = true;
                        break;
                    }
                }
            } else if (ent.type === 'circle') {
                if (Math.abs(Math.hypot(worldX - ent.x, worldY - ent.y) - ent.radius) < threshold) hit = true;
            } else if (ent.type === 'rect') {
                const left = Math.min(ent.x, ent.x + ent.w);
                const right = Math.max(ent.x, ent.x + ent.w);
                const top = Math.min(ent.y, ent.y + ent.h);
                const bottom = Math.max(ent.y, ent.y + ent.h);

                if (worldX >= left && worldX <= right && worldY >= top && worldY <= bottom) {
                    if (Math.abs(worldX - left) < threshold || Math.abs(worldX - right) < threshold ||
                        Math.abs(worldY - top) < threshold || Math.abs(worldY - bottom) < threshold) {
                        hit = true;
                    }
                }
            } else if (ent.type === 'hatch') {
                if (pointInPolygon(worldX, worldY, ent.points)) hit = true;
            } else if (ent.type === 'dimension') {
                if (Math.hypot(worldX - ent.textX, worldY - ent.textY) < threshold) hit = true;
            } else if (ent.type === 'arc-length-dimension') {
                if (Math.hypot(worldX - ent.textX, worldY - ent.textY) < threshold) hit = true;
            }

            if (hit) {
                if (!selectedEntityIndices.includes(i)) {
                    selectedEntityIndices.push(i);
                }
                break;
            }
        }

        drawAllEntities();
        updatePropertiesPanel();
    }

    function deselectAll() {
        selectedEntityIndices = [];
        drawAllEntities();
        updatePropertiesPanel();
        showSaveIndicator('All entities deselected');
    }

    function deleteSelected() {
        if (selectedEntityIndices.length > 0) {
            saveState();
            selectedEntityIndices.sort((a, b) => b - a).forEach(idx => {
                entities.splice(idx, 1);
            });
            selectedEntityIndices = [];
            drawAllEntities();
            saveToStorage();
            showSaveIndicator('Selected items deleted');
        } else {
            showSaveIndicator('No items selected');
        }
    }

    // ===== ADVANCED DRAWING TOOLS =====

    function generateSplinePoints(controlPoints, segmentsPerSegment = 20) {
        if (controlPoints.length < 2) return controlPoints;

        const points = [];

        for (let i = 0; i < controlPoints.length - 1; i++) {
            const p0 = controlPoints[Math.max(0, i - 1)];
            const p1 = controlPoints[i];
            const p2 = controlPoints[i + 1];
            const p3 = controlPoints[Math.min(controlPoints.length - 1, i + 2)];

            for (let t = 0; t <= segmentsPerSegment; t++) {
                const u = t / segmentsPerSegment;
                const u2 = u * u;
                const u3 = u2 * u;

                const x = 0.5 * ((2 * p1.x) +
                    (-p0.x + p2.x) * u +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);

                const y = 0.5 * ((2 * p1.y) +
                    (-p0.y + p2.y) * u +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

                points.push({ x: x, y: y });
            }
        }

        return points;
    }

    function startSplineTool(world) {
        isDrawingSpline = true;
        drawing = true;
        currentTool = 'spline';
        splinePoints = [{ x: world.x, y: world.y }];
        tempEntity = null;
        showSaveIndicator('Spline started - Click to add control points, double-click or Enter to finish');
        drawAllEntities();
    }

    function addSplinePoint(world) {
        if (!isDrawingSpline || currentTool !== 'spline') return;

        const lastPoint = splinePoints[splinePoints.length - 1];
        let newPoint = { x: world.x, y: world.y };

        if (orthoMode) {
            newPoint = applyOrthoConstraint(lastPoint, newPoint);
        }

        const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);

        if (distance > 1) {
            splinePoints.push(newPoint);
            tempEntity = null;
            drawAllEntities();
            showSaveIndicator(`Spline point added - ${splinePoints.length} control points`);
        }
    }

    function finishSplineTool() {
        if (splinePoints.length < 3) {
            cancelSplineTool();
            return;
        }

        saveState();

        const smoothPoints = generateSplinePoints(splinePoints, 50);

        const newSpline = {
            type: 'spline',
            points: smoothPoints,
            controlPoints: [...splinePoints],
            layer: currentLayer,
            material: currentMaterial,
            color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
            lineweight: 1.8,
            linetype: 'solid'
        };

        entities.push(newSpline);
        saveToStorage();
        showSaveIndicator('Spline created with ' + smoothPoints.length + ' points');

        isDrawingSpline = false;
        drawing = false;
        splinePoints = [];
        tempEntity = null;
        drawAllEntities();
        setTool('select');
    }

    function cancelSplineTool() {
        isDrawingSpline = false;
        drawing = false;
        splinePoints = [];
        tempEntity = null;
        drawAllEntities();
        showSaveIndicator('Spline cancelled');
        setTool('select');
    }

    function drawSplinePreview(ctx) {
        if (!isDrawingSpline || currentTool !== 'spline' || splinePoints.length === 0) return;

        ctx.save();

        if (splinePoints.length >= 2) {
            const previewPoints = generateSplinePoints(splinePoints, 30);

            ctx.strokeStyle = '#6e83fa';
            ctx.lineWidth = 2.5 / zoom;
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(previewPoints[0].x, previewPoints[0].y);
            for (let i = 1; i < previewPoints.length; i++) {
                ctx.lineTo(previewPoints[i].x, previewPoints[i].y);
            }
            ctx.stroke();
        }

        if (tempEntity && splinePoints.length > 0) {
            const lastPoint = splinePoints[splinePoints.length - 1];

            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2.5 / zoom;
            ctx.setLineDash([8 / zoom, 5 / zoom]);

            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(tempEntity.x, tempEntity.y);
            ctx.stroke();
        }

        splinePoints.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 6 / zoom, 0, 2 * Math.PI);

            if (index === 0) {
                ctx.fillStyle = '#4ade80';
            } else {
                ctx.fillStyle = '#f59e0b';
            }

            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();

            if (index > 0) {
                const prevPoint = splinePoints[index - 1];
                ctx.beginPath();
                ctx.moveTo(prevPoint.x, prevPoint.y);
                ctx.lineTo(point.x, point.y);
                ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
                ctx.lineWidth = 1 / zoom;
                ctx.setLineDash([4 / zoom, 4 / zoom]);
                ctx.stroke();
            }
        });

        ctx.restore();
    }

    function startEllipseTool(world) {
        ellipseCenter = { x: world.x, y: world.y };
        isDrawingEllipse = true;
        drawing = true;
        showSaveIndicator('Click to set first radius, then second radius');
    }

    function updateEllipsePreview(world) {
        if (!isDrawingEllipse || !ellipseCenter) return;

        if (ellipseRadiusX === 0) {
            ellipseRadiusX = Math.abs(world.x - ellipseCenter.x);
            ellipseRadiusY = ellipseRadiusX;
        } else {
            ellipseRadiusY = Math.abs(world.y - ellipseCenter.y);
        }

        tempEntity = {
            type: 'ellipse',
            x: ellipseCenter.x,
            y: ellipseCenter.y,
            radiusX: ellipseRadiusX,
            radiusY: ellipseRadiusY
        };

        drawAllEntities();
    }

    function finishEllipseTool(world) {
        if (!isDrawingEllipse || !ellipseCenter) return;

        if (ellipseRadiusX === 0) {
            ellipseRadiusX = Math.abs(world.x - ellipseCenter.x);
            ellipseRadiusY = ellipseRadiusX;
        } else {
            ellipseRadiusY = Math.abs(world.y - ellipseCenter.y);
        }

        if (ellipseRadiusX > 0 && ellipseRadiusY > 0) {
            const newEllipse = {
                type: 'ellipse',
                x: ellipseCenter.x,
                y: ellipseCenter.y,
                radiusX: ellipseRadiusX,
                radiusY: ellipseRadiusY,
                layer: currentLayer,
                material: currentMaterial,
                color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
                lineweight: 1.5,
                linetype: 'solid'
            };

            entities.push(newEllipse);
            saveToStorage();
            showSaveIndicator('Ellipse created');
        }

        ellipseCenter = null;
        ellipseRadiusX = 0;
        ellipseRadiusY = 0;
        isDrawingEllipse = false;
        drawing = false;
        tempEntity = null;
        drawAllEntities();
    }

    function startHatchTool(world) {
        hatchPoints = [{ x: world.x, y: world.y }];
        isDrawingHatch = true;
        drawing = true;
        showSaveIndicator('Click to define hatch boundary, double-click to finish');
    }

    function addHatchPoint(world) {
        if (!isDrawingHatch) return;
        hatchPoints.push({ x: world.x, y: world.y });
        drawAllEntities();
    }

    function finishHatchTool() {
        if (hatchPoints.length < 3) {
            cancelHatchTool();
            return;
        }

        const newHatch = {
            type: 'hatch',
            points: [...hatchPoints],
            pattern: 'solid',
            color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
            layer: currentLayer,
            material: currentMaterial
        };

        entities.push(newHatch);
        isDrawingHatch = false;
        drawing = false;
        hatchPoints = [];
        drawAllEntities();
        saveToStorage();
        showSaveIndicator('Hatch created');
    }

    function cancelHatchTool() {
        isDrawingHatch = false;
        drawing = false;
        hatchPoints = [];
        tempEntity = null;
        drawAllEntities();
        showSaveIndicator('Hatch cancelled');
        setTool('select');
    }

    function startTextTool(world) {
        textPosition = { x: world.x, y: world.y };
        const text = prompt('Enter text:', 'Text');
        if (text && text.trim()) {
            const newText = {
                type: 'text',
                x: world.x,
                y: world.y,
                text: text,
                layer: currentLayer,
                color: materials.find(m => m.id === currentMaterial)?.color || '#ffffff',
                fontSize: 12,
                lineweight: 1
            };
            entities.push(newText);
            saveToStorage();
            showSaveIndicator('Text added');
        }
        textPosition = null;
        drawAllEntities();
    }

    // ===== POLYLINE TOOL =====
    function startPolylineTool(world) {
        drawing = true;
        currentTool = 'polyline';
        polylinePoints = [{ x: world.x, y: world.y }];
        lastDrawPoint = { x: world.x, y: world.y };
        tempEntity = null;
        showDynamicInput(world.x, world.y, lastDrawPoint);
        showSaveIndicator('Polyline started - Click to add points, double-click or Enter to finish');
        drawAllEntities();
    }

    function addPolylinePoint(world) {
        if (!drawing || currentTool !== 'polyline' || polylinePoints.length === 0) return;

        const lastPoint = polylinePoints[polylinePoints.length - 1];
        let newPoint = { x: world.x, y: world.y };

        if (orthoMode) {
            newPoint = applyOrthoConstraint(lastPoint, newPoint);
        }

        if (polarMode) {
            newPoint = applyPolarConstraint(lastPoint, newPoint, polarAngle);
        }

        const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);

        if (distance > 0.1) {
            polylinePoints.push(newPoint);
            lastDrawPoint = newPoint;
            tempEntity = null;
            drawAllEntities();
            showDynamicInput(newPoint.x, newPoint.y, newPoint);
            showSaveIndicator(`Polyline point added - ${polylinePoints.length} points`);
        }
    }

    function finishPolylineTool() {
        if (!polylinePoints || polylinePoints.length < 2) {
            console.warn("Polyline not enough points");
            return;
        }

        saveState();

        const newPolyline = {
            type: 'polyline',
            points: [...polylinePoints],
            layer: currentLayer,
            material: currentMaterial,
            color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
            lineweight: 1.5,
            linetype: 'solid',
            closed: false
        };

        entities.push(newPolyline);

        polylinePoints = [];
        drawing = false;
        tempEntity = null;

        saveToStorage();
        showSaveIndicator('Polyline created with ' + newPolyline.points.length + ' points');
        drawAllEntities();
        setTool('select');
    }

    function cancelPolylineTool() {
        drawing = false;
        polylinePoints = [];
        tempEntity = null;
        hideDynamicInput();
        drawAllEntities();
        showSaveIndicator('Polyline drawing cancelled');
        setTool('select');
    }

    function drawPolylinePreview(ctx) {
        if (!drawing || currentTool !== 'polyline' || polylinePoints.length === 0) return;

        ctx.save();

        if (polylinePoints.length >= 2) {
            ctx.strokeStyle = '#6e83fa';
            ctx.lineWidth = 2.5 / zoom;
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.moveTo(polylinePoints[0].x, polylinePoints[0].y);
            for (let i = 1; i < polylinePoints.length; i++) {
                ctx.lineTo(polylinePoints[i].x, polylinePoints[i].y);
            }
            ctx.stroke();
        }

        if (tempEntity && polylinePoints.length > 0) {
            const lastPoint = polylinePoints[polylinePoints.length - 1];

            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2.5 / zoom;
            ctx.setLineDash([8 / zoom, 5 / zoom]);

            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(tempEntity.x, tempEntity.y);
            ctx.stroke();

            const distance = Math.hypot(tempEntity.x - lastPoint.x, tempEntity.y - lastPoint.y);

            if (distance > 0.1) {
                const midX = (lastPoint.x + tempEntity.x) / 2;
                const midY = (lastPoint.y + tempEntity.y) / 2;

                ctx.fillStyle = '#fcd34d';
                ctx.font = `${11 / zoom}px "JetBrains Mono", monospace`;
                ctx.setLineDash([]);

                const factor = unitFactors[currentUnit] || 10;
                const displayLength = (distance / factor).toFixed(2);

                ctx.fillText(
                    `${displayLength} ${currentUnit}`,
                    midX + 8 / zoom,
                    midY - 8 / zoom
                );
            }
        }

        polylinePoints.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 5 / zoom, 0, 2 * Math.PI);

            if (index === 0) {
                ctx.fillStyle = '#4ade80';
            } else {
                ctx.fillStyle = '#60a5fa';
            }

            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
        });

        ctx.restore();
    }

    // ===== CONTINUOUS LINE TOOL =====
    function startContinuousLineTool(world) {
        continuousLinePoints = [{ x: world.x, y: world.y }];
        continuousLineStartPoint = { x: world.x, y: world.y };
        isDrawingContinuousLine = true;
        drawing = true;
        lastDrawPoint = { x: world.x, y: world.y };
        pendingLength = null;
        pendingAngle = null;

        showDynamicInput(world.x, world.y, lastDrawPoint);

        showSaveIndicator('Enter length (e.g., 100) or angle (e.g., <45) or polar (e.g., 100<45)');
    }

    function addContinuousLinePoint(world) {
        if (!isDrawingContinuousLine || continuousLinePoints.length === 0) return;

        const lastPoint = continuousLinePoints[continuousLinePoints.length - 1];
        let newPoint = { x: world.x, y: world.y };

        if (orthoMode) {
            newPoint = applyOrthoConstraint(lastPoint, newPoint);
        }

        if (polarMode) {
            newPoint = applyPolarConstraint(lastPoint, newPoint, polarAngle);
        }

        const distance = Math.hypot(newPoint.x - lastPoint.x, newPoint.y - lastPoint.y);

        if (distance > 1) {
            const newLine = {
                type: 'line',
                x: lastPoint.x,
                y: lastPoint.y,
                x2: newPoint.x,
                y2: newPoint.y,
                layer: currentLayer,
                material: currentMaterial,
                color: materials.find(m => m.id === currentMaterial)?.color || '#94a3b8',
                lineweight: 1.5,
                linetype: 'solid'
            };

            entities.push(newLine);
            continuousLinePoints.push(newPoint);
            continuousLineStartPoint = newPoint;
            lastDrawPoint = newPoint;

            saveToStorage();
            showSaveIndicator('Line segment added');
            drawAllEntities();

            showDynamicInput(newPoint.x, newPoint.y, newPoint);
        }
    }

    function updateContinuousLinePreview(world) {
        if (!isDrawingContinuousLine || continuousLinePoints.length === 0) return;

        const lastPoint = continuousLinePoints[continuousLinePoints.length - 1];
        let previewPoint = { x: world.x, y: world.y };

        if (orthoMode) {
            previewPoint = applyOrthoConstraint(lastPoint, previewPoint);
        }

        if (polarMode) {
            previewPoint = applyPolarConstraint(lastPoint, previewPoint, polarAngle);
        }

        currentDrawAngle = Math.atan2(previewPoint.y - lastPoint.y, previewPoint.x - lastPoint.x);
        continuousLineStartPoint = previewPoint;

        if (!dynamicInputActive) {
            showDynamicInput(world.x, world.y, lastPoint, currentDrawAngle);
        } else {
            if ((orthoMode || polarMode) && pendingAngle !== currentDrawAngle) {
                pendingAngle = currentDrawAngle;
                const angleIndicator = document.getElementById('angle-indicator');
                if (angleIndicator) {
                    angleIndicator.textContent = `∠ ${(pendingAngle * 180 / Math.PI).toFixed(1)}°`;
                }
            }
        }

        drawAllEntities();
    }

    function finishContinuousLineTool() {
        if (continuousLinePoints.length < 2) {
            cancelContinuousLineTool();
            return;
        }

        isDrawingContinuousLine = false;
        drawing = false;
        continuousLinePoints = [];
        continuousLineStartPoint = null;
        hideDynamicInput();

        showSaveIndicator('Drawing finished');
        drawAllEntities();
        setTool('select');
    }

    function cancelContinuousLineTool() {
        isDrawingContinuousLine = false;
        drawing = false;
        continuousLinePoints = [];
        continuousLineStartPoint = null;
        tempEntity = null;
        hideDynamicInput();
        drawAllEntities();
        showSaveIndicator('Drawing cancelled');
        setTool('select');
    }

    function drawContinuousLinePreview(ctx) {
        if (!isDrawingContinuousLine || continuousLinePoints.length === 0) return;

        ctx.save();

        if (continuousLinePoints.length >= 2) {
            ctx.strokeStyle = '#6e83fa';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([]);

            for (let i = 0; i < continuousLinePoints.length - 1; i++) {
                ctx.beginPath();
                ctx.moveTo(continuousLinePoints[i].x, continuousLinePoints[i].y);
                ctx.lineTo(continuousLinePoints[i + 1].x, continuousLinePoints[i + 1].y);
                ctx.stroke();
            }
        }

        if (continuousLineStartPoint && continuousLinePoints.length > 0) {
            const lastPoint = continuousLinePoints[continuousLinePoints.length - 1];

            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 2 / zoom;
            ctx.setLineDash([5 / zoom, 3 / zoom]);

            ctx.beginPath();
            ctx.moveTo(lastPoint.x, lastPoint.y);
            ctx.lineTo(continuousLineStartPoint.x, continuousLineStartPoint.y);
            ctx.stroke();

            const distance = Math.hypot(
                continuousLineStartPoint.x - lastPoint.x,
                continuousLineStartPoint.y - lastPoint.y
            );

            if (distance > 0.1) {
                const midX = (lastPoint.x + continuousLineStartPoint.x) / 2;
                const midY = (lastPoint.y + continuousLineStartPoint.y) / 2;

                ctx.fillStyle = '#fcd34d';
                ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
                ctx.setLineDash([]);

                const factor = unitFactors[currentUnit] || 10;
                const displayLength = (distance / factor).toFixed(2);

                ctx.fillText(
                    `${displayLength} ${currentUnit}`,
                    midX + 10 / zoom,
                    midY - 10 / zoom
                );
            }
        }

        continuousLinePoints.forEach((point, index) => {
            ctx.beginPath();
            ctx.arc(point.x, point.y, 4 / zoom, 0, 2 * Math.PI);

            if (index === 0) {
                ctx.fillStyle = '#4ade80';
            } else {
                ctx.fillStyle = '#60a5fa';
            }

            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1 / zoom;
            ctx.stroke();
        });

        ctx.restore();
    }

    // ===== MODIFY TOOLS =====

    function startFilletTool() {
        if (selectedEntityIndices.length < 2) {
            showSaveIndicator('Select two lines to fillet');
            return;
        }

        const ent1 = entities[selectedEntityIndices[0]];
        const ent2 = entities[selectedEntityIndices[1]];

        if (ent1.type === 'line' && ent2.type === 'line') {
            const intersection = lineIntersection(
                ent1.x, ent1.y, ent1.x2, ent1.y2,
                ent2.x, ent2.y, ent2.x2, ent2.y2
            );

            if (intersection) {
                saveState();
                const factor = unitFactors[currentUnit] || 10;
                const radius = filletRadius / factor;

                const newArc = {
                    type: 'arc',
                    x: intersection.x,
                    y: intersection.y,
                    radius: radius,
                    startAngle: Math.atan2(ent1.y - intersection.y, ent1.x - intersection.x),
                    endAngle: Math.atan2(ent2.y - intersection.y, ent2.x - intersection.x),
                    layer: currentLayer,
                    color: ent1.color,
                    lineweight: ent1.lineweight
                };

                entities.push(newArc);

                const idx1 = selectedEntityIndices[0];
                const idx2 = selectedEntityIndices[1];
                entities.splice(Math.max(idx1, idx2), 1);
                entities.splice(Math.min(idx1, idx2), 1);

                selectedEntityIndices = [];
                drawAllEntities();
                saveToStorage();
                showSaveIndicator(`Fillet created (R=${filletRadius} ${currentUnit})`);
            }
        }
    }

    function setFilletRadius() {
        const input = prompt('Enter fillet radius:', filletRadius);
        if (input !== null) {
            filletRadius = parseFloat(input) || 10;
            showSaveIndicator(`Fillet radius set to ${filletRadius} ${currentUnit}`);
        }
    }

    function startChamferTool() {
        if (selectedEntityIndices.length < 2) {
            showSaveIndicator('Select two lines to chamfer');
            return;
        }

        const ent1 = entities[selectedEntityIndices[0]];
        const ent2 = entities[selectedEntityIndices[1]];

        if (ent1.type === 'line' && ent2.type === 'line') {
            const intersection = lineIntersection(
                ent1.x, ent1.y, ent1.x2, ent1.y2,
                ent2.x, ent2.y, ent2.x2, ent2.y2
            );

            if (intersection) {
                saveState();
                const factor = unitFactors[currentUnit] || 10;
                const dist = chamferDistance / factor;

                const angle1 = Math.atan2(ent1.y2 - ent1.y, ent1.x2 - ent1.x);
                const angle2 = Math.atan2(ent2.y2 - ent2.y, ent2.x2 - ent2.x);

                const point1 = {
                    x: intersection.x - Math.cos(angle1) * dist,
                    y: intersection.y - Math.sin(angle1) * dist
                };
                const point2 = {
                    x: intersection.x - Math.cos(angle2) * dist,
                    y: intersection.y - Math.sin(angle2) * dist
                };

                const newLine = {
                    type: 'line',
                    x: point1.x,
                    y: point1.y,
                    x2: point2.x,
                    y2: point2.y,
                    layer: currentLayer,
                    color: ent1.color,
                    lineweight: ent1.lineweight
                };

                entities.push(newLine);

                const idx1 = selectedEntityIndices[0];
                const idx2 = selectedEntityIndices[1];
                entities.splice(Math.max(idx1, idx2), 1);
                entities.splice(Math.min(idx1, idx2), 1);

                selectedEntityIndices = [];
                drawAllEntities();
                saveToStorage();
                showSaveIndicator(`Chamfer created (D=${chamferDistance} ${currentUnit})`);
            }
        }
    }

    function setChamferDistance() {
        const input = prompt('Enter chamfer distance:', chamferDistance);
        if (input !== null) {
            chamferDistance = parseFloat(input) || 5;
            showSaveIndicator(`Chamfer distance set to ${chamferDistance} ${currentUnit}`);
        }
    }

    function startOffsetTool() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select an entity to offset');
            return;
        }

        saveState();
        const ent = entities[selectedEntityIndices[0]];
        const factor = unitFactors[currentUnit] || 10;
        const distance = offsetDistance / factor;

        if (ent.type === 'line') {
            const dx = ent.x2 - ent.x;
            const dy = ent.y2 - ent.y;
            const len = Math.hypot(dx, dy);
            const perpX = -dy / len * distance;
            const perpY = dx / len * distance;

            const newLine1 = {
                type: 'line',
                x: ent.x + perpX,
                y: ent.y + perpY,
                x2: ent.x2 + perpX,
                y2: ent.y2 + perpY,
                layer: currentLayer,
                color: ent.color,
                lineweight: ent.lineweight
            };

            const newLine2 = {
                type: 'line',
                x: ent.x - perpX,
                y: ent.y - perpY,
                x2: ent.x2 - perpX,
                y2: ent.y2 - perpY,
                layer: currentLayer,
                color: ent.color,
                lineweight: ent.lineweight
            };

            entities.push(newLine1, newLine2);
            showSaveIndicator(`Offset lines created (D=${offsetDistance} ${currentUnit})`);
        } else if (ent.type === 'circle') {
            const newCircle1 = {
                type: 'circle',
                x: ent.x,
                y: ent.y,
                radius: ent.radius + distance,
                layer: currentLayer,
                color: ent.color,
                lineweight: ent.lineweight
            };

            const newCircle2 = {
                type: 'circle',
                x: ent.x,
                y: ent.y,
                radius: Math.max(0.1, ent.radius - distance),
                layer: currentLayer,
                color: ent.color,
                lineweight: ent.lineweight
            };

            entities.push(newCircle1, newCircle2);
            showSaveIndicator(`Offset circles created (D=${offsetDistance} ${currentUnit})`);
        }

        selectedEntityIndices = [];
        drawAllEntities();
        saveToStorage();
    }

    function setOffsetDistance() {
        const input = prompt('Enter offset distance:', offsetDistance);
        if (input !== null) {
            offsetDistance = parseFloat(input) || 10;
            showSaveIndicator(`Offset distance set to ${offsetDistance} ${currentUnit}`);
        }
    }

    function startArrayTool() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities to array');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content glass-card">
                <h3 class="text-lg font-bold mb-4">Array Settings</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-slate-400">Type</label>
                        <select id="array-type" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                            <option value="rectangular">Rectangular</option>
                            <option value="polar">Polar</option>
                        </select>
                    </div>
                    <div id="rectangular-options">
                        <div>
                            <label class="text-xs text-slate-400">Rows</label>
                            <input type="number" id="array-rows" value="3" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Columns</label>
                            <input type="number" id="array-cols" value="3" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Row Spacing</label>
                            <input type="number" id="array-row-spacing" value="${arraySpacing}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Column Spacing</label>
                            <input type="number" id="array-col-spacing" value="${arraySpacing}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                    </div>
                    <div id="polar-options" style="display: none;">
                        <div>
                            <label class="text-xs text-slate-400">Count</label>
                            <input type="number" id="array-count" value="6" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                        <div>
                            <label class="text-xs text-slate-400">Fill Angle</label>
                            <input type="number" id="array-angle" value="360" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                        </div>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="apply-array" class="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg text-sm">Apply</button>
                        <button id="cancel-array" class="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const arrayType = document.getElementById('array-type');
        const rectOptions = document.getElementById('rectangular-options');
        const polarOptions = document.getElementById('polar-options');

        arrayType.addEventListener('change', () => {
            if (arrayType.value === 'rectangular') {
                rectOptions.style.display = 'block';
                polarOptions.style.display = 'none';
            } else {
                rectOptions.style.display = 'none';
                polarOptions.style.display = 'block';
            }
        });

        document.getElementById('apply-array').addEventListener('click', () => {
            saveState();
            const factor = unitFactors[currentUnit] || 10;
            const newEntities = [];

            if (arrayType.value === 'rectangular') {
                const rows = parseInt(document.getElementById('array-rows').value);
                const cols = parseInt(document.getElementById('array-cols').value);
                const rowSpacing = parseFloat(document.getElementById('array-row-spacing').value) / factor;
                const colSpacing = parseFloat(document.getElementById('array-col-spacing').value) / factor;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        if (r === 0 && c === 0) continue;
                        const dx = c * colSpacing;
                        const dy = r * rowSpacing;

                        selectedEntityIndices.forEach(idx => {
                            const ent = entities[idx];
                            const cloned = cloneEntity(ent, dx, dy);
                            newEntities.push(cloned);
                        });
                    }
                }
            } else {
                const count = parseInt(document.getElementById('array-count').value);
                const fillAngle = parseFloat(document.getElementById('array-angle').value) * Math.PI / 180;
                const angleStep = fillAngle / count;

                const center = { x: 0, y: 0 };
                let totalX = 0, totalY = 0;
                let entityCount = 0;

                selectedEntityIndices.forEach(idx => {
                    const ent = entities[idx];
                    if (ent.type === 'line') {
                        totalX += (ent.x + ent.x2) / 2;
                        totalY += (ent.y + ent.y2) / 2;
                        entityCount++;
                    } else if (ent.type === 'circle' || ent.type === 'rect') {
                        totalX += ent.x;
                        totalY += ent.y;
                        entityCount++;
                    }
                });

                if (entityCount > 0) {
                    center.x = totalX / entityCount;
                    center.y = totalY / entityCount;
                }

                for (let i = 1; i < count; i++) {
                    const angle = i * angleStep;
                    selectedEntityIndices.forEach(idx => {
                        const ent = entities[idx];
                        const rotated = rotateEntity(ent, center, angle * 180 / Math.PI);
                        newEntities.push(rotated);
                    });
                }
            }

            entities.push(...newEntities);
            drawAllEntities();
            saveToStorage();
            showSaveIndicator(`${newEntities.length} items created in array`);
            document.body.removeChild(modal);
        });

        document.getElementById('cancel-array').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    function startStretchTool(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities to stretch');
            return;
        }
        stretchBasePoint = { x: world.x, y: world.y };
        isStretching = true;
        tempEntity = { x: world.x, y: world.y };
        showSaveIndicator('Select stretch point');
    }

    function updateStretchPreview(world) {
        if (!isStretching || !stretchBasePoint) return;
        tempEntity = { x: world.x, y: world.y };
        drawAllEntities();
    }

    function performStretch(targetPoint) {
        if (!stretchBasePoint || selectedEntityIndices.length === 0) return;

        saveState();
        const dx = targetPoint.x - stretchBasePoint.x;
        const dy = targetPoint.y - stretchBasePoint.y;

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];

            if (ent.type === 'line') {
                ent.x2 += dx;
                ent.y2 += dy;
            } else if (ent.type === 'rect') {
                ent.w += dx;
                ent.h += dy;
                if (ent.w < 0) {
                    ent.x += ent.w;
                    ent.w = Math.abs(ent.w);
                }
                if (ent.h < 0) {
                    ent.y += ent.h;
                    ent.h = Math.abs(ent.h);
                }
            } else if (ent.type === 'circle') {
                ent.radius += (dx + dy) / 2;
                ent.radius = Math.max(0.1, ent.radius);
            }
        });

        stretchBasePoint = null;
        isStretching = false;
        tempEntity = null;
        drawAllEntities();
        saveToStorage();
        showSaveIndicator('Stretch completed');
    }

    function breakEntityAtPoint(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select an entity to break');
            return;
        }

        saveState();
        const ent = entities[selectedEntityIndices[0]];

        if (ent.type === 'line') {
            const t = ((world.x - ent.x) * (ent.x2 - ent.x) + (world.y - ent.y) * (ent.y2 - ent.y)) /
                      (Math.pow(ent.x2 - ent.x, 2) + Math.pow(ent.y2 - ent.y, 2));

            if (t > 0 && t < 1) {
                const breakPoint = {
                    x: ent.x + t * (ent.x2 - ent.x),
                    y: ent.y + t * (ent.y2 - ent.y)
                };

                const line1 = {
                    type: 'line',
                    x: ent.x,
                    y: ent.y,
                    x2: breakPoint.x,
                    y2: breakPoint.y,
                    layer: ent.layer,
                    color: ent.color,
                    lineweight: ent.lineweight
                };

                const line2 = {
                    type: 'line',
                    x: breakPoint.x,
                    y: breakPoint.y,
                    x2: ent.x2,
                    y2: ent.y2,
                    layer: ent.layer,
                    color: ent.color,
                    lineweight: ent.lineweight
                };

                entities.splice(selectedEntityIndices[0], 1);
                entities.push(line1, line2);
                selectedEntityIndices = [];
                drawAllEntities();
                saveToStorage();
                showSaveIndicator('Line broken at point');
            }
        }
    }

    function joinEntities() {
        if (selectedEntityIndices.length < 2) {
            showSaveIndicator('Select at least two entities to join');
            return;
        }

        saveState();
        const entitiesToJoin = selectedEntityIndices.map(idx => entities[idx]);
        const firstEnt = entitiesToJoin[0];
        let allPoints = [];

        if (firstEnt.type === 'line') {
            allPoints = [{ x: firstEnt.x, y: firstEnt.y }, { x: firstEnt.x2, y: firstEnt.y2 }];

            for (let i = 1; i < entitiesToJoin.length; i++) {
                const ent = entitiesToJoin[i];
                if (ent.type === 'line') {
                    const lastPoint = allPoints[allPoints.length - 1];
                    if (Math.hypot(ent.x - lastPoint.x, ent.y - lastPoint.y) < 1) {
                        allPoints.push({ x: ent.x2, y: ent.y2 });
                    } else if (Math.hypot(ent.x2 - lastPoint.x, ent.y2 - lastPoint.y) < 1) {
                        allPoints.push({ x: ent.x, y: ent.y });
                    }
                }
            }

            const newPolyline = {
                type: 'polyline',
                points: allPoints,
                closed: false,
                layer: firstEnt.layer,
                color: firstEnt.color,
                lineweight: firstEnt.lineweight
            };

            selectedEntityIndices.sort((a, b) => b - a).forEach(idx => {
                entities.splice(idx, 1);
            });
            entities.push(newPolyline);
            selectedEntityIndices = [];
            drawAllEntities();
            saveToStorage();
            showSaveIndicator('Entities joined');
        }
    }

    function trimEntityAtPoint(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entity to trim');
            return;
        }

        saveState();
        const ent = entities[selectedEntityIndices[0]];

        if (ent.type === 'line') {
            const t = ((world.x - ent.x) * (ent.x2 - ent.x) + (world.y - ent.y) * (ent.y2 - ent.y)) /
                      (Math.pow(ent.x2 - ent.x, 2) + Math.pow(ent.y2 - ent.y, 2));

            if (t > 0 && t < 1) {
                const trimPoint = {
                    x: ent.x + t * (ent.x2 - ent.x),
                    y: ent.y + t * (ent.y2 - ent.y)
                };

                const newLine = {
                    type: 'line',
                    x: ent.x,
                    y: ent.y,
                    x2: trimPoint.x,
                    y2: trimPoint.y,
                    layer: ent.layer,
                    color: ent.color,
                    lineweight: ent.lineweight
                };

                entities.splice(selectedEntityIndices[0], 1);
                entities.push(newLine);
                selectedEntityIndices = [];
                drawAllEntities();
                saveToStorage();
                showSaveIndicator('Line trimmed');
            }
        }
    }

    function extendEntityToBoundary(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entity to extend');
            return;
        }

        saveState();
        const ent = entities[selectedEntityIndices[0]];

        if (ent.type === 'line') {
            const dx = ent.x2 - ent.x;
            const dy = ent.y2 - ent.y;
            const len = Math.hypot(dx, dy);
            const dirX = dx / len;
            const dirY = dy / len;

            const projection = (world.x - ent.x) * dirX + (world.y - ent.y) * dirY;

            if (projection > len) {
                ent.x2 = world.x;
                ent.y2 = world.y;
            } else if (projection < 0) {
                ent.x = world.x;
                ent.y = world.y;
            }

            drawAllEntities();
            saveToStorage();
            showSaveIndicator('Line extended');
        }

        selectedEntityIndices = [];
    }

    function scaleEntities() {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities to scale first');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content glass-card">
                <h3 class="text-lg font-bold mb-4">Scale Factor</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-slate-400">Scale Factor</label>
                        <input type="number" id="scale-factor" value="1" step="0.1" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="apply-scale" class="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg text-sm">Apply</button>
                        <button id="cancel-scale" class="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('apply-scale').addEventListener('click', () => {
            saveState();
            const factor = parseFloat(document.getElementById('scale-factor').value);
            if (factor > 0) {
                selectedEntityIndices.forEach(idx => {
                    const ent = entities[idx];
                    if (ent.type === 'line') {
                        ent.x *= factor;
                        ent.y *= factor;
                        ent.x2 *= factor;
                        ent.y2 *= factor;
                    } else if (ent.type === 'circle') {
                        ent.x *= factor;
                        ent.y *= factor;
                        ent.radius *= factor;
                    } else if (ent.type === 'rect') {
                        ent.x *= factor;
                        ent.y *= factor;
                        ent.w *= factor;
                        ent.h *= factor;
                    } else if (ent.type === 'polyline' || ent.type === 'spline') {
                        ent.points = ent.points.map(p => ({ x: p.x * factor, y: p.y * factor }));
                        if (ent.controlPoints) {
                            ent.controlPoints = ent.controlPoints.map(p => ({ x: p.x * factor, y: p.y * factor }));
                        }
                    } else if (ent.type === 'ellipse') {
                        ent.x *= factor;
                        ent.y *= factor;
                        ent.radiusX *= factor;
                        ent.radiusY *= factor;
                    } else if (ent.type === 'dimension') {
                        ent.x1 *= factor;
                        ent.y1 *= factor;
                        ent.x2 *= factor;
                        ent.y2 *= factor;
                        ent.textX *= factor;
                        ent.textY *= factor;
                        ent.length = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
                        ent.value = ent.formatLength(ent.length);
                    } else if (ent.type === 'arc-length-dimension') {
                        ent.x *= factor;
                        ent.y *= factor;
                        ent.radius *= factor;
                        ent.startPoint.x *= factor;
                        ent.startPoint.y *= factor;
                        ent.endPoint.x *= factor;
                        ent.endPoint.y *= factor;
                        ent.startExtPoint.x *= factor;
                        ent.startExtPoint.y *= factor;
                        ent.endExtPoint.x *= factor;
                        ent.endExtPoint.y *= factor;
                        ent.textX *= factor;
                        ent.textY *= factor;
                        ent.arcLength = ent.radius * ent.angleRad;
                        ent.value = ent.formatArcLength();
                    }
                });
                drawAllEntities();
                saveToStorage();
                showSaveIndicator(`Scaled by ${factor}x`);
            }
            document.body.removeChild(modal);
        });

        document.getElementById('cancel-scale').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    // ===== CLONE FUNCTIONS =====
    function startCloneTool(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities first!');
            return;
        }
        cloneBasePoint = { x: world.x, y: world.y };
        isCloning = true;
        tempEntity = { x: world.x, y: world.y };
        showSaveIndicator('Select base point');
    }

    function updateClonePreview(world) {
        if (!isCloning || !cloneBasePoint || selectedEntityIndices.length === 0) return;
        tempEntity = { x: world.x, y: world.y };
        drawAllEntities();
    }

    function drawClonePreview(ctx) {
        if (!isCloning || !cloneBasePoint || !tempEntity || selectedEntityIndices.length === 0) return;

        ctx.save();

        const dx = tempEntity.x - cloneBasePoint.x;
        const dy = tempEntity.y - cloneBasePoint.y;

        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const copied = cloneEntity(ent, dx, dy);

            if (copied.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(copied.x, copied.y);
                ctx.lineTo(copied.x2, copied.y2);
                ctx.stroke();
            } else if (copied.type === 'polyline') {
                if (copied.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(copied.points[0].x, copied.points[0].y);
                for (let i = 1; i < copied.points.length; i++) {
                    ctx.lineTo(copied.points[i].x, copied.points[i].y);
                }
                ctx.stroke();
            } else if (copied.type === 'spline') {
                if (copied.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(copied.points[0].x, copied.points[0].y);
                for (let i = 1; i < copied.points.length; i++) {
                    ctx.lineTo(copied.points[i].x, copied.points[i].y);
                }
                ctx.stroke();
            } else if (copied.type === 'rect') {
                ctx.strokeRect(copied.x, copied.y, copied.w, copied.h);
            } else if (copied.type === 'circle') {
                ctx.beginPath();
                ctx.arc(copied.x, copied.y, copied.radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (copied.type === 'ellipse') {
                drawEllipse(ctx, copied);
            } else if (copied.type === 'dimension') {
                drawDimension(ctx, copied);
            } else if (copied.type === 'arc-length-dimension') {
                drawArcLengthDimension(ctx, copied);
            } else if (copied.type === 'hatch') {
                drawHatch(ctx, copied);
            }
        });

        const distance = Math.hypot(dx, dy);

        ctx.fillStyle = '#4ade80';
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
        ctx.setLineDash([]);
        ctx.fillText(
            `ΔX: ${dx.toFixed(2)} ΔY: ${dy.toFixed(2)} Dist: ${distance.toFixed(2)}`,
            tempEntity.x + 10 / zoom,
            tempEntity.y - 10 / zoom
        );

        ctx.restore();
    }

    function cloneEntity(entity, dx, dy) {
        const cloned = JSON.parse(JSON.stringify(entity));

        if (cloned.type === 'line') {
            cloned.x += dx;
            cloned.y += dy;
            cloned.x2 += dx;
            cloned.y2 += dy;
        } else if (cloned.type === 'polyline' || cloned.type === 'spline') {
            cloned.points = cloned.points.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
            if (cloned.controlPoints) {
                cloned.controlPoints = cloned.controlPoints.map(p => ({
                    x: p.x + dx,
                    y: p.y + dy
                }));
            }
        } else if (cloned.type === 'rect') {
            cloned.x += dx;
            cloned.y += dy;
        } else if (cloned.type === 'circle') {
            cloned.x += dx;
            cloned.y += dy;
        } else if (cloned.type === 'ellipse') {
            cloned.x += dx;
            cloned.y += dy;
        } else if (cloned.type === 'arc') {
            cloned.x += dx;
            cloned.y += dy;
        } else if (cloned.type === 'dimension') {
            cloned.x1 += dx;
            cloned.y1 += dy;
            cloned.x2 += dx;
            cloned.y2 += dy;
            cloned.textX += dx;
            cloned.textY += dy;
        } else if (cloned.type === 'arc-length-dimension') {
            cloned.x += dx;
            cloned.y += dy;
            cloned.startPoint.x += dx;
            cloned.startPoint.y += dy;
            cloned.endPoint.x += dx;
            cloned.endPoint.y += dy;
            cloned.startExtPoint.x += dx;
            cloned.startExtPoint.y += dy;
            cloned.endExtPoint.x += dx;
            cloned.endExtPoint.y += dy;
            cloned.textX += dx;
            cloned.textY += dy;
        } else if (cloned.type === 'text') {
            cloned.x += dx;
            cloned.y += dy;
        } else if (cloned.type === 'hatch') {
            cloned.points = cloned.points.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
        }

        return cloned;
    }

    function performClone(targetPoint, makeCopy = true) {
        if (!cloneBasePoint || selectedEntityIndices.length === 0) return;

        saveState();
        const dx = targetPoint.x - cloneBasePoint.x;
        const dy = targetPoint.y - cloneBasePoint.y;

        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
            cloneBasePoint = null;
            isCloning = false;
            tempEntity = null;
            return;
        }

        const newEntities = [];

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const cloned = cloneEntity(ent, dx, dy);
            newEntities.push(cloned);
        });

        if (makeCopy) {
            entities.push(...newEntities);
            showSaveIndicator(`${newEntities.length} item(s) copied`);
        }

        cloneBasePoint = null;
        isCloning = false;
        tempEntity = null;
        drawAllEntities();
        saveToStorage();
    }

    // ===== MOVE FUNCTIONS =====
    function startMoveTool(world) {
        if (selectedEntityIndices.length === 0) {
            showSaveIndicator('Select entities first!');
            return;
        }
        moveBasePoint = { x: world.x, y: world.y };
        isMoving = true;
        tempEntity = { x: world.x, y: world.y };
        showSaveIndicator('Select base point');
    }

    function updateMovePreview(world) {
        if (!isMoving || !moveBasePoint || selectedEntityIndices.length === 0) return;
        tempEntity = { x: world.x, y: world.y };
        drawAllEntities();
    }

    function drawMovePreview(ctx) {
        if (!isMoving || !moveBasePoint || !tempEntity || selectedEntityIndices.length === 0) return;

        ctx.save();

        const dx = tempEntity.x - moveBasePoint.x;
        const dy = tempEntity.y - moveBasePoint.y;

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([]);

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            drawEntityPreview(ctx, ent, 0, 0, '#94a3b8');
        });

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            drawEntityPreview(ctx, ent, dx, dy, '#fbbf24');
        });

        const distance = Math.hypot(dx, dy);

        ctx.fillStyle = '#fbbf24';
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
        ctx.setLineDash([]);
        ctx.fillText(
            `ΔX: ${dx.toFixed(2)} ΔY: ${dy.toFixed(2)}`,
            tempEntity.x + 10 / zoom,
            tempEntity.y - 10 / zoom
        );

        ctx.restore();
    }

    function drawEntityPreview(ctx, entity, dx, dy, color) {
        ctx.save();
        ctx.strokeStyle = color;

        if (entity.type === 'line') {
            ctx.beginPath();
            ctx.moveTo(entity.x + dx, entity.y + dy);
            ctx.lineTo(entity.x2 + dx, entity.y2 + dy);
            ctx.stroke();
        } else if (entity.type === 'polyline' || entity.type === 'spline') {
            if (entity.points.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(entity.points[0].x + dx, entity.points[0].y + dy);
            for (let i = 1; i < entity.points.length; i++) {
                ctx.lineTo(entity.points[i].x + dx, entity.points[i].y + dy);
            }
            ctx.stroke();
        } else if (entity.type === 'rect') {
            ctx.strokeRect(entity.x + dx, entity.y + dy, entity.w, entity.h);
        } else if (entity.type === 'circle') {
            ctx.beginPath();
            ctx.arc(entity.x + dx, entity.y + dy, entity.radius, 0, 2 * Math.PI);
            ctx.stroke();
        } else if (entity.type === 'ellipse') {
            const tempEnt = { ...entity, x: entity.x + dx, y: entity.y + dy };
            drawEllipse(ctx, tempEnt);
        } else if (entity.type === 'dimension') {
            const dimCopy = { ...entity };
            dimCopy.x1 += dx; dimCopy.y1 += dy;
            dimCopy.x2 += dx; dimCopy.y2 += dy;
            dimCopy.textX += dx; dimCopy.textY += dy;
            drawDimension(ctx, dimCopy);
        } else if (entity.type === 'arc-length-dimension') {
            const arcDimCopy = { ...entity };
            arcDimCopy.x += dx; arcDimCopy.y += dy;
            arcDimCopy.startPoint.x += dx; arcDimCopy.startPoint.y += dy;
            arcDimCopy.endPoint.x += dx; arcDimCopy.endPoint.y += dy;
            arcDimCopy.startExtPoint.x += dx; arcDimCopy.startExtPoint.y += dy;
            arcDimCopy.endExtPoint.x += dx; arcDimCopy.endExtPoint.y += dy;
            arcDimCopy.textX += dx; arcDimCopy.textY += dy;
            drawArcLengthDimension(ctx, arcDimCopy);
        } else if (entity.type === 'hatch') {
            const hatchCopy = { ...entity };
            hatchCopy.points = entity.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            drawHatch(ctx, hatchCopy);
        }

        ctx.restore();
    }

    function performMove(targetPoint) {
        if (!moveBasePoint || selectedEntityIndices.length === 0) return;

        saveState();
        const dx = targetPoint.x - moveBasePoint.x;
        const dy = targetPoint.y - moveBasePoint.y;

        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) {
            moveBasePoint = null;
            isMoving = false;
            tempEntity = null;
            return;
        }

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];

            if (ent.type === 'line') {
                ent.x += dx;
                ent.y += dy;
                ent.x2 += dx;
                ent.y2 += dy;
            } else if (ent.type === 'polyline' || ent.type === 'spline') {
                ent.points = ent.points.map(p => ({
                    x: p.x + dx,
                    y: p.y + dy
                }));
                if (ent.controlPoints) {
                    ent.controlPoints = ent.controlPoints.map(p => ({
                        x: p.x + dx,
                        y: p.y + dy
                    }));
                }
            } else if (ent.type === 'rect') {
                ent.x += dx;
                ent.y += dy;
            } else if (ent.type === 'circle') {
                ent.x += dx;
                ent.y += dy;
            } else if (ent.type === 'ellipse') {
                ent.x += dx;
                ent.y += dy;
            } else if (ent.type === 'arc') {
                ent.x += dx;
                ent.y += dy;
            } else if (ent.type === 'dimension') {
                ent.x1 += dx;
                ent.y1 += dy;
                ent.x2 += dx;
                ent.y2 += dy;
                ent.textX += dx;
                ent.textY += dy;
            } else if (ent.type === 'arc-length-dimension') {
                ent.x += dx;
                ent.y += dy;
                ent.startPoint.x += dx;
                ent.startPoint.y += dy;
                ent.endPoint.x += dx;
                ent.endPoint.y += dy;
                ent.startExtPoint.x += dx;
                ent.startExtPoint.y += dy;
                ent.endExtPoint.x += dx;
                ent.endExtPoint.y += dy;
                ent.textX += dx;
                ent.textY += dy;
            } else if (ent.type === 'text') {
                ent.x += dx;
                ent.y += dy;
            } else if (ent.type === 'hatch') {
                ent.points = ent.points.map(p => ({
                    x: p.x + dx,
                    y: p.y + dy
                }));
            }
        });

        moveBasePoint = null;
        isMoving = false;
        tempEntity = null;
        drawAllEntities();
        saveToStorage();
        showSaveIndicator(`${selectedEntityIndices.length} item(s) moved`);
    }

    // ===== MIRROR FUNCTIONS =====
    function mirrorEntity(entity, p1, p2) {
        const mirrored = { ...entity };

        const mirrorX = p2.x - p1.x;
        const mirrorY = p2.y - p1.y;
        const length = Math.hypot(mirrorX, mirrorY);

        if (length === 0) return entity;

        const unitX = mirrorX / length;
        const unitY = mirrorY / length;

        if (entity.type === 'line') {
            const p1Mirrored = mirrorPoint(entity.x, entity.y, p1, unitX, unitY);
            const p2Mirrored = mirrorPoint(entity.x2, entity.y2, p1, unitX, unitY);
            mirrored.x = p1Mirrored.x;
            mirrored.y = p1Mirrored.y;
            mirrored.x2 = p2Mirrored.x;
            mirrored.y2 = p2Mirrored.y;
        } else if (entity.type === 'polyline' || entity.type === 'spline') {
            mirrored.points = entity.points.map(p => mirrorPoint(p.x, p.y, p1, unitX, unitY));
            if (entity.controlPoints) {
                mirrored.controlPoints = entity.controlPoints.map(p => mirrorPoint(p.x, p.y, p1, unitX, unitY));
            }
        } else if (entity.type === 'rect') {
            const p1Mirrored = mirrorPoint(entity.x, entity.y, p1, unitX, unitY);
            const p2Mirrored = mirrorPoint(entity.x + entity.w, entity.y + entity.h, p1, unitX, unitY);
            mirrored.x = Math.min(p1Mirrored.x, p2Mirrored.x);
            mirrored.y = Math.min(p1Mirrored.y, p2Mirrored.y);
            mirrored.w = Math.abs(p2Mirrored.x - p1Mirrored.x);
            mirrored.h = Math.abs(p2Mirrored.y - p1Mirrored.y);
        } else if (entity.type === 'circle') {
            const centerMirrored = mirrorPoint(entity.x, entity.y, p1, unitX, unitY);
            mirrored.x = centerMirrored.x;
            mirrored.y = centerMirrored.y;
        } else if (entity.type === 'ellipse') {
            const centerMirrored = mirrorPoint(entity.x, entity.y, p1, unitX, unitY);
            mirrored.x = centerMirrored.x;
            mirrored.y = centerMirrored.y;
        } else if (entity.type === 'dimension') {
            const p1Mirrored = mirrorPoint(entity.x1, entity.y1, p1, unitX, unitY);
            const p2Mirrored = mirrorPoint(entity.x2, entity.y2, p1, unitX, unitY);
            const textMirrored = mirrorPoint(entity.textX, entity.textY, p1, unitX, unitY);
            mirrored.x1 = p1Mirrored.x;
            mirrored.y1 = p1Mirrored.y;
            mirrored.x2 = p2Mirrored.x;
            mirrored.y2 = p2Mirrored.y;
            mirrored.textX = textMirrored.x;
            mirrored.textY = textMirrored.y;
        } else if (entity.type === 'hatch') {
            mirrored.points = entity.points.map(p => mirrorPoint(p.x, p.y, p1, unitX, unitY));
        }

        return mirrored;
    }

    function mirrorPoint(x, y, p1, unitX, unitY) {
        const dx = x - p1.x;
        const dy = y - p1.y;
        const dot = dx * unitX + dy * unitY;

        return {
            x: 2 * (p1.x + dot * unitX) - x,
            y: 2 * (p1.y + dot * unitY) - y
        };
    }

    function drawMirrorPreview(ctx) {
        if (!mirrorPoint1 || !tempEntity || selectedEntityIndices.length === 0) return;

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([3 / zoom, 3 / zoom]);

        ctx.beginPath();
        ctx.moveTo(mirrorPoint1.x, mirrorPoint1.y);
        ctx.lineTo(tempEntity.x, tempEntity.y);
        ctx.stroke();

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const mirrored = mirrorEntity(ent, mirrorPoint1, { x: tempEntity.x, y: tempEntity.y });

            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([]);

            if (mirrored.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(mirrored.x, mirrored.y);
                ctx.lineTo(mirrored.x2, mirrored.y2);
                ctx.stroke();
            } else if (mirrored.type === 'polyline' || mirrored.type === 'spline') {
                if (mirrored.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(mirrored.points[0].x, mirrored.points[0].y);
                for (let i = 1; i < mirrored.points.length; i++) {
                    ctx.lineTo(mirrored.points[i].x, mirrored.points[i].y);
                }
                ctx.stroke();
            } else if (mirrored.type === 'rect') {
                ctx.strokeRect(mirrored.x, mirrored.y, mirrored.w, mirrored.h);
            } else if (mirrored.type === 'circle') {
                ctx.beginPath();
                ctx.arc(mirrored.x, mirrored.y, mirrored.radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (mirrored.type === 'ellipse') {
                drawEllipse(ctx, mirrored);
            } else if (mirrored.type === 'dimension') {
                drawDimension(ctx, mirrored);
            } else if (mirrored.type === 'hatch') {
                drawHatch(ctx, mirrored);
            }
        });

        ctx.restore();
    }

    function performMirror(p2) {
        if (!mirrorPoint1 || selectedEntityIndices.length === 0) return;

        saveState();
        const newEntities = [];

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const mirrored = mirrorEntity(ent, mirrorPoint1, p2);

            newEntities.push({
                ...mirrored,
                layer: ent.layer,
                material: ent.material,
                color: ent.color,
                lineweight: ent.lineweight,
                linetype: ent.linetype
            });
        });

        entities.push(...newEntities);
        mirrorPoint1 = null;
        tempEntity = null;
        drawAllEntities();
        saveToStorage();
        showSaveIndicator('Mirror completed');
    }

    // ===== ROTATE FUNCTIONS =====
    function rotateEntity(entity, center, angleDeg) {
        const angle = angleDeg * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotated = { ...entity };

        if (entity.type === 'line') {
            const p1 = rotatePoint(entity.x, entity.y, center, cos, sin);
            const p2 = rotatePoint(entity.x2, entity.y2, center, cos, sin);
            rotated.x = p1.x;
            rotated.y = p1.y;
            rotated.x2 = p2.x;
            rotated.y2 = p2.y;
        } else if (entity.type === 'polyline' || entity.type === 'spline') {
            rotated.points = entity.points.map(p => rotatePoint(p.x, p.y, center, cos, sin));
            if (entity.controlPoints) {
                rotated.controlPoints = entity.controlPoints.map(p => rotatePoint(p.x, p.y, center, cos, sin));
            }
        } else if (entity.type === 'rect') {
            const p1 = rotatePoint(entity.x, entity.y, center, cos, sin);
            const p2 = rotatePoint(entity.x + entity.w, entity.y + entity.h, center, cos, sin);
            rotated.x = Math.min(p1.x, p2.x);
            rotated.y = Math.min(p1.y, p2.y);
            rotated.w = Math.abs(p2.x - p1.x);
            rotated.h = Math.abs(p2.y - p1.y);
        } else if (entity.type === 'circle') {
            const centerRotated = rotatePoint(entity.x, entity.y, center, cos, sin);
            rotated.x = centerRotated.x;
            rotated.y = centerRotated.y;
        } else if (entity.type === 'ellipse') {
            const centerRotated = rotatePoint(entity.x, entity.y, center, cos, sin);
            rotated.x = centerRotated.x;
            rotated.y = centerRotated.y;
        } else if (entity.type === 'dimension') {
            const p1 = rotatePoint(entity.x1, entity.y1, center, cos, sin);
            const p2 = rotatePoint(entity.x2, entity.y2, center, cos, sin);
            const text = rotatePoint(entity.textX, entity.textY, center, cos, sin);
            rotated.x1 = p1.x;
            rotated.y1 = p1.y;
            rotated.x2 = p2.x;
            rotated.y2 = p2.y;
            rotated.textX = text.x;
            rotated.textY = text.y;
        } else if (entity.type === 'hatch') {
            rotated.points = entity.points.map(p => rotatePoint(p.x, p.y, center, cos, sin));
        }

        return rotated;
    }

    function rotatePoint(x, y, center, cos, sin) {
        const dx = x - center.x;
        const dy = y - center.y;

        return {
            x: center.x + dx * cos - dy * sin,
            y: center.y + dx * sin + dy * cos
        };
    }

    function drawRotatePreview(ctx) {
        if (!rotateCenter || !tempEntity || selectedEntityIndices.length === 0) return;

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1 / zoom;
        ctx.setLineDash([3 / zoom, 3 / zoom]);

        ctx.beginPath();
        ctx.arc(rotateCenter.x, rotateCenter.y, 5 / zoom, 0, 2 * Math.PI);
        ctx.stroke();

        const angle = Math.atan2(tempEntity.y - rotateCenter.y, tempEntity.x - rotateCenter.x) - rotateStartAngle;
        const angleDeg = angle * 180 / Math.PI;

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const rotated = rotateEntity(ent, rotateCenter, angleDeg);

            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.5 / zoom;
            ctx.setLineDash([]);

            if (rotated.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(rotated.x, rotated.y);
                ctx.lineTo(rotated.x2, rotated.y2);
                ctx.stroke();
            } else if (rotated.type === 'polyline' || rotated.type === 'spline') {
                if (rotated.points.length < 2) return;
                ctx.beginPath();
                ctx.moveTo(rotated.points[0].x, rotated.points[0].y);
                for (let i = 1; i < rotated.points.length; i++) {
                    ctx.lineTo(rotated.points[i].x, rotated.points[i].y);
                }
                ctx.stroke();
            } else if (rotated.type === 'rect') {
                ctx.strokeRect(rotated.x, rotated.y, rotated.w, rotated.h);
            } else if (rotated.type === 'circle') {
                ctx.beginPath();
                ctx.arc(rotated.x, rotated.y, rotated.radius, 0, 2 * Math.PI);
                ctx.stroke();
            } else if (rotated.type === 'ellipse') {
                drawEllipse(ctx, rotated);
            } else if (rotated.type === 'dimension') {
                drawDimension(ctx, rotated);
            } else if (rotated.type === 'hatch') {
                drawHatch(ctx, rotated);
            }
        });

        ctx.restore();
    }

    function performRotate(anglePoint) {
        if (!rotateCenter || selectedEntityIndices.length === 0) return;

        saveState();
        const angle = Math.atan2(anglePoint.y - rotateCenter.y, anglePoint.x - rotateCenter.x) - rotateStartAngle;
        const angleDeg = angle * 180 / Math.PI;

        const newEntities = [];

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            const rotated = rotateEntity(ent, rotateCenter, angleDeg);

            newEntities.push({
                ...rotated,
                layer: ent.layer,
                material: ent.material,
                color: ent.color,
                lineweight: ent.lineweight,
                linetype: ent.linetype
            });
        });

        const indicesToRemove = [...selectedEntityIndices].sort((a, b) => b - a);
        indicesToRemove.forEach(idx => entities.splice(idx, 1));

        entities.push(...newEntities);
        selectedEntityIndices = [];
        rotateCenter = null;
        tempEntity = null;
        drawAllEntities();
        saveToStorage();
        showSaveIndicator(`Rotated ${Math.round(angleDeg)}°`);
    }

    // ===== DIMENSION FUNCTIONS =====
    class DimensionEntity {
        constructor(startPoint, endPoint, options = {}) {
            this.type = 'dimension';
            this.x1 = startPoint.x;
            this.y1 = startPoint.y;
            this.x2 = endPoint.x;
            this.y2 = endPoint.y;
            this.layer = options.layer || currentLayer;
            this.color = options.color || '#f97316';
            this.lineweight = options.lineweight || 1;
            this.linetype = options.linetype || 'solid';

            this.length = Math.hypot(this.x2 - this.x1, this.y2 - this.y1);
            this.angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
            this.offset = options.offset || 20;

            const midX = (this.x1 + this.x2) / 2;
            const midY = (this.y1 + this.y2) / 2;
            const perpX = Math.sin(this.angle) * this.offset;
            const perpY = -Math.cos(this.angle) * this.offset;

            this.textX = midX + perpX;
            this.textY = midY + perpY;

            this.precision = options.precision || 2;
            this.unit = options.unit || currentUnit;
            this.value = this.formatLength(this.length);
        }

        formatLength(length) {
            const factor = unitFactors[this.unit] || 10;
            const convertedLength = length / factor;
            return convertedLength.toFixed(this.precision);
        }
    }

    function drawDimension(ctx, dim) {
        ctx.save();

        ctx.strokeStyle = dim.color;
        ctx.lineWidth = dim.lineweight / zoom;
        ctx.fillStyle = dim.color;
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;

        if (dim.linetype === 'dashed') {
            ctx.setLineDash([5 / zoom, 3 / zoom]);
        } else {
            ctx.setLineDash([]);
        }

        const angle = dim.angle;
        const perpX = Math.sin(angle) * dim.offset;
        const perpY = -Math.cos(angle) * dim.offset;

        ctx.beginPath();
        ctx.moveTo(dim.x1, dim.y1);
        ctx.lineTo(dim.x1 + perpX, dim.y1 + perpY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(dim.x2, dim.y2);
        ctx.lineTo(dim.x2 + perpX, dim.y2 + perpY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(dim.x1 + perpX, dim.y1 + perpY);
        ctx.lineTo(dim.x2 + perpX, dim.y2 + perpY);
        ctx.stroke();

        drawArrowhead(ctx, dim.x1 + perpX, dim.y1 + perpY, angle);
        drawArrowhead(ctx, dim.x2 + perpX, dim.y2 + perpY, angle + Math.PI);

        ctx.fillStyle = '#fcd34d';
        ctx.fillText(
            `${dim.value} ${dim.unit}`,
            dim.textX + 5 / zoom,
            dim.textY - 5 / zoom
        );

        ctx.restore();
    }

    function drawArrowhead(ctx, x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-8 / zoom, -4 / zoom);
        ctx.lineTo(-8 / zoom, 4 / zoom);
        ctx.closePath();
        ctx.fillStyle = '#f97316';
        ctx.fill();
        ctx.restore();
    }

    function startDimensionTool(world) {
        dimensionStartPoint = { x: world.x, y: world.y };
        isDrawingDimension = true;
        drawing = true;
    }

    function updateDimensionPreview(world) {
        if (!isDrawingDimension || !dimensionStartPoint) return;

        let endPoint = { x: world.x, y: world.y };
        if (orthoMode) {
            endPoint = applyOrthoConstraint(dimensionStartPoint, endPoint);
        }

        tempEntity = {
            type: 'dimension_preview',
            x1: dimensionStartPoint.x,
            y1: dimensionStartPoint.y,
            x2: endPoint.x,
            y2: endPoint.y
        };

        drawAllEntities();
    }

    function finishDimensionTool(world) {
        if (!isDrawingDimension || !dimensionStartPoint) return;

        let endPoint = { x: world.x, y: world.y };
        if (orthoMode) {
            endPoint = applyOrthoConstraint(dimensionStartPoint, endPoint);
        }

        const distance = Math.hypot(endPoint.x - dimensionStartPoint.x, endPoint.y - dimensionStartPoint.y);

        if (distance > 1) {
            saveState();

            const dim = new DimensionEntity(
                dimensionStartPoint,
                endPoint,
                {
                    layer: currentLayer,
                    unit: currentUnit,
                    precision: 2
                }
            );

            // Ensure dimension has all required properties
            dim.length = Math.hypot(dim.x2 - dim.x1, dim.y2 - dim.y1);
            dim.value = dim.formatLength(dim.length);

            entities.push(dim);
            saveToStorage();
            showSaveIndicator('Dimension created: ' + dim.value + ' ' + dim.unit);
        }

        dimensionStartPoint = null;
        isDrawingDimension = false;
        drawing = false;
        tempEntity = null;
        drawAllEntities();
    }

    function drawDimensionPreview(ctx) {
        if (!isDrawingDimension || !dimensionStartPoint || !tempEntity || tempEntity.type !== 'dimension_preview') return;

        ctx.save();
        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);

        const dx = tempEntity.x2 - tempEntity.x1;
        const dy = tempEntity.y2 - tempEntity.y1;
        const angle = Math.atan2(dy, dx);
        const offset = 20;
        const perpX = Math.sin(angle) * offset;
        const perpY = -Math.cos(angle) * offset;

        ctx.beginPath();
        ctx.moveTo(tempEntity.x1, tempEntity.y1);
        ctx.lineTo(tempEntity.x1 + perpX, tempEntity.y1 + perpY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(tempEntity.x2, tempEntity.y2);
        ctx.lineTo(tempEntity.x2 + perpX, tempEntity.y2 + perpY);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(tempEntity.x1 + perpX, tempEntity.y1 + perpY);
        ctx.lineTo(tempEntity.x2 + perpX, tempEntity.y2 + perpY);
        ctx.stroke();

        const length = Math.hypot(dx, dy);
        const midX = (tempEntity.x1 + tempEntity.x2) / 2;
        const midY = (tempEntity.y1 + tempEntity.y2) / 2;
        const factor = unitFactors[currentUnit] || 10;
        const previewValue = (length / factor).toFixed(2);

        ctx.fillStyle = '#fcd34d';
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
        ctx.fillText(
            `${previewValue} ${currentUnit}`,
            midX + perpX + 5 / zoom,
            midY + perpY - 5 / zoom
        );

        ctx.restore();
    }

    function setDimensionType(type) {
        currentDimensionType = type;
        setTool('dimension');
        showSaveIndicator(`${type.charAt(0).toUpperCase() + type.slice(1)} Dimension tool active`);
    }

    // ===== ARC LENGTH DIMENSION FUNCTIONS =====
    class ArcLengthDimension {
        constructor(arcEntity, options = {}) {
            this.type = 'arc-length-dimension';
            this.arcId = arcEntity.id || Date.now();
            this.x = arcEntity.x;
            this.y = arcEntity.y;
            this.radius = arcEntity.radius;
            this.startAngle = arcEntity.startAngle || 0;
            this.endAngle = arcEntity.endAngle || Math.PI;
            this.layer = options.layer || currentLayer;
            this.color = options.color || '#f59e0b';
            this.lineweight = options.lineweight || 1;
            this.linetype = options.linetype || 'solid';

            this.angleRad = Math.abs(this.endAngle - this.startAngle);
            this.arcLength = this.radius * this.angleRad;
            this.offset = options.offset || 20;
            this.midAngle = this.startAngle + (this.angleRad / 2);

            this.textX = this.x + (this.radius + this.offset) * Math.cos(this.midAngle);
            this.textY = this.y + (this.radius + this.offset) * Math.sin(this.midAngle);

            this.startPoint = {
                x: this.x + this.radius * Math.cos(this.startAngle),
                y: this.y + this.radius * Math.sin(this.startAngle)
            };
            this.endPoint = {
                x: this.x + this.radius * Math.cos(this.endAngle),
                y: this.y + this.radius * Math.sin(this.endAngle)
            };
            this.startExtPoint = {
                x: this.x + (this.radius + this.offset) * Math.cos(this.startAngle),
                y: this.y + (this.radius + this.offset) * Math.sin(this.startAngle)
            };
            this.endExtPoint = {
                x: this.x + (this.radius + this.offset) * Math.cos(this.endAngle),
                y: this.y + (this.radius + this.offset) * Math.sin(this.endAngle)
            };

            this.precision = options.precision || 2;
            this.unit = options.unit || currentUnit;
            this.value = this.formatArcLength();
        }

        formatArcLength() {
            const factor = unitFactors[this.unit] || 10;
            const convertedLength = this.arcLength / factor;
            return convertedLength.toFixed(this.precision);
        }
    }

    function drawArcLengthDimension(ctx, dim) {
        ctx.save();

        ctx.strokeStyle = dim.color;
        ctx.lineWidth = dim.lineweight / zoom;
        ctx.fillStyle = dim.color;
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;

        if (dim.linetype === 'dashed') {
            ctx.setLineDash([5 / zoom, 3 / zoom]);
        } else {
            ctx.setLineDash([]);
        }

        ctx.beginPath();
        ctx.moveTo(dim.startPoint.x, dim.startPoint.y);
        ctx.lineTo(dim.startExtPoint.x, dim.startExtPoint.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(dim.endPoint.x, dim.endPoint.y);
        ctx.lineTo(dim.endExtPoint.x, dim.endExtPoint.y);
        ctx.stroke();

        ctx.beginPath();
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = dim.startAngle + (dim.angleRad * t);
            const x = dim.x + (dim.radius + dim.offset) * Math.cos(angle);
            const y = dim.y + (dim.radius + dim.offset) * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        drawArcArrowhead(ctx, dim.startExtPoint.x, dim.startExtPoint.y, dim.startAngle + Math.PI/2);
        drawArcArrowhead(ctx, dim.endExtPoint.x, dim.endExtPoint.y, dim.endAngle - Math.PI/2);

        ctx.fillStyle = '#fcd34d';
        ctx.setLineDash([]);
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
        ctx.fillText(
            `${dim.value} ${dim.unit}`,
            dim.textX + 5 / zoom,
            dim.textY - 5 / zoom
        );

        ctx.restore();
    }

    function drawArcArrowhead(ctx, x, y, angle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-8 / zoom, -4 / zoom);
        ctx.lineTo(-8 / zoom, 4 / zoom);
        ctx.closePath();
        ctx.fillStyle = '#f59e0b';
        ctx.fill();
        ctx.restore();
    }

    function findArcAtPoint(worldX, worldY) {
        let closestArc = null;
        let minDist = 20 / zoom;

        for (let i = 0; i < entities.length; i++) {
            const ent = entities[i];
            if (ent.type === 'arc') {
                const centerX = ent.x;
                const centerY = ent.y;
                const radius = ent.radius;
                const startAngle = ent.startAngle || 0;
                const endAngle = ent.endAngle || Math.PI;

                const dx = worldX - centerX;
                const dy = worldY - centerY;
                const pointAngle = Math.atan2(dy, dx);

                let angle = pointAngle;
                let start = startAngle;
                let end = endAngle;

                if (start > end) {
                    start -= Math.PI * 2;
                }

                if (angle >= start && angle <= end) {
                    const arcX = centerX + radius * Math.cos(angle);
                    const arcY = centerY + radius * Math.sin(angle);
                    const dist = Math.hypot(worldX - arcX, worldY - arcY);

                    if (dist < minDist) {
                        minDist = dist;
                        closestArc = { entity: ent, index: i, angle: angle };
                    }
                }
            }
        }

        return closestArc;
    }

    function startArcLengthDimension(world) {
        const arcInfo = findArcAtPoint(world.x, world.y);

        if (arcInfo) {
            selectedArcEntity = arcInfo.entity;
            isDrawingArcLength = true;

            arcLengthPreview = new ArcLengthDimension(selectedArcEntity, {
                offset: 20,
                layer: currentLayer,
                unit: currentUnit,
                precision: 2
            });

            showSaveIndicator('Select arc length dimension position');
            drawAllEntities();
        } else {
            showSaveIndicator('Click on an arc to dimension');
        }
    }

    function updateArcLengthPreview(world) {
        if (!isDrawingArcLength || !selectedArcEntity) return;

        const centerX = selectedArcEntity.x;
        const centerY = selectedArcEntity.y;
        const radius = selectedArcEntity.radius;
        const mouseRadius = Math.hypot(world.x - centerX, world.y - centerY);
        const offset = Math.max(5, mouseRadius - radius);

        arcLengthPreview = new ArcLengthDimension(selectedArcEntity, {
            offset: offset,
            layer: currentLayer,
            unit: currentUnit,
            precision: 2
        });

        drawAllEntities();
    }

    function finishArcLengthDimension(world) {
        if (!isDrawingArcLength || !selectedArcEntity) return;

        saveState();

        const centerX = selectedArcEntity.x;
        const centerY = selectedArcEntity.y;
        const radius = selectedArcEntity.radius;
        const mouseRadius = Math.hypot(world.x - centerX, world.y - centerY);
        const offset = Math.max(5, mouseRadius - radius);

        const arcDim = new ArcLengthDimension(selectedArcEntity, {
            offset: offset,
            layer: currentLayer,
            unit: currentUnit,
            precision: 2
        });

        // Ensure arc dimension has all required properties
        arcDim.arcLength = arcDim.radius * arcDim.angleRad;
        arcDim.value = arcDim.formatArcLength();

        entities.push(arcDim);
        saveToStorage();
        showSaveIndicator(`Arc Length: ${arcDim.value} ${currentUnit}`);

        selectedArcEntity = null;
        isDrawingArcLength = false;
        arcLengthPreview = null;
        drawAllEntities();
    }

    function cancelArcLengthDimension() {
        selectedArcEntity = null;
        isDrawingArcLength = false;
        arcLengthPreview = null;
        tempEntity = null;
        drawAllEntities();
        showSaveIndicator('Arc length dimension cancelled');
        setTool('select');
    }

    function drawArcLengthPreview(ctx) {
        if (!isDrawingArcLength || !arcLengthPreview) return;

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);

        ctx.beginPath();
        ctx.moveTo(arcLengthPreview.startPoint.x, arcLengthPreview.startPoint.y);
        ctx.lineTo(arcLengthPreview.startExtPoint.x, arcLengthPreview.startExtPoint.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(arcLengthPreview.endPoint.x, arcLengthPreview.endPoint.y);
        ctx.lineTo(arcLengthPreview.endExtPoint.x, arcLengthPreview.endExtPoint.y);
        ctx.stroke();

        ctx.beginPath();
        const steps = 20;
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const angle = arcLengthPreview.startAngle + (arcLengthPreview.angleRad * t);
            const x = arcLengthPreview.x + (arcLengthPreview.radius + arcLengthPreview.offset) * Math.cos(angle);
            const y = arcLengthPreview.y + (arcLengthPreview.radius + arcLengthPreview.offset) * Math.sin(angle);
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        ctx.fillStyle = '#fcd34d';
        ctx.setLineDash([]);
        ctx.font = `${12 / zoom}px "JetBrains Mono", monospace`;
        ctx.fillText(
            `${arcLengthPreview.value} ${arcLengthPreview.unit}`,
            arcLengthPreview.textX + 5 / zoom,
            arcLengthPreview.textY - 5 / zoom
        );

        ctx.restore();
    }

    // ===== ZOOM FUNCTIONS =====
    function handleMouseWheel(e) {
        e.preventDefault();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        const worldPos = screenToWorld(mouseX, mouseY);

        const zoomFactor = 1.1;
        if (e.deltaY < 0) {
            zoom *= zoomFactor;
        } else {
            zoom /= zoomFactor;
        }

        zoom = Math.max(0.1, Math.min(10, zoom));

        const newScreenPos = worldToScreen(worldPos.x, worldPos.y);
        panX += mouseX - newScreenPos.x;
        panY += mouseY - newScreenPos.y;

        drawAllEntities();
        updateLivePoint(e);
    }

    function zoomIn() {
        zoom *= 1.2;
        zoom = Math.min(10, zoom);
        drawAllEntities();
    }

    function zoomOut() {
        zoom /= 1.2;
        zoom = Math.max(0.1, zoom);
        drawAllEntities();
    }

    function zoomExtents() {
        if (entities.length === 0) return;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        entities.forEach(ent => {
            if (ent.type === 'line') {
                minX = Math.min(minX, ent.x, ent.x2);
                minY = Math.min(minY, ent.y, ent.y2);
                maxX = Math.max(maxX, ent.x, ent.x2);
                maxY = Math.max(maxY, ent.y, ent.y2);
            } else if (ent.type === 'polyline' || ent.type === 'spline') {
                ent.points.forEach(p => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
            } else if (ent.type === 'rect') {
                minX = Math.min(minX, ent.x, ent.x + ent.w);
                minY = Math.min(minY, ent.y, ent.y + ent.h);
                maxX = Math.max(maxX, ent.x, ent.x + ent.w);
                maxY = Math.max(maxY, ent.y, ent.y + ent.h);
            } else if (ent.type === 'circle') {
                minX = Math.min(minX, ent.x - ent.radius);
                minY = Math.min(minY, ent.y - ent.radius);
                maxX = Math.max(maxX, ent.x + ent.radius);
                maxY = Math.max(maxY, ent.y + ent.radius);
            } else if (ent.type === 'ellipse') {
                minX = Math.min(minX, ent.x - ent.radiusX);
                minY = Math.min(minY, ent.y - ent.radiusY);
                maxX = Math.max(maxX, ent.x + ent.radiusX);
                maxY = Math.max(maxY, ent.y + ent.radiusY);
            } else if (ent.type === 'dimension') {
                minX = Math.min(minX, ent.x1, ent.x2, ent.textX);
                minY = Math.min(minY, ent.y1, ent.y2, ent.textY);
                maxX = Math.max(maxX, ent.x1, ent.x2, ent.textX);
                maxY = Math.max(maxY, ent.y1, ent.y2, ent.textY);
            } else if (ent.type === 'arc-length-dimension') {
                minX = Math.min(minX, ent.startPoint.x, ent.endPoint.x, ent.textX);
                minY = Math.min(minY, ent.startPoint.y, ent.endPoint.y, ent.textY);
                maxX = Math.max(maxX, ent.startPoint.x, ent.endPoint.x, ent.textX);
                maxY = Math.max(maxY, ent.startPoint.y, ent.endPoint.y, ent.textY);
            } else if (ent.type === 'text') {
                minX = Math.min(minX, ent.x);
                minY = Math.min(minY, ent.y);
                maxX = Math.max(maxX, ent.x);
                maxY = Math.max(maxY, ent.y);
            } else if (ent.type === 'hatch') {
                ent.points.forEach(p => {
                    minX = Math.min(minX, p.x);
                    minY = Math.min(minY, p.y);
                    maxX = Math.max(maxX, p.x);
                    maxY = Math.max(maxY, p.y);
                });
            }
        });

        const width = maxX - minX;
        const height = maxY - minY;
        const margin = 40;

        if (width === 0 && height === 0) return;

        const zoomX = (canvas.width - 100) / (width + margin * 2);
        const zoomY = (canvas.height - 100) / (height + margin * 2);
        zoom = Math.min(zoomX, zoomY);
        zoom = Math.max(0.1, Math.min(10, zoom));

        panX = (canvas.width / 2) - ((minX + maxX) / 2) * zoom;
        panY = (canvas.height / 2) - ((minY + maxY) / 2) * zoom;

        drawAllEntities();
    }

    // ===== PAN FUNCTIONS =====
    function startPan(e) {
        isPanning = true;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        canvas.style.cursor = 'grabbing';
        canvas.classList.add('panning');
    }

    function doPan(e) {
        if (!isPanning) return;
        const dx = e.clientX - lastPanX;
        const dy = e.clientY - lastPanY;
        panX += dx;
        panY += dy;
        lastPanX = e.clientX;
        lastPanY = e.clientY;
        drawAllEntities();
        updateLivePoint(e);
    }

    function stopPan() {
        isPanning = false;
        canvas.style.cursor = panMode ? 'grab' : 'crosshair';
        canvas.classList.remove('panning');
    }

    // ===== LAYERS FUNCTIONS =====
    function updateLayersList() {
        const layersList = document.getElementById('layers-list');
        const layerSelect = document.getElementById('prop-layer');

        if (!layersList || !layerSelect) return;

        layersList.innerHTML = '';
        layerSelect.innerHTML = '';

        layers.forEach(layer => {
            const layerItem = document.createElement('div');
            layerItem.className = `layer-item ${currentLayer === layer.id ? 'active' : ''}`;
            layerItem.innerHTML = `
                <div class="layer-color" style="background: ${layer.color}"></div>
                <span class="flex-1 text-xs">${layer.name}</span>
                <button class="layer-visibility text-xs ${layer.visible ? 'text-indigo-400' : 'text-slate-600'}" data-layer="${layer.id}">
                    <i class="fas ${layer.visible ? 'fa-eye' : 'fa-eye-slash'}"></i>
                </button>
                <button class="layer-lock text-xs ${layer.locked ? 'text-indigo-400' : 'text-slate-600'}" data-layer="${layer.id}">
                    <i class="fas ${layer.locked ? 'fa-lock' : 'fa-lock-open'}"></i>
                </button>
            `;

            layerItem.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    currentLayer = layer.id;
                    updateLayersList();
                }
            });

            layersList.appendChild(layerItem);

            const option = document.createElement('option');
            option.value = layer.id;
            option.textContent = layer.name;
            option.selected = currentLayer === layer.id;
            layerSelect.appendChild(option);

            const visBtn = layerItem.querySelector('.layer-visibility');
            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.visible = !layer.visible;
                drawAllEntities();
                updateLayersList();
            });

            const lockBtn = layerItem.querySelector('.layer-lock');
            lockBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                layer.locked = !layer.locked;
                updateLayersList();
            });
        });
    }

    function addLayer() {
        const newLayer = {
            id: Date.now().toString(),
            name: `Layer ${layers.length}`,
            color: '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
            visible: true,
            locked: false,
            transparency: 0
        };
        layers.push(newLayer);
        updateLayersList();
        saveToStorage();
    }

    // ===== MATERIALS FUNCTIONS =====
    function updateMaterialsList() {
        const materialsList = document.getElementById('materials-list');
        const materialSelect = document.getElementById('prop-material');

        if (!materialsList || !materialSelect) return;

        materialsList.innerHTML = '';
        materialSelect.innerHTML = '';

        materials.forEach(material => {
            const materialItem = document.createElement('div');
            materialItem.className = `material-item ${currentMaterial === material.id ? 'active' : ''}`;
            materialItem.innerHTML = `
                <div class="material-color" style="background: ${material.color}"></div>
                <span class="flex-1 text-xs">${material.name}</span>
                <span class="text-xs text-slate-500">${material.density} kg/m³</span>
            `;

            materialItem.addEventListener('click', () => {
                currentMaterial = material.id;
                if (selectedEntityIndices.length > 0) {
                    saveState();
                    selectedEntityIndices.forEach(idx => {
                        entities[idx].material = material.id;
                    });
                    drawAllEntities();
                    saveToStorage();
                }
                updateMaterialsList();
            });

            materialsList.appendChild(materialItem);

            const option = document.createElement('option');
            option.value = material.id;
            option.textContent = material.name;
            option.selected = currentMaterial === material.id;
            materialSelect.appendChild(option);
        });
    }

    function addMaterial() {
        const name = prompt('Enter material name:');
        if (!name) return;

        const color = prompt('Enter color (hex or name):', '#94a3b8');
        const density = parseFloat(prompt('Enter density (kg/m³):', '2400'));
        const cost = parseFloat(prompt('Enter cost per unit:', '100'));

        const newMaterial = {
            id: Date.now().toString(),
            name: name,
            color: color || '#94a3b8',
            pattern: 'solid',
            density: density || 2400,
            cost: cost || 100
        };

        materials.push(newMaterial);
        updateMaterialsList();
        saveToStorage();
        showSaveIndicator('Material added');
    }

    // ===== PROPERTIES PANEL =====
    function updatePropertiesPanel() {
        const propLayer = document.getElementById('prop-layer');
        const propMaterial = document.getElementById('prop-material');
        const propColor = document.getElementById('prop-color');
        const propColorHex = document.getElementById('prop-color-hex');
        const propLineweight = document.getElementById('prop-lineweight');
        const propLinetype = document.getElementById('prop-linetype');
        const propTransparency = document.getElementById('prop-transparency');
        const transparencyValue = document.getElementById('transparency-value');

        if (selectedEntityIndices.length === 0) {
            if (propLayer) propLayer.disabled = true;
            if (propMaterial) propMaterial.disabled = true;
            if (propColor) propColor.disabled = true;
            if (propColorHex) propColorHex.disabled = true;
            if (propLineweight) propLineweight.disabled = true;
            if (propLinetype) propLinetype.disabled = true;
            if (propTransparency) propTransparency.disabled = true;
            return;
        }

        if (propLayer) propLayer.disabled = false;
        if (propMaterial) propMaterial.disabled = false;
        if (propColor) propColor.disabled = false;
        if (propColorHex) propColorHex.disabled = false;
        if (propLineweight) propLineweight.disabled = false;
        if (propLinetype) propLinetype.disabled = false;
        if (propTransparency) propTransparency.disabled = false;

        const firstEnt = entities[selectedEntityIndices[0]];

        if (propLayer) propLayer.value = firstEnt.layer || '0';
        if (propMaterial) propMaterial.value = firstEnt.material || '1';
        if (propColor) propColor.value = firstEnt.color || '#94a3b8';
        if (propColorHex) propColorHex.value = firstEnt.color || '#94a3b8';
        if (propLineweight) propLineweight.value = firstEnt.lineweight || 1;
        if (propLinetype) propLinetype.value = firstEnt.linetype || 'solid';
        if (propTransparency) {
            propTransparency.value = firstEnt.transparency || 0;
            if (transparencyValue) transparencyValue.textContent = firstEnt.transparency || 0;
        }
    }

    // ===== GRID DRAWING =====
    function drawGrid(ctx) {
        ctx.strokeStyle = isDarkTheme ? '#2d3b4f' : '#e2e8f0';
        ctx.lineWidth = 0.5 / zoom;
        ctx.setLineDash([]);

        const startX = Math.floor(-panX / zoom / 40) * 40 - 40;
        const startY = Math.floor(-panY / zoom / 40) * 40 - 40;
        const endX = startX + (canvas.width / zoom) + 80;
        const endY = startY + (canvas.height / zoom) + 80;

        for (let x = startX; x < endX; x += 40) {
            ctx.beginPath();
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
            ctx.stroke();
        }
        for (let y = startY; y < endY; y += 40) {
            ctx.beginPath();
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
    }

    // ===== SELECTION BOX =====
    function drawSelectionBox(ctx) {
        if (!selectionBox) return;

        ctx.save();
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);
        ctx.fillStyle = 'rgba(78, 70, 229, 0.2)';

        const x = Math.min(selectionBox.x1, selectionBox.x2);
        const y = Math.min(selectionBox.y1, selectionBox.y2);
        const w = Math.abs(selectionBox.x2 - selectionBox.x1);
        const h = Math.abs(selectionBox.y2 - selectionBox.y1);

        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        ctx.restore();
    }

    // ===== STRETCH PREVIEW =====
    function drawStretchPreview(ctx) {
        if (!isStretching || !stretchBasePoint || !tempEntity) return;

        ctx.save();
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 1.5 / zoom;
        ctx.setLineDash([5 / zoom, 3 / zoom]);

        const dx = tempEntity.x - stretchBasePoint.x;
        const dy = tempEntity.y - stretchBasePoint.y;

        selectedEntityIndices.forEach(idx => {
            const ent = entities[idx];
            if (ent.type === 'line') {
                ctx.beginPath();
                ctx.moveTo(ent.x, ent.y);
                ctx.lineTo(ent.x2 + dx, ent.y2 + dy);
                ctx.stroke();
            } else if (ent.type === 'rect') {
                ctx.strokeRect(ent.x, ent.y, ent.w + dx, ent.h + dy);
            } else if (ent.type === 'circle') {
                ctx.beginPath();
                ctx.arc(ent.x, ent.y, ent.radius + (dx + dy) / 2, 0, 2 * Math.PI);
                ctx.stroke();
            }
        });

        ctx.fillStyle = '#f97316';
        ctx.font = `${12 / zoom}px monospace`;
        ctx.fillText(
            `ΔX: ${dx.toFixed(2)} ΔY: ${dy.toFixed(2)}`,
            tempEntity.x + 10 / zoom,
            tempEntity.y - 10 / zoom
        );

        ctx.restore();
    }

    // ===== UTILITY FUNCTIONS =====
    function lineIntersectsRect(x1, y1, x2, y2, rx1, ry1, rx2, ry2) {
        if (x1 >= rx1 && x1 <= rx2 && y1 >= ry1 && y1 <= ry2) return true;
        if (x2 >= rx1 && x2 <= rx2 && y2 >= ry1 && y2 <= ry2) return true;

        if (lineIntersectsLine(x1, y1, x2, y2, rx1, ry1, rx2, ry1)) return true;
        if (lineIntersectsLine(x1, y1, x2, y2, rx2, ry1, rx2, ry2)) return true;
        if (lineIntersectsLine(x1, y1, x2, y2, rx1, ry2, rx2, ry2)) return true;
        if (lineIntersectsLine(x1, y1, x2, y2, rx1, ry1, rx1, ry2)) return true;

        return false;
    }

    function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
        const denominator = ((x2 - x1) * (y4 - y3)) - ((y2 - y1) * (x4 - x3));
        if (denominator === 0) return false;

        const ua = (((x4 - x3) * (y1 - y3)) - ((y4 - y3) * (x1 - x3))) / denominator;
        const ub = (((x2 - x1) * (y1 - y3)) - ((y2 - y1) * (x1 - x3))) / denominator;

        return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    }

    function rectIntersectsRect(r1x1, r1y1, r1x2, r1y2, r2x1, r2y1, r2x2, r2y2) {
        return !(r1x2 < r2x1 || r1x1 > r2x2 || r1y2 < r2y1 || r1y1 > r2y2);
    }

    function circleIntersectsRect(cx, cy, r, rx1, ry1, rx2, ry2) {
        const closestX = Math.max(rx1, Math.min(cx, rx2));
        const closestY = Math.max(ry1, Math.min(cy, ry2));
        const dx = cx - closestX;
        const dy = cy - closestY;
        return (dx * dx + dy * dy) <= r * r;
    }

    function distanceToSegment(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;

        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;

        let xx, yy;
        if (param < 0) { xx = x1; yy = y1; }
        else if (param > 1) { xx = x2; yy = y2; }
        else { xx = x1 + param * C; yy = y1 + param * D; }

        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ===== FILE MENU FUNCTIONS =====
    function newDrawing() {
        if (confirm('Create new drawing? All unsaved work will be lost.')) {
            saveState();

            entities = [];
            selectedEntityIndices = [];
            drawing = false;
            tempEntity = null;
            polylinePoints = [];
            continuousLinePoints = [];
            isDrawingContinuousLine = false;
            continuousLineStartPoint = null;
            dimensionStartPoint = null;
            isDrawingDimension = false;
            isDrawingArcLength = false;
            selectedArcEntity = null;
            arcLengthPreview = null;
            splinePoints = [];
            isDrawingSpline = false;
            ellipseCenter = null;
            isDrawingEllipse = false;
            hatchPoints = [];
            isDrawingHatch = false;
            mirrorPoint1 = null;
            rotateCenter = null;
            cloneBasePoint = null;
            isCloning = false;
            moveBasePoint = null;
            isMoving = false;
            stretchBasePoint = null;
            isStretching = false;
            hoveredEntityIndex = -1;
            isSelecting = false;
            selectionBox = null;
            panX = 0;
            panY = 0;
            zoom = 1;

            localStorage.removeItem('architectCAD');

            drawAllEntities();
            showSaveIndicator('New drawing created');
            setTool('select');
        }
    }

    function saveDrawing() {
        saveToStorage();
        addRecentFile('Untitled Drawing');
        showSaveIndicator('Drawing saved');
    }

    function saveAsDrawing() {
        try {
            entities.forEach(ent => {
                if (ent.type === 'dimension') {
                    ent.length = Math.hypot(ent.x2 - ent.x1, ent.y2 - ent.y1);
                    ent.value = (ent.length / (unitFactors[ent.unit || currentUnit] || 10)).toFixed(ent.precision || 2);
                }
                if (ent.type === 'arc-length-dimension') {
                    ent.arcLength = ent.radius * ent.angleRad;
                    ent.value = (ent.arcLength / (unitFactors[ent.unit || currentUnit] || 10)).toFixed(ent.precision || 2);
                }
            });

            const data = JSON.stringify({
                entities: entities,
                layers: layers,
                materials: materials,
                currentLayer: currentLayer,
                currentMaterial: currentMaterial,
                unit: currentUnit,
                snap: snapGrid,
                version: VERSION,
                savedAt: new Date().toISOString()
            }, null, 2);

            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `architect_cad_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.cad`;
            document.body.appendChild(a);
            a.click();

            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);

            addRecentFile(a.download);
            showSaveIndicator('Drawing saved as file');
        } catch(e) {
            console.error('Save failed:', e);
            showSaveIndicator('Save failed');
        }
    }

    function exportDXF() {
        let dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1021
9
$INSBASE
10
0.0
20
0.0
30
0.0
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
${layers.length}
`;

        layers.forEach((layer) => {
            dxfContent += `0
LAYER
2
${layer.name}
70
0
62
${parseInt(layer.color.replace('#', '0x'))}
6
CONTINUOUS
0
`;
        });

        dxfContent += `0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

        entities.forEach(ent => {
            const layer = layers.find(l => l.id === ent.layer)?.name || '0';

            if (ent.type === 'line') {
                dxfContent += `0
LINE
8
${layer}
10
${(ent.x).toFixed(6)}
20
${(ent.y).toFixed(6)}
11
${(ent.x2).toFixed(6)}
21
${(ent.y2).toFixed(6)}
0
`;
            }
            else if (ent.type === 'circle') {
                dxfContent += `0
CIRCLE
8
${layer}
10
${(ent.x).toFixed(6)}
20
${(ent.y).toFixed(6)}
40
${(ent.radius).toFixed(6)}
0
`;
            }
            else if (ent.type === 'arc') {
                const startAngle = ((ent.startAngle || 0) * 180 / Math.PI).toFixed(6);
                const endAngle = ((ent.endAngle || Math.PI) * 180 / Math.PI).toFixed(6);
                dxfContent += `0
ARC
8
${layer}
10
${(ent.x).toFixed(6)}
20
${(ent.y).toFixed(6)}
40
${(ent.radius).toFixed(6)}
50
${startAngle}
51
${endAngle}
0
`;
            }
            else if (ent.type === 'ellipse') {
                const majorAxis = Math.max(ent.radiusX, ent.radiusY);
                const minorAxis = Math.min(ent.radiusX, ent.radiusY);
                const ratio = minorAxis / majorAxis;
                dxfContent += `0
ELLIPSE
8
${layer}
10
${(ent.x).toFixed(6)}
20
${(ent.y).toFixed(6)}
11
${majorAxis.toFixed(6)}
21
0
31
0
40
${ratio.toFixed(6)}
41
0
42
${2 * Math.PI}
0
`;
            }
            else if (ent.type === 'rect') {
                const x1 = ent.x;
                const y1 = ent.y;
                const x2 = ent.x + ent.w;
                const y2 = ent.y + ent.h;

                dxfContent += `0
LINE
8
${layer}
10
${x1.toFixed(6)}
20
${y1.toFixed(6)}
11
${x2.toFixed(6)}
21
${y1.toFixed(6)}
0
0
LINE
8
${layer}
10
${x1.toFixed(6)}
20
${y2.toFixed(6)}
11
${x2.toFixed(6)}
21
${y2.toFixed(6)}
0
0
LINE
8
${layer}
10
${x1.toFixed(6)}
20
${y1.toFixed(6)}
11
${x1.toFixed(6)}
21
${y2.toFixed(6)}
0
0
LINE
8
${layer}
10
${x2.toFixed(6)}
20
${y1.toFixed(6)}
11
${x2.toFixed(6)}
21
${y2.toFixed(6)}
0
`;
            }
            else if (ent.type === 'polyline' && ent.points.length >= 2) {
                dxfContent += `0
POLYLINE
8
${layer}
66
1
10
0
20
0
70
${ent.closed ? 1 : 0}
0
`;
                ent.points.forEach(p => {
                    dxfContent += `0
VERTEX
8
${layer}
10
${p.x.toFixed(6)}
20
${p.y.toFixed(6)}
0
`;
                });
                dxfContent += `0
SEQEND
0
`;
            }
            else if (ent.type === 'spline' && ent.points.length >= 2) {
                dxfContent += `0
POLYLINE
8
${layer}
66
1
10
0
20
0
70
0
0
`;
                ent.points.forEach(p => {
                    dxfContent += `0
VERTEX
8
${layer}
10
${p.x.toFixed(6)}
20
${p.y.toFixed(6)}
0
`;
                });
                dxfContent += `0
SEQEND
0
`;
            }
            else if (ent.type === 'text') {
                dxfContent += `0
TEXT
8
${layer}
10
${ent.x.toFixed(6)}
20
${ent.y.toFixed(6)}
40
${ent.fontSize || 2.5}
1
${ent.text}
0
`;
            }
            else if (ent.type === 'dimension') {
                dxfContent += `0
DIMENSION
8
${layer}
10
${((ent.x1 + ent.x2) / 2).toFixed(6)}
20
${((ent.y1 + ent.y2) / 2).toFixed(6)}
11
${ent.textX.toFixed(6)}
21
${ent.textY.toFixed(6)}
70
32
1
${ent.value}
0
`;
            }
            else if (ent.type === 'hatch') {
                dxfContent += `0
SOLID
8
${layer}
10
${ent.points[0]?.x.toFixed(6) || 0}
20
${ent.points[0]?.y.toFixed(6) || 0}
11
${ent.points[1]?.x.toFixed(6) || 0}
21
${ent.points[1]?.y.toFixed(6) || 0}
12
${ent.points[2]?.x.toFixed(6) || 0}
22
${ent.points[2]?.y.toFixed(6) || 0}
0
`;
            }
        });

        dxfContent += `0
ENDSEC
0
EOF`;

        const blob = new Blob([dxfContent], { type: 'application/dxf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.dxf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showSaveIndicator('Exported as DXF - Ready for AutoCAD');
    }

    function exportSVG() {
        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-panX/zoom} ${-panY/zoom} ${canvas.width/zoom} ${canvas.height/zoom}">`;

        entities.forEach(ent => {
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible) return;
            const color = ent.color || layer.color;

            if (ent.type === 'line') {
                svgContent += `<line x1="${ent.x}" y1="${ent.y}" x2="${ent.x2}" y2="${ent.y2}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'circle') {
                svgContent += `<circle cx="${ent.x}" cy="${ent.y}" r="${ent.radius}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'rect') {
                svgContent += `<rect x="${ent.x}" y="${ent.y}" width="${ent.w}" height="${ent.h}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'polyline') {
                let points = ent.points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polyline points="${points}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'spline') {
                let points = ent.points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polyline points="${points}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'ellipse') {
                svgContent += `<ellipse cx="${ent.x}" cy="${ent.y}" rx="${ent.radiusX}" ry="${ent.radiusY}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'text') {
                svgContent += `<text x="${ent.x}" y="${ent.y}" fill="${color}" font-size="${ent.fontSize}">${ent.text}</text>`;
            } else if (ent.type === 'hatch') {
                let points = ent.points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polygon points="${points}" fill="${color}" fill-opacity="0.3" stroke="${color}" stroke-width="${ent.lineweight || 1}"/>`;
            }
        });

        svgContent += `</svg>`;

        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `drawing_${new Date().toISOString().slice(0,19)}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        showSaveIndicator('Exported as SVG');
    }

    function exportPNG() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        tempCtx.fillStyle = isDarkTheme ? '#0f172a' : '#f1f5f9';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
        tempCtx.drawImage(canvas, 0, 0);

        const link = document.createElement('a');
        link.download = `drawing_${new Date().toISOString().slice(0,19)}.png`;
        link.href = tempCanvas.toDataURL();
        link.click();
        showSaveIndicator('Exported as PNG');
    }

    function exportPDF() {
        showSaveIndicator('PDF export coming soon...');
    }

    function printDrawing() {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-panX/zoom} ${-panY/zoom} ${canvas.width/zoom} ${canvas.height/zoom}">`;

        entities.forEach(ent => {
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible) return;
            const color = ent.color || layer.color;

            if (ent.type === 'line') {
                svgContent += `<line x1="${ent.x}" y1="${ent.y}" x2="${ent.x2}" y2="${ent.y2}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'circle') {
                svgContent += `<circle cx="${ent.x}" cy="${ent.y}" r="${ent.radius}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'rect') {
                svgContent += `<rect x="${ent.x}" y="${ent.y}" width="${ent.w}" height="${ent.h}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'polyline') {
                let points = ent.points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polyline points="${points}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            } else if (ent.type === 'spline') {
                let points = ent.points.map(p => `${p.x},${p.y}`).join(' ');
                svgContent += `<polyline points="${points}" stroke="${color}" stroke-width="${ent.lineweight || 1}" fill="none"/>`;
            }
        });

        svgContent += `</svg>`;

        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>ArchitectSAF Print</title>
                <style>
                    body { margin: 0; padding: 20px; background: white; }
                    svg { width: 100%; height: auto; }
                    @media print {
                        body { margin: 0; padding: 0; }
                        svg { width: 100%; height: auto; }
                    }
                </style>
            </head>
            <body>
                ${svgContent}
                <script>window.print();<\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    }

    // ===== FORMAT MENU FUNCTIONS =====
    function showUnitsSetup() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content glass-card">
                <h3 class="text-lg font-bold mb-4">Units Setup</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-slate-400">Length Type</label>
                        <select id="unit-type" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                            <option value="mm" ${currentUnit === 'mm' ? 'selected' : ''}>Millimeters (mm)</option>
                            <option value="cm" ${currentUnit === 'cm' ? 'selected' : ''}>Centimeters (cm)</option>
                            <option value="m" ${currentUnit === 'm' ? 'selected' : ''}>Meters (m)</option>
                            <option value="in" ${currentUnit === 'in' ? 'selected' : ''}>Inches (in)</option>
                            <option value="ft" ${currentUnit === 'ft' ? 'selected' : ''}>Feet (ft)</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-xs text-slate-400">Precision</label>
                        <select id="unit-precision" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                            <option value="0">0</option>
                            <option value="1">0.0</option>
                            <option value="2" selected>0.00</option>
                            <option value="3">0.000</option>
                            <option value="4">0.0000</option>
                        </select>
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="save-units" class="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg text-sm">Apply</button>
                        <button id="cancel-units" class="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('save-units').addEventListener('click', () => {
            currentUnit = document.getElementById('unit-type').value;
            const unitDisplay = document.getElementById('unit-display');
            if (unitDisplay) unitDisplay.innerText = currentUnit;
            showSaveIndicator(`Units set to ${currentUnit}`);
            document.body.removeChild(modal);
        });

        document.getElementById('cancel-units').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    function showDrawingLimits() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content glass-card">
                <h3 class="text-lg font-bold mb-4">Drawing Limits</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-slate-400">Min X</label>
                        <input type="number" id="limit-min-x" value="${(-panX/zoom).toFixed(2)}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div>
                        <label class="text-xs text-slate-400">Min Y</label>
                        <input type="number" id="limit-min-y" value="${(-panY/zoom).toFixed(2)}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div>
                        <label class="text-xs text-slate-400">Max X</label>
                        <input type="number" id="limit-max-x" value="${((canvas.width - panX)/zoom).toFixed(2)}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div>
                        <label class="text-xs text-slate-400">Max Y</label>
                        <input type="number" id="limit-max-y" value="${((canvas.height - panY)/zoom).toFixed(2)}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="apply-limits" class="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg text-sm">Apply</button>
                        <button id="cancel-limits" class="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('apply-limits').addEventListener('click', () => {
            const minX = parseFloat(document.getElementById('limit-min-x').value);
            const minY = parseFloat(document.getElementById('limit-min-y').value);
            const maxX = parseFloat(document.getElementById('limit-max-x').value);
            const maxY = parseFloat(document.getElementById('limit-max-y').value);

            const width = maxX - minX;
            const height = maxY - minY;
            zoom = Math.min((canvas.width - 100) / width, (canvas.height - 100) / height);
            zoom = Math.max(0.1, Math.min(10, zoom));
            panX = (canvas.width / 2) - ((minX + maxX) / 2) * zoom;
            panY = (canvas.height / 2) - ((minY + maxY) / 2) * zoom;

            drawAllEntities();
            showSaveIndicator('Drawing limits applied');
            document.body.removeChild(modal);
        });

        document.getElementById('cancel-limits').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    function showGridSettings() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.style.display = 'flex';
        modal.innerHTML = `
            <div class="modal-content glass-card">
                <h3 class="text-lg font-bold mb-4">Grid Settings</h3>
                <div class="space-y-3">
                    <div>
                        <label class="text-xs text-slate-400">Grid Snap Size</label>
                        <input type="number" id="grid-snap" value="${snapGrid}" class="w-full bg-slate-800 rounded px-3 py-2 text-sm mt-1">
                    </div>
                    <div class="flex gap-2 mt-4">
                        <button id="apply-grid" class="flex-1 bg-indigo-600 hover:bg-indigo-700 py-2 rounded-lg text-sm">Apply</button>
                        <button id="cancel-grid" class="flex-1 bg-slate-700 hover:bg-slate-600 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        document.getElementById('apply-grid').addEventListener('click', () => {
            snapGrid = parseFloat(document.getElementById('grid-snap').value) || 5;
            const snapSizeDisplay = document.getElementById('snap-size');
            if (snapSizeDisplay) snapSizeDisplay.innerText = snapGrid;
            showSaveIndicator(`Grid snap set to ${snapGrid}`);
            document.body.removeChild(modal);
        });

        document.getElementById('cancel-grid').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    // ===== OSNAP FUNCTIONS =====
    function toggleOSNAP() {
        osnapEnabled = !osnapEnabled;
        const osnapBtn = document.getElementById('mode-osnap');
        if (osnapBtn) {
            osnapBtn.classList.toggle('active', osnapEnabled);
            osnapBtn.style.background = osnapEnabled ? 'rgba(99, 102, 241, 0.3)' : '';
        }
        showSaveIndicator(osnapEnabled ? 'OSNAP ON' : 'OSNAP OFF');
        updateModeDisplay();
    }

    function toggleOrthoMode() {
        orthoMode = !orthoMode;
        if (orthoMode) polarMode = false;
        const orthoBtn = document.getElementById('mode-ortho');
        if (orthoBtn) {
            orthoBtn.classList.toggle('active', orthoMode);
            orthoBtn.style.background = orthoMode ? 'rgba(99, 102, 241, 0.3)' : '';
        }
        showSaveIndicator(orthoMode ? 'Ortho mode ON' : 'Ortho mode OFF');
        updateModeDisplay();
    }

    function togglePolarMode() {
        polarMode = !polarMode;
        if (polarMode) orthoMode = false;
        const polarBtn = document.getElementById('mode-polar');
        if (polarBtn) {
            polarBtn.classList.toggle('active', polarMode);
            polarBtn.style.background = polarMode ? 'rgba(99, 102, 241, 0.3)' : '';
        }
        if (polarMode) {
            const angle = prompt('Enter polar tracking angle (e.g., 45):', polarAngle);
            if (angle) polarAngle = parseFloat(angle);
            showSaveIndicator(`Polar mode ON (${polarAngle}°)`);
        } else {
            showSaveIndicator('Polar mode OFF');
        }
        updateModeDisplay();
    }

    function toggleGridSnap() {
        gridSnap = !gridSnap;
        const gridBtn = document.getElementById('mode-grid');
        if (gridBtn) {
            gridBtn.classList.toggle('active', gridSnap);
            gridBtn.style.background = gridSnap ? 'rgba(99, 102, 241, 0.3)' : '';
        }
        showSaveIndicator(gridSnap ? 'Grid snap ON' : 'Grid snap OFF');
    }

    function setPolarAngle() {
        const angle = prompt('Enter polar tracking angle:', polarAngle);
        if (angle) {
            polarAngle = parseFloat(angle);
            showSaveIndicator(`Polar angle set to ${polarAngle}°`);
        }
    }

    function showOSNAPMenu() {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'fixed';
        menu.style.left = '50%';
        menu.style.top = '50%';
        menu.style.transform = 'translate(-50%, -50%)';
        menu.style.backgroundColor = '#1e293b';
        menu.style.border = '1px solid #4ade80';
        menu.style.borderRadius = '8px';
        menu.style.padding = '12px';
        menu.style.zIndex = '10000';
        menu.style.minWidth = '200px';

        menu.innerHTML = `
            <div class="text-indigo-400 text-xs font-bold mb-2">OBJECT SNAP SETTINGS</div>
            <div class="space-y-1">
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-endpoint" ${osnapEndpoints ? 'checked' : ''}> Endpoint
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-midpoint" ${osnapMidpoints ? 'checked' : ''}> Midpoint
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-center" ${osnapCenters ? 'checked' : ''}> Center
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-intersection" ${osnapIntersections ? 'checked' : ''}> Intersection
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-perpendicular" ${osnapPerpendicular ? 'checked' : ''}> Perpendicular
                </label>
                <label class="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" id="osnap-tangent" ${osnapTangent ? 'checked' : ''}> Tangent
                </label>
            </div>
            <div class="mt-3 pt-2 border-t border-white/10">
                <button id="osnap-close" class="w-full bg-indigo-600 hover:bg-indigo-700 py-1 rounded text-xs">Close</button>
            </div>
        `;

        document.body.appendChild(menu);

        document.getElementById('osnap-endpoint').addEventListener('change', (e) => { osnapEndpoints = e.target.checked; });
        document.getElementById('osnap-midpoint').addEventListener('change', (e) => { osnapMidpoints = e.target.checked; });
        document.getElementById('osnap-center').addEventListener('change', (e) => { osnapCenters = e.target.checked; });
        document.getElementById('osnap-intersection').addEventListener('change', (e) => { osnapIntersections = e.target.checked; });
        document.getElementById('osnap-perpendicular').addEventListener('change', (e) => { osnapPerpendicular = e.target.checked; });
        document.getElementById('osnap-tangent').addEventListener('change', (e) => { osnapTangent = e.target.checked; });

        document.getElementById('osnap-close').addEventListener('click', () => {
            document.body.removeChild(menu);
        });

        menu.addEventListener('click', (e) => {
            if (e.target === menu) {
                document.body.removeChild(menu);
            }
        });
    }

    // ===== CLEAR FUNCTIONS =====
    function clearCanvas() {
        if (confirm('Are you sure you want to clear the entire canvas? This cannot be undone.')) {
            saveState();
            entities = [];
            selectedEntityIndices = [];
            drawing = false;
            tempEntity = null;
            polylinePoints = [];
            continuousLinePoints = [];
            isDrawingContinuousLine = false;
            continuousLineStartPoint = null;
            dimensionStartPoint = null;
            isDrawingDimension = false;
            isDrawingArcLength = false;
            selectedArcEntity = null;
            arcLengthPreview = null;
            splinePoints = [];
            isDrawingSpline = false;
            ellipseCenter = null;
            isDrawingEllipse = false;
            hatchPoints = [];
            isDrawingHatch = false;
            mirrorPoint1 = null;
            rotateCenter = null;
            cloneBasePoint = null;
            isCloning = false;
            moveBasePoint = null;
            isMoving = false;
            stretchBasePoint = null;
            isStretching = false;
            hoveredEntityIndex = -1;
            isSelecting = false;
            selectionBox = null;

            drawAllEntities();
            saveToStorage();
            showSaveIndicator('Canvas cleared');
            setTool('select');
        }
    }

    // ===== SHARE FUNCTIONS =====
    function generateShareLink() {
        try {
            const projectData = {
                entities: entities,
                layers: layers,
                materials: materials,
                currentLayer: currentLayer,
                currentMaterial: currentMaterial,
                currentUnit: currentUnit,
                snapGrid: snapGrid,
                version: VERSION,
                appName: APP_NAME
            };

            const jsonStr = JSON.stringify(projectData);
            const encoded = btoa(encodeURIComponent(jsonStr).replace(/%([0-9A-F]{2})/g, function(match, p1) {
                return String.fromCharCode('0x' + p1);
            }));

            const url = new URL(window.location.href);
            url.searchParams.set('project', encoded);

            const shareLink = document.getElementById('share-link');
            if (shareLink) {
                shareLink.value = url.toString();
            }

            const modal = document.getElementById('share-modal');
            if (modal) {
                modal.style.display = 'flex';
                setTimeout(() => modal.classList.add('active'), 10);
            }

            showSaveIndicator('Share link generated');
        } catch (e) {
            console.error('Failed to generate share link:', e);
            showSaveIndicator('Failed to generate link');
        }
    }

    function loadFromShareLink() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const projectData = urlParams.get('project');

            if (projectData) {
                const decoded = decodeURIComponent(atob(projectData).split('').map(function(c) {
                    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
                }).join(''));

                const data = JSON.parse(decoded);

                entities = data.entities || [];
                layers = data.layers || layers;
                materials = data.materials || materials;
                currentLayer = data.currentLayer || '0';
                currentMaterial = data.currentMaterial || '1';
                currentUnit = data.currentUnit || 'cm';
                snapGrid = data.snapGrid || 5;

                drawAllEntities();
                updateLayersList();
                updateMaterialsList();

                const url = new URL(window.location.href);
                url.searchParams.delete('project');
                window.history.replaceState({}, '', url);

                // Additive: stash the decoded project (in the same shape
                // loadProject()/getProjectData() use) so the dashboard, if
                // present, can adopt it as a real file with its own id
                // instead of it living only in memory with no file record.
                // A plain global (rather than an event) is used because this
                // runs before the dashboard script has attached any
                // listeners.
                window.__architectSAFPendingSharedProject = {
                    entities: data.entities || [],
                    layers: data.layers || layers,
                    materials: data.materials || materials,
                    currentLayer: data.currentLayer || '0',
                    currentMaterial: data.currentMaterial || '1',
                    unit: data.currentUnit || 'cm',
                    snap: data.snapGrid || 5
                };

                showSaveIndicator('Project loaded from link');
            }
        } catch (e) {
            console.error('Failed to load project from link:', e);
            showSaveIndicator('Invalid project link');
        }
    }

    // ===== STORAGE =====
    function saveToStorage() {
        try {
            const cleanEntities = entities.map(ent => {
                const clean = JSON.parse(JSON.stringify(ent));
                if (clean.type === 'dimension') {
                    clean.value = clean.value || '0.00';
                    clean.unit = clean.unit || currentUnit;
                }
                if (clean.type === 'arc-length-dimension') {
                    clean.value = clean.value || '0.00';
                    clean.unit = clean.unit || currentUnit;
                }
                return clean;
            });

            const projectData = {
                entities: cleanEntities,
                layers: layers,
                materials: materials,
                currentLayer: currentLayer,
                currentMaterial: currentMaterial,
                unit: currentUnit,
                snap: snapGrid,
                version: VERSION,
                savedAt: new Date().toISOString(),
                osnapSettings: {
                    enabled: osnapEnabled,
                    endpoints: osnapEndpoints,
                    midpoints: osnapMidpoints,
                    centers: osnapCenters,
                    intersections: osnapIntersections,
                    perpendicular: osnapPerpendicular,
                    tangent: osnapTangent
                }
            };

            const jsonString = JSON.stringify(projectData);
            localStorage.setItem('architectCAD', jsonString);

            const verify = localStorage.getItem('architectCAD');
            if (!verify) {
                throw new Error('Save verification failed');
            }

            console.log(`Saved ${entities.length} entities to storage`);

            // Additive: let external listeners (e.g. the dashboard's file
            // manager) know a save just happened, without this file needing
            // to know anything about them.
            window.dispatchEvent(new CustomEvent('architectsaf:save', { detail: { projectData } }));
        } catch(e) {
            console.error('Failed to save to storage:', e);
            showSaveIndicator('Save failed - storage full?');
        }
    }

    function loadFromStorage() {
        try {
            const saved = localStorage.getItem('architectCAD');
            if (!saved) {
                console.log('No saved data found');
                return;
            }

            const data = JSON.parse(saved);

            if (!data || typeof data !== 'object') {
                throw new Error('Invalid data structure');
            }

            if (Array.isArray(data.entities)) {
                entities = data.entities.map(ent => {
                    if (ent.type === 'dimension' && !ent.value) {
                        ent.value = '0.00';
                    }
                    if (ent.type === 'arc-length-dimension' && !ent.value) {
                        ent.value = '0.00';
                    }
                    return ent;
                });
                console.log(`Loaded ${entities.length} entities`);
            } else {
                entities = [];
            }

            layers = Array.isArray(data.layers) ? data.layers : layers;
            materials = Array.isArray(data.materials) ? data.materials : materials;
            currentLayer = data.currentLayer || '0';
            currentMaterial = data.currentMaterial || '1';
            currentUnit = data.unit || 'cm';
            snapGrid = data.snap || 5;

            if (data.osnapSettings) {
                osnapEnabled = data.osnapSettings.enabled ?? true;
                osnapEndpoints = data.osnapSettings.endpoints ?? true;
                osnapMidpoints = data.osnapSettings.midpoints ?? true;
                osnapCenters = data.osnapSettings.centers ?? true;
                osnapIntersections = data.osnapSettings.intersections ?? true;
                osnapPerpendicular = data.osnapSettings.perpendicular ?? false;
                osnapTangent = data.osnapSettings.tangent ?? false;
            }

            showSaveIndicator(`Loaded ${entities.length} entities`);
        } catch(e) { 
            console.error('Failed to load from storage:', e);
            showSaveIndicator('Load failed - data corrupted');
            entities = []; 
        }
        drawAllEntities();
        updateLayersList();
        updateMaterialsList();
    }

    function showSaveIndicator(message = 'Saved') {
        const el = document.getElementById('save-indicator');
        if (!el) return;
        const span = el.querySelector('span');
        if (span) span.textContent = message;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 2000);
    }

    // ===== TOOL SELECTION =====
    function setTool(tool) {
        currentTool = tool;

        continuousLinePoints = [];
        isDrawingContinuousLine = false;
        continuousLineStartPoint = null;
        polylinePoints = [];
        splinePoints = [];
        isDrawingSpline = false;
        ellipseCenter = null;
        isDrawingEllipse = false;
        ellipseRadiusX = 0;
        ellipseRadiusY = 0;
        hatchPoints = [];
        isDrawingHatch = false;
        dimensionStartPoint = null;
        isDrawingDimension = false;
        isDrawingArcLength = false;
        selectedArcEntity = null;
        arcLengthPreview = null;
        measureStartPoint = null;
        isMeasuring = false;
        measureResult.style.display = 'none';
        mirrorPoint1 = null;
        rotateCenter = null;
        cloneBasePoint = null;
        isCloning = false;
        moveBasePoint = null;
        isMoving = false;
        stretchBasePoint = null;
        isStretching = false;
        trimReference = null;
        extendBoundary = null;
        tempEntity = null;
        drawing = false;
        isSelecting = false;
        selectionBox = null;
        hideDynamicInput();

        panMode = (tool === 'pan');
        canvas.style.cursor = panMode ? 'grab' : 'crosshair';

        document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));

        const toolMap = {
            'select': 'mode-select',
            'continuous-line': 'mode-continuous-line',
            'polyline': 'mode-polyline',
            'spline': 'mode-spline',
            'arc': 'mode-arc',
            'circle': 'mode-circle',
            'ellipse': 'mode-ellipse',
            'rect': 'mode-rect',
            'hatch': 'mode-hatch',
            'text': 'mode-text',
            'dimension': 'mode-dim',
            'arc-length-dimension': 'mode-dim-arc',
            'measure': 'mode-measure',
            'mirror': 'mode-mirror',
            'rotate': 'mode-rotate',
            'move': 'mode-move',
            'clone': 'mode-clone',
            'scale': 'mode-scale',
            'stretch': 'mode-stretch',
            'trim': 'mode-trim',
            'extend': 'mode-extend',
            'fillet': 'mode-fillet',
            'chamfer': 'mode-chamfer',
            'offset': 'mode-offset',
            'array': 'mode-array',
            'break': 'mode-break',
            'join': 'mode-join',
            'group': 'mode-group',
            'ungroup': 'mode-ungroup',
            'pan': 'mode-pan'
        };

        const btnId = toolMap[tool];
        if (btnId) {
            const btn = document.getElementById(btnId);
            if (btn) btn.classList.add('active');
        }

        updateModeDisplay();
        drawAllEntities();
    }

    // ===== MOUSE EVENT HANDLERS =====
    function updateHover(e) {
        const world = getMouseCoord(e, false, false);
        let newHoverIndex = -1;
        const threshold = 8 / zoom;

        for (let i = entities.length - 1; i >= 0; i--) {
            const ent = entities[i];
            const layer = layers.find(l => l.id === ent.layer);
            if (!layer?.visible || layer.locked) continue;

            let hit = false;

            if (ent.type === 'line') {
                if (Math.hypot(world.x - ent.x, world.y - ent.y) < threshold) hit = true;
                else if (Math.hypot(world.x - ent.x2, world.y - ent.y2) < threshold) hit = true;
                else {
                    const d = distanceToSegment(world.x, world.y, ent.x, ent.y, ent.x2, ent.y2);
                    if (d < threshold) hit = true;
                }
            } else if (ent.type === 'polyline' || ent.type === 'spline') {
                for (let j = 0; j < ent.points.length - 1; j++) {
                    const d = distanceToSegment(world.x, world.y, ent.points[j].x, ent.points[j].y, ent.points[j+1].x, ent.points[j+1].y);
                    if (d < threshold) {
                        hit = true;
                        break;
                    }
                }
            } else if (ent.type === 'circle') {
                if (Math.abs(Math.hypot(world.x - ent.x, world.y - ent.y) - ent.radius) < threshold) hit = true;
            } else if (ent.type === 'ellipse') {
                const normalizedX = (world.x - ent.x) / ent.radiusX;
                const normalizedY = (world.y - ent.y) / ent.radiusY;
                const distToEllipse = Math.abs(Math.hypot(normalizedX, normalizedY) - 1) * Math.min(ent.radiusX, ent.radiusY);
                if (distToEllipse < threshold) hit = true;
            } else if (ent.type === 'rect') {
                const left = Math.min(ent.x, ent.x + ent.w);
                const right = Math.max(ent.x, ent.x + ent.w);
                const top = Math.min(ent.y, ent.y + ent.h);
                const bottom = Math.max(ent.y, ent.y + ent.h);

                if (world.x >= left && world.x <= right && world.y >= top && world.y <= bottom) {
                    if (Math.abs(world.x - left) < threshold || Math.abs(world.x - right) < threshold ||
                        Math.abs(world.y - top) < threshold || Math.abs(world.y - bottom) < threshold) {
                        hit = true;
                    }
                }
            } else if (ent.type === 'hatch') {
                if (pointInPolygon(world.x, world.y, ent.points)) hit = true;
            } else if (ent.type === 'dimension') {
                if (Math.hypot(world.x - ent.textX, world.y - ent.textY) < threshold) hit = true;
            } else if (ent.type === 'arc-length-dimension') {
                if (Math.hypot(world.x - ent.textX, world.y - ent.textY) < threshold) hit = true;
            } else if (ent.type === 'text') {
                if (Math.hypot(world.x - ent.x, world.y - ent.y) < threshold) hit = true;
            }

            if (hit) {
                newHoverIndex = i;
                break;
            }
        }

        if (newHoverIndex !== hoveredEntityIndex) {
            hoveredEntityIndex = newHoverIndex;
            drawAllEntities();
        }
    }

    function pointInPolygon(x, y, points) {
        let inside = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const xi = points[i].x, yi = points[i].y;
            const xj = points[j].x, yj = points[j].y;
            const intersect = ((yi > y) != (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    function onMouseMove(e) {
        updateLivePoint(e);

        if (isPanning) {
            doPan(e);
            return;
        }

        const world = getMouseCoord(e, true, true);

        if (currentTool === 'select' && !isSelecting && !drawing) {
            updateHover(e);
        }

        if (currentTool === 'select' && isSelecting) {
            updateSelectionBox(world);
        } else if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
            updateContinuousLinePreview(world);
        } else if (currentTool === 'polyline' && drawing) {
            let previewPoint = { x: world.x, y: world.y };
            if (orthoMode && polylinePoints.length > 0) {
                const lastPoint = polylinePoints[polylinePoints.length - 1];
                previewPoint = applyOrthoConstraint(lastPoint, previewPoint);
            }
            if (polarMode && polylinePoints.length > 0) {
                const lastPoint = polylinePoints[polylinePoints.length - 1];
                previewPoint = applyPolarConstraint(lastPoint, previewPoint, polarAngle);
            }
            tempEntity = previewPoint;
            drawAllEntities();
        } else if (currentTool === 'spline' && isDrawingSpline) {
            let previewPoint = { x: world.x, y: world.y };
            if (orthoMode && splinePoints.length > 0) {
                const lastPoint = splinePoints[splinePoints.length - 1];
                previewPoint = applyOrthoConstraint(lastPoint, previewPoint);
            }
            tempEntity = previewPoint;
            drawAllEntities();
        } else if (currentTool === 'ellipse' && isDrawingEllipse) {
            updateEllipsePreview(world);
        } else if (currentTool === 'hatch' && isDrawingHatch) {
            tempEntity = { x: world.x, y: world.y };
            drawAllEntities();
        } else if (currentTool === 'dimension' && isDrawingDimension) {
            updateDimensionPreview(world);
        } else if (currentTool === 'arc-length-dimension' && isDrawingArcLength) {
            updateArcLengthPreview(world);
        } else if (currentTool === 'measure' && isMeasuring) {
            updateMeasurePreview(world);
        } else if (currentTool === 'mirror' && mirrorPoint1) {
            tempEntity = { x: world.x, y: world.y };
            drawAllEntities();
        } else if (currentTool === 'rotate' && rotateCenter) {
            tempEntity = { x: world.x, y: world.y };
            drawAllEntities();
        } else if (currentTool === 'clone' && isCloning) {
            updateClonePreview(world);
        } else if (currentTool === 'move' && isMoving) {
            updateMovePreview(world);
        } else if (currentTool === 'stretch' && isStretching) {
            updateStretchPreview(world);
        } else if (currentTool === 'trim' && trimReference) {
            tempEntity = { x: world.x, y: world.y };
            drawAllEntities();
        } else if (currentTool === 'extend' && extendBoundary) {
            tempEntity = { x: world.x, y: world.y };
            drawAllEntities();
        }

        if (drawing && tempEntity && (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arc')) {
            let previewPoint = { x: world.x, y: world.y };
            if (orthoMode) {
                previewPoint = applyOrthoConstraint({ x: startX, y: startY }, previewPoint);
            }
            if (polarMode) {
                previewPoint = applyPolarConstraint({ x: startX, y: startY }, previewPoint, polarAngle);
            }

            if (currentTool === 'rect') {
                tempEntity.w = previewPoint.x - startX;
                tempEntity.h = previewPoint.y - startY;
            }

            if (currentTool === 'circle') {
                tempEntity.radius = Math.hypot(previewPoint.x - startX, previewPoint.y - startY);
            }

            if (currentTool === 'arc') {
                tempEntity.radius = Math.hypot(previewPoint.x - startX, previewPoint.y - startY);
                tempEntity.endAngle = Math.atan2(previewPoint.y - startY, previewPoint.x - startX);
            }

            drawAllEntities();
        }
    }

    function onMouseDown(e) {
        e.preventDefault();

        if (e.button === 1 || (e.button === 0 && panMode) || window.spaceDown) {
            startPan(e);
            return;
        }

        const world = getMouseCoord(e, true, true);

        if (currentTool === 'select') {
            if (!e.shiftKey && !isSelecting) {
                deselectAll();
            }
            startSelectionBox(world);
            return;
        }

        if (currentTool === 'continuous-line') {
            if (!isDrawingContinuousLine) {
                startContinuousLineTool(world);
            } else {
                addContinuousLinePoint(world);
            }
            return;
        }

        if (currentTool === 'polyline') {
            if (!drawing) {
                startPolylineTool(world);
            } else {
                addPolylinePoint(world);
            }
            return;
        }

        if (currentTool === 'spline') {
            if (!isDrawingSpline) {
                startSplineTool(world);
            } else {
                addSplinePoint(world);
            }
            return;
        }

        if (currentTool === 'ellipse') {
            if (!isDrawingEllipse) {
                startEllipseTool(world);
            } else if (ellipseRadiusX === 0) {
                ellipseRadiusX = Math.abs(world.x - ellipseCenter.x);
                ellipseRadiusY = ellipseRadiusX;
                updateEllipsePreview(world);
            } else {
                finishEllipseTool(world);
            }
            return;
        }

        if (currentTool === 'hatch') {
            if (!isDrawingHatch) {
                startHatchTool(world);
            } else {
                addHatchPoint(world);
            }
            return;
        }

        if (currentTool === 'text') {
            startTextTool(world);
            return;
        }

        if (currentTool === 'dimension') {
            if (!isDrawingDimension) {
                startDimensionTool(world);
            } else {
                finishDimensionTool(world);
            }
            return;
        }

        if (currentTool === 'arc-length-dimension') {
            if (!isDrawingArcLength) {
                startArcLengthDimension(world);
            } else {
                finishArcLengthDimension(world);
            }
            return;
        }

        if (currentTool === 'measure') {
            if (!isMeasuring) {
                startMeasureTool(world);
            } else {
                finishMeasureTool(world);
            }
            return;
        }

        if (currentTool === 'mirror') {
            if (!mirrorPoint1) {
                mirrorPoint1 = world;
                tempEntity = world;
            } else {
                performMirror(world);
            }
            return;
        }

        if (currentTool === 'rotate') {
            if (!rotateCenter) {
                rotateCenter = world;
                rotateStartAngle = Math.atan2(world.y - rotateCenter.y, world.x - rotateCenter.x);
                tempEntity = world;
            } else {
                performRotate(world);
            }
            return;
        }

        if (currentTool === 'clone') {
            if (!isCloning) {
                startCloneTool(world);
            } else {
                performClone(world, true);
            }
            return;
        }

        if (currentTool === 'move') {
            if (!isMoving) {
                startMoveTool(world);
            } else {
                performMove(world);
            }
            return;
        }

        if (currentTool === 'stretch') {
            if (!isStretching) {
                startStretchTool(world);
            } else {
                performStretch(world);
            }
            return;
        }

        if (currentTool === 'trim') {
            if (!trimReference) {
                trimReference = world;
                showSaveIndicator('Select cutting edge');
            } else {
                trimEntityAtPoint(world);
                trimReference = null;
                setTool('select');
            }
            return;
        }

        if (currentTool === 'extend') {
            if (!extendBoundary) {
                extendBoundary = world;
                showSaveIndicator('Select boundary edge');
            } else {
                extendEntityToBoundary(world);
                extendBoundary = null;
                setTool('select');
            }
            return;
        }

        if (currentTool === 'break') {
            breakEntityAtPoint(world);
            setTool('select');
            return;
        }

        if (currentTool === 'join') {
            joinEntities();
            setTool('select');
            return;
        }

        if (currentTool === 'fillet') {
            startFilletTool();
            setTool('select');
            return;
        }

        if (currentTool === 'chamfer') {
            startChamferTool();
            setTool('select');
            return;
        }

        if (currentTool === 'offset') {
            startOffsetTool();
            setTool('select');
            return;
        }

        if (currentTool === 'array') {
            startArrayTool();
            setTool('select');
            return;
        }

        if (currentTool === 'scale') {
            scaleEntities();
            return;
        }

        if (currentTool === 'group') {
            groupSelected();
            setTool('select');
            return;
        }

        if (currentTool === 'ungroup') {
            ungroupSelected();
            setTool('select');
            return;
        }

        if (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arc') {
            drawing = true;
            startX = world.x; startY = world.y;
            tempEntity = { 
                type: currentTool, 
                x: world.x, 
                y: world.y,
                layer: currentLayer,
                material: currentMaterial,
                color: materials.find(m => m.id === currentMaterial)?.color,
                lineweight: 1.5,
                linetype: 'solid'
            };

            if (currentTool === 'rect') {
                tempEntity.w = 0; tempEntity.h = 0;
            }
            if (currentTool === 'circle') {
                tempEntity.radius = 0;
            }
            if (currentTool === 'arc') {
                tempEntity.radius = 0;
                tempEntity.startAngle = 0;
                tempEntity.endAngle = Math.PI;
            }
        }
    }

    function onMouseUp(e) {
        if (isPanning) {
            stopPan();
            return;
        }

        if (currentTool === 'select' && isSelecting) {
            finishSelectionBox(e.shiftKey);
            return;
        }

        if (drawing && tempEntity && (currentTool === 'rect' || currentTool === 'circle' || currentTool === 'arc')) {
            const world = getMouseCoord(e, true, true);
            let endPoint = { x: world.x, y: world.y };
            if (orthoMode) {
                endPoint = applyOrthoConstraint({ x: startX, y: startY }, endPoint);
            }
            if (polarMode) {
                endPoint = applyPolarConstraint({ x: startX, y: startY }, endPoint, polarAngle);
            }

            if (Math.hypot(endPoint.x - startX, endPoint.y - startY) < 1) {
                drawing = false; tempEntity = null; return;
            }

            let newEnt = { 
                ...tempEntity,
                layer: currentLayer,
                material: currentMaterial,
                color: materials.find(m => m.id === currentMaterial)?.color,
                lineweight: 1.5,
                linetype: 'solid'
            };

            if (currentTool === 'rect') {
                newEnt.w = endPoint.x - startX;
                newEnt.h = endPoint.y - startY;
                if (newEnt.w < 0) {
                    newEnt.x += newEnt.w;
                    newEnt.w = Math.abs(newEnt.w);
                }
                if (newEnt.h < 0) {
                    newEnt.y += newEnt.h;
                    newEnt.h = Math.abs(newEnt.h);
                }
            } else if (currentTool === 'circle') {
                newEnt.radius = Math.hypot(endPoint.x - startX, endPoint.y - startY);
            } else if (currentTool === 'arc') {
                newEnt.radius = Math.hypot(endPoint.x - startX, endPoint.y - startY);
            }

            saveState();
            entities.push(newEnt);
            tempEntity = null;
            drawing = false;
            drawAllEntities();
            saveToStorage();
            showSaveIndicator(`${currentTool} created`);
            setTool('select');
        }
    }

    function onMouseLeave() {
        livePoint.style.display = 'none';
        snapIndicator.style.display = 'none';
        orthoH.style.display = 'none';
        orthoV.style.display = 'none';
        endpointContainer.innerHTML = '';
        tooltip.style.display = 'none';
        quickProps.style.display = 'none';

        if (currentTool === 'polyline' && drawing) {
            // Keep polyline active
        }
        if (currentTool === 'spline' && isDrawingSpline) {
            // Keep spline active
        }
        if (currentTool === 'hatch' && isDrawingHatch) {
            // Keep hatch active
        }
        if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
            continuousLineStartPoint = null;
            drawAllEntities();
        }
        if (currentTool === 'dimension' && isDrawingDimension) {
            dimensionStartPoint = null;
            isDrawingDimension = false;
            drawing = false;
            tempEntity = null;
            drawAllEntities();
        }
        if (currentTool === 'arc-length-dimension' && isDrawingArcLength) {
            cancelArcLengthDimension();
        }
        if (currentTool === 'measure' && isMeasuring) {
            measureStartPoint = null;
            isMeasuring = false;
            tempEntity = null;
            measureResult.style.display = 'none';
            drawAllEntities();
        }
        if (currentTool === 'select' && isSelecting) {
            isSelecting = false;
            selectionBox = null;
            drawAllEntities();
        }
        if (currentTool === 'clone' && isCloning) {
            cloneBasePoint = null;
            isCloning = false;
            tempEntity = null;
            drawAllEntities();
        }
        if (currentTool === 'move' && isMoving) {
            moveBasePoint = null;
            isMoving = false;
            tempEntity = null;
            drawAllEntities();
        }
        if (currentTool === 'stretch' && isStretching) {
            stretchBasePoint = null;
            isStretching = false;
            tempEntity = null;
            drawAllEntities();
        }

        hoveredEntityIndex = -1;
        hideDynamicInput();

        if (isPanning) stopPan();
    }

    function onMouseEnter(e) {
        updateLivePoint(e);
        updateEndpointMarkers();
    }

    function onDoubleClick(e) {
        if (currentTool === 'polyline' && drawing) {
            finishPolylineTool();
        }

        if (currentTool === 'spline' && isDrawingSpline) {
            finishSplineTool();
        }

        if (currentTool === 'hatch' && isDrawingHatch) {
            finishHatchTool();
        }

        if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
            finishContinuousLineTool();
        }
    }

    function showContextMenu(e) {
        e.preventDefault();
        contextMenuOpen = true;
        contextMenuX = e.clientX;
        contextMenuY = e.clientY;

        let existingMenu = document.getElementById('context-menu');
        if (existingMenu) existingMenu.remove();

        const menu = document.createElement('div');
        menu.id = 'context-menu';
        menu.className = 'context-menu';
        menu.style.left = contextMenuX + 'px';
        menu.style.top = contextMenuY + 'px';

        const menuItems = [
            { label: 'Copy', icon: 'fa-copy', action: () => copySelected() },
            { label: 'Cut', icon: 'fa-cut', action: () => cutSelected() },
            { label: 'Paste', icon: 'fa-paste', action: () => pasteClipboard() },
            { label: '---' },
            { label: 'Move', icon: 'fa-arrows-alt', action: () => { if (selectedEntityIndices.length > 0) startMoveTool(getMouseCoord(e, false, false)); } },
            { label: 'Copy Here', icon: 'fa-copy', action: () => { if (selectedEntityIndices.length > 0) startCloneTool(getMouseCoord(e, false, false)); } },
            { label: 'Delete', icon: 'fa-trash', action: () => deleteSelected() },
            { label: '---' },
            { label: 'Deselect All', icon: 'fa-square', action: () => deselectAll() },
            { label: '---' },
            { label: 'Zoom Extents', icon: 'fa-expand-arrows-alt', action: () => zoomExtents() },
            { label: 'Clear Canvas', icon: 'fa-eraser', action: () => clearCanvas() }
        ];

        menuItems.forEach(item => {
            if (item.label === '---') {
                const divider = document.createElement('div');
                divider.className = 'context-menu-divider';
                menu.appendChild(divider);
            } else {
                const menuItem = document.createElement('div');
                menuItem.className = 'context-menu-item';
                menuItem.innerHTML = `<i class="fas ${item.icon} w-4"></i> ${item.label}`;
                menuItem.addEventListener('click', () => {
                    item.action();
                    menu.remove();
                    contextMenuOpen = false;
                });
                menu.appendChild(menuItem);
            }
        });

        document.body.appendChild(menu);

        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove();
                contextMenuOpen = false;
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    // ===== KEYBOARD HANDLERS =====
    function onKeyDown(e) {
        // Handle Enter for finishing polyline/spline when dynamic input is NOT active
        if (e.key === 'Enter' && !dynamicInputActive) {
            if (currentTool === 'polyline' && drawing && polylinePoints.length >= 2) {
                e.preventDefault();
                finishPolylineTool();
                return;
            }
            if (currentTool === 'spline' && isDrawingSpline && splinePoints.length >= 3) {
                e.preventDefault();
                finishSplineTool();
                return;
            }
            if (currentTool === 'hatch' && isDrawingHatch && hatchPoints.length >= 3) {
                e.preventDefault();
                finishHatchTool();
                return;
            }
            if (currentTool === 'continuous-line' && isDrawingContinuousLine && continuousLinePoints.length >= 2) {
                e.preventDefault();
                finishContinuousLineTool();
                return;
            }
        }

        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            canvas.style.cursor = 'grab';
            window.spaceDown = true;
        }

        if (e.ctrlKey && e.key === 'z') {
            e.preventDefault();
            undo();
            return;
        }
        if (e.ctrlKey && e.key === 'y') {
            e.preventDefault();
            redo();
            return;
        }

        if (e.ctrlKey && e.key === 'c') {
            e.preventDefault();
            copySelected();
            return;
        }
        if (e.ctrlKey && e.key === 'x') {
            e.preventDefault();
            cutSelected();
            return;
        }
        if (e.ctrlKey && e.key === 'v') {
            e.preventDefault();
            pasteClipboard();
            return;
        }

        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            if (e.shiftKey) {
                saveAsDrawing();
            } else {
                saveDrawing();
            }
            return;
        }

        if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            newDrawing();
            return;
        }

        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault();
            printDrawing();
            return;
        }

        if (e.key === '?' || e.key === 'F1') {
            e.preventDefault();
            const shortcutsModal = document.getElementById('shortcuts-modal');
            if (shortcutsModal) {
                shortcutsModal.style.display = 'flex';
                setTimeout(() => shortcutsModal.classList.add('active'), 10);
            }
            return;
        }

        if (e.key === 'Delete' || e.key === 'Del') {
            deleteSelected();
        }
        if (e.key === 'Escape') {
            cancelCurrentDrawing();
        }

        if (e.key === 'F8') {
            e.preventDefault();
            toggleOrthoMode();
        }

        if (e.key === 'F3') {
            e.preventDefault();
            toggleOSNAP();
        }

        if (e.key === 'F9') {
            e.preventDefault();
            toggleGridSnap();
        }

        if (e.key === 'F10') {
            e.preventDefault();
            togglePolarMode();
        }

        if (e.key === '+' || e.key === '=') zoomIn();
        if (e.key === '-') zoomOut();

        if (e.ctrlKey && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            clearCanvas();
        }

        if (e.ctrlKey && e.key === 'a') {
            e.preventDefault();
            selectedEntityIndices = entities.map((_, idx) => idx);
            drawAllEntities();
            showSaveIndicator(`${selectedEntityIndices.length} entities selected`);
        }

        if (e.key === 'Tab' && (drawing || isDrawingContinuousLine || isDrawingSpline)) {
            e.preventDefault();
            showCoordInput((coords) => {
                if (currentTool === 'continuous-line' && isDrawingContinuousLine) {
                    addContinuousLinePoint(coords);
                } else if (currentTool === 'polyline' && drawing) {
                    addPolylinePoint(coords);
                } else if (currentTool === 'spline' && isDrawingSpline) {
                    addSplinePoint(coords);
                }
            });
        }
    }

    function onKeyUp(e) {
        if (e.code === 'Space') {
            canvas.style.cursor = panMode ? 'grab' : 'crosshair';
            window.spaceDown = false;
        }
    }

    // ===== EVENT LISTENERS SETUP =====
    function setupEventListeners() {
        canvas.addEventListener('wheel', handleMouseWheel, { passive: false });
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('mouseleave', onMouseLeave);
        canvas.addEventListener('mouseenter', onMouseEnter);
        canvas.addEventListener('dblclick', onDoubleClick);
        canvas.addEventListener('contextmenu', showContextMenu);

        const toolButtons = {
            'mode-select': 'select',
            'mode-continuous-line': 'continuous-line',
            'mode-polyline': 'polyline',
            'mode-spline': 'spline',
            'mode-arc': 'arc',
            'mode-circle': 'circle',
            'mode-ellipse': 'ellipse',
            'mode-rect': 'rect',
            'mode-hatch': 'hatch',
            'mode-text': 'text',
            'mode-dim': 'dimension',
            'mode-dim-arc': 'arc-length-dimension',
            'mode-measure': 'measure',
            'mode-mirror': 'mirror',
            'mode-rotate': 'rotate',
            'mode-move': 'move',
            'mode-clone': 'clone',
            'mode-scale': 'scale',
            'mode-stretch': 'stretch',
            'mode-trim': 'trim',
            'mode-extend': 'extend',
            'mode-fillet': 'fillet',
            'mode-chamfer': 'chamfer',
            'mode-offset': 'offset',
            'mode-array': 'array',
            'mode-break': 'break',
            'mode-join': 'join',
            'mode-group': 'group',
            'mode-ungroup': 'ungroup',
            'mode-pan': 'pan'
        };

        for (const [btnId, toolName] of Object.entries(toolButtons)) {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => setTool(toolName));
            }
        }

        const orthoBtn = document.getElementById('mode-ortho');
        if (orthoBtn) orthoBtn.addEventListener('click', toggleOrthoMode);

        const polarBtn = document.getElementById('mode-polar');
        if (polarBtn) polarBtn.addEventListener('click', togglePolarMode);

        const osnapBtn = document.getElementById('mode-osnap');
        if (osnapBtn) osnapBtn.addEventListener('click', toggleOSNAP);

        const gridBtn = document.getElementById('mode-grid');
        if (gridBtn) gridBtn.addEventListener('click', toggleGridSnap);

        const zoomInBtn = document.getElementById('mode-zoom-in');
        if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);

        const zoomOutBtn = document.getElementById('mode-zoom-out');
        if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);

        const zoomExtentsBtn = document.getElementById('mode-zoom-extents');
        if (zoomExtentsBtn) zoomExtentsBtn.addEventListener('click', zoomExtents);

        const deleteBtn = document.getElementById('mode-delete');
        if (deleteBtn) deleteBtn.addEventListener('click', deleteSelected);

        const clearBtn = document.getElementById('mode-clear');
        if (clearBtn) clearBtn.addEventListener('click', clearCanvas);

        const addLayerBtn = document.getElementById('add-layer');
        if (addLayerBtn) addLayerBtn.addEventListener('click', addLayer);

        const addMaterialBtn = document.getElementById('add-material');
        if (addMaterialBtn) addMaterialBtn.addEventListener('click', addMaterial);

        const undoBtn = document.getElementById('btn-undo');
        if (undoBtn) undoBtn.addEventListener('click', undo);

        const redoBtn = document.getElementById('btn-redo');
        if (redoBtn) redoBtn.addEventListener('click', redo);

        const themeBtn = document.getElementById('btn-theme');
        if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

        const shareBtn = document.getElementById('btn-share');
        if (shareBtn) {
            shareBtn.addEventListener('click', (e) => {
                e.preventDefault();
                generateShareLink();
            });
        }

        const copyLinkBtn = document.getElementById('copy-link');
        if (copyLinkBtn) {
            copyLinkBtn.addEventListener('click', () => {
                const link = document.getElementById('share-link');
                if (link) {
                    link.select();
                    navigator.clipboard.writeText(link.value).then(() => {
                        showSaveIndicator('Link copied to clipboard!');
                    }).catch(() => {
                        document.execCommand('copy');
                        showSaveIndicator('Link copied!');
                    });
                }
            });
        }

        const closeShareBtn = document.getElementById('close-share');
        if (closeShareBtn) {
            closeShareBtn.addEventListener('click', () => {
                const modal = document.getElementById('share-modal');
                if (modal) {
                    modal.classList.remove('active');
                    setTimeout(() => modal.style.display = 'none', 300);
                }
            });
        }

        const shareModal = document.getElementById('share-modal');
        if (shareModal) {
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) {
                    shareModal.classList.remove('active');
                    setTimeout(() => shareModal.style.display = 'none', 300);
                }
            });
        }

        const propLayer = document.getElementById('prop-layer');
        if (propLayer) {
            propLayer.addEventListener('change', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].layer = e.target.value;
                });
                drawAllEntities();
                saveToStorage();
            });
        }

        const propMaterial = document.getElementById('prop-material');
        if (propMaterial) {
            propMaterial.addEventListener('change', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].material = e.target.value;
                    const material = materials.find(m => m.id === e.target.value);
                    if (material) {
                        entities[idx].color = material.color;
                    }
                });
                drawAllEntities();
                saveToStorage();
            });
        }

        const propColor = document.getElementById('prop-color');
        const propColorHex = document.getElementById('prop-color-hex');
        if (propColor) {
            propColor.addEventListener('input', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].color = e.target.value;
                });
                if (propColorHex) propColorHex.value = e.target.value;
                drawAllEntities();
                saveToStorage();
            });
        }
        if (propColorHex) {
            propColorHex.addEventListener('change', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].color = e.target.value;
                });
                if (propColor) propColor.value = e.target.value;
                drawAllEntities();
                saveToStorage();
            });
        }

        const propLineweight = document.getElementById('prop-lineweight');
        if (propLineweight) {
            propLineweight.addEventListener('change', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].lineweight = parseFloat(e.target.value);
                });
                drawAllEntities();
                saveToStorage();
            });
        }

        const propLinetype = document.getElementById('prop-linetype');
        if (propLinetype) {
            propLinetype.addEventListener('change', (e) => {
                saveState();
                selectedEntityIndices.forEach(idx => {
                    entities[idx].linetype = e.target.value;
                });
                drawAllEntities();
                saveToStorage();
            });
        }

        const propTransparency = document.getElementById('prop-transparency');
        const transparencyValue = document.getElementById('transparency-value');
        if (propTransparency) {
            propTransparency.addEventListener('input', (e) => {
                saveState();
                const val = parseInt(e.target.value);
                selectedEntityIndices.forEach(idx => {
                    entities[idx].transparency = val;
                });
                if (transparencyValue) transparencyValue.textContent = val;
                drawAllEntities();
                saveToStorage();
            });
        }

        document.querySelectorAll('.menu-option[data-action]').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = option.dataset.action;
                switch(action) {
                    case 'new': newDrawing(); break;
                    case 'open': loadFromStorage(); break;
                    case 'recent-files': showRecentFiles(); break;
                    case 'save': saveDrawing(); break;
                    case 'save-as': saveAsDrawing(); break;
                    case 'export-dxf': exportDXF(); break;
                    case 'export-svg': exportSVG(); break;
                    case 'export-png': exportPNG(); break;
                    case 'export-pdf': exportPDF(); break;
                    case 'print': printDrawing(); break;
                    case 'exit': window.close(); break;
                    case 'undo': undo(); break;
                    case 'redo': redo(); break;
                    case 'cut': cutSelected(); break;
                    case 'copy': copySelected(); break;
                    case 'paste': pasteClipboard(); break;
                    case 'select-all': 
                        selectedEntityIndices = entities.map((_, idx) => idx);
                        drawAllEntities();
                        showSaveIndicator(`${selectedEntityIndices.length} entities selected`);
                        break;
                    case 'deselect': deselectAll(); break;
                    case 'units': showUnitsSetup(); break;
                    case 'limits': showDrawingLimits(); break;
                    case 'grid-settings': showGridSettings(); break;
                    case 'layers': 
                        const layersPanel = document.getElementById('layers-panel');
                        if (layersPanel) {
                            layersPanel.style.display = layersPanel.style.display === 'none' ? 'block' : 'none';
                        }
                        break;
                    case 'materials':
                        const materialsPanel = document.getElementById('materials-panel');
                        if (materialsPanel) {
                            materialsPanel.style.display = materialsPanel.style.display === 'none' ? 'block' : 'none';
                        }
                        break;
                    case 'theme': toggleTheme(); break;
                    case 'shortcuts':
                        const shortcutsModal = document.getElementById('shortcuts-modal');
                        if (shortcutsModal) {
                            shortcutsModal.style.display = 'flex';
                            setTimeout(() => shortcutsModal.classList.add('active'), 10);
                        }
                        break;
                    case 'tips':
                        const tipsModal = document.getElementById('tips-modal');
                        if (tipsModal) {
                            tipsModal.style.display = 'flex';
                            setTimeout(() => tipsModal.classList.add('active'), 10);
                        }
                        break;
                    case 'about':
                        const aboutModal = document.getElementById('about-modal');
                        if (aboutModal) {
                            aboutModal.style.display = 'flex';
                            setTimeout(() => aboutModal.classList.add('active'), 10);
                        }
                        break;
                }
            });
        });

        document.querySelectorAll('.menu-option[data-tool]').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const tool = option.dataset.tool;
                setTool(tool);
            });
        });

        document.querySelectorAll('.menu-option[data-dimension]').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const dimType = option.dataset.dimension;
                switch(dimType) {
                    case 'linear':
                    case 'aligned':
                    case 'angular':
                    case 'radius':
                    case 'diameter':
                        setDimensionType(dimType);
                        setTool('dimension');
                        currentDimensionType = dimType;
                        showSaveIndicator(`${dimType.charAt(0).toUpperCase() + dimType.slice(1)} Dimension tool active`);
                        break;
                    case 'arc':
                        setTool('arc-length-dimension');
                        showSaveIndicator('Click on an arc to add arc length dimension');
                        break;
                }
            });
        });

        document.querySelectorAll('.menu-option[data-modify]').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const modifyType = option.dataset.modify;
                switch(modifyType) {
                    case 'trim': setTool('trim'); break;
                    case 'extend': setTool('extend'); break;
                    case 'move': setTool('move'); break;
                    case 'mirror': setTool('mirror'); break;
                    case 'rotate': setTool('rotate'); break;
                    case 'scale': setTool('scale'); break;
                    case 'stretch': setTool('stretch'); break;
                    case 'fillet': setTool('fillet'); break;
                    case 'chamfer': setTool('chamfer'); break;
                    case 'offset': setTool('offset'); break;
                    case 'array': setTool('array'); break;
                    case 'break': setTool('break'); break;
                    case 'join': setTool('join'); break;
                    case 'group': groupSelected(); setTool('select'); break;
                    case 'ungroup': ungroupSelected(); setTool('select'); break;
                    case 'block': createBlock(); setTool('select'); break;
                }
            });
        });

        document.querySelectorAll('.menu-option[data-draw]').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const drawType = option.dataset.draw;
                setTool(drawType);
            });
        });

        const commandLine = document.getElementById('command-line');
        if (commandLine) {
            const layersPanel = document.getElementById('layers-panel');
            const propertiesPanel = document.getElementById('properties-panel');
            if (layersPanel) layersPanel.style.display = 'none';
            if (propertiesPanel) propertiesPanel.style.display = 'none';

            commandLine.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const cmd = e.target.value.toUpperCase().trim();
                    addCommandHistory(cmd);

                    const cmdMap = {
                        'L': 'continuous-line',
                        'PL': 'polyline',
                        'SPL': 'spline',
                        'AR': 'arc',
                        'C': 'circle',
                        'EL': 'ellipse',
                        'REC': 'rect',
                        'H': 'hatch',
                        'T': 'text',
                        'DI': 'measure',
                        'DIM': 'dimension',
                        'DIMARC': 'arc-length-dimension',
                        'MIR': 'mirror',
                        'ROT': 'rotate',
                        'M': 'move',
                        'CO': 'clone',
                        'SC': 'scale',
                        'S': 'stretch',
                        'TR': 'trim',
                        'EX': 'extend',
                        'F': 'fillet',
                        'CHA': 'chamfer',
                        'O': 'offset',
                        'ARRAY': 'array',
                        'BR': 'break',
                        'J': 'join',
                        'G': 'group',
                        'U': 'ungroup',
                        'Z': 'zoom-extents',
                        'DEL': 'delete',
                        'CLS': 'clear',
                        'OR': 'ortho',
                        'OS': 'osnap',
                        'POL': 'polar',
                        'GRID': 'grid'
                    };

                    if (cmd === 'LAYERS') {
                        if (layersPanel) {
                            layersPanel.style.display = layersPanel.style.display === 'none' ? 'block' : 'none';
                            showSaveIndicator('Layers panel toggled');
                        }
                    } else if (cmd === 'PROPERTIES') {
                        if (propertiesPanel) {
                            propertiesPanel.style.display = propertiesPanel.style.display === 'none' ? 'block' : 'none';
                            showSaveIndicator('Properties panel toggled');
                        }
                    } else if (cmd === 'MATERIALS') {
                        const materialsPanel = document.getElementById('materials-panel');
                        if (materialsPanel) {
                            materialsPanel.style.display = materialsPanel.style.display === 'none' ? 'block' : 'none';
                            showSaveIndicator('Materials panel toggled');
                        }
                    } else if (cmdMap[cmd] === 'ortho') {
                        toggleOrthoMode();
                    } else if (cmdMap[cmd] === 'osnap') {
                        toggleOSNAP();
                    } else if (cmdMap[cmd] === 'polar') {
                        togglePolarMode();
                    } else if (cmdMap[cmd] === 'grid') {
                        toggleGridSnap();
                    } else if (cmdMap[cmd] === 'zoom-extents') {
                        zoomExtents();
                    } else if (cmdMap[cmd] === 'delete') {
                        deleteSelected();
                    } else if (cmdMap[cmd] === 'clear') {
                        clearCanvas();
                    } else if (cmdMap[cmd]) {
                        setTool(cmdMap[cmd]);
                    } else {
                        showSaveIndicator(`Unknown command: ${cmd}`);
                        addCommandHistory(cmd, false);
                    }

                    e.target.value = '';
                }
            });

            const historyBtn = document.getElementById('command-history-btn');
            if (historyBtn) {
                historyBtn.addEventListener('click', () => {
                    const historyEl = document.getElementById('command-history');
                    historyEl.classList.toggle('visible');
                });
            }
        }

        const infoModal = document.getElementById('info-modal');
        const infoBtn = document.getElementById('btn-info');
        const closeInfoBtn = document.getElementById('close-info');

        if (infoBtn && infoModal) {
            infoBtn.addEventListener('click', () => {
                infoModal.style.display = 'flex';
                setTimeout(() => infoModal.classList.add('active'), 10);
            });
        }

        if (closeInfoBtn && infoModal) {
            closeInfoBtn.addEventListener('click', () => {
                infoModal.classList.remove('active');
                setTimeout(() => infoModal.style.display = 'none', 300);
            });
        }

        if (infoModal) {
            infoModal.addEventListener('click', (e) => {
                if (e.target === infoModal) {
                    infoModal.classList.remove('active');
                    setTimeout(() => infoModal.style.display = 'none', 300);
                }
            });
        }

        const shortcutsModal = document.getElementById('shortcuts-modal');
        const closeShortcutsBtn = document.getElementById('close-shortcuts');
        if (closeShortcutsBtn && shortcutsModal) {
            closeShortcutsBtn.addEventListener('click', () => {
                shortcutsModal.classList.remove('active');
                setTimeout(() => shortcutsModal.style.display = 'none', 300);
            });
        }
        if (shortcutsModal) {
            shortcutsModal.addEventListener('click', (e) => {
                if (e.target === shortcutsModal) {
                    shortcutsModal.classList.remove('active');
                    setTimeout(() => shortcutsModal.style.display = 'none', 300);
                }
            });
        }

        const tipsModal = document.getElementById('tips-modal');
        const closeTipsBtn = document.getElementById('close-tips');
        if (closeTipsBtn && tipsModal) {
            closeTipsBtn.addEventListener('click', () => {
                tipsModal.classList.remove('active');
                setTimeout(() => tipsModal.style.display = 'none', 300);
            });
        }
        if (tipsModal) {
            tipsModal.addEventListener('click', (e) => {
                if (e.target === tipsModal) {
                    tipsModal.classList.remove('active');
                    setTimeout(() => tipsModal.style.display = 'none', 300);
                }
            });
        }

        const aboutModal = document.getElementById('about-modal');
        const closeAboutBtn = document.getElementById('close-about');
        if (closeAboutBtn && aboutModal) {
            closeAboutBtn.addEventListener('click', () => {
                aboutModal.classList.remove('active');
                setTimeout(() => aboutModal.style.display = 'none', 300);
            });
        }
        if (aboutModal) {
            aboutModal.addEventListener('click', (e) => {
                if (e.target === aboutModal) {
                    aboutModal.classList.remove('active');
                    setTimeout(() => aboutModal.style.display = 'none', 300);
                }
            });
        }

        const recentModal = document.getElementById('recent-files-modal');
        const closeRecentBtn = document.getElementById('close-recent');
        if (closeRecentBtn && recentModal) {
            closeRecentBtn.addEventListener('click', () => {
                recentModal.classList.remove('active');
                setTimeout(() => recentModal.style.display = 'none', 300);
            });
        }
        if (recentModal) {
            recentModal.addEventListener('click', (e) => {
                if (e.target === recentModal) {
                    recentModal.classList.remove('active');
                    setTimeout(() => recentModal.style.display = 'none', 300);
                }
            });
        }

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);

        const btn3d = document.getElementById('btn-3d-page');
        if (btn3d) {
            btn3d.addEventListener('click', () => {
                window.location.href = 'index.html';
            });
        }

        const closeLayersBtn = document.getElementById('close-layers');
        if (closeLayersBtn) {
            closeLayersBtn.addEventListener('click', () => {
                const layersPanelElem = document.getElementById('layers-panel');
                if (layersPanelElem) {
                    layersPanelElem.style.display = 'none';
                    showSaveIndicator('Layers panel closed');
                }
            });
        }

        const closeMaterialsBtn = document.getElementById('close-materials');
        if (closeMaterialsBtn) {
            closeMaterialsBtn.addEventListener('click', () => {
                const materialsPanelElem = document.getElementById('materials-panel');
                if (materialsPanelElem) {
                    materialsPanelElem.style.display = 'none';
                    showSaveIndicator('Materials panel closed');
                }
            });
        }

        const closePropertiesBtn = document.getElementById('close-properties');
        if (closePropertiesBtn) {
            closePropertiesBtn.addEventListener('click', () => {
                const propertiesPanelElem = document.getElementById('properties-panel');
                if (propertiesPanelElem) {
                    propertiesPanelElem.style.display = 'none';
                    showSaveIndicator('Properties panel closed');
                }
            });
        }

        const setFilletBtn = document.getElementById('set-fillet-radius');
        if (setFilletBtn) {
            setFilletBtn.addEventListener('click', setFilletRadius);
        }

        const setChamferBtn = document.getElementById('set-chamfer-distance');
        if (setChamferBtn) {
            setChamferBtn.addEventListener('click', setChamferDistance);
        }

        const setOffsetBtn = document.getElementById('set-offset-distance');
        if (setOffsetBtn) {
            setOffsetBtn.addEventListener('click', setOffsetDistance);
        }

        const setPolarBtn = document.getElementById('set-polar-angle');
        if (setPolarBtn) {
            setPolarBtn.addEventListener('click', setPolarAngle);
        }

        document.querySelectorAll('.layout-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                if (tab.id === 'add-layout') {
                    const name = prompt('Enter layout name:', `Layout ${Object.keys(layouts).length}`);
                    if (name) {
                        layouts[name] = { entities: [], panX: 0, panY: 0, zoom: 1 };
                        const newTab = document.createElement('div');
                        newTab.className = 'layout-tab';
                        newTab.dataset.layout = name;
                        newTab.textContent = name;
                        tab.parentNode.insertBefore(newTab, tab);
                    }
                } else {
                    document.querySelectorAll('.layout-tab').forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    currentLayout = tab.dataset.layout;
                    showSaveIndicator(`Switched to ${currentLayout}`);
                }
            });
        });
    }

    // ===== INITIALIZE =====
    resizeCanvas();
    loadFromStorage();
    loadFromShareLink();
    loadRecentFiles();
    setupEventListeners();
    setTool('select');
    updateLayersList();
    updateMaterialsList();
    updateModeDisplay();
    updateHistoryButtons();
    startAutoSave();

    if (!localStorage.getItem('architectCAD')) {
        const infoModal = document.getElementById('info-modal');
        if (infoModal) {
            infoModal.style.display = 'flex';
            setTimeout(() => infoModal.classList.add('active'), 10);
        }
    }

    console.log(`%c${APP_NAME} v${VERSION} - Professional 2D CAD Tool`, 'color: #4ade80; font-size: 14px; font-weight: bold;');
    console.log(`%cAll AutoCAD-style tools available:`, 'color: #fcd34d; font-size: 12px;');
    console.log(`%c  Draw: Line, Polyline, Spline, Arc, Circle, Ellipse, Rectangle, Hatch, Text, Measure`, 'color: #94a3b8; font-size: 11px;');
    console.log(`%c  Modify: Move, Copy, Mirror, Rotate, Scale, Stretch, Trim, Extend, Fillet, Chamfer, Offset, Array, Break, Join, Group, Block`, 'color: #94a3b8; font-size: 11px;');
    console.log(`%c  Dimension: Linear, Aligned, Angular, Radius, Diameter, Arc Length`, 'color: #94a3b8; font-size: 11px;');
    console.log(`%c  Navigation: Pan, Zoom, Zoom Extents`, 'color: #94a3b8; font-size: 11px;');
    console.log(`%c  Shortcuts: F3=OSNAP, F8=Ortho, F9=Grid, F10=Polar, Ctrl+A=Select All, Del=Delete, Esc=Cancel, ?=Help`, 'color: #94a3b8; font-size: 11px;');

    canvas.addEventListener('mouseleave', () => {
        livePoint.style.display = 'none';
        snapIndicator.style.display = 'none';
        orthoH.style.display = 'none';
        orthoV.style.display = 'none';
    });

    // ===== Additive, read-only bridge for external extensions =====
    // Exposes the current drawing so other scripts (e.g. a 3D workspace or
    // the dashboard's file manager) can read and load documents without
    // needing access to this closure, and without this file needing to know
    // anything about them.
    window.ArchitectSAFCore = window.ArchitectSAFCore || {
        getEntities: () => JSON.parse(JSON.stringify(entities)),
        getLayers: () => JSON.parse(JSON.stringify(layers)),
        getView: () => ({ panX, panY, zoom }),
        getUnit: () => currentUnit,
        getEntityCount: () => entities.length,
        resizeCanvas: () => resizeCanvas(),

        // Quick environment presets (mirrors a "SETUP-METRIC"/"SETUP-IMPERIAL"
        // style command): sets the display unit and a sensible snap grid
        // instantly. Internal drawing units are always mm (see unitFactors),
        // so this only changes labeling/snap granularity, never geometry.
        setupMetric: () => {
            currentUnit = 'm';
            snapGrid = 100; // 100mm snap grid
            const ud = document.getElementById('unit-display');
            if (ud) ud.innerText = currentUnit;
            const sd = document.getElementById('snap-size');
            if (sd) sd.innerText = snapGrid;
            drawAllEntities();
            if (typeof showSaveIndicator === 'function') showSaveIndicator('Metric setup applied (meters, 100mm snap)');
        },
        setupImperial: () => {
            currentUnit = 'ft';
            snapGrid = 152.4; // 6" snap grid (in internal mm units)
            const ud = document.getElementById('unit-display');
            if (ud) ud.innerText = currentUnit;
            const sd = document.getElementById('snap-size');
            if (sd) sd.innerText = snapGrid;
            drawAllEntities();
            if (typeof showSaveIndicator === 'function') showSaveIndicator('Imperial setup applied (feet, 6in snap)');
        },

        // Serializes the live document into the same shape saveToStorage()
        // persists, so a caller can stash it against a file record.
        getProjectData: () => JSON.parse(JSON.stringify({
            entities: entities,
            layers: layers,
            materials: materials,
            currentLayer: currentLayer,
            currentMaterial: currentMaterial,
            unit: currentUnit,
            snap: snapGrid,
            version: VERSION,
            osnapSettings: {
                enabled: osnapEnabled,
                endpoints: osnapEndpoints,
                midpoints: osnapMidpoints,
                centers: osnapCenters,
                intersections: osnapIntersections,
                perpendicular: osnapPerpendicular,
                tangent: osnapTangent
            }
        })),

        // Clears all transient tool/selection state (same set newDrawing()
        // resets) without the confirm() dialog, so a host UI (the dashboard)
        // can drive it directly.
        newProject: () => {
            entities = [];
            selectedEntityIndices = [];
            drawing = false;
            tempEntity = null;
            polylinePoints = [];
            continuousLinePoints = [];
            isDrawingContinuousLine = false;
            continuousLineStartPoint = null;
            dimensionStartPoint = null;
            isDrawingDimension = false;
            isDrawingArcLength = false;
            selectedArcEntity = null;
            arcLengthPreview = null;
            splinePoints = [];
            isDrawingSpline = false;
            ellipseCenter = null;
            isDrawingEllipse = false;
            hatchPoints = [];
            isDrawingHatch = false;
            mirrorPoint1 = null;
            rotateCenter = null;
            cloneBasePoint = null;
            isCloning = false;
            moveBasePoint = null;
            isMoving = false;
            stretchBasePoint = null;
            isStretching = false;
            hoveredEntityIndex = -1;
            isSelecting = false;
            selectionBox = null;
            undoStack = [];
            redoStack = [];
            panX = 0;
            panY = 0;
            zoom = 1;
            resizeCanvas();
            drawAllEntities();
            updateLayersList();
            updateMaterialsList();
            updateHistoryButtons();
        },

        // Loads a project object (same shape getProjectData()/saveToStorage()
        // produce) into the live engine, replacing the current document.
        loadProject: (data) => {
            if (!data || typeof data !== 'object') return false;
            window.ArchitectSAFCore.newProject();

            entities = Array.isArray(data.entities) ? data.entities : [];
            layers = Array.isArray(data.layers) ? data.layers : layers;
            materials = Array.isArray(data.materials) ? data.materials : materials;
            currentLayer = data.currentLayer || '0';
            currentMaterial = data.currentMaterial || '1';
            currentUnit = data.unit || 'cm';
            snapGrid = data.snap || 5;

            if (data.osnapSettings) {
                osnapEnabled = data.osnapSettings.enabled ?? true;
                osnapEndpoints = data.osnapSettings.endpoints ?? true;
                osnapMidpoints = data.osnapSettings.midpoints ?? true;
                osnapCenters = data.osnapSettings.centers ?? true;
                osnapIntersections = data.osnapSettings.intersections ?? true;
                osnapPerpendicular = data.osnapSettings.perpendicular ?? false;
                osnapTangent = data.osnapSettings.tangent ?? false;
            }

            resizeCanvas();
            if (entities.length > 0) zoomExtents(); else drawAllEntities();
            updateLayersList();
            updateMaterialsList();
            updateHistoryButtons();
            return true;
        }
    };
})();