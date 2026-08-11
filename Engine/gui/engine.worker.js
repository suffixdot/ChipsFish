/**
 * engine.worker.js
 * Full JavaScript port of the Damath Engine (C++ → JS).
 * Runs in a Web Worker so AI search never blocks the UI thread.
 *
 * Message-based API — parent posts:
 *   { id, type: 'initialize', variant }
 *   { id, type: 'moves',      fen }
 *   { id, type: 'move',       fen, move, mid_move_promotion }
 *   { id, type: 'ai_move',    fen, depth, time_ms, mid_move_promotion }
 *   { id, type: 'best_move',  fen, depth, mid_move_promotion }
 *
 * Worker responds with:
 *   { id, result: <object> }  or  { id, error: <string> }
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// FRACTION  (exact rational arithmetic using BigInt)
// ─────────────────────────────────────────────────────────────────────────────

function gcd(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b !== 0n) { const t = b; b = a % b; a = t; }
    return a;
}

class Fraction {
    constructor(num = 0n, den = 1n) {
        if (typeof num === 'number') num = BigInt(Math.trunc(num));
        if (typeof den === 'number') den = BigInt(Math.trunc(den));
        if (den === 0n) throw new Error('Denominator cannot be zero');
        const g = gcd(num < 0n ? -num : num, den < 0n ? -den : den);
        this.num = num / g;
        this.den = den / g;
        if (this.den < 0n) { this.num = -this.num; this.den = -this.den; }
    }

    static ZERO = new Fraction(0n, 1n);
    static INF  = new Fraction(9999999n, 1n);
    static NEG_INF = new Fraction(-9999999n, 1n);

    add(o)  { return new Fraction(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o)  { return new Fraction(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o)  { return new Fraction(this.num * o.num, this.den * o.den); }
    div(o)  {
        if (o.num === 0n) return Fraction.ZERO;
        return new Fraction(this.num * o.den, this.den * o.num);
    }
    neg()   { return new Fraction(-this.num, this.den); }

    eq(o)   { return this.num === o.num && this.den === o.den; }
    lt(o)   { return this.num * o.den < o.num * this.den; }
    gt(o)   { return o.lt(this); }
    lte(o)  { return !this.gt(o); }
    gte(o)  { return !this.lt(o); }

    toFloat() { return Number(this.num) / Number(this.den); }

    toString() {
        if (this.den === 1n) return this.num.toString();
        return `${this.num}/${this.den}`;
    }

    static parse(s) {
        if (!s) return Fraction.ZERO;
        s = String(s).trim();
        if (!s) return Fraction.ZERO;
        const slash = s.indexOf('/');
        try {
            if (slash === -1) return new Fraction(BigInt(s));
            return new Fraction(BigInt(s.slice(0, slash)), BigInt(s.slice(slash + 1)));
        } catch (_) {
            return Fraction.ZERO;
        }
    }

    mulInt(n) { return new Fraction(this.num * BigInt(n), this.den); }
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

const Color = { NONE: 0, RED: 1, BLUE: 2 };
const OpType = { NONE: 0, ADD: 1, SUB: 2, MUL: 3, DIV: 4 };

function makeSquare(col, row) { return row * 8 + col; }
function sqCol(sq)  { return sq % 8; }
function sqRow(sq)  { return (sq / 8) | 0; }
function sqOk(sq)   { return sq >= 0 && sq < 64; }
function sqPlayable(sq) { return sqOk(sq) && (sqRow(sq) + sqCol(sq)) % 2 === 1; }
function flipColor(c) {
    if (c === Color.RED) return Color.BLUE;
    if (c === Color.BLUE) return Color.RED;
    return Color.NONE;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPERATOR TABLE  (same 4-template pattern as Board.cpp)
// ─────────────────────────────────────────────────────────────────────────────

const OPERATORS = new Array(64).fill(OpType.NONE);
(function initOperators() {
    // rows 0,4: [+, −, ÷, ×]   rows 1,5: [−, +, ×, ÷]
    // rows 2,6: [÷, ×, +, −]   rows 3,7: [×, ÷, −, +]
    const T = [
        [OpType.ADD, OpType.SUB, OpType.DIV, OpType.MUL],
        [OpType.SUB, OpType.ADD, OpType.MUL, OpType.DIV],
        [OpType.DIV, OpType.MUL, OpType.ADD, OpType.SUB],
        [OpType.MUL, OpType.DIV, OpType.SUB, OpType.ADD],
    ];
    for (let r = 0; r < 8; r++) {
        let j = 0;
        for (let c = 0; c < 8; c++) {
            const sq = makeSquare(c, r);
            if (sqPlayable(sq)) { OPERATORS[sq] = T[r % 4][j++]; }
        }
    }
})();

// ─────────────────────────────────────────────────────────────────────────────
// VARIANT STARTING POSITIONS  (mirrors gui_server.py VARIANT_VALUES + build_variant_fen)
// ─────────────────────────────────────────────────────────────────────────────

const VARIANT_VALUES = {
    integer:    ['-11','8','-5','2','0','-3','10','-7','-9','6','-1','4'],
    rational:   ['-11/10','8/10','-5/10','2/10','0','-3/10','10/10','-7/10','-9/10','6/10','-1/10','4/10'],
    radical:    ['-121','-81','100','144','-49','-25','36','64','-9','-1','4','16'],
    counting:   ['11','8','5','2','12','3','10','7','9','6','1','4'],
    whole:      ['11','8','5','2','0','3','10','7','9','6','1','4'],
    fraction:   ['11/10','8/10','5/10','2/10','12/10','3/10','10/10','7/10','9/10','6/10','1/10','4/10'],
    polynomial: ['-3','-1','6','10','-55','-45','66','78','-21','-15','28','36'],
    thermo:     ['37','23','13','5','2','7','31','19','29','17','3','11'],
};

function buildVariantFen(variant = 'rational') {
    const vals = VARIANT_VALUES[variant] || VARIANT_VALUES.rational;
    const [a, b, c, d, e, f, g, h, i, j, k, l] = vals;
    const row7 = `b(${d})1b(${c})1b(${b})1b(${a})`;
    const row6 = `1b(${h})1b(${g})1b(${f})1b(${e})1`;
    const row5 = `b(${l})1b(${k})1b(${j})1b(${i})`;
    const row4 = '8';
    const row3 = '8';
    const row2 = `1r(${i})1r(${j})1r(${k})1r(${l})1`;
    const row1 = `r(${e})1r(${f})1r(${g})1r(${h})1`;
    const row0 = `1r(${a})1r(${b})1r(${c})1r(${d})1`;
    return `${row7}/${row6}/${row5}/${row4}/${row3}/${row2}/${row1}/${row0} r 0 0`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PIECE
// ─────────────────────────────────────────────────────────────────────────────

function makePiece(color, value, isKing) {
    return { color, value, isKing };
}
const EMPTY_PIECE = makePiece(Color.NONE, Fraction.ZERO, false);

// ─────────────────────────────────────────────────────────────────────────────
// BOARD
// ─────────────────────────────────────────────────────────────────────────────

class Board {
    constructor() {
        this.board     = new Array(64).fill(null).map(() => ({ ...EMPTY_PIECE, value: Fraction.ZERO }));
        this.sideToMove = Color.RED;
        this.redScore   = Fraction.ZERO;
        this.blueScore  = Fraction.ZERO;
        this.history    = [];   // array of { sideToMove, redScore, blueScore }
        this.moveHistory = [];  // array of Move objects
        this.midMovePromotion = false;
        this.variant    = 'rational';
        this.thermoScores = {
            red: { g: 0, degC: 0, gDegC: 0 },
            blue: { g: 0, degC: 0, gDegC: 0 }
        };
    }

    getPiece(sq) { return this.board[sq]; }
    setPiece(sq, p) { this.board[sq] = p; }

    clear() {
        this.board = new Array(64).fill(null).map(() => ({ color: Color.NONE, value: Fraction.ZERO, isKing: false }));
        this.sideToMove = Color.RED;
        this.redScore = Fraction.ZERO;
        this.blueScore = Fraction.ZERO;
        this.history = [];
        this.moveHistory = [];
    }

    loadPosition(fen) {
        this.clear();
        const fields = splitFenFields(fen);
        if (!fields.length) return;

        // Parse board layout
        const rows = splitFenRows(fields[0]);
        for (let rIdx = 0; rIdx < rows.length; rIdx++) {
            const r = 7 - rIdx;
            if (r < 0) break;
            let c = 0;
            let i = 0;
            const row = rows[rIdx];
            while (i < row.length) {
                const ch = row[i];
                if (ch >= '1' && ch <= '8') { c += parseInt(ch); i++; }
                else if (ch === 'r' || ch === 'R' || ch === 'b' || ch === 'B') {
                    const color = (ch === 'r' || ch === 'R') ? Color.RED : Color.BLUE;
                    const isKing = (ch === 'R' || ch === 'B');
                    i++;
                    let val = Fraction.ZERO;
                    if (i < row.length && row[i] === '(') {
                        const closeIdx = row.indexOf(')', i);
                        if (closeIdx !== -1) {
                            val = Fraction.parse(row.slice(i + 1, closeIdx));
                            i = closeIdx + 1;
                        }
                    }
                    this.board[makeSquare(c, r)] = { color, value: val, isKing };
                    c++;
                } else { i++; }
            }
        }

        if (fields.length > 1) this.sideToMove = (fields[1] === 'b' || fields[1] === 'B') ? Color.BLUE : Color.RED;
        if (fields.length > 2) this.redScore  = Fraction.parse(fields[2]);
        if (fields.length > 3) this.blueScore = Fraction.parse(fields[3]);
    }

    getFen() {
        let out = '';
        for (let r = 7; r >= 0; r--) {
            let empty = 0;
            for (let c = 0; c < 8; c++) {
                const p = this.board[makeSquare(c, r)];
                if (p.color === Color.NONE) { empty++; }
                else {
                    if (empty > 0) { out += empty; empty = 0; }
                    let ch = (p.color === Color.RED) ? 'r' : 'b';
                    if (p.isKing) ch = ch.toUpperCase();
                    out += `${ch}(${p.value.toString()})`;
                }
            }
            if (empty > 0) out += empty;
            if (r > 0) out += '/';
        }
        out += ` ${this.sideToMove === Color.RED ? 'r' : 'b'}`;
        out += ` ${this.redScore.toString()}`;
        out += ` ${this.blueScore.toString()}`;
        return out;
    }

    makeMove(m) {
        // Record position key BEFORE the move for repetition detection
        this.history.push({
            sideToMove: this.sideToMove,
            redScore: this.redScore,
            blueScore: this.blueScore,
            posKey: this.getFen(),
            thermoScores: JSON.parse(JSON.stringify(this.thermoScores))
        });
        this.moveHistory.push(m);

        let p = { ...this.board[m.from], value: this.board[m.from].value };
        this.board[m.from] = { color: Color.NONE, value: Fraction.ZERO, isKing: false };

        // Remove captured pieces
        for (let i = 0; i < m.capturedSquares.length; i++) {
            this.board[m.capturedSquares[i]] = { color: Color.NONE, value: Fraction.ZERO, isKing: false };
        }

        const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
        if (m.promoted) p = { ...p, isKing: true };
        this.board[dest] = p;

        if (this.sideToMove === Color.RED) {
            this.redScore = this.redScore.add(m.scoreChange);
            if (m.isCapture && this.variant === 'thermo' && m.stepDetails) {
                for (const detail of m.stepDetails) {
                    if (detail.unit === 'g') this.thermoScores.red.g += detail.scoreNum;
                    else if (detail.unit === 'degC') this.thermoScores.red.degC += detail.scoreNum;
                    else if (detail.unit === 'g_degC') this.thermoScores.red.gDegC += detail.scoreNum;
                }
            }
        } else {
            this.blueScore = this.blueScore.add(m.scoreChange);
            if (m.isCapture && this.variant === 'thermo' && m.stepDetails) {
                for (const detail of m.stepDetails) {
                    if (detail.unit === 'g') this.thermoScores.blue.g += detail.scoreNum;
                    else if (detail.unit === 'degC') this.thermoScores.blue.degC += detail.scoreNum;
                    else if (detail.unit === 'g_degC') this.thermoScores.blue.gDegC += detail.scoreNum;
                }
            }
        }
        this.sideToMove = flipColor(this.sideToMove);
    }

    undoMove() {
        if (this.history.length === 0) return;
        const m = this.moveHistory.pop();
        const prev = this.history.pop();

        const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
        let p = { ...this.board[dest], value: this.board[dest].value };
        this.board[dest] = { color: Color.NONE, value: Fraction.ZERO, isKing: false };

        if (m.promoted) p = { ...p, isKing: false };
        this.board[m.from] = p;

        for (let i = 0; i < m.capturedSquares.length; i++) {
            this.board[m.capturedSquares[i]] = m.capturedPieces[i];
        }

        this.sideToMove = prev.sideToMove;
        this.redScore   = prev.redScore;
        this.blueScore  = prev.blueScore;
        if (prev.thermoScores) {
            this.thermoScores = prev.thermoScores;
        }
    }

    isDrawByRepetition() {
        // Use position hashes stored in history to detect 3-fold repetition.
        // We record the FEN string as the position key in history.
        const currentKey = this.getFen();
        let count = 1;
        for (let i = this.history.length - 1; i >= 0; i--) {
            if (this.moveHistory[i] && this.moveHistory[i].isCapture) break;
            if (this.history[i].posKey === currentKey) count++;
            if (count >= 3) return true;
        }
        return false;
    }

    isDrawByNoCaptureLimit() {
        let plies = 0;
        for (let i = this.moveHistory.length - 1; i >= 0; i--) {
            if (this.moveHistory[i].isCapture) break;
            plies++;
        }
        return plies >= 40;
    }

    isDrawByOnePieceRepetition() {
        let redCount = 0, blueCount = 0;
        for (let sq = 0; sq < 64; sq++) {
            const p = this.board[sq];
            if (p.color === Color.RED) redCount++;
            else if (p.color === Color.BLUE) blueCount++;
        }
        if (redCount === 1) {
            if (checkOnePieceRepetition(Color.RED, this.moveHistory, this.history)) return true;
        }
        if (blueCount === 1) {
            if (checkOnePieceRepetition(Color.BLUE, this.moveHistory, this.history)) return true;
        }
        return false;
    }

    isGameOver() {
        let redCount = 0, blueCount = 0;
        for (let sq = 0; sq < 64; sq++) {
            const p = this.board[sq];
            if (p.color === Color.RED) redCount++;
            else if (p.color === Color.BLUE) blueCount++;
        }
        if (redCount === 0 || blueCount === 0) return true;
        if (this.isDrawByNoCaptureLimit()) return true;
        if (this.isDrawByOnePieceRepetition()) return true;
        if (this.isDrawByRepetition()) return true;
        const moves = generateLegalMoves(this, this.midMovePromotion);
        return moves.length === 0;
    }

    getFinalScores(variant = this.variant) {
        if (variant === 'thermo') {
            let redG = this.thermoScores.red.g;
            let redDegC = this.thermoScores.red.degC;
            let redGDegC = this.thermoScores.red.gDegC;

            let blueG = this.thermoScores.blue.g;
            let blueDegC = this.thermoScores.blue.degC;
            let blueGDegC = this.thermoScores.blue.gDegC;

            for (let sq = 0; sq < 64; sq++) {
                const p = this.board[sq];
                if (p.color === Color.RED) {
                    const u = getThermoUnit(p.value);
                    const val = Number(p.value.num < 0n ? -p.value.num : p.value.num);
                    const mult = p.isKing ? 2 : 1;
                    if (u === 'g') redG += val * mult;
                    else if (u === 'degC') redDegC += val * mult;
                } else if (p.color === Color.BLUE) {
                    const u = getThermoUnit(p.value);
                    const val = Number(p.value.num < 0n ? -p.value.num : p.value.num);
                    const mult = p.isKing ? 2 : 1;
                    if (u === 'g') blueG += val * mult;
                    else if (u === 'degC') blueDegC += val * mult;
                }
            }

            const finalRed = BigInt((redG * redDegC) + redGDegC);
            const finalBlue = BigInt((blueG * blueDegC) + blueGDegC);
            return { red: new Fraction(finalRed), blue: new Fraction(finalBlue) };
        }

        let red = this.redScore, blue = this.blueScore;
        for (let sq = 0; sq < 64; sq++) {
            const p = this.board[sq];
            if (p.color === Color.RED) {
                const val = p.isKing ? p.value.mul(new Fraction(2, 1)) : p.value;
                red = red.add(val);
            }
            if (p.color === Color.BLUE) {
                const val = p.isKing ? p.value.mul(new Fraction(2, 1)) : p.value;
                blue = blue.add(val);
            }
        }
        return { red, blue };
    }

    countPieces() {
        let red = 0, blue = 0;
        for (let sq = 0; sq < 64; sq++) {
            const p = this.board[sq];
            if (p.color === Color.RED) red++;
            else if (p.color === Color.BLUE) blue++;
        }
        return { red, blue };
    }
}

function splitFenFields(fen) {
    // Split by spaces but not inside parentheses
    const fields = [];
    let cur = '', depth = 0;
    for (let i = 0; i < fen.length; i++) {
        const ch = fen[i];
        if (ch === '(') { depth++; cur += ch; }
        else if (ch === ')') { depth--; cur += ch; }
        else if (ch === ' ' && depth === 0) { fields.push(cur); cur = ''; }
        else { cur += ch; }
    }
    if (cur) fields.push(cur);
    return fields;
}

function splitFenRows(boardPart) {
    const rows = [];
    let cur = '', depth = 0;
    for (let i = 0; i < boardPart.length; i++) {
        const ch = boardPart[i];
        if (ch === '(') { depth++; cur += ch; }
        else if (ch === ')') { depth--; cur += ch; }
        else if (ch === '/' && depth === 0) { rows.push(cur); cur = ''; }
        else { cur += ch; }
    }
    rows.push(cur);
    return rows;
}

function checkOnePieceRepetition(color, moveHistory, history) {
    let lastCapIdx = -1;
    for (let i = moveHistory.length - 1; i >= 0; i--) {
        if (moveHistory[i].isCapture) { lastCapIdx = i; break; }
    }
    const playerMoves = [];
    for (let i = lastCapIdx + 1; i < moveHistory.length; i++) {
        if (history[i] && history[i].sideToMove === color) {
            playerMoves.push(moveHistory[i]);
        }
    }
    const n = playerMoves.length;
    if (n < 5) return false;
    for (let k = 1; k <= Math.floor(n / 5); k++) {
        let match = true;
        for (let i = 0; i < 5 * k; i++) {
            if (!movesEqual(playerMoves[n - 5 * k + i], playerMoves[n - 5 * k + (i % k)])) {
                match = false; break;
            }
        }
        if (match) return true;
    }
    return false;
}

function movesEqual(a, b) {
    if (a.from !== b.from) return false;
    if (a.steps.length !== b.steps.length) return false;
    for (let i = 0; i < a.steps.length; i++) if (a.steps[i] !== b.steps[i]) return false;
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

const THERMO_MASS_CHIPS = new Set([37, 13, 7, 19, 29, 3]);
const THERMO_TEMP_CHIPS = new Set([23, 5, 2, 31, 17, 11]);

function getThermoUnit(valFraction) {
    if (!valFraction) return 'g';
    const num = Number(valFraction.num < 0n ? -valFraction.num : valFraction.num);
    if (THERMO_MASS_CHIPS.has(num)) return 'g';
    if (THERMO_TEMP_CHIPS.has(num)) return 'degC';
    return 'g';
}

function calcScoreThermoDetail(taker, taken, op) {
    const u1 = getThermoUnit(taker.value);
    const u2 = getThermoUnit(taken.value);
    const v1 = Number(taker.value.num < 0n ? -taker.value.num : taker.value.num);
    const v2 = Number(taken.value.num < 0n ? -taken.value.num : taken.value.num);
    let baseVal = 0;
    let unit = null;

    if (op === OpType.ADD) {
        if (u1 === u2) { baseVal = v1 + v2; unit = u1; }
    } else if (op === OpType.SUB) {
        if (u1 === u2 && (v1 - v2) > 0) { baseVal = v1 - v2; unit = u1; }
    } else if (op === OpType.MUL) {
        if (u1 !== u2) { baseVal = v1 * v2; unit = 'g_degC'; }
    }

    if (baseVal <= 0) return { score: Fraction.ZERO, unit: null, scoreNum: 0 };

    let mult = 1;
    if (taker.isKing) mult *= 2;
    if (taken.isKing) mult *= 2;

    const totalScore = baseVal * mult;
    return { score: new Fraction(BigInt(totalScore)), unit, scoreNum: totalScore };
}

function calcScore(taker, taken, op, variant = 'rational') {
    if (variant === 'thermo') {
        return calcScoreThermoDetail(taker, taken, op).score;
    }

    let base;
    if (op === OpType.ADD) base = taker.value.add(taken.value);
    else if (op === OpType.SUB) base = taker.value.sub(taken.value);
    else if (op === OpType.MUL) base = taker.value.mul(taken.value);
    else if (op === OpType.DIV) base = taken.value.num === 0n ? Fraction.ZERO : taker.value.div(taken.value);
    else base = Fraction.ZERO;

    let mult = 1;
    if (taker.isKing) mult *= 2;
    if (taken.isKing) mult *= 2;
    return base.mulInt(mult);
}

function getCapturesRec(curSq, piece, currentMove, allCaptures, board, us, midMoveProm) {
    const col = sqCol(curSq), row = sqRow(curSq);
    const savedPiece = board.getPiece(curSq);
    board.setPiece(curSq, { color: Color.NONE, value: Fraction.ZERO, isKing: false });

    let hasNext = false;

    if (!piece.isKing) {
        const dc = [-1, -1, 1, 1];
        const dr = [-1, 1, -1, 1];
        for (let i = 0; i < 4; i++) {
            const adjCol = col + dc[i], adjRow = row + dr[i];
            const landCol = col + 2 * dc[i], landRow = row + 2 * dr[i];
            if (adjCol >= 0 && adjCol < 8 && adjRow >= 0 && adjRow < 8 &&
                landCol >= 0 && landCol < 8 && landRow >= 0 && landRow < 8) {
                const adjSq  = makeSquare(adjCol, adjRow);
                const landSq = makeSquare(landCol, landRow);
                const taken  = board.getPiece(adjSq);
                const landP  = board.getPiece(landSq);
                if (taken.color === flipColor(us) && landP.color === Color.NONE) {
                    hasNext = true;
                    board.setPiece(adjSq, { color: Color.NONE, value: Fraction.ZERO, isKing: false });
                    const promotedThisStep = (us === Color.RED && landRow === 7) || (us === Color.BLUE && landRow === 0);
                    const nextPiece = promotedThisStep ? { ...piece, isKing: true } : piece;
                    const stepDetail = (board.variant === 'thermo') ? calcScoreThermoDetail(nextPiece, taken, OPERATORS[landSq]) : null;
                    const stepScore = stepDetail ? stepDetail.score : calcScore(nextPiece, taken, OPERATORS[landSq], board.variant);
                    const nextMove = {
                        from: currentMove.from,
                        steps: [...currentMove.steps, landSq],
                        capturedSquares: [...currentMove.capturedSquares, adjSq],
                        capturedPieces:  [...currentMove.capturedPieces, taken],
                        stepScores: [...currentMove.stepScores, stepScore],
                        stepDetails: stepDetail ? [...(currentMove.stepDetails || []), stepDetail] : [],
                        scoreChange: currentMove.scoreChange.add(stepScore),
                        promoted: currentMove.promoted || promotedThisStep,
                        isCapture: true,
                    };
                    if (promotedThisStep && !midMoveProm) {
                        allCaptures.push(nextMove);
                    } else {
                        getCapturesRec(landSq, nextPiece, nextMove, allCaptures, board, us, midMoveProm);
                    }
                    board.setPiece(adjSq, taken);
                }
            }
        }
    } else {
        // King captures
        const dc = [-1, -1, 1, 1];
        const dr = [-1, 1, -1, 1];
        for (let i = 0; i < 4; i++) {
            for (let step = 1; step < 8; step++) {
                const adjCol = col + step * dc[i], adjRow = row + step * dr[i];
                if (adjCol < 0 || adjCol >= 8 || adjRow < 0 || adjRow >= 8) break;
                const adjSq = makeSquare(adjCol, adjRow);
                const taken = board.getPiece(adjSq);
                if (taken.color === us) break;
                if (taken.color === flipColor(us)) {
                    for (let landStep = step + 1; landStep < 8; landStep++) {
                        const landCol = col + landStep * dc[i], landRow = row + landStep * dr[i];
                        if (landCol < 0 || landCol >= 8 || landRow < 0 || landRow >= 8) break;
                        const landSq = makeSquare(landCol, landRow);
                        const landP = board.getPiece(landSq);
                        if (landP.color !== Color.NONE) break;
                        hasNext = true;
                        board.setPiece(adjSq, { color: Color.NONE, value: Fraction.ZERO, isKing: false });
                        const stepDetail = (board.variant === 'thermo') ? calcScoreThermoDetail(piece, taken, OPERATORS[landSq]) : null;
                        const stepScore = stepDetail ? stepDetail.score : calcScore(piece, taken, OPERATORS[landSq], board.variant);
                        const nextMove = {
                            from: currentMove.from,
                            steps: [...currentMove.steps, landSq],
                            capturedSquares: [...currentMove.capturedSquares, adjSq],
                            capturedPieces:  [...currentMove.capturedPieces, taken],
                            stepScores: [...currentMove.stepScores, stepScore],
                            stepDetails: stepDetail ? [...(currentMove.stepDetails || []), stepDetail] : [],
                            scoreChange: currentMove.scoreChange.add(stepScore),
                            promoted: currentMove.promoted,
                            isCapture: true,
                        };
                        getCapturesRec(landSq, piece, nextMove, allCaptures, board, us, midMoveProm);
                        board.setPiece(adjSq, taken);
                    }
                    break;
                }
            }
        }
    }

    board.setPiece(curSq, savedPiece);
    if (!hasNext && currentMove.isCapture) allCaptures.push(currentMove);
}

function generateLegalMoves(board, midMoveProm) {
    const us = board.sideToMove;
    const allCaptures = [];

    for (let sq = 0; sq < 64; sq++) {
        const p = board.getPiece(sq);
        if (p.color === us) {
            const seed = { from: sq, steps: [], capturedSquares: [], capturedPieces: [], stepScores: [], scoreChange: Fraction.ZERO, promoted: false, isCapture: false };
            getCapturesRec(sq, p, seed, allCaptures, board, us, midMoveProm);
        }
    }

    if (allCaptures.length > 0) {
        // King must capture rule
        let kingCanCapture = false;
        for (const m of allCaptures) if (board.getPiece(m.from).isKing) { kingCanCapture = true; break; }
        let filtered = kingCanCapture ? allCaptures.filter(m => board.getPiece(m.from).isKing) : allCaptures;

        // Max captures rule
        let maxCaps = 0;
        for (const m of filtered) maxCaps = Math.max(maxCaps, m.capturedSquares.length);
        return filtered.filter(m => m.capturedSquares.length === maxCaps);
    }

    // Normal moves
    const normalMoves = [];
    for (let sq = 0; sq < 64; sq++) {
        const p = board.getPiece(sq);
        if (p.color !== us) continue;
        const col = sqCol(sq), row = sqRow(sq);
        if (!p.isKing) {
            const dr = (us === Color.RED) ? 1 : -1;
            for (const dc of [-1, 1]) {
                const dc2 = col + dc, dr2 = row + dr;
                if (dc2 >= 0 && dc2 < 8 && dr2 >= 0 && dr2 < 8) {
                    const dest = makeSquare(dc2, dr2);
                    if (board.getPiece(dest).color === Color.NONE) {
                        const promoted = (us === Color.RED && dr2 === 7) || (us === Color.BLUE && dr2 === 0);
                        normalMoves.push({ from: sq, steps: [dest], capturedSquares: [], capturedPieces: [], stepScores: [], scoreChange: Fraction.ZERO, promoted, isCapture: false });
                    }
                }
            }
        } else {
            const dcs = [-1, -1, 1, 1], drs = [-1, 1, -1, 1];
            for (let i = 0; i < 4; i++) {
                for (let step = 1; step < 8; step++) {
                    const dc2 = col + step * dcs[i], dr2 = row + step * drs[i];
                    if (dc2 < 0 || dc2 >= 8 || dr2 < 0 || dr2 >= 8) break;
                    const dest = makeSquare(dc2, dr2);
                    if (board.getPiece(dest).color !== Color.NONE) break;
                    normalMoves.push({ from: sq, steps: [dest], capturedSquares: [], capturedPieces: [], stepScores: [], scoreChange: Fraction.ZERO, promoted: false, isCapture: false });
                }
            }
        }
    }
    return normalMoves;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATE
// ─────────────────────────────────────────────────────────────────────────────

const KING_BONUS         = new Fraction(2n, 1n);
const ADVANCE_STEP       = new Fraction(1n, 10n);
const CENTER_BONUS       = new Fraction(1n, 20n);
const OPERATOR_BONUS     = new Fraction(1n, 15n);

// Aggressive personality weights
const AGGRESSIVE_KING_BONUS      = new Fraction(3n, 1n);
const AGGRESSIVE_ADVANCE_STEP    = new Fraction(1n, 5n);
const AGGRESSIVE_CENTER_BONUS    = new Fraction(1n, 10n);
const AGGRESSIVE_OPERATOR_BONUS  = new Fraction(1n, 8n);
const AGGRESSIVE_CAPTURE_BONUS   = new Fraction(1n, 2n);

function evaluateBoard(board, personality = 'passive') {
    let redEval  = Fraction.ZERO;
    let blueEval = Fraction.ZERO;
    
    // Select weights based on personality
    const isAggressive = personality === 'aggressive';
    const kingBonus = isAggressive ? AGGRESSIVE_KING_BONUS : KING_BONUS;
    const advanceStep = isAggressive ? AGGRESSIVE_ADVANCE_STEP : ADVANCE_STEP;
    const centerBonus = isAggressive ? AGGRESSIVE_CENTER_BONUS : CENTER_BONUS;
    const operatorBonus = isAggressive ? AGGRESSIVE_OPERATOR_BONUS : OPERATOR_BONUS;
    const captureBonus = isAggressive ? AGGRESSIVE_CAPTURE_BONUS : Fraction.ZERO;

    for (let sq = 0; sq < 64; sq++) {
        const p = board.getPiece(sq);
        if (p.color === Color.RED) {
            redEval = redEval.add(p.value);
            if (p.isKing) { redEval = redEval.add(kingBonus); }
            else { redEval = redEval.add(advanceStep.mul(new Fraction(BigInt(sqRow(sq))))); }
            if (sqCol(sq) >= 2 && sqCol(sq) <= 5) redEval = redEval.add(centerBonus);
            const op = OPERATORS[sq];
            if (op === OpType.MUL || op === OpType.DIV) redEval = redEval.add(operatorBonus);
        } else if (p.color === Color.BLUE) {
            blueEval = blueEval.add(p.value);
            if (p.isKing) { blueEval = blueEval.add(kingBonus); }
            else { blueEval = blueEval.add(advanceStep.mul(new Fraction(BigInt(7 - sqRow(sq))))); }
            if (sqCol(sq) >= 2 && sqCol(sq) <= 5) blueEval = blueEval.add(centerBonus);
            const op = OPERATORS[sq];
            if (op === OpType.MUL || op === OpType.DIV) blueEval = blueEval.add(operatorBonus);
        }
    }
    redEval  = redEval.add(board.redScore);
    blueEval = blueEval.add(board.blueScore);
    if (board.sideToMove === Color.RED) return redEval.sub(blueEval);
    return blueEval.sub(redEval);
}

function getTerminalScore(board, depthFromRoot = 0) {
    if (board.isDrawByRepetition() || board.isDrawByOnePieceRepetition() || board.isDrawByNoCaptureLimit()) {
        return Fraction.ZERO;
    }
    const { red, blue } = board.getFinalScores();
    const myScore = board.sideToMove === Color.RED ? red : blue;
    const oppScore = board.sideToMove === Color.RED ? blue : red;

    if (myScore.gt(oppScore)) {
        return new Fraction(1000000 - depthFromRoot, 1);
    } else if (myScore.lt(oppScore)) {
        return new Fraction(-1000000 + depthFromRoot, 1);
    } else {
        return Fraction.ZERO;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH  (Negamax + Alpha-Beta + Quiescence + Killer Moves + TT + IDS)
// ─────────────────────────────────────────────────────────────────────────────

const MAX_DEPTH = 64;
const TT_SIZE   = 1 << 20;  // ~1M entries

class TranspositionTable {
    constructor() { this.table = new Map(); }
    probe(key) { return this.table.get(key); }
    store(key, depth, flag, score, fromSq, toSq) {
        const existing = this.table.get(key);
        if (existing && existing.depth > depth) return;
        this.table.set(key, { depth, flag, score, fromSq, toSq });
    }
    clear() { this.table.clear(); }
}

const TT_EXACT = 0, TT_LOWERBOUND = 1, TT_UPPERBOUND = 2;

// Simple Zobrist-like hash using board FEN strings as keys (accurate but slower)
// For speed we use a rolling hash approach
function boardKey(board) {
    // Use the FEN as the key — accurate, avoids implementing Zobrist in JS
    return board.getFen();
}

let searchStartTime = 0;
let searchTimeLimit = 0;
let searchTimeout   = false;
let searchNodes     = 0;
const killerMoves   = Array.from({ length: MAX_DEPTH }, () => [null, null]);
// History heuristic table [from][to]: incremented by depth^2 on beta cutoffs
const historyTable  = Array.from({ length: 64 }, () => new Int32Array(64));

function scoreMoveForSort(m, board, ttFromSq, ttToSq, depthFromRoot) {
    const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
    if (m.from === ttFromSq && dest === ttToSq) return 1000000;
    if (m.isCapture) {
        return 10000 + Math.round(m.scoreChange.toFloat() * 100);
    }
    if (depthFromRoot < MAX_DEPTH) {
        const k = killerMoves[depthFromRoot];
        if (k[0] && movesEqual(m, k[0])) return 9000;
        if (k[1] && movesEqual(m, k[1])) return 8000;
    }
    let score = Math.min(historyTable[m.from][dest], 7000);
    if (m.promoted) score += 500;
    const toRow = sqRow(dest);
    score += Math.abs(toRow - sqRow(m.from)) * 10;
    return score;
}

function quiescence(board, alpha, beta, midMoveProm, depthFromRoot = 0, personality = 'passive') {
    if (searchTimeout) return Fraction.ZERO;
    searchNodes++;
    if (searchTimeLimit > 0 && searchNodes % 512 === 0) {
        if (Date.now() - searchStartTime >= searchTimeLimit) {
            searchTimeout = true;
            return Fraction.ZERO;
        }
    }

    const moves = generateLegalMoves(board, midMoveProm);
    if (moves.length === 0) return getTerminalScore(board, depthFromRoot);
    if (!moves[0].isCapture) return evaluateBoard(board, personality);

    moves.sort((a, b) => b.scoreChange.toFloat() - a.scoreChange.toFloat());

    let best = Fraction.NEG_INF;
    for (const m of moves) {
        board.makeMove(m);
        const score = quiescence(board, beta.neg(), alpha.neg(), midMoveProm, depthFromRoot + 1, personality).neg();
        board.undoMove();
        if (searchTimeout) return Fraction.ZERO;
        if (score.gt(best)) best = score;
        if (score.gt(alpha)) alpha = score;
        if (alpha.gte(beta)) break;
    }
    return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGRESSIVE PERSONALITY — Position Complexity Scoring
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scores how "tricky" the current board position is for the side to move (the opponent).
 *
 * A high score means:
 *   - The opponent has ONE narrow best response (hard to find)
 *   - All other moves are significantly worse for them (easy to blunder)
 *   - High variance in outcomes across opponent moves (complex tactical landscape)
 *
 * This drives the Aggressive personality to prefer positions where the opponent
 * must find a specific "only move" rather than safe positions where any
 * reasonable reply keeps the game roughly equal.
 *
 * Metric:
 *   vals = sorted evaluations of each opponent response (from our perspective)
 *   trapDepth = vals[1] - vals[0]   → gap between opponent's best and 2nd-best reply
 *   variance  = statistical variance → overall positional complexity
 *   score     = trapDepth × 4.0 + sqrt(variance)
 *
 * @param {Board} board        - Position AFTER we made our candidate move (opponent to move)
 * @param {boolean} midMoveProm
 * @param {string} personality
 * @returns {number} complexity score (higher = more traps for opponent)
 */
