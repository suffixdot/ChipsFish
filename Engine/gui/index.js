// Damath GUI Frontend Logic — ChipsFish Engine Suite v2.0

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
let historyViewIndex = -1; // Index into [...moveHistory, currentFen]. -1 or maxIndex means LIVE view
let midMovePromotion = false;
let showBestMove = false;
let hintOneShot = false; // true while a one-shot hint arrow should be displayed
let showEvalBar = true;
let bestMoveRequestId = 0; // used to cancel stale in-flight requests
let evalRequestId = 0;     // used to cancel stale eval requests
let activeDamathVariant = 'integer'; // current Damath variant
let aiPersonality = 'passive'; // 'passive' or 'aggressive'
let soundEnabled = true;

// ---------------------------------------------------------------------------
// Damath Variant Definitions
// ---------------------------------------------------------------------------
const DAMATH_VARIANTS = {
    counting: { label: 'Counting', grade: 'Grades 1–2', hint: 'Chips: 1–12 (positive counting numbers)' },
    whole: { label: 'Whole Number', grade: 'Grades 3–4', hint: 'Chips: 0–11 (whole numbers)' },
    fraction: { label: 'Fraction', grade: 'Grades 5–6', hint: 'Chips: 1/10 to 12/10' },
    integer: { label: 'Integer', grade: 'Grade 7', hint: 'Chips: -11 to 10 (official layout)' },
    rational: { label: 'Rational', grade: 'Grade 8', hint: 'Chips: -11/10 to 10/10 (official layout)' },
    radical: { label: 'Radical', grade: 'Grade 9', hint: 'Chips: radical expressions (e.g. -9√2, 144√8)' },
    polynomial: { label: 'Polynomial', grade: 'Grade 10', hint: 'Chips: polynomial terms (e.g. 78xy², -45y)' },
    thermo: { label: 'Thermo Sci-Dama', grade: 'Grade 10', hint: 'Chips: Mass in grams & Temp in °C (Lower score wins!)' }
};

const VARIANT_FEN_TO_KEY = {
    integer: {
        '-11': '-11', '8': '8',  '-5': '-5', '2': '2',
        '0':   '0',   '-3': '-3','10': '10',  '-7': '-7',
        '-9':  '-9',  '6': '6',  '-1': '-1',  '4': '4'
    },
    rational: {
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

const FEN_TO_KEY = VARIANT_FEN_TO_KEY.rational;

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
    polynomial: {
        '-11': { raw: '-3x²y',   html: '-3x<sup>2</sup>y' },
        '8':   { raw: '-xy²',    html: '-xy<sup>2</sup>' },
        '-5':  { raw: '6x',      html: '6x' },
        '2':   { raw: '10y',     html: '10y' },
        '0':   { raw: '-55x',    html: '-55x' },
        '-3':  { raw: '-45y',    html: '-45y' },
        '10':  { raw: '66x²y',   html: '66x<sup>2</sup>y' },
        '-7':  { raw: '78xy²',   html: '78xy<sup>2</sup>' },
        '-9':  { raw: '-21xy²',  html: '-21xy<sup>2</sup>' },
        '6':   { raw: '-15x',    html: '-15x' },
        '-1':  { raw: '28y',     html: '28y' },
        '4':   { raw: '36x²y',   html: '36x<sup>2</sup>y' }
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

function getVariantPieceLabel(fenValue, variantName) {
    return getVariantChipData(fenValue, variantName).raw;
}

// ---------------------------------------------------------------------------
// Web Audio Synthesizer (Zero External Dependencies)
// ---------------------------------------------------------------------------
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playSound(type) {
    if (!soundEnabled) return;
    try {
        initAudio();
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const now = audioCtx.currentTime;
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'click') {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(100, now + 0.05);
            gainNode.gain.setValueAtTime(0.08, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
        } else if (type === 'move') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, now);
            osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
            gainNode.gain.setValueAtTime(0.15, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
            osc.start(now);
            osc.stop(now + 0.09);
        } else if (type === 'capture') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.linearRampToValueAtTime(60, now + 0.14);
            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc.start(now);
            osc.stop(now + 0.14);
        } else if (type === 'promotion') {
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((f, idx) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'sine';
                o.frequency.setValueAtTime(f, now + idx * 0.05);
                o.connect(g);
                g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.12, now + idx * 0.05);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.15);
                o.start(now + idx * 0.05);
                o.stop(now + idx * 0.05 + 0.15);
            });
        } else if (type === 'victory') {
            const notes = [392.00, 523.25, 659.25, 783.99];
            notes.forEach((f, idx) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                o.type = 'triangle';
                o.frequency.setValueAtTime(f, now + idx * 0.12);
                o.connect(g);
                g.connect(audioCtx.destination);
                g.gain.setValueAtTime(0.15, now + idx * 0.12);
                g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);
                o.start(now + idx * 0.12);
                o.stop(now + idx * 0.12 + 0.4);
            });
        }
    } catch (_) {}
}

