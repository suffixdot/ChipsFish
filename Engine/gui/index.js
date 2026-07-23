// Damath GUI Frontend Logic

// Game State
let currentFen = '';
let sideToMove = 'r'; // 'r' for red, 'b' for blue
let redScore = '0';
let blueScore = '0';
let boardGrid = Array(64).fill(null);
let legalMoves = [];
let selectedSquare = null;
let activeGameMode = 'pve'; // 'pvp', 'pve', 'eve'
let playerColor = 'red'; // 'red', 'blue' (used for pve)
let isAiThinking = false;
let aiAutoplayActive = false;
let moveHistory = [];
let midMovePromotion = false;
let showBestMove = false;
let bestMoveRequestId = 0; // used to cancel stale in-flight requests
let activeDamathVariant = 'integer'; // current Damath variant

// ---------------------------------------------------------------------------
// Damath Variant Chip Label Mapping
// Maps underlying engine piece FEN values to visual chip labels for each variant.
// Exactly matches official DepEd Damath chip layout rules.
// ---------------------------------------------------------------------------

const DAMATH_VARIANTS = {
    counting: { label: 'Counting', grade: 'Grades 1–2', hint: 'Chips: 1–12 (positive counting numbers)' },
    whole: { label: 'Whole Number', grade: 'Grades 3–4', hint: 'Chips: 0–11 (whole numbers)' },
    fraction: { label: 'Fraction', grade: 'Grades 5–6', hint: 'Chips: 1/10 to 12/10' },
    integer: { label: 'Integer', grade: 'Grade 7', hint: 'Chips: -11 to 10 (official layout)' },
    rational: { label: 'Rational', grade: 'Grade 8', hint: 'Chips: -11/10 to 10/10 (official layout)' },
    radical: { label: 'Radical', grade: 'Grade 9', hint: 'Chips: radical expressions (e.g. -9√2, 144√8)' },
    polynomial: { label: 'Polynomial', grade: 'Grade 10', hint: 'Chips: polynomial terms (e.g. 78xy², -45y)' }
};

// ---------------------------------------------------------------------------
// Per-variant FEN value → canonical slot key.
// The engine reduces fractions (e.g. "8/10" → "4/5"), so each variant needs
// its own map covering every reduced form that can appear in a FEN string.
// Canonical slot keys are the 12 integer-Damath values:
//   '-11','8','-5','2','0','-3','10','-7','-9','6','-1','4'
// ---------------------------------------------------------------------------
const VARIANT_FEN_TO_KEY = {
    integer: {
        '-11': '-11', '8': '8',  '-5': '-5', '2': '2',
        '0':   '0',   '-3': '-3','10': '10',  '-7': '-7',
        '-9':  '-9',  '6': '6',  '-1': '-1',  '4': '4'
    },
    rational: {
        // Engine stores as lowest-terms fractions
        '-11/10': '-11',
        '4/5':    '8',    '8/10': '8',
        '-1/2':   '-5',   '-5/10': '-5',
        '1/5':    '2',    '2/10': '2',
        '0':      '0',    '0/1': '0',
        '-3/10':  '-3',
        '1':      '10',   '1/1': '10', '10/10': '10',
        '-7/10':  '-7',
        '-9/10':  '-9',
        '3/5':    '6',    '6/10': '6',
        '-1/10':  '-1',
        '2/5':    '4',    '4/10': '4'
    },
    counting: {
        // Chip values: 11,8,5,2,12,3,10,7,9,6,1,4 (all positive)
        '11': '-11', '8': '8',  '5': '-5', '2': '2',
        '12': '0',   '3': '-3', '10': '10', '7': '-7',
        '9':  '-9',  '6': '6',  '1': '-1',  '4': '4'
    },
    whole: {
        // Chip values: 11,8,5,2,0,3,10,7,9,6,1,4
        '11': '-11', '8': '8',  '5': '-5', '2': '2',
        '0':  '0',   '3': '-3', '10': '10', '7': '-7',
        '9':  '-9',  '6': '6',  '1': '-1',  '4': '4'
    },
    fraction: {
        // 12 chip values: 11/10,8/10,5/10,2/10,12/10,3/10,10/10,7/10,9/10,6/10,1/10,4/10
        // Engine reduces all: 11/10,4/5,1/2,1/5,6/5,3/10,1,7/10,9/10,3/5,1/10,2/5
        '11/10': '-11',
        '4/5':   '8',    '8/10': '8',
        '1/2':   '-5',   '5/10': '-5',
        '1/5':   '2',    '2/10': '2',
        '6/5':   '0',    '12/10': '0',
        '3/10':  '-3',
        '1':     '10',   '10/10': '10',
        '7/10':  '-7',
        '9/10':  '-9',
        '3/5':   '6',    '6/10': '6',
        '1/10':  '-1',
        '2/5':   '4',    '4/10': '4'
    },
    radical: {
        // Row 0 slots A-D: -121,-81,100,144
        '-121': '-11', '-81': '8', '100': '-5', '144': '2',
        // Row 1 slots E-H: -49,-25,36,64
        '-49':  '0',   '-25': '-3', '36': '10',  '64': '-7',
        // Row 2 slots I-L: -9,-1,4,16
        '-9':   '-9',  '-1': '6',   '4': '-1',  '16': '4'
    },
    polynomial: {
        // Row 0 slots A-D: -3,-1,6,10
        '-3': '-11', '-1': '8',  '6': '-5',  '10': '2',
        // Row 1 slots E-H: -55,-45,66,78
        '-55': '0',  '-45': '-3', '66': '10',  '78': '-7',
        // Row 2 slots I-L: -21,-15,28,36
        '-21': '-9', '-15': '6',  '28': '-1',  '36': '4'
    }
};

