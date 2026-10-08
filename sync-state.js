/**
 * sync-state.js
 * ----------------------------------------------------------------
 * The centralized state array requirement: a single flat array tracking
 * every Three.js-authored object (a wall segment or a named room) against
 * exactly where it lives in Luckysheet.
 *
 * Deliberately a flat array, not a nested object/tree: appends are O(1),
 * and filtering by sheet or type is a single predictable Array scan with
 * no hashing/indexing overhead to maintain — the right trade-off at the
 * scale a floor plan actually reaches (tens to a few hundred entries),
 * and trivially fast to reason about, inspect, and unit test.
 * ----------------------------------------------------------------
 */

/** @type {Array<Object>} */
export const syncState = [];

/**
 * @param {{threeRef:any, sheetOrder:number, row:number, label:string,
 *   x1:number, z1:number, x2:number, z2:number,
 *   lengthM:number, heightM:number, thicknessM:number}} entry
 */
export function pushWallState(entry) {
    syncState.push({ type: 'wall', ...entry });
}

/**
 * @param {{name:string, sheetOrder:number, row:number, loopPoints:Array,
 *   areaM2:number, perimeterM:number, wallHeightM:number}} entry
 */
export function pushRoomState(entry) {
    syncState.push({ type: 'room', ...entry });
}

export function getStateForSheet(sheetOrder) {
    return syncState.filter((e) => e.sheetOrder === sheetOrder);
}

export function getWalls() {
    return syncState.filter((e) => e.type === 'wall');
}

export function getRooms() {
    return syncState.filter((e) => e.type === 'room');
}

/** Removes every entry belonging to a sheet (e.g. if that layout is ever discarded). */
export function clearStateForSheet(sheetOrder) {
    for (let i = syncState.length - 1; i >= 0; i--) {
        if (syncState[i].sheetOrder === sheetOrder) syncState.splice(i, 1);
    }
}
