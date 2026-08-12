/**
 * engine.js
 * Thin wrapper around engine.worker.js that exposes a promise-based API
 * matching the shape of the old Python localhost:8000 server responses.
 *
 * Replaces the network apiFetch function in index.js with in-process calls.
 */

(function () {
    'use strict';

    // ── Spawn the worker ────────────────────────────────────────────────────
    const workerBlob = (() => {
        try {
            // Preferred: load as a module-based worker from same origin
            return new Worker('engine.worker.js');
        } catch (_) {
            return null;
        }
    })();

    let _nextId = 1;
    const _pending = new Map(); // id → { resolve, reject }

    if (workerBlob) {
        workerBlob.onmessage = function (e) {
            const { id, result, error } = e.data;
            const p = _pending.get(id);
            if (!p) return;
            _pending.delete(id);
            if (error) p.reject(new Error(error));
            else p.resolve(result);
        };
        workerBlob.onerror = function (e) {
            console.error('[ChipsFish Engine Worker Error]', e);
        };
    }

    /**
     * Send a message to the engine worker and return a Promise.
     * Falls back to an error if the worker failed to load.
     */
    function engineCall(type, params = {}) {
        if (!workerBlob) {
            return Promise.reject(new Error('Engine worker failed to load.'));
        }
        return new Promise((resolve, reject) => {
            const id = _nextId++;
            _pending.set(id, { resolve, reject });
            workerBlob.postMessage({ id, type, ...params });
        });
    }

    // ── Public API (mirrors the old /api/* endpoints) ───────────────────────

    /**
     * Drop-in replacement for the old apiFetch(endpoint, data) function.
     * Maps endpoint paths to worker message types.
     */
    window.engineApiFetch = async function (endpoint, data = {}) {
        const type = endpointToType(endpoint);
        if (!type) throw new Error(`Unknown endpoint: ${endpoint}`);
        return engineCall(type, data);
    };

    function endpointToType(endpoint) {
        const map = {
            '/api/initialize': 'initialize',
            '/api/moves':      'moves',
            '/api/move':       'move',
            '/api/ai_move':    'ai_move',
            '/api/best_move':  'best_move',
            '/api/eval':       'eval',
        };
        return map[endpoint] || null;
    }

    // ── Expose a status check for debugging ─────────────────────────────────
    window.engineReady = !!workerBlob;

    console.log('[ChipsFish] JS Engine loaded.', workerBlob ? 'Worker active.' : 'Worker FAILED to load.');
})();