// Legacy global map retained for any code paths that don't yet pass a variant
const FEN_TO_KEY = VARIANT_FEN_TO_KEY.rational;

// ---------------------------------------------------------------------------
// Variant chip data – each entry holds:
//   raw  : the plain-text chip value (for accessibility / title attributes)
//   html : a rich HTML string rendered inside the chip circle
// Keys are the 12 canonical integer keys above.
// ---------------------------------------------------------------------------
const VARIANT_CHIP_DATA = {
    // ── Integer (Grade 7) ──────────────────────────────────────────────────
    integer: {
        '-11': { raw: '-11',  html: '-11' },
        '8':   { raw: '8',    html: '8' },
        '-5':  { raw: '-5',   html: '-5' },
        '2':   { raw: '2',    html: '2' },
        '0':   { raw: '0',    html: '0' },
        '-3':  { raw: '-3',   html: '-3' },
        '10':  { raw: '10',   html: '10' },
        '-7':  { raw: '-7',   html: '-7' },
        '-9':  { raw: '-9',   html: '-9' },
        '6':   { raw: '6',    html: '6' },
        '-1':  { raw: '-1',   html: '-1' },
        '4':   { raw: '4',    html: '4' }
    },
    // ── Rational (Grade 8) ─────────────────────────────────────────────────
    // Display as stacked fractions:  ⁻⁹/₁₀  →  <sup>-9</sup>/<sub>10</sub>
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
    // ── Radical (Grade 9) ──────────────────────────────────────────────────
    // Coefficient + √radicand layout matching the official chip diagram.
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
    // ── Counting (Grades 1–2) ──────────────────────────────────────────────
    counting: {
        '-11': { raw: '11', html: '11' },
        '8':   { raw: '8',  html: '8' },
        '-5':  { raw: '5',  html: '5' },
        '2':   { raw: '2',  html: '2' },
        '0':   { raw: '12', html: '12' },
        '-3':  { raw: '3',  html: '3' },
        '10':  { raw: '10', html: '10' },
        '-7':  { raw: '7',  html: '7' },
        '-9':  { raw: '9',  html: '9' },
        '6':   { raw: '6',  html: '6' },
        '-1':  { raw: '1',  html: '1' },
        '4':   { raw: '4',  html: '4' }
    },
    // ── Whole Number (Grades 3–4) ──────────────────────────────────────────
    whole: {
        '-11': { raw: '11', html: '11' },
        '8':   { raw: '8',  html: '8' },
        '-5':  { raw: '5',  html: '5' },
        '2':   { raw: '2',  html: '2' },
        '0':   { raw: '0',  html: '0' },
        '-3':  { raw: '3',  html: '3' },
        '10':  { raw: '10', html: '10' },
        '-7':  { raw: '7',  html: '7' },
        '-9':  { raw: '9',  html: '9' },
        '6':   { raw: '6',  html: '6' },
        '-1':  { raw: '1',  html: '1' },
        '4':   { raw: '4',  html: '4' }
    },
    // ── Fraction (Grades 5–6) ──────────────────────────────────────────────
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
    // ── Polynomial (Grade 10) — to be confirmed, placeholder layout ─────────
    polynomial: {
        // Row 0 (red bottom, odd cols): -11, 8, -5, 2
        '-11': { raw: '-3x²y',   html: '-3x<sup>2</sup>y' },
        '8':   { raw: '-xy²',    html: '-xy<sup>2</sup>' },
        '-5':  { raw: '6x',      html: '6x' },
        '2':   { raw: '10y',     html: '10y' },
        // Row 1 (red middle, even cols): 0, -3, 10, -7  ← swapped with old row 2
        '0':   { raw: '-55x',    html: '-55x' },
        '-3':  { raw: '-45y',    html: '-45y' },
        '10':  { raw: '66x²y',   html: '66x<sup>2</sup>y' },
        '-7':  { raw: '78xy²',   html: '78xy<sup>2</sup>' },
        // Row 2 (red top, odd cols): -9, 6, -1, 4      ← swapped with old row 1
        '-9':  { raw: '-21xy²',  html: '-21xy<sup>2</sup>' },
        '6':   { raw: '-15x',    html: '-15x' },
        '-1':  { raw: '28y',     html: '28y' },
        '4':   { raw: '36x²y',   html: '36x<sup>2</sup>y' }
    }
};

/**
 * Returns { raw, html } for a piece given its FEN value and the active variant.
 * `raw`  – plain text for title/aria attributes.
 * `html` – HTML string safe to set via innerHTML inside the chip circle.
 */