// ---------------------------------------------------------------------------
// DOM Elements
// ---------------------------------------------------------------------------
const elBoard = document.getElementById('board');
const elScoreRed = document.getElementById('score-red');
const elScoreBlue = document.getElementById('score-blue');
const elLeadRed = document.getElementById('lead-red');
const elLeadBlue = document.getElementById('lead-blue');
const elGraveyardRed = document.getElementById('graveyard-red');
const elGraveyardBlue = document.getElementById('graveyard-blue');
const elPanelRed = document.getElementById('panel-red');
const elPanelBlue = document.getElementById('panel-blue');
const elConsoleLog = document.getElementById('console-log');
const elGameOverModal = document.getElementById('game-over-modal');
const elGameOverTitle = document.getElementById('game-over-title');
const elGameOverText = document.getElementById('game-over-text');
const elModalScoreRed = document.getElementById('modal-score-red');
const elModalScoreBlue = document.getElementById('modal-score-blue');
const elEvalBarWrapper = document.getElementById('eval-bar-wrapper');
const elEvalBarContainer = document.getElementById('eval-bar-container');
const elEvalBarFill    = document.getElementById('eval-bar-fill');
const elEvalBarLabel   = document.getElementById('eval-bar-label');

const elActiveVariantBadge = document.getElementById('active-variant-badge');
const elVariantBadgeName = document.getElementById('variant-badge-name');
const elVariantBadgeGrade = document.getElementById('variant-badge-grade');

const elTabPve = document.getElementById('tab-pve');
const elTabPvp = document.getElementById('tab-pvp');
const elTabEve = document.getElementById('tab-eve');
const elBtnAudioToggle = document.getElementById('btn-audio-toggle');
const elBtnHint = document.getElementById('btn-hint');
const elBtnCopyFen = document.getElementById('btn-copy-fen');
const elBtnCopyPgn = document.getElementById('btn-copy-pgn');
const elMathTooltip = document.getElementById('math-equation-tooltip');
const elMathTooltipText = document.getElementById('math-tooltip-text');

// Configuration inputs
const elGameMode = document.getElementById('game-mode');
const elPlayerColor = document.getElementById('player-color');
const elPlayerColorGroup = document.getElementById('player-color-group');
const elAiConfigSection = document.getElementById('ai-config-section');
const elAiLimitType = document.getElementById('ai-limit-type');
const elAiDepthGroup = document.getElementById('ai-depth-group');
const elAiDepth = document.getElementById('ai-depth');
const elAiTimeGroup = document.getElementById('ai-time-group');
const elAiTime = document.getElementById('ai-time');
const elAiPersonality = document.getElementById('ai-personality');
const elMidMovePromo = document.getElementById('mid-move-promo');
const elShowBestMove = document.getElementById('show-best-move');
const elShowEvalBar  = document.getElementById('show-eval-bar');
const elBestMoveDepth = document.getElementById('best-move-depth');
const elBestMoveOverlay = document.getElementById('best-move-overlay');
const elBtnFlipBoard = document.getElementById('btn-flip-board');
const elFlipBoardCheck = document.getElementById('flip-board-check');
const elDamathVariant = document.getElementById('damath-variant');
const elVariantHintText = document.getElementById('variant-hint-text');

let isFlipped = false;
let moveNotationLog = [];

// Buttons & Modals
const elBtnStart = document.getElementById('btn-start');
const elBtnUndo = document.getElementById('btn-undo');
const elBtnReset = document.getElementById('btn-reset');
const elBtnClearConsole = document.getElementById('btn-clear-console');
const elBtnCloseModal = document.getElementById('btn-close-modal');

const elBtnSettings = document.getElementById('btn-settings');
const elSettingsModal = document.getElementById('settings-modal');
const elBtnCloseSettings = document.getElementById('btn-close-settings');
const elBtnApplySettings = document.getElementById('btn-apply-settings');

const elWelcomeModal = document.getElementById('welcome-modal');
const elBtnCloseWelcome = document.getElementById('btn-close-welcome');
const elBtnWelcomeOk = document.getElementById('btn-welcome-ok');

const elStatusTurnPill = document.getElementById('status-turn-pill');
const elStatusTurnText = document.getElementById('status-turn-text');
const elEngineStatusText = document.getElementById('engine-status-text');
const elHistoryList = document.getElementById('history-list');
const elMoveCountBadge = document.getElementById('move-count-badge');

// ---------------------------------------------------------------------------
// Notation & History Management
// ---------------------------------------------------------------------------
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

function isViewingHistory() {
    return historyViewIndex >= 0 && historyViewIndex < moveHistory.length;
}

