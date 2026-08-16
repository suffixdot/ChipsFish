/**
 * engine.js — Promise-based wrapper for engine.worker.js
 */

(function () {
    'use strict';

    let worker = null;
    try {
        worker = new Worker('engine.worker.js');
    } catch (e) {
        console.error('[ChipsFish Analyzer Engine Worker Failed]', e);
    }

    let nextId = 1;
    const pending = new Map();

    if (worker) {
        worker.onmessage = function (e) {
            const { id, result, error } = e.data;
            const p = pending.get(id);
            if (!p) return;
            pending.delete(id);
            if (error) p.reject(new Error(error));
            else p.resolve(result);
        };
        worker.onerror = function (e) {
            console.error('[Engine Worker Runtime Error]', e);
        };
    }

    function callWorker(type, params = {}) {
        if (!worker) {
            return Promise.reject(new Error('Engine worker is not initialized.'));
        }
        return new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            worker.postMessage({ id, type, ...params });
        });
    }

    window.engineApiFetch = async function (endpoint, data = {}) {
        const map = {
            '/api/initialize': 'initialize',
            '/api/moves':      'moves',
            '/api/move':       'move',
            '/api/best_move':  'best_move',
            '/api/eval':       'eval',
            '/api/analyze':    'analyze_position'
        };
        const type = map[endpoint] || endpoint.replace('/api/', '');
        return callWorker(type, data);
    };

    window.analyzePosition = function (params) {
        return callWorker('analyze_position', params);
    };

    window.engineReady = !!worker;
    console.log('[ChipsFish Analyzer Engine] Initialized worker successfully.');
})();