function getVariantChipData(fenValue, variantName) {
    if (fenValue === null || fenValue === undefined) return { raw: '', html: '' };
    const cleanVal = String(fenValue).trim();
    // Use the per-variant FEN→key map; fall back to the global rational map
    const fenMap = VARIANT_FEN_TO_KEY[variantName] || VARIANT_FEN_TO_KEY.rational;
    const key = fenMap[cleanVal] !== undefined ? fenMap[cleanVal] : cleanVal;
    const map = VARIANT_CHIP_DATA[variantName] || VARIANT_CHIP_DATA.integer;
    return map[key] || { raw: cleanVal, html: cleanVal };
}

/** Legacy plain-text accessor kept for any callers that still need it. */
function getVariantPieceLabel(fenValue, variantName) {
    return getVariantChipData(fenValue, variantName).raw;
}

// Audio Context Setup
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    try {
        initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        const now = audioCtx.currentTime;

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gainNode.gain.setValueAtTime(0.05, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'move') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);
            gainNode.gain.setValueAtTime(0.1, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        } else if (type === 'capture') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.linearRampToValueAtTime(40, now + 0.2);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);

            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(120, now);
            osc2.frequency.linearRampToValueAtTime(10, now + 0.25);
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            gain2.gain.setValueAtTime(0.1, now);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc2.start(now);
            osc2.stop(now + 0.25);
        } else if (type === 'promotion') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(554, now + 0.08);
            osc.frequency.setValueAtTime(659, now + 0.16);
            osc.frequency.setValueAtTime(880, now + 0.24);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.setValueAtTime(0.08, now + 0.24);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
        } else if (type === 'victory') {
            const notes = [261.63, 329.63, 392.00, 523.25];
            notes.forEach((f, idx) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(f, now + idx * 0.12);
                o.connect(g);
                g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.08, now + idx * 0.12);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);
                o.start(now + idx * 0.12);
                o.stop(now + idx * 0.12 + 0.4);
            });
        } else if (type === 'defeat') {
            const notes = [392.00, 349.23, 311.13, 233.08];
            notes.forEach((f, idx) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'sawtooth';
                o.frequency.setValueAtTime(f, now + idx * 0.15);
                o.connect(g);
                g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.06, now + idx * 0.15);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.5);
                o.start(now + idx * 0.15);
                o.stop(now + idx * 0.15 + 0.5);
            });
        }
    } catch (e) {
        console.warn("Audio Context failed to play sound: ", e);
    }
}

// UI Elements
const elBoard = document.getElementById('board');
const elScoreRed = document.getElementById('score-red');
const elScoreBlue = document.getElementById('score-blue');
const elPanelRed = document.getElementById('panel-red');
const elPanelBlue = document.getElementById('panel-blue');
const elConsoleLog = document.getElementById('console-log');
const elGameOverModal = document.getElementById('game-over-modal');
const elGameOverText = document.getElementById('game-over-text');
const elModalScoreRed = document.getElementById('modal-score-red');
const elModalScoreBlue = document.getElementById('modal-score-blue');

// Configuration inputs
const elGameMode = document.getElementById('game-mode');
const elPlayerColor = document.getElementById('player-color');
const elPlayerColorGroup = document.getElementById('player-color-group');
const elAiLimitType = document.getElementById('ai-limit-type');
const elAiDepthGroup = document.getElementById('ai-depth-group');
const elAiDepth = document.getElementById('ai-depth');
const elAiTimeGroup = document.getElementById('ai-time-group');
const elAiTime = document.getElementById('ai-time');
const elMidMovePromo = document.getElementById('mid-move-promo');
const elShowBestMove = document.getElementById('show-best-move');
const elBestMoveDepthGroup = document.getElementById('best-move-depth-group');
const elBestMoveDepth = document.getElementById('best-move-depth');
const elBestMoveOverlay = document.getElementById('best-move-overlay');
const elBtnFlipBoard = document.getElementById('btn-flip-board');
const elFlipBoardCheck = document.getElementById('flip-board-check');
const elDamathVariant = document.getElementById('damath-variant');
const elVariantHintText = document.getElementById('variant-hint-text');
const elVariantHintBox = document.getElementById('variant-hint-box');

let isFlipped = false;

// Actions buttons & Modals
const elBtnStart = document.getElementById('btn-start');
const elBtnUndo = document.getElementById('btn-undo');
const elBtnReset = document.getElementById('btn-reset');
const elBtnClearConsole = document.getElementById('btn-clear-console');
const elBtnCloseModal = document.getElementById('btn-close-modal');

const elBtnSettings = document.getElementById('btn-settings');
const elSettingsModal = document.getElementById('settings-modal');
const elBtnCloseSettings = document.getElementById('btn-close-settings');
const elBtnApplySettings = document.getElementById('btn-apply-settings');

// Sidebar Quick Card Elements
const elBadgeGameMode = document.getElementById('badge-game-mode');
const elStatusTurnPill = document.getElementById('status-turn-pill');
const elStatusTurnText = document.getElementById('status-turn-text');
const elEngineStatusText = document.getElementById('engine-status-text');
const elHistoryList = document.getElementById('history-list');
const elMoveCountBadge = document.getElementById('move-count-badge');

let moveNotationLog = [];

function recordMoveNotation(side, pathStr, isCapture) {
    const moveNumber = Math.floor(moveNotationLog.length / 2) + 1;
    moveNotationLog.push({
        num: moveNumber,
        side: side,
        text: pathStr,
        isCapture: isCapture
    });
    renderMoveHistory();
}