function jumpToHistoryIndex(targetIndex) {
    const maxIdx = moveHistory.length;
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex > maxIdx) targetIndex = maxIdx;

    historyViewIndex = targetIndex;
    clearSelection();
    playSound('click');

    const allPositions = [...moveHistory, currentFen];
    const fenToDisplay = allPositions[historyViewIndex] || currentFen;

    const isLive = (historyViewIndex === maxIdx);
    parseFen(fenToDisplay, isLive);
    renderBoard();
    renderMoveHistory();

    if (elEngineStatusText) {
        if (!isLive) {
            elEngineStatusText.innerText = `Viewing Move ${historyViewIndex} of ${maxIdx} (Read-Only) — Press → to return`;
        } else {
            elEngineStatusText.innerText = isAiThinking ? 'Engine Thinking...' : 'Engine Ready';
        }
    }
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

    const maxIdx = moveHistory.length;
    let html = '';
    moveNotationLog.forEach((item, index) => {
        const isRed = item.side === 'r';
        const numLabel = isRed ? `${item.num}.` : '';
        const badgeTag = item.isCapture ? '<span class="move-badge badge-capture">💥 CAP</span>' : '';
        const posIdx = index + 1;
        const isActive = (historyViewIndex === posIdx);
        html += `
            <div class="history-row ${isActive ? 'active-history-row' : ''}" data-pos-idx="${posIdx}" title="Click to view position after move ${index + 1}">
                <span class="move-num">${numLabel}</span>
                <span class="move-cell ${isRed ? 'red-move' : 'blue-move'}">${item.text}</span>
                ${badgeTag}
            </div>
        `;
    });
    elHistoryList.innerHTML = html;

    const rows = elHistoryList.querySelectorAll('.history-row');
    rows.forEach(row => {
        row.addEventListener('click', () => {
            const posIdx = parseInt(row.dataset.posIdx, 10);
            if (!isNaN(posIdx)) {
                jumpToHistoryIndex(posIdx);
            }
        });
    });

    if (historyViewIndex === maxIdx || historyViewIndex < 0) {
        elHistoryList.scrollTop = elHistoryList.scrollHeight;
    }
}

function openSettingsModal() {
    playSound('click');
    updateModeDependentControls();
    updateAiLimitTypeControls();
    if (elSettingsModal) elSettingsModal.classList.add('active');
}

function closeSettingsModal() {
    playSound('click');
    if (elSettingsModal) elSettingsModal.classList.remove('active');
}

async function apiFetch(endpoint, data = {}) {
    try {
        if (typeof window.engineApiFetch !== 'function') {
            throw new Error('JS engine not loaded.');
        }
        return await window.engineApiFetch(endpoint, data);
    } catch (err) {
        logToConsole(`Error: ${err.message}`, 'error');
        throw err;
    }
}

function logToConsole(message, type = 'system') {
    if (!elConsoleLog) return;
    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerText = message;
    elConsoleLog.appendChild(entry);
    elConsoleLog.scrollTop = elConsoleLog.scrollHeight;
}