function scorePositionComplexity(board, midMoveProm, personality) {
    const oppMoves = generateLegalMoves(board, midMoveProm);
    if (oppMoves.length === 0) return 1000; // terminal — we won, maximally "complex"
    if (oppMoves.length === 1) return 300;  // forced reply — moderately tricky

    const vals = [];
    for (const m of oppMoves) {
        board.makeMove(m);
        // evaluateBoard returns position value from the CURRENT side-to-move's perspective.
        // After opponent's move it's our turn again, so positive = good for us.
        // Higher val here = opponent just made a bad move (good for us).
        const v = evaluateBoard(board, personality).toFloat();
        board.undoMove();
        vals.push(v);
    }

    // Sort ascending: vals[0] = opponent's best reply (worst outcome for us)
    //                 vals[1] = their 2nd best, etc.
    vals.sort((a, b) => a - b);

    // Trap depth: how much worse is the 2nd-best response vs the best?
    // Large gap = opponent needs the one correct move or they hand us an advantage.
    const trapDepth = vals.length > 1 ? vals[1] - vals[0] : 0;

    // Variance: how wildly different are the outcomes across all opponent moves?
    // High variance = chaotic, complex position with many tempting wrong paths.
    const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
    const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;

    // Trap depth weighted heavily (4×) because "narrow winning reply" is the
    // strongest indicator of opponent mistake potential.
    return trapDepth * 4.0 + Math.sqrt(Math.max(0, variance));
}