function renderMoveHistory() {
    if (!elHistoryList) return;
    if (moveNotationLog.length === 0) {
        elHistoryList.innerHTML = '<div class="history-empty">No moves played yet</div>';
        if (elMoveCountBadge) elMoveCountBadge.innerText = '0 moves';
        return;
    }
    if (elMoveCountBadge) {
        elMoveCountBadge.innerText = `${moveNotationLog.length} move${moveNotationLog.length > 1 ? 's' : ''}`;
    }

    let html = '';
    moveNotationLog.forEach((item) => {
        const isRed = item.side === 'r';
        const numLabel = isRed ? `${item.num}.` : '';
        const sideClass = isRed ? 'red-move' : 'blue-move';
        const captureTag = item.isCapture ? '<span class="capture-tag">CAP</span>' : '';
        html += `
            <div class="history-item ${sideClass}">
                <span class="num">${numLabel}</span>
                <span class="move-text">${item.text}</span>
                ${captureTag}
            </div>
        `;
    });
    elHistoryList.innerHTML = html;
    elHistoryList.scrollTop = elHistoryList.scrollHeight;
}

function openSettingsModal() {
    if (elSettingsModal) elSettingsModal.classList.add('show');
}

function closeSettingsModal() {
    if (elSettingsModal) elSettingsModal.classList.remove('show');
}