function parseFraction(fracStr) {
    if (!fracStr) return 0;
    const cleaned = String(fracStr).replace(/damath\s*>\s*/g, '').trim();
    if (!cleaned) return 0;
    if (cleaned.includes('/')) {
        const parts = cleaned.split('/');
        return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(cleaned);
}

function getSquareOperator(col, row) {
    const isPlayable = (row + col) % 2 === 1;
    if (!isPlayable) return '';
    const j = Math.floor(col / 2);
    const templates = [
        ['+', '−', '÷', '×'], // rows 0, 4
        ['−', '+', '×', '÷'], // rows 1, 5
        ['÷', '×', '+', '−'], // rows 2, 6
        ['×', '÷', '−', '+'], // rows 3, 7
    ];
    return templates[row % 4][j];
}

// ---------------------------------------------------------------------------
// FEN Parser
// ---------------------------------------------------------------------------
function parseFen(fen, updateLiveState = true) {
    if (updateLiveState) {
        currentFen = fen;
    }
    const fields = fen.split(' ');
    if (fields.length < 4) return;

    const boardPart = fields[0];
    sideToMove = fields[1];
    redScore = fields[2];
    blueScore = fields[3];

    // Turn pill
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

    // Scores & Lead difference
    elScoreRed.innerText = redScore;
    elScoreBlue.innerText = blueScore;

    const numRed = parseFraction(redScore);
    const numBlue = parseFraction(blueScore);
    const diff = Math.abs(numRed - numBlue);
    if (diff > 0) {
        if (numRed > numBlue) {
            if (elLeadRed) elLeadRed.innerText = `+${diff.toFixed(1)}`;
            if (elLeadBlue) elLeadBlue.innerText = '';
        } else {
            if (elLeadBlue) elLeadBlue.innerText = `+${diff.toFixed(1)}`;
            if (elLeadRed) elLeadRed.innerText = '';
        }
    } else {
        if (elLeadRed) elLeadRed.innerText = '';
        if (elLeadBlue) elLeadBlue.innerText = '';
    }

    // Parse Board Pieces
    boardGrid = Array(64).fill(null);
    const rows = [];
    let currentRow = '';
    let parenDepth = 0;
    for (let idx = 0; idx < boardPart.length; idx++) {
        const char = boardPart[idx];
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

    updateGraveyard();
    if (showEvalBar) requestEvalBar();
}

function updateGraveyard() {
    let redCount = 0, blueCount = 0;
    for (let sq = 0; sq < 64; sq++) {
        const p = boardGrid[sq];
        if (p) {
            if (p.color === 'red') redCount++;
            else if (p.color === 'blue') blueCount++;
        }
    }
    const capturedRed = 12 - redCount;
    const capturedBlue = 12 - blueCount;

    if (elGraveyardRed) {
        elGraveyardRed.innerHTML = Array.from({ length: capturedRed }, () => '<span class="grave-chip red"></span>').join('');
    }
    if (elGraveyardBlue) {
        elGraveyardBlue.innerHTML = Array.from({ length: capturedBlue }, () => '<span class="grave-chip blue"></span>').join('');
    }
}

function setEvalBarDisplay(evalFromRed) {
    // evalFromRed: positive = RED better, negative = BLUE better
    // Scale by / 40 so Damath score scale (where chip values are ~10 and captures are ~20-100)
    // produces smooth, realistic Chess.com style evaluation bar movements.
    const absVal = Math.abs(evalFromRed);
    const isMate = absVal > 5000;

    let pct;
    if (isMate) {
        pct = evalFromRed > 0 ? 95 : 5;
    } else {
        // Scale: tanh(eval/40) maps ±40 pts to ~76% fill, ±80 pts to ~93% fill
        const t = Math.tanh(evalFromRed / 40);
        pct = 50 + t * 45;
        pct = Math.min(95, Math.max(5, pct));
    }
    elEvalBarFill.style.height = `${pct}%`;

    // Track label at the fill boundary (clamp to 8–92% so label stays visible)
    const labelPct = Math.min(92, Math.max(8, pct));
    if (elEvalBarWrapper) {
        elEvalBarWrapper.style.setProperty('--eval-fill-pct', `${labelPct}%`);
    }

    // Format label — show who's ahead and by how much
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

let lastDisplayedEvalReqId = 0;

async function requestEvalBar() {
    if (!elEvalBarFill || !elEvalBarLabel || !showEvalBar) return;
    const reqId = ++evalRequestId;
    const depth = elBestMoveDepth ? (parseInt(elBestMoveDepth.value) || 6) : 6;
    const fenAtRequest = currentFen;

    // Show thinking state
    if (elEvalBarWrapper) elEvalBarWrapper.classList.add('thinking');

    try {
        const res = await apiFetch('/api/eval', {
            fen: fenAtRequest,
            depth: Math.min(15, Math.max(1, depth)),
            mid_move_promotion: midMovePromotion,
            personality: aiPersonality,
            variant: activeDamathVariant
        });
        if (!showEvalBar) return;
        if (res && typeof res.eval === 'number') {
            // Only display if this request is monotonically newer or matches current position
            if (reqId >= lastDisplayedEvalReqId || fenAtRequest === currentFen) {
                lastDisplayedEvalReqId = reqId;
                setEvalBarDisplay(res.eval);
            }
        }
    } catch (_) {
        // silently ignore
    } finally {
        // Only remove thinking class if no newer request is in-flight
        if (reqId === evalRequestId && elEvalBarWrapper) {
            elEvalBarWrapper.classList.remove('thinking');
        }
    }
}


// ---------------------------------------------------------------------------
// Board Renderer
// ---------------------------------------------------------------------------
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
                const chipData = getVariantChipData(piece.value, activeDamathVariant);
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
                    handlePieceClick(sq);
                });
            }

            cell.addEventListener('mouseenter', () => {
                handleSquareHover(sq);
            });
            cell.addEventListener('mouseleave', () => {
                hideMathTooltip();
            });

            cell.addEventListener('click', () => {
                handleSquareClick(sq);
            });

            elBoard.appendChild(cell);
        }
    }

    syncOverlaySize();
    clearBestMoveArrow();
    if (showBestMove) {
        requestBestMove();
    }
}

function toggleBoardFlip() {
    isFlipped = !isFlipped;
    if (elFlipBoardCheck) elFlipBoardCheck.checked = isFlipped;
    playSound('click');
    logToConsole(`Board flipped (${isFlipped ? 'BLUE view' : 'RED view'})`, 'system');
    renderBoard();
}

function syncOverlaySize() {
    const boardEl = document.getElementById('board');
    if (!boardEl || !elBestMoveOverlay) return;
    const rect = boardEl.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    elBestMoveOverlay.setAttribute('width', w);
    elBestMoveOverlay.setAttribute('height', h);
    elBestMoveOverlay.setAttribute('viewBox', `0 0 ${w} ${h}`);
}