function negamax(board, depth, alpha, beta, tt, depthFromRoot, midMoveProm, personality = 'passive') {
    if (searchTimeout) return Fraction.ZERO;
    searchNodes++;
    if (searchTimeLimit > 0 && searchNodes % 512 === 0) {
        if (Date.now() - searchStartTime >= searchTimeLimit) {
            searchTimeout = true;
            return Fraction.ZERO;
        }
    }

    const moves = generateLegalMoves(board, midMoveProm);
    if (moves.length === 0) return getTerminalScore(board, depthFromRoot);

    const key = boardKey(board);
    let ttFromSq = -1, ttToSq = -1;
    const ttEntry = tt.probe(key);
    if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_EXACT) return ttEntry.score;
        if (ttEntry.flag === TT_LOWERBOUND && ttEntry.score.gt(alpha)) alpha = ttEntry.score;
        if (ttEntry.flag === TT_UPPERBOUND && ttEntry.score.lt(beta))  beta  = ttEntry.score;
        if (alpha.gte(beta)) return ttEntry.score;
    }
    if (ttEntry) { ttFromSq = ttEntry.fromSq; ttToSq = ttEntry.toSq; }

    if (depth <= 0) return quiescence(board, alpha, beta, midMoveProm, depthFromRoot, personality);

    const scored = moves.map(m => [scoreMoveForSort(m, board, ttFromSq, ttToSq, depthFromRoot), m]);
    scored.sort((a, b) => b[0] - a[0]);

    let flag = TT_UPPERBOUND;
    let best = Fraction.NEG_INF;
    let bestMove = null;

    for (let i = 0; i < scored.length; i++) {
        const m = scored[i][1];
        board.makeMove(m);

        let score;
        if (i === 0) {
            // First move: full window search
            score = negamax(board, depth - 1, beta.neg(), alpha.neg(), tt, depthFromRoot + 1, midMoveProm, personality).neg();
        } else {
            // PVS: zero-window search first
            const zwBeta = alpha.add(new Fraction(1n, 100n));
            score = negamax(board, depth - 1, zwBeta.neg(), alpha.neg(), tt, depthFromRoot + 1, midMoveProm, personality).neg();
            // If it beat alpha and is within the full window, re-search with full window
            if (score.gt(alpha) && score.lt(beta)) {
                score = negamax(board, depth - 1, beta.neg(), alpha.neg(), tt, depthFromRoot + 1, midMoveProm, personality).neg();
            }
        }

        board.undoMove();
        if (searchTimeout) return Fraction.ZERO;

        if (score.gt(best)) { best = score; bestMove = m; }
        if (score.gt(alpha)) { alpha = score; flag = TT_EXACT; }
        if (alpha.gte(beta)) {
            flag = TT_LOWERBOUND;
            if (!m.isCapture) {
                const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
                historyTable[m.from][dest] += depth * depth;
                if (depthFromRoot < MAX_DEPTH) {
                    const k = killerMoves[depthFromRoot];
                    if (!k[0] || !movesEqual(m, k[0])) { k[1] = k[0]; k[0] = m; }
                }
            }
            break;
        }
    }

    if (!searchTimeout && bestMove) {
        const dest = bestMove.steps.length > 0 ? bestMove.steps[bestMove.steps.length - 1] : bestMove.from;
        tt.store(key, depth, flag, best, bestMove.from, dest);
    }
    return best;
}

