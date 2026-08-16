/**
 * analyzer.js — ChipsFish Standalone Damath Solver & Tablebase Controller
 */

(function () {
    'use strict';

    // ─────────────────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────────────────

    let currentFen = '';
    let sideToMove = 'r';
    let redScore = '0';
    let blueScore = '0';
    let boardGrid = Array(64).fill(null);
    let legalMoves = [];
    let selectedSquare = null;
    let isFlipped = false;
    let soundEnabled = true;
    let activeVariant = 'integer';

    // Analysis State
    let isAnalyzing = false;
    let targetDepth = 7;
    let currentAnalysis = null;
    let analysisRequestId = 0;
    let autoSolveActive = false;
    let autoSolveTimer = null;
    let crawlActive = false;

    // ─────────────────────────────────────────────────────────────────────────
    // VARIANT DEFINITIONS & CHIP FORMATTERS
    // ─────────────────────────────────────────────────────────────────────────

    const DAMATH_VARIANTS = {
        counting:   { label: 'Counting', grade: 'Grades 1–2', hint: 'Chips: 1–12 (positive numbers)' },
        whole:      { label: 'Whole Number', grade: 'Grades 3–4', hint: 'Chips: 0–11 (whole numbers)' },
        fraction:   { label: 'Fraction', grade: 'Grades 5–6', hint: 'Chips: 1/10 to 12/10' },
        integer:    { label: 'Integer', grade: 'Grade 7', hint: 'Chips: -11 to 10 (official layout)' },
        rational:   { label: 'Rational', grade: 'Grade 8', hint: 'Chips: -11/10 to 10/10' },
        radical:    { label: 'Radical', grade: 'Grade 9', hint: 'Chips: radical expressions (e.g. -9√2, 144√8)' },
        polynomial: { label: 'Polynomial', grade: 'Grade 10', hint: 'Chips: polynomial terms (e.g. 78xy², -45y)' },
        thermo:     { label: 'Thermo Sci-Dama', grade: 'Grade 10', hint: 'Chips: Mass (g) & Temp (°C) — Lower score wins!' }
    };

    const VARIANT_FEN_TO_KEY = {
        integer: {
            '-11': '-11', '8': '8',  '-5': '-5', '2': '2',
            '0':   '0',   '-3': '-3','10': '10',  '-7': '-7',
            '-9':  '-9',  '6': '6',  '-1': '-1',  '4': '4'
        },
        rational: {
            '-11/10': '-11', '4/5': '8', '8/10': '8', '-1/2': '-5', '-5/10': '-5',
            '1/5': '2', '2/10': '2', '0': '0', '0/1': '0', '-3/10': '-3',
            '1': '10', '1/1': '10', '10/10': '10', '-7/10': '-7',
            '-9/10': '-9', '3/5': '6', '6/10': '6', '-1/10': '-1', '2/5': '4', '4/10': '4'
        },
        counting: {
            '11': '-11', '8': '8',  '5': '-5', '2': '2',
            '12': '0',   '3': '-3', '10': '10', '7': '-7',
            '9':  '-9',  '6': '6',  '1': '-1',  '4': '4'
        },
        whole: {
            '11': '-11', '8': '8',  '5': '-5', '2': '2',
            '0':  '0',   '3': '-3', '10': '10', '7': '-7',
            '9':  '-9',  '6': '6',  '1': '-1',  '4': '4'
        },
        fraction: {
            '11/10': '-11', '4/5': '8', '8/10': '8', '1/2': '-5', '5/10': '-5',
            '1/5': '2', '2/10': '2', '6/5': '0', '12/10': '0', '3/10': '-3',
            '1': '10', '10/10': '10', '7/10': '-7', '9/10': '-9',
            '3/5': '6', '6/10': '6', '1/10': '-1', '2/5': '4', '4/10': '4'
        },
        radical: {
            '-121': '-11', '-81': '8', '100': '-5', '144': '2',
            '-49':  '0',   '-25': '-3', '36': '10',  '64': '-7',
            '-9':   '-9',  '-1': '6',   '4': '-1',  '16': '4'
        },
        polynomial: {
            '-3': '-11', '-1': '8',  '6': '-5',  '10': '2',
            '-55': '0',  '-45': '-3', '66': '10',  '78': '-7',
            '-21': '-9', '-15': '6',  '28': '-1',  '36': '4'
        },
        thermo: {
            '37': '37', '23': '23', '13': '13', '5':  '5',
            '2':  '2',  '7':  '7',  '31': '31', '19': '19',
            '29': '29', '17': '17', '3':  '3',  '11': '11'
        }
    };

    const VARIANT_CHIP_DATA = {
        thermo: {
            '37': { raw: '37g',  html: '37<span class="chip-unit">g</span>' },
            '23': { raw: '23°C', html: '23<span class="chip-unit">°C</span>' },
            '13': { raw: '13g',  html: '13<span class="chip-unit">g</span>' },
            '5':  { raw: '5°C',  html: '5<span class="chip-unit">°C</span>' },
            '2':  { raw: '2°C',  html: '2<span class="chip-unit">°C</span>' },
            '7':  { raw: '7g',   html: '7<span class="chip-unit">g</span>' },
            '31': { raw: '31°C', html: '31<span class="chip-unit">°C</span>' },
            '19': { raw: '19g',  html: '19<span class="chip-unit">g</span>' },
            '29': { raw: '29g',  html: '29<span class="chip-unit">g</span>' },
            '17': { raw: '17°C', html: '17<span class="chip-unit">°C</span>' },
            '3':  { raw: '3g',   html: '3<span class="chip-unit">g</span>' },
            '11': { raw: '11°C', html: '11<span class="chip-unit">°C</span>' }
        },
        integer: {
            '-11': { raw: '-11', html: '-11' }, '8':   { raw: '8', html: '8' },
            '-5':  { raw: '-5', html: '-5' },   '2':   { raw: '2', html: '2' },
            '0':   { raw: '0', html: '0' },     '-3':  { raw: '-3', html: '-3' },
            '10':  { raw: '10', html: '10' },   '-7':  { raw: '-7', html: '-7' },
            '-9':  { raw: '-9', html: '-9' },   '6':   { raw: '6', html: '6' },
            '-1':  { raw: '-1', html: '-1' },   '4':   { raw: '4', html: '4' }
        },
        rational: {
            '-11': { raw: '-11/10', html: '<span class="chip-frac"><sup>-11</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '8':   { raw: '8/10',   html: '<span class="chip-frac"><sup>8</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-5':  { raw: '-5/10',  html: '<span class="chip-frac"><sup>-5</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '2':   { raw: '2/10',   html: '<span class="chip-frac"><sup>2</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '0':   { raw: '0',      html: '0' },
            '-3':  { raw: '-3/10',  html: '<span class="chip-frac"><sup>-3</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '10':  { raw: '10/10',  html: '<span class="chip-frac"><sup>10</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-7':  { raw: '-7/10',  html: '<span class="chip-frac"><sup>-7</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-9':  { raw: '-9/10',  html: '<span class="chip-frac"><sup>-9</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '6':   { raw: '6/10',   html: '<span class="chip-frac"><sup>6</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-1':  { raw: '-1/10',  html: '<span class="chip-frac"><sup>-1</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '4':   { raw: '4/10',   html: '<span class="chip-frac"><sup>4</sup><span class="frac-slash">/</span><sub>10</sub></span>' }
        },
        counting: {
            '-11': { raw: '11', html: '11' }, '8':   { raw: '8', html: '8' },
            '-5':  { raw: '5', html: '5' },   '2':   { raw: '2', html: '2' },
            '0':   { raw: '12', html: '12' }, '-3':  { raw: '3', html: '3' },
            '10':  { raw: '10', html: '10' }, '-7':  { raw: '7', html: '7' },
            '-9':  { raw: '9', html: '9' },   '6':   { raw: '6', html: '6' },
            '-1':  { raw: '1', html: '1' },   '4':   { raw: '4', html: '4' }
        },
        whole: {
            '-11': { raw: '11', html: '11' }, '8':   { raw: '8', html: '8' },
            '-5':  { raw: '5', html: '5' },   '2':   { raw: '2', html: '2' },
            '0':   { raw: '0', html: '0' },   '-3':  { raw: '3', html: '3' },
            '10':  { raw: '10', html: '10' }, '-7':  { raw: '7', html: '7' },
            '-9':  { raw: '9', html: '9' },   '6':   { raw: '6', html: '6' },
            '-1':  { raw: '1', html: '1' },   '4':   { raw: '4', html: '4' }
        },
        fraction: {
            '-11': { raw: '11/10', html: '<span class="chip-frac"><sup>11</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '8':   { raw: '8/10',  html: '<span class="chip-frac"><sup>8</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-5':  { raw: '5/10',  html: '<span class="chip-frac"><sup>5</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '2':   { raw: '2/10',  html: '<span class="chip-frac"><sup>2</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '0':   { raw: '12/10', html: '<span class="chip-frac"><sup>12</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-3':  { raw: '3/10',  html: '<span class="chip-frac"><sup>3</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '10':  { raw: '10/10', html: '<span class="chip-frac"><sup>10</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-7':  { raw: '7/10',  html: '<span class="chip-frac"><sup>7</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-9':  { raw: '9/10',  html: '<span class="chip-frac"><sup>9</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '6':   { raw: '6/10',  html: '<span class="chip-frac"><sup>6</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '-1':  { raw: '1/10',  html: '<span class="chip-frac"><sup>1</sup><span class="frac-slash">/</span><sub>10</sub></span>' },
            '4':   { raw: '4/10',  html: '<span class="chip-frac"><sup>4</sup><span class="frac-slash">/</span><sub>10</sub></span>' }
        },
        radical: {
            '-11': { raw: '-121 √18', html: '<span class="chip-radical"><span class="rad-coef">-121</span><span class="rad-sym">√</span><span class="rad-idx">18</span></span>' },
            '8':   { raw: '-81 √32',  html: '<span class="chip-radical"><span class="rad-coef">-81</span><span class="rad-sym">√</span><span class="rad-idx">32</span></span>' },
            '-5':  { raw: '100 √2',   html: '<span class="chip-radical"><span class="rad-coef">100</span><span class="rad-sym">√</span><span class="rad-idx">2</span></span>' },
            '2':   { raw: '144 √8',   html: '<span class="chip-radical"><span class="rad-coef">144</span><span class="rad-sym">√</span><span class="rad-idx">8</span></span>' },
            '0':   { raw: '-49 √8',   html: '<span class="chip-radical"><span class="rad-coef">-49</span><span class="rad-sym">√</span><span class="rad-idx">8</span></span>' },
            '-3':  { raw: '-25 √18',  html: '<span class="chip-radical"><span class="rad-coef">-25</span><span class="rad-sym">√</span><span class="rad-idx">18</span></span>' },
            '10':  { raw: '36 √32',   html: '<span class="chip-radical"><span class="rad-coef">36</span><span class="rad-sym">√</span><span class="rad-idx">32</span></span>' },
            '-7':  { raw: '64 √2',    html: '<span class="chip-radical"><span class="rad-coef">64</span><span class="rad-sym">√</span><span class="rad-idx">2</span></span>' },
            '-9':  { raw: '-9 √2',    html: '<span class="chip-radical"><span class="rad-coef">-9</span><span class="rad-sym">√</span><span class="rad-idx">2</span></span>' },
            '6':   { raw: '-√8',      html: '<span class="chip-radical"><span class="rad-coef">-</span><span class="rad-sym">√</span><span class="rad-idx">8</span></span>' },
            '-1':  { raw: '4 √18',    html: '<span class="chip-radical"><span class="rad-coef">4</span><span class="rad-sym">√</span><span class="rad-idx">18</span></span>' },
            '4':   { raw: '16 √32',   html: '<span class="chip-radical"><span class="rad-coef">16</span><span class="rad-sym">√</span><span class="rad-idx">32</span></span>' }
        },
        polynomial: {
            '-11': { raw: '-3x²y',  html: '-3x<sup>2</sup>y' },
            '8':   { raw: '-xy²',   html: '-xy<sup>2</sup>' },
            '-5':  { raw: '6x',     html: '6x' },
            '2':   { raw: '10y',    html: '10y' },
            '0':   { raw: '-55x',   html: '-55x' },
            '-3':  { raw: '-45y',   html: '-45y' },
            '10':  { raw: '66x²y',  html: '66x<sup>2</sup>y' },
            '-7':  { raw: '78xy²',  html: '78xy<sup>2</sup>' },
            '-9':  { raw: '-21xy²', html: '-21xy<sup>2</sup>' },
            '6':   { raw: '-15x',   html: '-15x' },
            '-1':  { raw: '28y',    html: '28y' },
            '4':   { raw: '36x²y',  html: '36x<sup>2</sup>y' }
        }
    };

    function getVariantChipData(fenValue, variantName) {
        if (fenValue === null || fenValue === undefined) return { raw: '', html: '' };
        const cleanVal = String(fenValue).trim();
        const fenMap = VARIANT_FEN_TO_KEY[variantName] || VARIANT_FEN_TO_KEY.rational;
        const key = fenMap[cleanVal] !== undefined ? fenMap[cleanVal] : cleanVal;
        const map = VARIANT_CHIP_DATA[variantName] || VARIANT_CHIP_DATA.integer;
        return map[key] || { raw: cleanVal, html: cleanVal };
    }

    function getSquareOperator(col, row) {
        const isPlayable = (row + col) % 2 === 1;
        if (!isPlayable) return '';
        const j = Math.floor(col / 2);
        const templates = [
            ['+', '−', '÷', '×'],
            ['−', '+', '×', '÷'],
            ['÷', '×', '+', '−'],
            ['×', '÷', '−', '+'],
        ];
        return templates[row % 4][j];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AUDIO SYNTHESIZER
    // ─────────────────────────────────────────────────────────────────────────

    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    function playSound(type) {
        if (!soundEnabled) return;
        try {
            initAudio();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(800, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'move') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(320, now);
                osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                osc.start(now);
                osc.stop(now + 0.09);
            } else if (type === 'capture') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(220, now);
                osc.frequency.linearRampToValueAtTime(60, now + 0.14);
                gain.gain.setValueAtTime(0.18, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
                osc.start(now);
                osc.stop(now + 0.14);
            }
        } catch (_) {}
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOM ELEMENTS
    // ─────────────────────────────────────────────────────────────────────────

    const elBoard = document.getElementById('board');
    const elBestMoveOverlay = document.getElementById('best-move-overlay');
    const elEvalBarFill = document.getElementById('eval-bar-fill');
    const elEvalBarLabel = document.getElementById('eval-bar-label');
    const elEvalBarWrapper = document.getElementById('eval-bar-wrapper');
    const elEvalBarContainer = document.getElementById('eval-bar-container');

    const elVariantSelect = document.getElementById('variant-select');
    const elVariantBadgeName = document.getElementById('variant-badge-name');
    const elVariantBadgeGrade = document.getElementById('variant-badge-grade');

    const elBtnAnalyzeToggle = document.getElementById('btn-analyze-toggle');
    const elAnalyzeBtnText = document.getElementById('analyze-btn-text');
    const elBtnStepBest = document.getElementById('btn-step-best');
    const elBtnAutoSolve = document.getElementById('btn-auto-solve');
    const elBtnReset = document.getElementById('btn-reset');
    const elBtnFlipBoard = document.getElementById('btn-flip-board');
    const elDepthSlider = document.getElementById('depth-slider');
    const elDepthValue = document.getElementById('depth-value');

    const elScoreRed = document.getElementById('score-red');
    const elScoreBlue = document.getElementById('score-blue');
    const elStatusTurnPill = document.getElementById('status-turn-pill');
    const elStatusTurnText = document.getElementById('status-turn-text');
    const elEngineStatusText = document.getElementById('engine-status-text');

    const elBestMoveTag = document.getElementById('best-move-tag');
    const elEvalScoreTag = document.getElementById('eval-score-tag');
    const elStatDepth = document.getElementById('stat-depth');
    const elStatNodes = document.getElementById('stat-nodes');
    const elStatNps = document.getElementById('stat-nps');
    const elStatTime = document.getElementById('stat-time');

    const elCandidateList = document.getElementById('candidate-list');
    const elFenTextarea = document.getElementById('fen-textarea');
    const elBtnCopyFen = document.getElementById('btn-copy-fen');
    const elBtnLoadFen = document.getElementById('btn-load-fen');

    const elTbCountBadge = document.getElementById('tb-count-badge');
    const elTbTotalCount = document.getElementById('tb-total-count');
    const elTbVariantCount = document.getElementById('tb-variant-count');
    const elTbList = document.getElementById('tb-list');
    const elBtnExportTxt = document.getElementById('btn-export-txt');
    const elBtnExportJson = document.getElementById('btn-export-json');
    const elBtnImport = document.getElementById('btn-import');
    const elFileInput = document.getElementById('file-input');
    const elBtnClearTb = document.getElementById('btn-clear-tb');

    const elMathTooltip = document.getElementById('math-equation-tooltip');
    const elMathTooltipText = document.getElementById('math-tooltip-text');
    const elBtnAudioToggle = document.getElementById('btn-audio-toggle');

    // ─────────────────────────────────────────────────────────────────────────
    // TABLEBASE LOCAL PERSISTENCE (IndexedDB + fallback)
    // ─────────────────────────────────────────────────────────────────────────

    const TABLEBASE_KEY = 'chipsfish_solver_tablebase';
    let tablebaseStore = {}; // Map of key (fen) -> entry

    function initTablebase() {
        try {
            const raw = localStorage.getItem(TABLEBASE_KEY);
            if (raw) tablebaseStore = JSON.parse(raw);
        } catch (_) {
            tablebaseStore = {};
        }
        updateTablebaseStats();
    }

    function saveTablebaseEntry(analysis) {
        if (!analysis || !analysis.fen) return;
        const key = `${analysis.variant}:${analysis.fen}`;
        const existing = tablebaseStore[key];
        if (existing && existing.depth > analysis.depth) return;

        tablebaseStore[key] = {
            fen: analysis.fen,
            variant: analysis.variant,
            side: analysis.side_to_move,
            eval: analysis.eval,
            eval_str: analysis.eval_str,
            bestmove: analysis.bestmove,
            bestmove_raw: analysis.bestmove_raw,
            depth: analysis.depth,
            nodes: analysis.nodes,
            candidate_moves: analysis.candidate_moves || [],
            timestamp: Date.now()
        };

        try {
            localStorage.setItem(TABLEBASE_KEY, JSON.stringify(tablebaseStore));
        } catch (e) {
            console.warn('[Tablebase Storage Full]', e);
        }
        updateTablebaseStats();
    }

    function updateTablebaseStats() {
        const keys = Object.keys(tablebaseStore);
        const total = keys.length;
        let variantCount = 0;
        for (const k of keys) {
            if (k.startsWith(`${activeVariant}:`)) variantCount++;
        }

        if (elTbCountBadge) elTbCountBadge.innerText = `${total} solved`;
        if (elTbTotalCount) elTbTotalCount.innerText = total;
        if (elTbVariantCount) elTbVariantCount.innerText = variantCount;

        renderTablebaseList();
    }

    function renderTablebaseList() {
        if (!elTbList) return;
        elTbList.innerHTML = '';
        const keys = Object.keys(tablebaseStore).reverse().slice(0, 30);
        if (keys.length === 0) {
            elTbList.innerHTML = '<div style="text-align:center; padding:16px; color:var(--text-dim); font-size:0.75rem;">No analyzed positions saved yet. Click "Start Analyzing" or "Auto-Solve".</div>';
            return;
        }

        keys.forEach(k => {
            const entry = tablebaseStore[k];
            const item = document.createElement('div');
            item.className = 'tb-entry';
            item.title = `Click to load position: ${entry.fen}`;
            item.innerHTML = `
                <div class="tb-fen-short">[${entry.variant}] ${entry.fen.split(' ')[0]}</div>
                <div class="tb-move">${entry.bestmove_raw || 'Solved'}</div>
                <div style="font-family:var(--font-mono); font-weight:800; color:${entry.eval >= 0 ? '#ff6b85':'#60a5fa'}">${entry.eval_str}</div>
            `;
            item.addEventListener('click', () => {
                loadCustomFen(entry.fen, entry.variant);
            });
            elTbList.appendChild(item);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EXPORT & IMPORT TABLEBASE KEEPSAKE (.txt & .json)
    // ─────────────────────────────────────────────────────────────────────────

    function exportTablebaseToTxt() {
        const keys = Object.keys(tablebaseStore);
        if (keys.length === 0) {
            alert('Tablebase is currently empty! Run the analyzer to evaluate positions first.');
            return;
        }

        let txt = '';
        txt += '================================================================================\n';
        txt += '              CHIPSFISH DAMATH SOLVER & TABLEBASE ARCHIVE                       \n';
        txt += `              Export Date: ${new Date().toISOString()}                         \n`;
        txt += `              Total Analyzed Positions: ${keys.length}                         \n`;
        txt += '================================================================================\n\n';

        keys.forEach((k, idx) => {
            const e = tablebaseStore[k];
            txt += `[POSITION #${idx + 1}]\n`;
            txt += `Variant:       ${e.variant.toUpperCase()} DAMATH\n`;
            txt += `Side to Move:  ${e.side === 'r' ? 'RED' : 'BLUE'}\n`;
            txt += `Evaluation:    ${e.eval_str} (RED perspective: ${e.eval})\n`;
            txt += `Depth / Nodes: Depth ${e.depth} (${e.nodes.toLocaleString()} nodes)\n`;
            txt += `Best Move:     ${e.bestmove_raw || 'None'}\n`;
            txt += `FEN:           ${e.fen}\n`;

            if (e.candidate_moves && e.candidate_moves.length > 0) {
                txt += 'Candidate Lines:\n';
                e.candidate_moves.forEach((c, cIdx) => {
                    txt += `  ${cIdx + 1}. ${c.raw} [Eval: ${c.eval_str}]${c.is_capture ? ' (Capture)' : ''}\n`;
                });
            }
            txt += '--------------------------------------------------------------------------------\n\n';
        });

        downloadFile(txt, `chipsfish_tablebase_${Date.now()}.txt`, 'text/plain');
    }

    function exportTablebaseToJson() {
        const json = JSON.stringify(tablebaseStore, null, 2);
        downloadFile(json, `chipsfish_tablebase_${Date.now()}.json`, 'application/json');
    }

    function downloadFile(content, fileName, contentType) {
        const blob = new Blob([content], { type: contentType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function importTablebaseFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const text = e.target.result;
                if (file.name.endsWith('.json')) {
                    const parsed = JSON.parse(text);
                    let count = 0;
                    for (const k in parsed) {
                        tablebaseStore[k] = parsed[k];
                        count++;
                    }
                    localStorage.setItem(TABLEBASE_KEY, JSON.stringify(tablebaseStore));
                    updateTablebaseStats();
                    alert(`Successfully imported ${count} positions from JSON.`);
                } else {
                    // Import from TXT format
                    const fenMatches = text.match(/FEN:\s+([^\n]+)/g);
                    let count = 0;
                    if (fenMatches) {
                        fenMatches.forEach(m => {
                            const fen = m.replace('FEN:', '').trim();
                            if (fen) {
                                const key = `${activeVariant}:${fen}`;
                                if (!tablebaseStore[key]) {
                                    tablebaseStore[key] = {
                                        fen,
                                        variant: activeVariant,
                                        side: fen.split(' ')[1] || 'r',
                                        eval: 0,
                                        eval_str: 'Imported',
                                        bestmove: null,
                                        bestmove_raw: 'Imported from TXT',
                                        depth: 1,
                                        nodes: 0,
                                        candidate_moves: [],
                                        timestamp: Date.now()
                                    };
                                    count++;
                                }
                            }
                        });
                        localStorage.setItem(TABLEBASE_KEY, JSON.stringify(tablebaseStore));
                        updateTablebaseStats();
                        alert(`Successfully loaded ${count} positions from TXT archive.`);
                    } else {
                        alert('No valid FEN positions found in TXT file.');
                    }
                }
            } catch (err) {
                alert('Failed to parse file: ' + err.message);
            }
        };
        reader.readAsText(file);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FEN PARSING & BOARD SETUP
    // ─────────────────────────────────────────────────────────────────────────

    function parseFen(fen) {
        currentFen = fen;
        if (elFenTextarea) elFenTextarea.value = fen;

        boardGrid = Array(64).fill(null);
        const fields = fen.split(' ');
        if (fields.length < 4) return;

        const boardPart = fields[0];
        sideToMove = fields[1];
        redScore = fields[2];
        blueScore = fields[3];

        if (elScoreRed) elScoreRed.innerText = redScore;
        if (elScoreBlue) elScoreBlue.innerText = blueScore;

        if (sideToMove === 'r') {
            if (elStatusTurnPill) {
                elStatusTurnPill.className = 'turn-pill red';
                if (elStatusTurnText) elStatusTurnText.innerText = 'RED Turn';
            }
        } else {
            if (elStatusTurnPill) {
                elStatusTurnPill.className = 'turn-pill blue';
                if (elStatusTurnText) elStatusTurnText.innerText = 'BLUE Turn';
            }
        }

        const rows = [];
        let currentRow = '';
        let parenDepth = 0;
        for (let i = 0; i < boardPart.length; i++) {
            const char = boardPart[i];
            if (char === '(') { parenDepth++; currentRow += char; }
            else if (char === ')') { parenDepth--; currentRow += char; }
            else if (char === '/' && parenDepth === 0) { rows.push(currentRow); currentRow = ''; }
            else { currentRow += char; }
        }
        rows.push(currentRow);

        for (let r = 0; r < 8; r++) {
            const rowStr = rows[r];
            let c = 0, i = 0;
            while (i < rowStr.length) {
                const char = rowStr[i];
                if (char >= '1' && char <= '8') {
                    c += parseInt(char, 10);
                    i++;
                } else if (char === 'r' || char === 'R' || char === 'b' || char === 'B') {
                    const color = (char === 'r' || char === 'R') ? 'red' : 'blue';
                    const isKing = (char === 'R' || char === 'B');
                    i++;
                    let val = '';
                    if (rowStr[i] === '(') {
                        i++;
                        const closeIdx = rowStr.indexOf(')', i);
                        if (closeIdx !== -1) {
                            val = rowStr.substring(i, closeIdx);
                            i = closeIdx + 1;
                        }
                    }
                    const targetRow = 7 - r;
                    const sq = targetRow * 8 + c;
                    boardGrid[sq] = { color, value: val, isKing };
                    c++;
                } else { i++; }
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOARD RENDERER & INTERACTION
    // ─────────────────────────────────────────────────────────────────────────

    function renderBoard() {
        if (!elBoard) return;
        elBoard.innerHTML = '';

        const rowIndices = isFlipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
        const colIndices = isFlipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

        for (let rIdx = 0; rIdx < 8; ++rIdx) {
            for (let cIdx = 0; cIdx < 8; ++cIdx) {
                const r = rowIndices[rIdx];
                const c = colIndices[cIdx];
                const sq = r * 8 + c;
                const isPlayable = (r + c) % 2 === 1;

                const cell = document.createElement('div');
                cell.className = `square ${isPlayable ? 'playable' : 'nonplayable'} ${((r + c) % 2 === 1 && r % 2 === 0) ? 'alt-tile' : ''}`;
                cell.dataset.sq = sq;
                cell.dataset.col = c;
                cell.dataset.row = r;

                const operator = getSquareOperator(c, r);
                if (operator) {
                    const opEl = document.createElement('div');
                    opEl.className = 'square-operator';
                    opEl.innerText = operator;
                    cell.appendChild(opEl);
                }

                const piece = boardGrid[sq];
                if (piece) {
                    const chipData = getVariantChipData(piece.value, activeVariant);
                    const pieceEl = document.createElement('div');
                    pieceEl.className = `chip ${piece.color} ${piece.isKing ? 'king' : ''}`;

                    const valEl = document.createElement('span');
                    valEl.className = 'chip-val';
                    valEl.innerHTML = chipData.html;
                    valEl.title = chipData.raw;
                    pieceEl.appendChild(valEl);

                    cell.appendChild(pieceEl);

                    pieceEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleSquareClick(sq);
                    });
                }

                cell.addEventListener('mouseenter', () => handleSquareHover(sq));
                cell.addEventListener('mouseleave', () => hideMathTooltip());
                cell.addEventListener('click', () => handleSquareClick(sq));

                elBoard.appendChild(cell);
            }
        }

        syncOverlaySize();
        if (currentAnalysis && currentAnalysis.bestmove) {
            renderBestMovePath(currentAnalysis.bestmove);
        }
    }

    function syncOverlaySize() {
        if (!elBoard || !elBestMoveOverlay) return;
        const rect = elBoard.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        elBestMoveOverlay.setAttribute('width', w);
        elBestMoveOverlay.setAttribute('height', h);
        elBestMoveOverlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
    }

    function squareCentre(col, row) {
        if (!elBoard) return { x: 0, y: 0 };
        const cell = elBoard.querySelector(`.square[data-col="${col}"][data-row="${row}"]`);
        if (!cell) return { x: 0, y: 0 };
        const boardRect = elBoard.getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        return {
            x: cellRect.left - boardRect.left + cellRect.width / 2,
            y: cellRect.top - boardRect.top + cellRect.height / 2
        };
    }

    function clearBestMoveArrow() {
        if (!elBestMoveOverlay) return;
        const existing = elBestMoveOverlay.querySelectorAll('.arrow-line, .jump-dot');
        existing.forEach(el => el.remove());
    }

    function calcTrimmedSegment(cFrom, cTo, trimStart = 14, trimEnd = 16) {
        const dx = cTo.x - cFrom.x;
        const dy = cTo.y - cFrom.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return { x1: cFrom.x, y1: cFrom.y, x2: cTo.x, y2: cTo.y };
        const ux = dx / len;
        const uy = dy / len;
        return {
            x1: cFrom.x + ux * trimStart,
            y1: cFrom.y + uy * trimStart,
            x2: cTo.x - ux * trimEnd,
            y2: cTo.y - uy * trimEnd
        };
    }

    function renderBestMovePath(movePath) {
        clearBestMoveArrow();
        if (!elBestMoveOverlay || !movePath || movePath.length < 2) return;
        syncOverlaySize();

        for (let i = 0; i < movePath.length - 1; i++) {
            const [fromCol, fromRow] = movePath[i];
            const [toCol, toRow] = movePath[i + 1];
            const cFrom = squareCentre(fromCol, fromRow);
            const cTo = squareCentre(toCol, toRow);

            if (cFrom.x === 0 && cFrom.y === 0) continue;
            if (cTo.x === 0 && cTo.y === 0) continue;

            const isLast = (i === movePath.length - 2);
            const trimStart = (i === 0) ? 14 : 0;
            const trimEnd = isLast ? 16 : 0;
            const seg = calcTrimmedSegment(cFrom, cTo, trimStart, trimEnd);

            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', seg.x1);
            line.setAttribute('y1', seg.y1);
            line.setAttribute('x2', seg.x2);
            line.setAttribute('y2', seg.y2);
            line.setAttribute('class', 'arrow-line');
            line.setAttribute('stroke', '#10b981');
            line.setAttribute('stroke-width', '5');
            line.setAttribute('stroke-linecap', 'round');

            if (isLast) {
                line.setAttribute('marker-end', 'url(#best-move-arrowhead)');
            } else {
                const jumpDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                jumpDot.setAttribute('cx', cTo.x);
                jumpDot.setAttribute('cy', cTo.y);
                jumpDot.setAttribute('r', '5');
                jumpDot.setAttribute('fill', '#10b981');
                jumpDot.setAttribute('class', 'jump-dot');
                elBestMoveOverlay.appendChild(jumpDot);
            }
            elBestMoveOverlay.appendChild(line);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MOVE INTERACTIONS
    // ─────────────────────────────────────────────────────────────────────────

    function handleSquareClick(sq) {
        const piece = boardGrid[sq];
        const sideChar = sideToMove;

        if (selectedSquare !== null) {
            const matchingMove = legalMoves.find(m => m.from === selectedSquare && (m.to === sq || (m.steps && m.steps[m.steps.length - 1] === sq)));
            if (matchingMove) {
                makeMoveOnBoard(matchingMove);
                selectedSquare = null;
                clearHighlights();
                return;
            }
        }

        if (piece && ((piece.color === 'red' && sideChar === 'r') || (piece.color === 'blue' && sideChar === 'b'))) {
            selectedSquare = sq;
            playSound('click');
            highlightMovesForSquare(sq);
        } else {
            selectedSquare = null;
            clearHighlights();
        }
    }

    function clearHighlights() {
        if (!elBoard) return;
        const squares = elBoard.querySelectorAll('.square');
        squares.forEach(s => s.classList.remove('selected', 'legal-move', 'legal-capture'));
    }

    function highlightMovesForSquare(sq) {
        clearHighlights();
        const cell = elBoard.querySelector(`.square[data-sq="${sq}"]`);
        if (cell) cell.classList.add('selected');

        const validMoves = legalMoves.filter(m => m.from === sq);
        validMoves.forEach(m => {
            const dest = m.to !== undefined ? m.to : (m.steps && m.steps[m.steps.length - 1]);
            const destCell = elBoard.querySelector(`.square[data-sq="${dest}"]`);
            if (destCell) {
                destCell.classList.add(m.is_capture ? 'legal-capture' : 'legal-move');
            }
        });
    }

    async function makeMoveOnBoard(moveData) {
        try {
            const res = await window.engineApiFetch('/api/move', {
                fen: currentFen,
                move: moveData,
                variant: activeVariant
            });

            if (res && res.fen) {
                playSound(moveData.is_capture ? 'capture' : 'move');
                parseFen(res.fen);
                legalMoves = res.moves || [];
                renderBoard();

                if (res.is_game_over) {
                    if (elEngineStatusText) elEngineStatusText.innerText = `Game Over: ${res.winner} wins!`;
                    stopAutoSolve();
                } else {
                    if (isAnalyzing || autoSolveActive) {
                        triggerAnalysis();
                    }
                }
            }
        } catch (e) {
            console.error('[Move Error]', e);
        }
    }

    function handleSquareHover(sq) {
        if (selectedSquare === null || !elMathTooltip || !elMathTooltipText) return;
        const matchingMoves = legalMoves.filter(m => m.from === selectedSquare && (m.to === sq || (m.steps && m.steps[m.steps.length - 1] === sq)));
        if (matchingMoves.length > 0 && matchingMoves[0].is_capture) {
            const m = matchingMoves[0];
            const pFrom = boardGrid[selectedSquare];
            const capSq = m.captured_squares ? m.captured_squares[0] : null;
            const pCap = capSq !== null ? boardGrid[capSq] : null;
            if (pFrom && pCap) {
                const op = getSquareOperator(capSq % 8, Math.floor(capSq / 8));
                const v1 = getVariantChipData(pFrom.value, activeVariant).raw;
                const v2 = getVariantChipData(pCap.value, activeVariant).raw;
                elMathTooltipText.innerText = `${v1} ${op || '×'} ${v2} → Score Gain: ${m.score_change}`;
                elMathTooltip.classList.add('visible');
            }
        }
    }

    function hideMathTooltip() {
        if (elMathTooltip) elMathTooltip.classList.remove('visible');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVALUATION BAR
    // ─────────────────────────────────────────────────────────────────────────

    function setEvalBarDisplay(evalFromRed) {
        if (!elEvalBarFill || !elEvalBarLabel) return;
        const absVal = Math.abs(evalFromRed);
        const isMate = absVal > 5000;

        let pct;
        if (isMate) {
            pct = evalFromRed > 0 ? 95 : 5;
        } else {
            const t = Math.tanh(evalFromRed / 40);
            pct = 50 + t * 45;
            pct = Math.min(95, Math.max(5, pct));
        }

        elEvalBarFill.style.height = `${pct}%`;
        const labelPct = Math.min(92, Math.max(8, pct));
        if (elEvalBarWrapper) elEvalBarWrapper.style.setProperty('--eval-fill-pct', `${labelPct}%`);

        let labelStr;
        if (isMate) {
            labelStr = evalFromRed > 0 ? '🔴 WIN' : '🔵 WIN';
        } else if (absVal < 0.05) {
            labelStr = 'EVEN';
        } else {
            const winner = evalFromRed > 0 ? '🔴' : '🔵';
            labelStr = `${winner} +${absVal.toFixed(1)}`;
        }
        elEvalBarLabel.innerText = labelStr;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SOLVER & ANALYSIS ENGINE LOOP
    // ─────────────────────────────────────────────────────────────────────────

    async function triggerAnalysis() {
        const reqId = ++analysisRequestId;
        if (elEvalBarWrapper) elEvalBarWrapper.classList.add('thinking');
        if (elEngineStatusText) elEngineStatusText.innerText = 'Calculating best move...';

        try {
            const res = await window.analyzePosition({
                fen: currentFen,
                depth: targetDepth,
                variant: activeVariant
            });

            if (reqId !== analysisRequestId) return;
            currentAnalysis = res;

            // Render stats
            if (res.bestmove_raw) {
                if (elBestMoveTag) elBestMoveTag.innerText = res.bestmove_raw;
                renderBestMovePath(res.bestmove);
            } else {
                if (elBestMoveTag) elBestMoveTag.innerText = 'None';
                clearBestMoveArrow();
            }

            if (elEvalScoreTag) {
                elEvalScoreTag.innerText = res.eval_str;
                elEvalScoreTag.className = `eval-score-tag ${res.eval > 0 ? 'red-adv' : (res.eval < 0 ? 'blue-adv' : 'even')}`;
            }

            if (elStatDepth) elStatDepth.innerText = res.depth;
            if (elStatNodes) elStatNodes.innerText = res.nodes.toLocaleString();
            if (elStatNps) elStatNps.innerText = res.nps.toLocaleString();
            if (elStatTime) elStatTime.innerText = `${res.time_ms}ms`;

            setEvalBarDisplay(res.eval);
            renderCandidateMoves(res.candidate_moves || []);

            // Save to persistent tablebase
            saveTablebaseEntry(res);

            if (elEngineStatusText) elEngineStatusText.innerText = 'Analysis Ready (Stored in Tablebase)';
        } catch (e) {
            console.error('[Analysis Error]', e);
            if (elEngineStatusText) elEngineStatusText.innerText = 'Analysis Error';
        } finally {
            if (reqId === analysisRequestId && elEvalBarWrapper) {
                elEvalBarWrapper.classList.remove('thinking');
            }
        }
    }

    function renderCandidateMoves(candidates) {
        if (!elCandidateList) return;
        elCandidateList.innerHTML = '';

        if (candidates.length === 0) {
            elCandidateList.innerHTML = '<div style="color:var(--text-dim); font-size:0.75rem; text-align:center; padding:10px;">No legal candidate moves</div>';
            return;
        }

        candidates.forEach((c, idx) => {
            const item = document.createElement('div');
            item.className = `candidate-item ${idx === 0 ? 'rank-1' : ''}`;
            item.innerHTML = `
                <div class="cand-left">
                    <span class="cand-rank">#${idx + 1}</span>
                    <span class="cand-notation">${c.raw}</span>
                    ${c.is_capture ? '<span class="cand-badge">Capture</span>' : ''}
                </div>
                <span class="cand-eval" style="color:${c.eval_from_red >= 0 ? '#ff6b85':'#60a5fa'}">${c.eval_str}</span>
            `;

            item.addEventListener('mouseenter', () => {
                if (c.path && c.path.length >= 2) renderBestMovePath(c.path);
            });
            item.addEventListener('mouseleave', () => {
                if (currentAnalysis && currentAnalysis.bestmove) renderBestMovePath(currentAnalysis.bestmove);
            });
            item.addEventListener('click', () => {
                makeMoveOnBoard(c);
            });

            elCandidateList.appendChild(item);
        });
    }

    function toggleAnalyzing() {
        isAnalyzing = !isAnalyzing;
        if (isAnalyzing) {
            if (elBtnAnalyzeToggle) elBtnAnalyzeToggle.classList.add('analyzing');
            if (elAnalyzeBtnText) elAnalyzeBtnText.innerText = 'Stop Analyzing';
            triggerAnalysis();
        } else {
            if (elBtnAnalyzeToggle) elBtnAnalyzeToggle.classList.remove('analyzing');
            if (elAnalyzeBtnText) elAnalyzeBtnText.innerText = 'Start Analyzing';
            clearBestMoveArrow();
        }
    }

    function stepBestMove() {
        if (currentAnalysis && currentAnalysis.bestmove && legalMoves.length > 0) {
            const bestPath = currentAnalysis.bestmove;
            const fromSq = bestPath[0][1] * 8 + bestPath[0][0];
            const toSq = bestPath[bestPath.length - 1][1] * 8 + bestPath[bestPath.length - 1][0];

            const found = legalMoves.find(m => m.from === fromSq && (m.to === toSq || (m.steps && m.steps[m.steps.length - 1] === toSq)));
            if (found) {
                makeMoveOnBoard(found);
            }
        } else {
            // Trigger analysis first
            triggerAnalysis().then(() => {
                if (currentAnalysis && currentAnalysis.bestmove) stepBestMove();
            });
        }
    }

    function toggleAutoSolve() {
        autoSolveActive = !autoSolveActive;
        if (autoSolveActive) {
            if (elBtnAutoSolve) {
                elBtnAutoSolve.innerText = '⏸ Pause Auto-Solve';
                elBtnAutoSolve.classList.add('danger-btn');
            }
            runAutoSolveStep();
        } else {
            stopAutoSolve();
        }
    }

    function stopAutoSolve() {
        autoSolveActive = false;
        if (autoSolveTimer) clearTimeout(autoSolveTimer);
        if (elBtnAutoSolve) {
            elBtnAutoSolve.innerText = '⚡ Auto-Solve Game';
            elBtnAutoSolve.classList.remove('danger-btn');
        }
    }

    async function runAutoSolveStep() {
        if (!autoSolveActive) return;
        await triggerAnalysis();
        if (currentAnalysis && currentAnalysis.bestmove && legalMoves.length > 0) {
            autoSolveTimer = setTimeout(() => {
                if (!autoSolveActive) return;
                stepBestMove();
                autoSolveTimer = setTimeout(runAutoSolveStep, 600);
            }, 500);
        } else {
            stopAutoSolve();
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // INITIALIZATION & VARIANT SWITCHING
    // ─────────────────────────────────────────────────────────────────────────

    async function initVariant(variantName) {
        activeVariant = variantName;
        const vInfo = DAMATH_VARIANTS[activeVariant] || DAMATH_VARIANTS.integer;

        if (elVariantBadgeName) elVariantBadgeName.innerText = `${vInfo.label.toUpperCase()} DAMATH`;
        if (elVariantBadgeGrade) elVariantBadgeGrade.innerText = vInfo.grade;
        if (elVariantSelect) elVariantSelect.value = activeVariant;

        if (elEngineStatusText) elEngineStatusText.innerText = `Initializing ${vInfo.label}...`;

        try {
            const res = await window.engineApiFetch('/api/initialize', { variant: activeVariant });
            if (res && res.fen) {
                parseFen(res.fen);
                legalMoves = res.moves || [];
                selectedSquare = null;
                currentAnalysis = null;
                clearBestMoveArrow();
                renderBoard();
                updateTablebaseStats();

                if (isAnalyzing) triggerAnalysis();
                else requestQuickEval();
            }
        } catch (e) {
            console.error('[Variant Init Error]', e);
        }
    }

    async function requestQuickEval() {
        try {
            const res = await window.engineApiFetch('/api/eval', {
                fen: currentFen,
                depth: 6,
                variant: activeVariant
            });
            if (res && typeof res.eval === 'number') {
                setEvalBarDisplay(res.eval);
            }
        } catch (_) {}
    }

    function loadCustomFen(fenStr, variantOverride) {
        if (variantOverride && variantOverride !== activeVariant) {
            activeVariant = variantOverride;
            if (elVariantSelect) elVariantSelect.value = activeVariant;
        }
        parseFen(fenStr);
        window.engineApiFetch('/api/moves', { fen: currentFen, variant: activeVariant }).then(res => {
            legalMoves = res.moves || [];
            selectedSquare = null;
            renderBoard();
            if (isAnalyzing) triggerAnalysis();
            else requestQuickEval();
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // EVENT LISTENERS & HOTKEYS
    // ─────────────────────────────────────────────────────────────────────────

    function setupEventListeners() {
        if (elVariantSelect) {
            elVariantSelect.addEventListener('change', () => {
                initVariant(elVariantSelect.value);
            });
        }

        if (elBtnAnalyzeToggle) {
            elBtnAnalyzeToggle.addEventListener('click', toggleAnalyzing);
        }

        if (elBtnStepBest) {
            elBtnStepBest.addEventListener('click', stepBestMove);
        }

        if (elBtnAutoSolve) {
            elBtnAutoSolve.addEventListener('click', toggleAutoSolve);
        }

        if (elBtnReset) {
            elBtnReset.addEventListener('click', () => {
                stopAutoSolve();
                initVariant(activeVariant);
            });
        }

        if (elBtnFlipBoard) {
            elBtnFlipBoard.addEventListener('click', () => {
                isFlipped = !isFlipped;
                if (elEvalBarContainer) elEvalBarContainer.classList.toggle('flipped', isFlipped);
                renderBoard();
            });
        }

        if (elDepthSlider) {
            elDepthSlider.addEventListener('input', () => {
                targetDepth = parseInt(elDepthSlider.value, 10) || 7;
                if (elDepthValue) elDepthValue.innerText = targetDepth;
                if (isAnalyzing) triggerAnalysis();
            });
        }

        if (elBtnCopyFen) {
            elBtnCopyFen.addEventListener('click', () => {
                if (navigator.clipboard && currentFen) {
                    navigator.clipboard.writeText(currentFen);
                    alert('FEN copied to clipboard!');
                }
            });
        }

        if (elBtnLoadFen) {
            elBtnLoadFen.addEventListener('click', () => {
                const input = elFenTextarea ? elFenTextarea.value.trim() : '';
                if (input) loadCustomFen(input);
            });
        }

        if (elBtnExportTxt) elBtnExportTxt.addEventListener('click', exportTablebaseToTxt);
        if (elBtnExportJson) elBtnExportJson.addEventListener('click', exportTablebaseToJson);

        if (elBtnImport && elFileInput) {
            elBtnImport.addEventListener('click', () => elFileInput.click());
            elFileInput.addEventListener('change', (e) => {
                if (e.target.files && e.target.files[0]) {
                    importTablebaseFile(e.target.files[0]);
                }
            });
        }

        if (elBtnClearTb) {
            elBtnClearTb.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all stored Tablebase analyses?')) {
                    tablebaseStore = {};
                    localStorage.removeItem(TABLEBASE_KEY);
                    updateTablebaseStats();
                }
            });
        }

        if (elBtnAudioToggle) {
            elBtnAudioToggle.addEventListener('click', () => {
                soundEnabled = !soundEnabled;
                elBtnAudioToggle.classList.toggle('active', soundEnabled);
            });
        }

        // Window Resize & Keyboard Hotkeys
        window.addEventListener('resize', syncOverlaySize);
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === ' ' || e.key === 'Spacebar') {
                e.preventDefault();
                toggleAnalyzing();
            } else if (e.key === 'f' || e.key === 'F') {
                isFlipped = !isFlipped;
                if (elEvalBarContainer) elEvalBarContainer.classList.toggle('flipped', isFlipped);
                renderBoard();
            } else if (e.key === 'ArrowRight') {
                stepBestMove();
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // BOOTSTRAP
    // ─────────────────────────────────────────────────────────────────────────

    initTablebase();
    setupEventListeners();
    initVariant('integer');

})();