function squareCentre(col, row) {
    const boardEl = document.getElementById('board');
    if (!boardEl) return { x: 0, y: 0 };
    const cell = boardEl.querySelector(`.square[data-col="${col}"][data-row="${row}"]`);
    if (!cell) return { x: 0, y: 0 };
    const boardRect = boardEl.getBoundingClientRect();
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

async function requestBestMove() {
    if (!showBestMove && !hintOneShot) {
        clearBestMoveArrow();
        return;
    }
    const reqId = ++bestMoveRequestId;
    const bestMoveDepth = elBestMoveDepth ? (parseInt(elBestMoveDepth.value) || 6) : 6;
    // Snapshot the hint flag so we can check it after the async call resolves
    const wasHint = hintOneShot;
    try {
        const res = await apiFetch('/api/best_move', {
            fen: currentFen,
            depth: Math.min(15, Math.max(1, bestMoveDepth)),
            mid_move_promotion: midMovePromotion,
            personality: aiPersonality,
            variant: activeDamathVariant
        });
        if (reqId !== bestMoveRequestId) return;
        // If neither the persistent toggle nor the hint is still active, bail out
        if (!showBestMove && !hintOneShot) {
            clearBestMoveArrow();
            return;
        }
        if (res && res.bestmove && res.bestmove.length >= 2) {
            renderBestMovePath(res.bestmove);
        } else {
            clearBestMoveArrow();
        }
    } catch (_) {
        clearBestMoveArrow();
    }
}

// ---------------------------------------------------------------------------
// Math Tooltip Handler
// ---------------------------------------------------------------------------
function handleSquareHover(sq) {
    if (selectedSquare === null || !elMathTooltip || !elMathTooltipText) return;
    const matchingMoves = legalMoves.filter(m => m.from === selectedSquare && getMoveDest(m) === sq);
    if (matchingMoves.length > 0 && matchingMoves[0].is_capture) {
        const m = matchingMoves[0];
        const pFrom = boardGrid[selectedSquare];
        const capSq = m.captured_squares ? m.captured_squares[0] : null;
        const pCap = capSq !== null ? boardGrid[capSq] : null;
        if (pFrom && pCap) {
            const op = getSquareOperator(capSq % 8, Math.floor(capSq / 8));
            const v1 = getVariantChipData(pFrom.value, activeDamathVariant).raw;
            const v2 = getVariantChipData(pCap.value, activeDamathVariant).raw;
            elMathTooltipText.innerText = `${v1} ${op || '×'} ${v2} → Score Gain: ${m.score_change}`;
            elMathTooltip.classList.add('visible');
        }
    }
}

function hideMathTooltip() {
    if (elMathTooltip) elMathTooltip.classList.remove('visible');
}

// ---------------------------------------------------------------------------
// Game Flow & Interactions
// ---------------------------------------------------------------------------
function handlePieceClick(sq) {
    if (isViewingHistory()) return;
    const piece = boardGrid[sq];
    if (!piece) return;
    const sideChar = (piece.color === 'red') ? 'r' : 'b';
    if (sideChar !== sideToMove) return;

    if (activeGameMode === 'pve') {
        const expectedColor = (playerColor === 'red') ? 'r' : 'b';
        if (sideToMove !== expectedColor) return;
    }
    if (isAiThinking) return;

    selectSquare(sq);
}

function selectSquare(sq) {
    selectedSquare = sq;
    playSound('click');
    const squares = elBoard.querySelectorAll('.square');
    squares.forEach(s => {
        s.classList.remove('selected', 'legal-move', 'legal-capture');
    });

    const cell = elBoard.querySelector(`.square[data-sq="${sq}"]`);
    if (cell) cell.classList.add('selected');

    const validMoves = legalMoves.filter(m => m.from === sq);
    validMoves.forEach(m => {
        const dest = getMoveDest(m);
        const destCell = elBoard.querySelector(`.square[data-sq="${dest}"]`);
        if (destCell) {
            destCell.classList.add(m.is_capture ? 'legal-capture' : 'legal-move');
        }
    });
}

function clearSelection() {
    selectedSquare = null;
    hideMathTooltip();
    const squares = elBoard.querySelectorAll('.square');
    squares.forEach(s => s.classList.remove('selected', 'legal-move', 'legal-capture'));
}

function getMoveDest(m) {
    if (m.steps && m.steps.length > 0) {
        return m.steps[m.steps.length - 1];
    }
    return m.from;
}

function formatMovePath(m) {
    const fromCol = m.from % 8, fromRow = Math.floor(m.from / 8);
    let str = `(${fromCol},${fromRow})`;
    if (m.steps) {
        m.steps.forEach(s => {
            str += ` → (${s % 8},${Math.floor(s / 8)})`;
        });
    }
    return str;
}

async function handleSquareClick(sq) {
    if (isViewingHistory()) return;
    if (selectedSquare === null) return;
    const matchingMoves = legalMoves.filter(m => m.from === selectedSquare && getMoveDest(m) === sq);
    if (matchingMoves.length === 0) {
        clearSelection();
        return;
    }
    const chosenMove = matchingMoves[0];
    await executeMove(chosenMove);
}

async function executeMove(m) {
    clearSelection();
    // A move was made — dismiss any one-shot hint arrow
    if (hintOneShot) {
        hintOneShot = false;
        clearBestMoveArrow();
    }
    const currentSide = sideToMove;
    const pathStr = formatMovePath(m);

    moveHistory.push(currentFen);
    historyViewIndex = moveHistory.length;
    elBtnUndo.disabled = false;

    const res = await apiFetch('/api/move', {
        fen: currentFen,
        move: m.path || m,
        mid_move_promotion: midMovePromotion,
        variant: activeDamathVariant
    });

    parseFen(res.fen);
    recordMoveNotation(currentSide, pathStr, m.is_capture);

    if (m.promoted) playSound('promotion');
    else if (m.is_capture) playSound('capture');
    else playSound('move');

    renderBoard();

    if (res.game_over || res.is_game_over) {
        handleGameOver(res);
        return;
    }

    legalMoves = res.moves || res.legal_moves || [];
    checkAiTurn();
}

function checkAiTurn() {
    if (isAiThinking) return;
    let shouldAiMove = false;
    if (activeGameMode === 'eve') shouldAiMove = true;
    else if (activeGameMode === 'pve') {
        const aiSide = (playerColor === 'red') ? 'b' : 'r';
        if (sideToMove === aiSide) shouldAiMove = true;
    }
    if (shouldAiMove) triggerAiMove();
}

async function triggerAiMove() {
    isAiThinking = true;
    elEngineStatusText.innerText = 'AI Thinking...';

    const aiDepthVal = elAiDepth ? (parseInt(elAiDepth.value) || 5) : 5;
    const aiTimeVal = elAiTime ? (parseInt(elAiTime.value) || 1000) : 1000;
    const limitType = elAiLimitType ? elAiLimitType.value : 'time';

    const params = {
        fen: currentFen,
        depth: (limitType === 'depth') ? aiDepthVal : 0,
        time_ms: (limitType === 'time') ? aiTimeVal : 0,
        mid_move_promotion: midMovePromotion,
        personality: aiPersonality,
        variant: activeDamathVariant
    };

    try {
        const res = await apiFetch('/api/ai_move', params);
        if (res.output) logToConsole(res.output, 'engine');

        if (res.bestmove) {
            const path = res.bestmove;
            const fromSq = path[0][1] * 8 + path[0][0];
            const destSq = path[path.length - 1][1] * 8 + path[path.length - 1][0];
            const matchingMove = legalMoves.find(m => m.from === fromSq && getMoveDest(m) === destSq) || {
                from: fromSq,
                steps: path.slice(1).map(([c, r]) => r * 8 + c),
                path: path,
                is_capture: false
            };
            await executeMove(matchingMove);
        } else if (res.game_over || res.is_game_over) {
            handleGameOver(res);
        }
    } catch (err) {
        logToConsole(`AI Error: ${err.message}`, 'error');
    } finally {
        isAiThinking = false;
        elEngineStatusText.innerText = 'Engine Ready';
    }
}

function handleGameOver(res) {
    // Normalize winner: worker sends 'RED'/'BLUE'/'Draw', also handle lowercase
    const winnerRaw = (res.winner || '').toLowerCase();
    // Normalize reason: worker sends 'game_over_reason', also accept 'reason'
    const reason = res.game_over_reason || res.reason || '';

    let winMsg = '';
    if (winnerRaw === 'draw') {
        winMsg = `Match Draw! (${reason || 'Draw condition reached'})`;
    } else {
        const winnerName = winnerRaw === 'red' ? 'RED PLAYER' : 'BLUE PLAYER';
        const defaultWinReason = activeDamathVariant === 'thermo' ? 'Lower score' : 'Higher score';
        winMsg = `${winnerName} WINS! (${reason || defaultWinReason})`;
        playSound('victory');
    }
    elGameOverTitle.innerText = winnerRaw === 'draw' ? 'Draw Game' : 'Victory!';
    elGameOverText.innerText = winMsg;

    const finalRed = res.final_score_red !== undefined ? res.final_score_red : redScore;
    const finalBlue = res.final_score_blue !== undefined ? res.final_score_blue : blueScore;
    const capRed = res.capture_score_red !== undefined ? res.capture_score_red : redScore;
    const capBlue = res.capture_score_blue !== undefined ? res.capture_score_blue : blueScore;

    if (elModalScoreRed) elModalScoreRed.innerText = finalRed;
    if (elModalScoreBlue) elModalScoreBlue.innerText = finalBlue;

    const elSubRed = document.getElementById('modal-score-red-sub');
    const elSubBlue = document.getElementById('modal-score-blue-sub');
    if (elSubRed) elSubRed.innerText = `(Captures: ${capRed})`;
    if (elSubBlue) elSubBlue.innerText = `(Captures: ${capBlue})`;

    if (elGameOverModal) elGameOverModal.classList.add('active');
}

async function startGame() {
    activeDamathVariant = elDamathVariant ? elDamathVariant.value : 'integer';
    activeGameMode = elGameMode ? elGameMode.value : 'pve';
    playerColor = elPlayerColor ? elPlayerColor.value : 'red';
    aiPersonality = elAiPersonality ? elAiPersonality.value : 'passive';
    midMovePromotion = elMidMovePromo ? elMidMovePromo.checked : false;

    // Sync eval bar and best move visibility from settings checkboxes
    if (elShowEvalBar) showEvalBar = elShowEvalBar.checked;
    if (elShowBestMove) showBestMove = elShowBestMove.checked;
    if (elEvalBarContainer) elEvalBarContainer.style.display = showEvalBar ? '' : 'none';
    if (!showEvalBar) {
        if (elEvalBarFill) elEvalBarFill.style.height = '50%';
        if (elEvalBarLabel) elEvalBarLabel.innerText = 'EVEN';
    }

    updateVariantBadgeHeader();

    logToConsole(`Initializing ${DAMATH_VARIANTS[activeDamathVariant].label} Damath...`, 'system');

    const initRes = await apiFetch('/api/initialize', { variant: activeDamathVariant });
    parseFen(initRes.fen);
    legalMoves = initRes.moves || initRes.legal_moves || [];
    moveHistory = [];
    moveNotationLog = [];
    historyViewIndex = 0;
    renderMoveHistory();
    elBtnUndo.disabled = true;
    renderBoard();

    checkAiTurn();
}

function resetGame() {
    playSound('click');
    if (elGameOverModal) elGameOverModal.classList.remove('active');
    startGame();
}

function updateVariantBadgeHeader() {
    const vInfo = DAMATH_VARIANTS[activeDamathVariant] || DAMATH_VARIANTS.integer;
    if (elVariantBadgeName) elVariantBadgeName.innerText = `${vInfo.label.toUpperCase()} DAMATH`;
    if (elVariantBadgeGrade) elVariantBadgeGrade.innerText = vInfo.grade;
}

function updateModeDependentControls() {
    const val = elGameMode ? elGameMode.value : 'pve';
    if (elPlayerColorGroup) elPlayerColorGroup.style.display = (val === 'pve') ? 'flex' : 'none';
    if (elAiConfigSection) elAiConfigSection.style.display = (val === 'pve' || val === 'eve') ? 'flex' : 'none';
}

function updateAiLimitTypeControls() {
    const val = elAiLimitType ? elAiLimitType.value : 'time';
    if (elAiDepthGroup) elAiDepthGroup.style.display = (val === 'depth') ? 'flex' : 'none';
    if (elAiTimeGroup) elAiTimeGroup.style.display = (val === 'time') ? 'flex' : 'none';
}

// ---------------------------------------------------------------------------
// Event Bindings
// ---------------------------------------------------------------------------
if (elGameMode) {
    elGameMode.addEventListener('change', updateModeDependentControls);
    updateModeDependentControls();
}

if (elAiLimitType) {
    elAiLimitType.addEventListener('change', updateAiLimitTypeControls);
    updateAiLimitTypeControls();
}

// Top Navbar Mode Tabs
[elTabPve, elTabPvp, elTabEve].forEach(tab => {
    if (tab) {
        tab.addEventListener('click', () => {
            playSound('click');
            [elTabPve, elTabPvp, elTabEve].forEach(t => t && t.classList.remove('active'));
            tab.classList.add('active');
            if (elGameMode) {
                elGameMode.value = tab.dataset.mode;
                updateModeDependentControls();
            }
            startGame();
        });
    }
});

// Audio Toggle Button
if (elBtnAudioToggle) {
    elBtnAudioToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        elBtnAudioToggle.classList.toggle('active', soundEnabled);
        playSound('click');
    });
}