function searchBestMove(board, depthLimit, timeLimitMs, midMoveProm, personality = 'passive') {
    searchStartTime = Date.now();
    searchTimeLimit = timeLimitMs;
    searchTimeout   = false;
    searchNodes     = 0;
    for (let i = 0; i < MAX_DEPTH; i++) killerMoves[i] = [null, null];
    // Reset history table for new search
    for (let f = 0; f < 64; f++) historyTable[f].fill(0);

    const tt = new TranspositionTable();
    const rootMoves = generateLegalMoves(board, midMoveProm);
    if (rootMoves.length === 0) return { bestMove: null, output: 'No legal moves.', depth: 0 };

    let bestMove = rootMoves[0];
    const outputLines = [];
    const maxDepth = depthLimit > 0 ? depthLimit : 64;

    if (timeLimitMs <= 0) {
        // Fixed depth search
        negamax(board, maxDepth, Fraction.NEG_INF, Fraction.INF, tt, 0, midMoveProm, personality);
        const ttEntry = tt.probe(boardKey(board));
        if (ttEntry) {
            for (const m of rootMoves) {
                const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
                if (m.from === ttEntry.fromSq && dest === ttEntry.toSq) { bestMove = m; break; }
            }
        }
        const elapsed = Date.now() - searchStartTime;
        outputLines.push(`info depth ${maxDepth} nodes ${searchNodes} time ${elapsed}`);
    } else {
        // Iterative deepening with Aspiration Windows
        let lastScore = Fraction.ZERO;
        for (let d = 1; d <= maxDepth; d++) {
            let alpha = Fraction.NEG_INF;
            let beta  = Fraction.INF;

            if (d >= 4) {
                // Narrow aspiration window around last iteration's score
                const delta = new Fraction(1n, 2n);
                alpha = lastScore.sub(delta);
                beta  = lastScore.add(delta);
            }

            let score = negamax(board, d, alpha, beta, tt, 0, midMoveProm);

            if (!searchTimeout && (score.lte(alpha) || score.gte(beta))) {
                // Aspiration window failed — re-search with full window
                score = negamax(board, d, Fraction.NEG_INF, Fraction.INF, tt, 0, midMoveProm);
            }

            if (searchTimeout) break;
            lastScore = score;

            const ttEntry = tt.probe(boardKey(board));
            if (ttEntry) {
                for (const m of rootMoves) {
                    const dest = m.steps.length > 0 ? m.steps[m.steps.length - 1] : m.from;
                    if (m.from === ttEntry.fromSq && dest === ttEntry.toSq) { bestMove = m; break; }
                }
            }
            const elapsed = Date.now() - searchStartTime;
            outputLines.push(`info depth ${d} nodes ${searchNodes} time ${elapsed}`);
        }
    }

    // ── Aggressive post-processing ────────────────────────────────────────────
    // After the main search finds the objective best move, the aggressive
    // personality re-evaluates all root moves to find the one that creates the
    // hardest position for the opponent — even if it scores slightly less.
    //
    // Strategy:
    //   1. Score all root moves using the now-warm Transposition Table (O(1) each)
    //   2. Filter to "near-best" candidates within AGGRO_THRESHOLD of the best score
    //   3. For each candidate, measure the complexity of the resulting position
    //      (how tricky it is for the opponent to navigate correctly)
    //   4. Pick the candidate with highest complexity score
    // ─────────────────────────────────────────────────────────────────────────
    if (personality === 'aggressive' && !searchTimeout && rootMoves.length > 1) {
        const AGGRO_THRESHOLD = 1.0;   // accept up to 1.0 pts worse for more complexity
        const MAX_CANDIDATES  = 10;    // cap candidate set to limit post-processing time

        // Score all root moves via warm TT lookup (essentially free after IDS)
        const rootScored = [];
        for (const m of rootMoves) {
            board.makeMove(m);
            const posKey = boardKey(board);
            const entry  = tt.probe(posKey);
            // TT score is from the resulting position's side-to-move perspective.
            // Negate it to get our (root side's) perspective.
            const score = entry
                ? -entry.score.toFloat()
                : -evaluateBoard(board, personality).toFloat();
            board.undoMove();
            rootScored.push({ move: m, score });
        }

        // Sort best-first and filter to the near-best candidate set
        rootScored.sort((a, b) => b.score - a.score);
        const topScore   = rootScored[0].score;
        const candidates = rootScored
            .filter(r => topScore - r.score <= AGGRO_THRESHOLD)
            .slice(0, MAX_CANDIDATES);

        // Evaluate position complexity for each candidate
        let bestComplexity = -Infinity;
        let aggressiveBest  = null;

        for (const { move } of candidates) {
            board.makeMove(move);
            const complexity = scorePositionComplexity(board, midMoveProm, personality);
            board.undoMove();
            if (complexity > bestComplexity) {
                bestComplexity = complexity;
                aggressiveBest = move;
            }
        }

        if (aggressiveBest) {
            bestMove = aggressiveBest;
            outputLines.push(
                `aggressive: complexity=${bestComplexity.toFixed(2)} ` +
                `candidates=${candidates.length} threshold=${AGGRO_THRESHOLD}`
            );
        }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const dest = bestMove.steps.length > 0 ? bestMove.steps[bestMove.steps.length - 1] : bestMove.from;
    outputLines.push(`bestmove (${sqCol(bestMove.from)},${sqRow(bestMove.from)}) -> (${sqCol(dest)},${sqRow(dest)})`);

    return { bestMove, output: outputLines.join('\n'), depth: maxDepth };
}

// ─────────────────────────────────────────────────────────────────────────────
// OPENING BOOK  (localStorage-backed, mirrors gui_server.py OpeningBook)
// ─────────────────────────────────────────────────────────────────────────────

const BOOK_KEY = 'chipsfish_opening_book';
let openingBook = null;

function loadBook() {
    try {
        const raw = self.localStorage ? self.localStorage.getItem(BOOK_KEY) : null;
        openingBook = raw ? JSON.parse(raw) : {};
    } catch (_) { openingBook = {}; }
}

function saveBook() {
    try {
        if (self.localStorage) self.localStorage.setItem(BOOK_KEY, JSON.stringify(openingBook));
    } catch (_) {}
}

function bookGet(fen, targetDepth = 1) {
    if (!openingBook) loadBook();
    const entry = openingBook[fen];
    if (entry && entry.depth >= targetDepth && entry.bestmove) return { bestmove: entry.bestmove, depth: entry.depth };
    return null;
}

function bookSave(fen, bestmove, depth) {
    if (!fen || !bestmove) return;
    if (!openingBook) loadBook();
    const existing = openingBook[fen];
    if (existing && existing.depth > depth) return;
    openingBook[fen] = { bestmove, depth, timestamp: Date.now() };
    saveBook();
}

// ─────────────────────────────────────────────────────────────────────────────
// MOVE FORMAT HELPERS  (convert between engine Move objects and API format)
// ─────────────────────────────────────────────────────────────────────────────

function moveToApiPath(m) {
    // Returns [[col,row], ...] — from square first, then each step
    const path = [[sqCol(m.from), sqRow(m.from)]];
    for (const sq of m.steps) path.push([sqCol(sq), sqRow(sq)]);
    return path;
}

function parseMoveSteps(payload) {
    // payload is [[col,row], ...] where first element is "from"
    return payload.map(([c, r]) => makeSquare(c, r));
}

function findMoveByPath(moves, pathSquares) {
    // pathSquares = [fromSq, step1Sq, step2Sq, ...]
    const fromSq = pathSquares[0];
    const stepSqs = pathSquares.slice(1);
    for (const m of moves) {
        if (m.from !== fromSq) continue;
        if (m.steps.length !== stepSqs.length) continue;
        let ok = true;
        for (let i = 0; i < stepSqs.length; i++) {
            if (m.steps[i] !== stepSqs[i]) { ok = false; break; }
        }
        if (ok) return m;
    }
    return null;
}

function parseGameOverInfo(board) {
    if (!board.isGameOver()) return null;
    const { red, blue } = board.getFinalScores();
    let winner = 'Draw', reason = '';

    const { red: rc, blue: bc } = board.countPieces();
    if (rc === 0) {
        reason = 'Red has no remaining pieces';
    } else if (bc === 0) {
        reason = 'Blue has no remaining pieces';
    } else if (board.isDrawByNoCaptureLimit()) {
        reason = '40-move no capture limit reached';
    } else if (board.isDrawByOnePieceRepetition()) {
        reason = 'One-piece repetition draw';
    } else if (board.isDrawByRepetition()) {
        reason = 'Threefold repetition draw';
    } else {
        const side = board.sideToMove === Color.RED ? 'RED' : 'BLUE';
        reason = `${side} has no legal moves`;
    }

    if (red.gt(blue)) {
        winner = 'RED';
    } else if (blue.gt(red)) {
        winner = 'BLUE';
    } else {
        winner = 'Draw';
    }

    return {
        is_game_over: true,
        winner,
        game_over_reason: reason,
        final_score_red: red.toString(),
        final_score_blue: blue.toString(),
        capture_score_red: board.redScore.toString(),
        capture_score_blue: board.blueScore.toString(),
        output: `Game Over! (${reason})\nFinal Scores - RED: ${red.toString()} | BLUE: ${blue.toString()}\n${winner === 'Draw' ? 'Draw!' : winner + ' wins!'}`
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSISTENT ENGINE  (keeps one Board alive between AI calls, preserving nothing
// since our TT is per-search anyway)
// ─────────────────────────────────────────────────────────────────────────────

const persistentBoard = new Board();

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE HANDLER
// ─────────────────────────────────────────────────────────────────────────────

loadBook();

self.onmessage = function (e) {
    const { id, type, ...params } = e.data;
    try {
        const result = handleMessage(type, params);
        self.postMessage({ id, result });
    } catch (err) {
        self.postMessage({ id, error: err.message || String(err) });
    }
};

let currentWorkerVariant = 'rational';

function handleMessage(type, params) {
    if (type === 'initialize') {
        const variant = params.variant || 'rational';
        currentWorkerVariant = variant;
        const fen = buildVariantFen(variant);
        return { fen };
    }

    const activeVariant = params.variant || currentWorkerVariant || 'rational';

    if (type === 'moves') {
        const { fen, mid_move_promotion = false } = params;
        const board = new Board();
        board.variant = activeVariant;
        board.midMovePromotion = mid_move_promotion;
        board.loadPosition(fen);
        const moves = generateLegalMoves(board, mid_move_promotion);
        const apiMoves = moves.map(m => {
            const fromCoord = [sqCol(m.from), sqRow(m.from)];
            const steps = m.steps.map(sq => [sqCol(sq), sqRow(sq)]);
            const scoreStr = m.scoreChange.toString();
            return {
                from: fromCoord,
                steps,
                is_capture: m.isCapture,
                score_change: m.isCapture ? scoreStr : '',
                raw: `(${fromCoord[0]},${fromCoord[1]}) -> ${steps.map(s => `(${s[0]},${s[1]})`).join(' -> ')}`
            };
        });
        return { moves: apiMoves, output: '' };
    }

    if (type === 'move') {
        const { fen, move: movePath, mid_move_promotion = false } = params;
        const board = new Board();
        board.variant = activeVariant;
        board.midMovePromotion = mid_move_promotion;
        board.loadPosition(fen);
        const moves = generateLegalMoves(board, mid_move_promotion);

        // movePath is [[col,row], ...] with from first
        const pathSqs = movePath.map(([c, r]) => makeSquare(c, r));
        const found = findMoveByPath(moves, pathSqs);
        if (!found) return { fen: null, is_game_over: false, game_over_reason: '', winner: '', output: 'Illegal move.' };

        board.makeMove(found);

        const promoted = found.promoted;
        let output = '';
        if (promoted) output += 'Piece promoted to King!\n';
        if (found.isCapture) output += `Captured ${found.capturedSquares.length} piece(s). Score change: ${found.scoreChange.toString()}\n`;

        const gameOver = parseGameOverInfo(board);
        if (gameOver) return { ...gameOver, fen: board.getFen(), output: output + gameOver.output };

        return { fen: board.getFen(), is_game_over: false, game_over_reason: '', winner: '', output };
    }

    if (type === 'ai_move') {
        const { fen, depth = 0, time_ms = 0, mid_move_promotion = false, personality = 'passive' } = params;
        const board = new Board();
        board.variant = activeVariant;
        board.midMovePromotion = mid_move_promotion;
        board.loadPosition(fen);

        const targetDepth = depth > 0 ? Math.min(15, Math.max(1, depth)) : (time_ms > 0 ? 0 : 7);
        const actualTimeMs = (depth > 0) ? 0 : (time_ms > 0 ? time_ms : 0);

        // Check opening book
        const cached = bookGet(fen, targetDepth);
        if (cached) {
            return { bestmove: cached.bestmove, output: `Loaded best move from memory (depth ${cached.depth})`, from_cache: true };
        }

        const { bestMove, output } = searchBestMove(board, targetDepth, actualTimeMs, mid_move_promotion, personality);
        if (!bestMove) {
            const gameOver = parseGameOverInfo(board);
            if (gameOver) return { bestmove: null, ...gameOver, output: 'No legal moves available.', from_cache: false };
            return { bestmove: null, output: 'No legal moves.', from_cache: false };
        }

        const bestmove = moveToApiPath(bestMove);
        bookSave(fen, bestmove, targetDepth);
        return { bestmove, output, from_cache: false };
    }

    if (type === 'best_move') {
        const { fen, depth = 15, mid_move_promotion = false, personality = 'passive' } = params;
        const board = new Board();
        board.variant = activeVariant;
        board.midMovePromotion = mid_move_promotion;
        board.loadPosition(fen);

        const targetDepth = Math.min(15, Math.max(1, depth));
        const cached = bookGet(fen, targetDepth);
        if (cached) {
            return { bestmove: cached.bestmove, output: `Loaded best move from memory (depth ${cached.depth})`, from_cache: true, cached_depth: cached.depth };
        }

        const { bestMove, output } = searchBestMove(board, targetDepth, 0, mid_move_promotion, personality);
        if (!bestMove) return { bestmove: null, output: 'No legal moves.', from_cache: false };

        const bestmove = moveToApiPath(bestMove);
        bookSave(fen, bestmove, targetDepth);
        return { bestmove, output, from_cache: false };
    }

    throw new Error(`Unknown message type: ${type}`);
}