// API Helpers
async function apiFetch(endpoint, data = {}) {
    try {
        const response = await fetch(`http://localhost:8000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!response.ok) {
            throw new Error(`API error: ${response.statusText}`);
        }
        return await response.json();
    } catch (err) {
        logToConsole(`Error: ${err.message}`, 'error');
        throw err;
    }
}

// Log to GUI Console
function logToConsole(message, type = 'system') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = message;
    elConsoleLog.appendChild(entry);
    elConsoleLog.scrollTop = elConsoleLog.scrollHeight;
}

// Parse fractional value string (e.g. "3/5", "-9/10", "1") to Float
function parseFraction(fracStr) {
    if (!fracStr) return 0;
    // Strip any stray 'damath>' prompt that may have leaked through
    const cleaned = String(fracStr).replace(/damath\s*>\s*/g, '').trim();
    if (!cleaned) return 0;
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(cleaned);
}

// Helper to determine operators — official Rational Damath board layout.
// 4 templates repeating every 4 rows (j = playable square index L→R within row):
//   rows 0,4: [+, −, ÷, ×]
//   rows 1,5: [−, +, ×, ÷]
//   rows 2,6: [÷, ×, +, −]
//   rows 3,7: [×, ÷, −, +]
function getSquareOperator(col, row) {
    const isPlayable = (row + col) % 2 === 1;
    if (!isPlayable) return '';
    // j = index of this playable square within its row (left to right, 0-based)
    const j = Math.floor(col / 2);
    const templates = [
        ['+', '−', '÷', '×'], // rows 0, 4
        ['−', '+', '×', '÷'], // rows 1, 5
        ['÷', '×', '+', '−'], // rows 2, 6
        ['×', '÷', '−', '+'], // rows 3, 7
    ];
    return templates[row % 4][j];
}

// Parse FEN
function parseFen(fen) {
    currentFen = fen;
    const fields = fen.split(' ');
    if (fields.length < 4) return;

    const boardPart = fields[0];
    sideToMove = fields[1];
    redScore = fields[2];
    blueScore = fields[3];

    // Update Turn Indicator
    if (sideToMove === 'r') {
        elPanelRed.classList.add('active');
        elPanelBlue.classList.remove('active');
        if (elStatusTurnPill) {
            elStatusTurnPill.className = 'turn-pill red';
            if (elStatusTurnText) elStatusTurnText.innerText = 'RED Turn';
        }
    } else {
        elPanelBlue.classList.add('active');
        elPanelRed.classList.remove('active');
        if (elStatusTurnPill) {
            elStatusTurnPill.className = 'turn-pill blue';
            if (elStatusTurnText) elStatusTurnText.innerText = 'BLUE Turn';
        }
    }

    // Update Scores
    elScoreRed.innerText = redScore;
    elScoreBlue.innerText = blueScore;

    // Parse Board Pieces
    boardGrid = Array(64).fill(null);
    const rows = [];
    let currentRow = '';
    let parenDepth = 0;
    for (let idx = 0; idx < boardPart.length; idx++) {
        const char = boardPart[idx];
        if (char === '(') {
            parenDepth++;
            currentRow += char;
        } else if (char === ')') {
            parenDepth--;
            currentRow += char;
        } else if (char === '/' && parenDepth === 0) {
            rows.push(currentRow);
            currentRow = '';
        } else {
            currentRow += char;
        }
    }
    rows.push(currentRow);

    
    for (let r = 0; r < 8; r++) {
        const rowStr = rows[r];
        let c = 0;
        let i = 0;
        
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
            } else {
                i++;
            }
        }
    }
}

// Render the 8x8 Board
function renderBoard() {
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
            cell.className = `square ${isPlayable ? 'playable' : 'nonplayable'}`;
            cell.dataset.sq = sq;
            cell.dataset.col = c;
            cell.dataset.row = r;

            // Visual edge coordinate labels (rendered upright)
            if (rIdx === 7) {
                const colLabel = document.createElement('span');
                colLabel.className = 'sq-coord col-coord';
                colLabel.innerText = c;
                cell.appendChild(colLabel);
            }
            if (cIdx === 0) {
                const rowLabel = document.createElement('span');
                rowLabel.className = 'sq-coord row-coord';
                rowLabel.innerText = r;
                cell.appendChild(rowLabel);
            }

            // Add Operator text
            const operator = getSquareOperator(c, r);
            if (operator) {
                const opEl = document.createElement('div');
                opEl.className = 'square-operator';
                opEl.innerText = operator;
                cell.appendChild(opEl);
            }

            // Render Piece
            const piece = boardGrid[sq];
            if (piece) {
                const pieceEl = document.createElement('div');
                pieceEl.className = `piece ${piece.color} ${piece.isKing ? 'king' : ''} variant-${activeDamathVariant}`;

                const chipData = getVariantChipData(piece.value, activeDamathVariant);

                const valEl = document.createElement('span');
                valEl.className = 'piece-value';
                valEl.innerHTML = chipData.html;
                valEl.title = chipData.raw; // plain text tooltip
                pieceEl.appendChild(valEl);

                cell.appendChild(pieceEl);

                pieceEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    initAudio();
                    handlePieceClick(sq);
                });
            }

            // Cell click handler (for moving)
            cell.addEventListener('click', () => {
                initAudio();
                handleSquareClick(sq);
            });

            elBoard.appendChild(cell);
        }
    }

    // Sync overlay SVG size to board dimensions
    syncOverlaySize();

    // Clear any stale arrow then request a fresh one if feature is on
    clearBestMoveArrow();
    if (showBestMove) {
        requestBestMove();
    }
}

function toggleBoardFlip() {
    isFlipped = !isFlipped;
    if (elFlipBoardCheck) elFlipBoardCheck.checked = isFlipped;
    logToConsole(`Board flipped (${isFlipped ? 'BLUE perspective' : 'RED perspective'})`, 'system');
    renderBoard();
}

// ─── Best Move Arrow Helpers ───────────────────────────────────────────────

/** Keep the SVG overlay exactly the same size as the board grid. */
function syncOverlaySize() {
    const boardEl = document.getElementById('board');
    if (!boardEl || !elBestMoveOverlay) return;
    const rect = boardEl.getBoundingClientRect();
    elBestMoveOverlay.setAttribute('width', rect.width);
    elBestMoveOverlay.setAttribute('height', rect.height);
}

/** Return the pixel centre of a board square [col, row] relative to the board grid. */
function squareCentre(col, row) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return { x: 0, y: 0 };
    const cell = boardEl.querySelector(`.square[data-col="${col}"][data-row="${row}"]`);
    if (!cell) return { x: 0, y: 0 };
    const boardRect = boardEl.getBoundingClientRect();
    const cellRect  = cell.getBoundingClientRect();
    return {
        x: cellRect.left - boardRect.left + cellRect.width  / 2,
        y: cellRect.top  - boardRect.top  + cellRect.height / 2
    };
}

/** Draw an arrow from [fromCol, fromRow] through all path squares (like multi-step captures). */
function drawBestMoveArrow(path) {
    if (!elBestMoveOverlay || path.length < 2) return;

    // Remove existing arrows (keep <defs>)
    elBestMoveOverlay.querySelectorAll('.best-move-arrow').forEach(el => el.remove());

    // Draw one segment per step in the path
    for (let i = 0; i < path.length - 1; i++) {
        const from = squareCentre(path[i][0], path[i][1]);
        const to   = squareCentre(path[i + 1][0], path[i + 1][1]);

        // Shorten the line so arrowhead doesn't overlap the centre dot
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const shorten = Math.min(12, len * 0.18);
        const ux = dx / len;
        const uy = dy / len;

        const x1 = from.x + ux * (len * 0.12);  // start slightly away from piece
        const y1 = from.y + uy * (len * 0.12);
        const x2 = to.x   - ux * shorten;        // end before arrowhead
        const y2 = to.y   - uy * shorten;

        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1);
        line.setAttribute('y1', y1);
        line.setAttribute('x2', x2);
        line.setAttribute('y2', y2);
        line.setAttribute('marker-end', 'url(#best-move-arrowhead)');
        line.classList.add('best-move-arrow');
        elBestMoveOverlay.appendChild(line);
    }
}

/** Remove all arrow lines. */
function clearBestMoveArrow() {
    if (!elBestMoveOverlay) return;
    elBestMoveOverlay.querySelectorAll('.best-move-arrow').forEach(el => el.remove());
}

/** Get or create the pulsing "Analyzing…" badge below the board wrapper. */
function getBestMoveBadge() {
    let badge = document.getElementById('best-move-badge');
    if (!badge) {
        badge = document.createElement('div');
        badge.id = 'best-move-badge';
        badge.className = 'best-move-badge';
        badge.innerText = '⚡ Analyzing depth 15…';
        const wrapper = document.querySelector('.board-wrapper');
        if (wrapper) wrapper.appendChild(badge);
    }
    return badge;
}

/**
 * Fire a background analysis request with configurable depth (max 15).
 * Uses a request-ID to ignore responses that arrive after a newer request.
 */
async function requestBestMove() {
    if (!showBestMove || !currentFen) return;

    let targetDepth = parseInt(elBestMoveDepth ? elBestMoveDepth.value : 15) || 15;
    targetDepth = Math.min(15, Math.max(1, targetDepth));

    const myId = ++bestMoveRequestId;
    const badge = getBestMoveBadge();
    badge.innerText = `🔍 Checking position…`;
    badge.classList.add('visible');

    try {
        const res = await apiFetch('/api/best_move', {
            fen: currentFen,
            mid_move_promotion: midMovePromotion,
            depth: targetDepth
        });

        if (myId !== bestMoveRequestId) return;

        if (res.bestmove && res.bestmove.length >= 2) {
            drawBestMoveArrow(res.bestmove);
            if (res.from_cache) {
                badge.innerText = `📖 Memory (Depth ${res.cached_depth || targetDepth})`;
                badge.classList.add('visible');
                setTimeout(() => {
                    if (myId === bestMoveRequestId) badge.classList.remove('visible');
                }, 2000);
            } else {
                badge.innerText = `⚡ Analyzed (Depth ${targetDepth})`;
                setTimeout(() => {
                    if (myId === bestMoveRequestId) badge.classList.remove('visible');
                }, 1000);
            }
        } else {
            badge.classList.remove('visible');
            clearBestMoveArrow();
        }
    } catch (err) {
        if (myId === bestMoveRequestId) {
            badge.classList.remove('visible');
        }
    }
}

// Highlight legal destinations
function handlePieceClick(sq) {
    if (isAiThinking || (activeGameMode === 'eve') || (activeGameMode === 'pve' && sideToMove !== getPlayerColorCode())) {
        return;
    }

    const piece = boardGrid[sq];
    if (!piece || (piece.color === 'red' && sideToMove !== 'r') || (piece.color === 'blue' && sideToMove !== 'b')) {
        clearSelection();
        return;
    }

    playSound('click');
    clearSelection();
    selectedSquare = sq;
    
    // Highlight origin square
    const originCell = document.querySelector(`.square[data-sq="${sq}"]`);
    if (originCell) originCell.classList.add('selected-from');

    // Show destinations
    const fromCol = sq % 8;
    const fromRow = Math.floor(sq / 8);

    legalMoves.forEach(move => {
        if (move.from[0] === fromCol && move.from[1] === fromRow) {
            const finalStep = move.steps[move.steps.length - 1];
            const destSq = finalStep[1] * 8 + finalStep[0];
            const destCell = document.querySelector(`.square[data-sq="${destSq}"]`);
            if (destCell) {
                destCell.classList.add('move-dest');
                if (move.is_capture) {
                    destCell.classList.add('capture-dest');
                }
            }
        }
    });
}

function handleSquareClick(sq) {
    const cell = document.querySelector(`.square[data-sq="${sq}"]`);
    if (cell && cell.classList.contains('move-dest')) {
        const fromCol = selectedSquare % 8;
        const fromRow = Math.floor(selectedSquare / 8);
        const destCol = sq % 8;
        const destRow = Math.floor(sq / 8);

        const move = legalMoves.find(m => 
            m.from[0] === fromCol && 
            m.from[1] === fromRow && 
            m.steps[m.steps.length - 1][0] === destCol && 
            m.steps[m.steps.length - 1][1] === destRow
        );

        if (move) {
            makeUserMove(move);
        }
    } else {
        clearSelection();
    }
}

function clearSelection() {
    selectedSquare = null;
    document.querySelectorAll('.square').forEach(cell => {
        cell.classList.remove('selected-from', 'move-dest', 'capture-dest');
    });
}

// Convert user coordinates to move format
function makeUserMove(move) {
    clearSelection();
    
    // Save to undo history before making
    moveHistory.push(currentFen);
    elBtnUndo.disabled = false;

    // Log the user's action
    const startStr = `(${move.from[0]},${move.from[1]})`;
    const stepStrs = move.steps.map(s => `(${s[0]},${s[1]})`).join(' -> ');
    logToConsole(`Player Move: ${startStr} -> ${stepStrs}`, 'user');

    executeMoveOnBackend(move.steps.map(s => `${s[0]},${s[1]}`), move.from[0] + ',' + move.from[1]);
}

async function executeMoveOnBackend(steps, fromCoord) {
    const movePayload = [fromCoord, ...steps];
    
    // Show capture sound or normal move sound
    const isCaptureMove = steps.length > 1 || Math.abs(parseInt(fromCoord.split(',')[1]) - parseInt(steps[0].split(',')[1])) > 1;

    // Record move in notation history before sideToMove flips in parseFen
    const moveSide = sideToMove;
    const notationText = `(${fromCoord}) → ${steps.map(s => `(${s})`).join(' → ')}`;
    recordMoveNotation(moveSide, notationText, isCaptureMove);

    try {
        const res = await apiFetch('/api/move', {
            fen: currentFen,
            move: movePayload.map(c => c.split(',').map(Number)),
            mid_move_promotion: midMovePromotion
        });

        // Print engine output to console
        if (res.output) {
            const cleanOut = res.output.replace(/damath>|========================================|Rational Fractions Damath Engine|Type 'help' for a list of commands./g, '').trim();
            if (cleanOut) logToConsole(cleanOut, 'engine');
        }

        // Check if King was promoted
        const wasPromo = res.output && res.output.includes("promoted");
        if (wasPromo) {
            playSound('promotion');
        } else if (isCaptureMove) {
            playSound('capture');
        } else {
            playSound('move');
        }

        if (res.is_game_over) {
            handleGameOver(res);
            return;
        }

        parseFen(res.fen);
        renderBoard();

        // Load next legal moves
        const nextMoves = await apiFetch('/api/moves', { fen: currentFen });
        legalMoves = nextMoves.moves;

        // Check if next turn is AI's
        triggerAiIfTurn();

    } catch (err) {
        logToConsole(`Error executing move: ${err.message}`, 'error');
    }
}

// AI trigger logic
function getPlayerColorCode() {
    return playerColor === 'red' ? 'r' : 'b';
}

function triggerAiIfTurn() {
    if (activeGameMode === 'eve') {
        if (aiAutoplayActive) {
            setTimeout(playAiMove, 600);
        }
    } else if (activeGameMode === 'pve') {
        const aiColor = (playerColor === 'red') ? 'b' : 'r';
        if (sideToMove === aiColor) {
            setTimeout(playAiMove, 400);
        }
    }
}

async function playAiMove() {
    if (isAiThinking) return;
    isAiThinking = true;
    if (elEngineStatusText) elEngineStatusText.innerText = 'Thinking...';
    logToConsole("AI is thinking...", "system");

    const limitType = elAiLimitType.value;
    let payload = {
        fen: currentFen,
        mid_move_promotion: midMovePromotion
    };
    if (limitType === 'depth') {
        let depthVal = parseInt(elAiDepth.value) || 5;
        depthVal = Math.min(15, Math.max(1, depthVal));
        payload.depth = depthVal;
    } else {
        payload.time_ms = parseInt(elAiTime.value);
    }

    try {
        const res = await apiFetch('/api/ai_move', payload);
        isAiThinking = false;
        if (elEngineStatusText) elEngineStatusText.innerText = 'Ready';

        if (res.output) {
            const searchLines = res.output.split('\n')
                .filter(l => l.includes('info depth') || l.includes('bestmove'))
                .join('\n');
            if (searchLines) logToConsole(searchLines, 'engine');
        }

        if (res.bestmove && res.bestmove.length > 0) {
            const fromStr = `${res.bestmove[0][0]},${res.bestmove[0][1]}`;
            const stepsStr = res.bestmove.slice(1).map(s => `${s[0]},${s[1]}`);
            
            // Log move
            const pathStr = res.bestmove.map(s => `(${s[0]},${s[1]})`).join(' -> ');
            logToConsole(`AI plays move: ${pathStr}`, 'system');

            // Apply move
            executeMoveOnBackend(stepsStr, fromStr);
        } else {
            logToConsole("AI returned no moves. Game over?", "error");
        }

    } catch (err) {
        isAiThinking = false;
        if (elEngineStatusText) elEngineStatusText.innerText = 'Ready';
        logToConsole(`AI Move Error: ${err.message}`, 'error');
    }
}


// Game Over Modal display
function handleGameOver(res) {
    aiAutoplayActive = false;
    if (elEngineStatusText) elEngineStatusText.innerText = 'Game Over';
    logToConsole("GAME OVER!", "system");
    if (res.game_over_reason) logToConsole(res.game_over_reason, "system");
    logToConsole(`Final Scores - RED: ${redScore} | BLUE: ${blueScore}`, "system");

    let statusText = '';
    if (res.winner === 'Draw') {
        statusText = "The game ended in a DRAW!";
        playSound('victory');
    } else if (res.winner === 'RED') {
        statusText = "RED Player wins the game!";
        playSound(playerColor === 'red' ? 'victory' : 'defeat');
    } else if (res.winner === 'BLUE') {
        statusText = "BLUE Player wins the game!";
        playSound(playerColor === 'blue' ? 'victory' : 'defeat');
    } else {
        statusText = "Game ended.";
        playSound('victory');
    }

    elGameOverText.innerText = statusText;
    elModalScoreRed.innerText = redScore;
    elModalScoreBlue.innerText = blueScore;
    elGameOverModal.classList.add('show');
}

// Game Controls
async function startGame() {
    initAudio();
    aiAutoplayActive = false;
    isAiThinking = false;
    moveHistory = [];
    moveNotationLog = [];
    renderMoveHistory();
    elBtnUndo.disabled = true;

    activeGameMode = elGameMode.value;
    playerColor = elPlayerColor.value;
    midMovePromotion = elMidMovePromo.checked;
    showBestMove = elShowBestMove.checked;
    activeDamathVariant = elDamathVariant ? elDamathVariant.value : 'integer';

    if (elBestMoveDepthGroup) {
        elBestMoveDepthGroup.style.display = showBestMove ? 'flex' : 'none';
    }

    if (elBadgeGameMode) elBadgeGameMode.innerText = activeGameMode.toUpperCase();
    if (elEngineStatusText) elEngineStatusText.innerText = 'Ready';

    // Clear any stale arrow on new game
    clearBestMoveArrow();
    const badge = getBestMoveBadge();
    if (badge) badge.classList.remove('visible');

    logToConsole(`Starting new game. Mode: ${activeGameMode.toUpperCase()}`, 'system');

    try {
        const initData = await apiFetch('/api/initialize', { variant: activeDamathVariant });
        parseFen(initData.fen);
        renderBoard();
        
        // Fetch starting legal moves
        const movesRes = await apiFetch('/api/moves', { fen: currentFen });
        legalMoves = movesRes.moves;

        if (activeGameMode === 'eve') {
            aiAutoplayActive = true;
            logToConsole("Autoplay started. AI vs AI.", "system");
            triggerAiIfTurn();
        } else {
            triggerAiIfTurn();
        }

    } catch (err) {
        logToConsole("Failed to start game.", "error");
    }
}

function resetGame() {
    aiAutoplayActive = false;
    isAiThinking = false;
    elGameOverModal.classList.remove('show');
    clearSelection();
    startGame();
}

async function undoMove() {
    if (moveHistory.length === 0 || isAiThinking) return;
    
    // In PvE mode, we want to undo BOTH the AI's move and the user's move (2 steps back)
    if (activeGameMode === 'pve') {
        if (moveHistory.length >= 2) {
            // Undo 2 FENs back
            moveHistory.pop(); // Pop AI FEN
            const prevFen = moveHistory.pop(); // Pop user FEN
            moveNotationLog.pop();
            moveNotationLog.pop();
            parseFen(prevFen);
        } else {
            return;
        }
    } else {
        const prevFen = moveHistory.pop();
        moveNotationLog.pop();
        parseFen(prevFen);
    }

    renderMoveHistory();

    if (moveHistory.length === 0) {
        elBtnUndo.disabled = true;
    }

    logToConsole("Move undone.", "system");
    renderBoard();
    clearSelection();
    
    // Get legal moves for this FEN
    const movesRes = await apiFetch('/api/moves', { fen: currentFen });
    legalMoves = movesRes.moves;
    
}


// UI Event Listeners
elGameMode.addEventListener('change', () => {
    if (elGameMode.value === 'pve') {
        elPlayerColorGroup.style.display = 'flex';
    } else {
        elPlayerColorGroup.style.display = 'none';
    }
});

function updateVariantHint() {
    const v = DAMATH_VARIANTS[elDamathVariant ? elDamathVariant.value : 'integer'];
    if (elVariantHintText && v) {
        elVariantHintText.innerText = v.hint;
    }
}

if (elDamathVariant) {
    elDamathVariant.addEventListener('change', () => {
        activeDamathVariant = elDamathVariant.value;
        updateVariantHint();
        // Restart the game with the new variant so the engine loads
        // the correct chip values (not just re-label the old FEN).
        startGame();
    });
    updateVariantHint(); // init on load
}

elAiLimitType.addEventListener('change', () => {
    if (elAiLimitType.value === 'depth') {
        elAiDepthGroup.style.display = 'flex';
        elAiTimeGroup.style.display = 'none';
    } else {
        elAiDepthGroup.style.display = 'none';
        elAiTimeGroup.style.display = 'flex';
    }
});

// Toggle best-move arrow live whenever the checkbox is flipped mid-game
elShowBestMove.addEventListener('change', () => {
    showBestMove = elShowBestMove.checked;
    if (elBestMoveDepthGroup) {
        elBestMoveDepthGroup.style.display = showBestMove ? 'flex' : 'none';
    }
    if (!showBestMove) {
        clearBestMoveArrow();
        const badge = getBestMoveBadge();
        if (badge) badge.classList.remove('visible');
        bestMoveRequestId++; // cancel any in-flight request
    } else if (currentFen) {
        requestBestMove();
    }
});

if (elBestMoveDepth) {
    elBestMoveDepth.addEventListener('change', () => {
        let val = parseInt(elBestMoveDepth.value) || 15;
        val = Math.min(15, Math.max(1, val));
        elBestMoveDepth.value = val;
        if (showBestMove && currentFen) {
            requestBestMove();
        }
    });
}

if (elAiDepth) {
    elAiDepth.addEventListener('change', () => {
        let val = parseInt(elAiDepth.value) || 5;
        val = Math.min(15, Math.max(1, val));
        elAiDepth.value = val;
    });
}

elBtnStart.addEventListener('click', startGame);
elBtnReset.addEventListener('click', resetGame);
elBtnUndo.addEventListener('click', undoMove);
elBtnClearConsole.addEventListener('click', () => {
    elConsoleLog.innerHTML = '';
});
elBtnCloseModal.addEventListener('click', resetGame);

// Settings modal listeners
if (elBtnSettings) elBtnSettings.addEventListener('click', openSettingsModal);
if (elBtnCloseSettings) elBtnCloseSettings.addEventListener('click', closeSettingsModal);
if (elBtnApplySettings) elBtnApplySettings.addEventListener('click', closeSettingsModal);
if (elSettingsModal) {
    elSettingsModal.addEventListener('click', (e) => {
        if (e.target === elSettingsModal) closeSettingsModal();
    });
}

// Flip board listeners
if (elBtnFlipBoard) elBtnFlipBoard.addEventListener('click', toggleBoardFlip);
if (elFlipBoardCheck) {
    elFlipBoardCheck.addEventListener('change', () => {
        if (elFlipBoardCheck.checked !== isFlipped) {
            toggleBoardFlip();
        }
    });
}

// Hotkey 'F' / 'f' for flipping the board
window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
        return;
    }
    if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleBoardFlip();
    }
});

// Load game state on boot
startGame();