// Hint Button — one-shot: shows the best move for the current position only
if (elBtnHint) {
    elBtnHint.addEventListener('click', () => {
        hintOneShot = true;
        playSound('click');
        requestBestMove();
    });
}

// Copy FEN & Copy PGN Buttons
if (elBtnCopyFen) {
    elBtnCopyFen.addEventListener('click', () => {
        navigator.clipboard.writeText(currentFen);
        logToConsole('FEN copied to clipboard!', 'system');
        playSound('click');
    });
}

if (elBtnCopyPgn) {
    elBtnCopyPgn.addEventListener('click', () => {
        const pgnText = moveNotationLog.map(m => `${m.num}. ${m.text}`).join('\n');
        navigator.clipboard.writeText(pgnText);
        logToConsole('Move history copied to clipboard!', 'system');
        playSound('click');
    });
}

if (elDamathVariant) {
    elDamathVariant.addEventListener('change', () => {
        activeDamathVariant = elDamathVariant.value;
        if (elVariantHintText && DAMATH_VARIANTS[activeDamathVariant]) {
            elVariantHintText.innerText = DAMATH_VARIANTS[activeDamathVariant].hint;
        }
        startGame();
    });
}

if (elShowBestMove) {
    elShowBestMove.addEventListener('change', () => {
        showBestMove = elShowBestMove.checked;
        if (!showBestMove) clearBestMoveArrow();
        else requestBestMove();
    });
}

