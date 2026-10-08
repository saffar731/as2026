/**
 * room-modal.js
 * ----------------------------------------------------------------
 * A tiny Promise-wrapped modal: shows the instant a closed loop is
 * detected, asking "What is the room name?" and resolving with the typed
 * name (or `null` if cancelled). Markup lives in index.html; this module
 * only wires behavior, keeping it swappable/testable independent of style.
 * ----------------------------------------------------------------
 */
export function promptRoomName() {
    return new Promise((resolve) => {
        const overlay = document.getElementById('room-modal-overlay');
        const form = document.getElementById('room-modal-form');
        const input = document.getElementById('room-modal-input');
        const cancelBtn = document.getElementById('room-modal-cancel');

        input.value = '';
        overlay.classList.add('visible');
        requestAnimationFrame(() => input.focus());

        function cleanup() {
            overlay.classList.remove('visible');
            form.removeEventListener('submit', onSubmit);
            cancelBtn.removeEventListener('click', onCancel);
        }
        function onSubmit(e) {
            e.preventDefault();
            const name = input.value.trim() || 'Unnamed Room';
            cleanup();
            resolve(name);
        }
        function onCancel() {
            cleanup();
            resolve(null);
        }

        form.addEventListener('submit', onSubmit);
        cancelBtn.addEventListener('click', onCancel);
    });
}