if (elShowEvalBar) {
    elShowEvalBar.addEventListener('change', () => {
        showEvalBar = elShowEvalBar.checked;
        if (elEvalBarContainer) elEvalBarContainer.style.display = showEvalBar ? '' : 'none';
        if (showEvalBar && currentFen) requestEvalBar();
        else if (!showEvalBar) {
            // Reset bar to neutral when hidden/turned off
            if (elEvalBarFill) elEvalBarFill.style.height = '50%';
            if (elEvalBarLabel) elEvalBarLabel.innerText = 'EVEN';
        }
    });
}

if (elBestMoveDepth) {
    elBestMoveDepth.addEventListener('change', () => {
        if (showBestMove) requestBestMove();
        if (showEvalBar) requestEvalBar();
    });
}

if (elBtnStart) elBtnStart.addEventListener('click', startGame);
if (elBtnReset) elBtnReset.addEventListener('click', resetGame);
if (elBtnUndo) elBtnUndo.addEventListener('click', async () => {
    playSound('click');
    if (moveHistory.length === 0) return;
    const prevFen = moveHistory.pop();
    moveNotationLog.pop();
    parseFen(prevFen, true);
    historyViewIndex = moveHistory.length;
    renderMoveHistory();
    if (moveHistory.length === 0) elBtnUndo.disabled = true;
    renderBoard();
    const movesRes = await apiFetch('/api/moves', { fen: currentFen, variant: activeDamathVariant });
    legalMoves = movesRes.moves;
});

if (elBtnClearConsole) elBtnClearConsole.addEventListener('click', () => {
    if (elConsoleLog) elConsoleLog.innerHTML = '';
});
if (elBtnCloseModal) elBtnCloseModal.addEventListener('click', () => {
    playSound('click');
    if (elGameOverModal) elGameOverModal.classList.remove('active');
});
const elBtnPlayAgainModal = document.getElementById('btn-play-again-modal');
if (elBtnPlayAgainModal) elBtnPlayAgainModal.addEventListener('click', resetGame);

if (elBtnSettings) elBtnSettings.addEventListener('click', openSettingsModal);
if (elBtnCloseSettings) elBtnCloseSettings.addEventListener('click', closeSettingsModal);
if (elBtnApplySettings) elBtnApplySettings.addEventListener('click', () => {
    // Read all toggle states before closing so startGame() picks them up
    if (elShowEvalBar) showEvalBar = elShowEvalBar.checked;
    if (elShowBestMove) showBestMove = elShowBestMove.checked;
    closeSettingsModal();
    startGame();
});

if (elBtnFlipBoard) elBtnFlipBoard.addEventListener('click', toggleBoardFlip);

// Welcome Modal Listeners
function closeWelcomeModal() {
    playSound('click');
    if (elWelcomeModal) elWelcomeModal.classList.remove('active');
}

if (elBtnCloseWelcome) elBtnCloseWelcome.addEventListener('click', closeWelcomeModal);
if (elBtnWelcomeOk) elBtnWelcomeOk.addEventListener('click', closeWelcomeModal);
if (elWelcomeModal) {
    elWelcomeModal.addEventListener('click', (e) => {
        if (e.target === elWelcomeModal) closeWelcomeModal();
    });
}

// Global Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
    
    if (e.key === 'ArrowLeft') {
        if (moveHistory.length > 0) {
            e.preventDefault();
            const maxIdx = moveHistory.length;
            const currentIdx = (historyViewIndex < 0 || historyViewIndex > maxIdx) ? maxIdx : historyViewIndex;
            if (currentIdx > 0) {
                jumpToHistoryIndex(currentIdx - 1);
            }
        }
    } else if (e.key === 'ArrowRight') {
        if (isViewingHistory()) {
            e.preventDefault();
            jumpToHistoryIndex(historyViewIndex + 1);
        }
    } else if (e.key === 'Escape') {
        if (elWelcomeModal && elWelcomeModal.classList.contains('active')) {
            closeWelcomeModal();
        } else if (elSettingsModal && elSettingsModal.classList.contains('active')) {
            closeSettingsModal();
        } else if (elGameOverModal && elGameOverModal.classList.contains('active')) {
            elGameOverModal.classList.remove('active');
        }
    } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleBoardFlip();
    } else if (e.key === 'z' || e.key === 'Z') {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (elBtnUndo && !elBtnUndo.disabled) elBtnUndo.click();
        }
    } else if (e.key === ' ') {
        e.preventDefault();
        if (!isAiThinking) triggerAiMove();
    } else if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        startGame();
    }
});

// Window Resize Handling for Overlay Alignment
window.addEventListener('resize', () => {
    syncOverlaySize();
    if (showBestMove && currentFen) {
        requestBestMove();
    }
});

// Boot app
startGame();
