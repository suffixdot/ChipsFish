#include "Board.h"
#include "Zobrist.h"
#include "Evaluate.h"
#include "Search.h"
#include "TranspositionTable.h"
#include "MoveGen.h"
#include <iostream>
#include <sstream>
#include <iomanip>

Board::Board() {
    init_operators();
    init_starting_position();
    current_hash = Zobrist::ComputeHash(*this);
}

void Board::Clear() {
    board.fill(Piece{Color::NONE, Fraction(0), false});
    history.clear();
    move_history.clear();
    red_score = Fraction(0);
    blue_score = Fraction(0);
    side_to_move = Color::RED;
    current_hash = Zobrist::ComputeHash(*this);
}

void Board::init_operators() {
    operators.fill(OpType::NONE);
    // Official Rational Damath board: 4 templates repeating every 4 rows.
    // j = playable square index (left to right) within a row.
    //   rows 0,4: j→ [+, −, ÷, ×]
    //   rows 1,5: j→ [−, +, ×, ÷]
    //   rows 2,6: j→ [÷, ×, +, −]
    //   rows 3,7: j→ [×, ÷, −, +]
    const OpType templates[4][4] = {
        {OpType::ADD, OpType::SUB, OpType::DIV, OpType::MUL}, // rows 0, 4
        {OpType::SUB, OpType::ADD, OpType::MUL, OpType::DIV}, // rows 1, 5
        {OpType::DIV, OpType::MUL, OpType::ADD, OpType::SUB}, // rows 2, 6
        {OpType::MUL, OpType::DIV, OpType::SUB, OpType::ADD}, // rows 3, 7
    };
    for (int r = 0; r < 8; ++r) {
        int t = r % 4;
        int j = 0; // playable square counter within this row
        for (int c = 0; c < 8; ++c) {
            Square sq = make_square(c, r);
            if (square_is_playable(sq)) {
                operators[sq] = templates[t][j];
                j++;
            }
        }
    }
}

void Board::init_starting_position() {
    board.fill(Piece{Color::NONE, Fraction(0), false});

    // Red pieces (official Rational Damath layout)
    // Row 0 (odd cols 1,3,5,7): -11/10, 8/10, -5/10, 2/10
    // Row 1 (even cols 0,2,4,6): 0, -3/10, 10/10, -7/10
    // Row 2 (odd cols 1,3,5,7): -9/10, 6/10, -1/10, 4/10
    std::vector<Fraction> r0 = {Fraction(-11, 10), Fraction(8, 10), Fraction(-5, 10), Fraction(2, 10)};
    std::vector<Fraction> r1 = {Fraction(0), Fraction(-3, 10), Fraction(10, 10), Fraction(-7, 10)};
    std::vector<Fraction> r2 = {Fraction(-9, 10), Fraction(6, 10), Fraction(-1, 10), Fraction(4, 10)};

    for (int i = 0; i < 4; ++i) {
        board[make_square(2 * i + 1, 0)] = Piece{Color::RED, r0[i], false};
        board[make_square(2 * i, 1)]     = Piece{Color::RED, r1[i], false};
        board[make_square(2 * i + 1, 2)] = Piece{Color::RED, r2[i], false};
    }

    // Blue pieces (official Rational Damath layout — mirror of Red)
    // Row 5 (even cols 0,2,4,6): 4/10, -1/10, 6/10, -9/10
    // Row 6 (odd cols 1,3,5,7): -7/10, 10/10, -3/10, 0
    // Row 7 (even cols 0,2,4,6): 2/10, -5/10, 8/10, -11/10
    std::vector<Fraction> r5 = {Fraction(4, 10), Fraction(-1, 10), Fraction(6, 10), Fraction(-9, 10)};
    std::vector<Fraction> r6 = {Fraction(-7, 10), Fraction(10, 10), Fraction(-3, 10), Fraction(0)};
    std::vector<Fraction> r7 = {Fraction(2, 10), Fraction(-5, 10), Fraction(8, 10), Fraction(-11, 10)};

    for (int i = 0; i < 4; ++i) {
        board[make_square(2 * i, 5)]     = Piece{Color::BLUE, r5[i], false};
        board[make_square(2 * i + 1, 6)] = Piece{Color::BLUE, r6[i], false};
        board[make_square(2 * i, 7)]     = Piece{Color::BLUE, r7[i], false};
    }
}

void Board::LoadPosition(const std::string& fen) {
    Clear();
    // Split FEN by spaces
    std::vector<std::string> fields;
    size_t start = 0;
    while (true) {
        size_t space = fen.find(' ', start);
        if (space == std::string::npos) {
            fields.push_back(fen.substr(start));
            break;
        }
        fields.push_back(fen.substr(start, space - start));
        start = space + 1;
    }

    if (fields.empty()) return;

    // Parse board layout
    std::string board_part = fields[0];
    std::vector<std::string> rows;
    std::string current_row = "";
    int paren_depth = 0;
    for (char ch : board_part) {
        if (ch == '(') {
            paren_depth++;
            current_row += ch;
        } else if (ch == ')') {
            paren_depth--;
            current_row += ch;
        } else if (ch == '/' && paren_depth == 0) {
            rows.push_back(current_row);
            current_row = "";
        } else {
            current_row += ch;
        }
    }
    rows.push_back(current_row);

    int r_idx = 7;
    for (const std::string& row_str : rows) {
        if (r_idx < 0) break;
        int c_idx = 0;
        size_t i = 0;
        while (i < row_str.size()) {
            char ch = row_str[i];
            if (ch >= '1' && ch <= '8') {
                c_idx += (ch - '0');
                i++;
            } else if (ch == 'r' || ch == 'R' || ch == 'b' || ch == 'B') {
                Color color = (ch == 'r' || ch == 'R') ? Color::RED : Color::BLUE;
                bool is_king = (ch == 'R' || ch == 'B');
                i++;
                if (i < row_str.size() && row_str[i] == '(') {
                    size_t close = row_str.find(')', i);
                    if (close != std::string::npos) {
                        std::string val_str = row_str.substr(i + 1, close - i - 1);
                        Fraction value = Fraction::parse(val_str);
                        board[make_square(c_idx, r_idx)] = Piece{color, value, is_king};
                        i = close + 1;
                    } else {
                        break;
                    }
                }
                c_idx++;
            } else {
                i++;
            }
        }
        r_idx--;
    }

    if (fields.size() > 1) {
        side_to_move = (fields[1] == "b" || fields[1] == "B") ? Color::BLUE : Color::RED;
    }
    if (fields.size() > 2) {
        red_score = Fraction::parse(fields[2]);
    }
    if (fields.size() > 3) {
        blue_score = Fraction::parse(fields[3]);
    }
    current_hash = Zobrist::ComputeHash(*this);
}

std::string Board::GetFen() const {
    std::ostringstream oss;
    for (int r = 7; r >= 0; --r) {
        int empty_count = 0;
        for (int c = 0; c < 8; ++c) {
            Square sq = make_square(c, r);
            const Piece& p = board[sq];
            if (p.color == Color::NONE) {
                empty_count++;
            } else {
                if (empty_count > 0) {
                    oss << empty_count;
                    empty_count = 0;
                }
                char ch = (p.color == Color::RED) ? 'r' : 'b';
                if (p.is_king) {
                    ch = std::toupper(ch);
                }
                oss << ch << "(" << p.value.to_string() << ")";
            }
        }
        if (empty_count > 0) {
            oss << empty_count;
        }
        if (r > 0) {
            oss << "/";
        }
    }
    oss << " " << (side_to_move == Color::RED ? "r" : "b");
    oss << " " << red_score.to_string();
    oss << " " << blue_score.to_string();
    return oss.str();
}

void Board::MakeMove(const Move& m) {
    BoardState current_state;
    current_state.side_to_move = side_to_move;
    current_state.red_score = red_score;
    current_state.blue_score = blue_score;
    current_state.hash = current_hash;
    history.push_back(current_state);
    move_history.push_back(m);

    // Incrementally update hash
    current_hash ^= Zobrist::GetSideKey();

    Piece p = board[m.from];
    current_hash ^= Zobrist::GetPieceKey(m.from, p.color, p.is_king);
    board[m.from] = Piece{Color::NONE, Fraction(0), false};

    // Remove captured pieces
    for (size_t i = 0; i < m.captured_squares.size(); ++i) {
        Square sq = m.captured_squares[i];
        Piece cap_p = m.captured_pieces[i];
        current_hash ^= Zobrist::GetPieceKey(sq, cap_p.color, cap_p.is_king);
        board[sq] = Piece{Color::NONE, Fraction(0), false};
    }

    Square dest = m.steps.empty() ? m.from : m.steps.back();
    if (m.promoted) {
        p.is_king = true;
    }
    current_hash ^= Zobrist::GetPieceKey(dest, p.color, p.is_king);
    board[dest] = p;

    if (side_to_move == Color::RED) {
        red_score = red_score + m.score_change;
    } else {
        blue_score = blue_score + m.score_change;
    }

    side_to_move = ~side_to_move;
}

void Board::UndoMove() {
    if (history.empty()) return;

    Move m = move_history.back();
    move_history.pop_back();

    BoardState prev_state = history.back();
    history.pop_back();

    Square dest = m.steps.empty() ? m.from : m.steps.back();
    Piece p = board[dest];
    board[dest] = Piece{Color::NONE, Fraction(0), false};

    if (m.promoted) {
        p.is_king = false;
    }
    board[m.from] = p;

    // Restore captured pieces
    for (size_t i = 0; i < m.captured_squares.size(); ++i) {
        board[m.captured_squares[i]] = m.captured_pieces[i];
    }

    side_to_move = prev_state.side_to_move;
    red_score = prev_state.red_score;
    blue_score = prev_state.blue_score;
    current_hash = prev_state.hash;
}

void Board::PrintBoard() const {
    std::cout << "  +--------------------------------------------------------------------------------+" << std::endl;
    for (int r = 7; r >= 0; --r) {
        std::cout << r << " | ";
        for (int c = 0; c < 8; ++c) {
            Square sq = make_square(c, r);
            std::string cell = "";
            if (square_is_playable(sq)) {
                const Piece& p = board[sq];
                if (p.color != Color::NONE) {
                    cell = p.to_string();
                } else {
                    OpType op = operators[sq];
                    if (op == OpType::ADD) cell = "+";
                    else if (op == OpType::SUB) cell = "-";
                    else if (op == OpType::MUL) cell = "*";
                    else if (op == OpType::DIV) cell = "/";
                    else cell = ".";
                }
            }
            std::cout << std::left << std::setw(10) << cell;
        }
        std::cout << "|" << std::endl;
    }
    std::cout << "  +--------------------------------------------------------------------------------+" << std::endl;
    std::cout << "    0         1         2         3         4         5         6         7" << std::endl;
    std::cout << "Turn: " << (side_to_move == Color::RED ? "RED" : "BLUE") << std::endl;
    std::cout << "Scores - RED: " << red_score << " | BLUE: " << blue_score << std::endl;
}

Fraction Board::Evaluate() const {
    return Evaluate::EvaluateBoard(*this);
}

Move Board::Search(int depth_or_time_ms) {
    TranspositionTable tt;
    if (depth_or_time_ms > 40) {
        return Search::SearchBestMove(*this, 0, depth_or_time_ms, tt);
    } else {
        return Search::SearchBestMove(*this, depth_or_time_ms, 0, tt);
    }
}

static bool IsOnePieceRepetition(Color color, const std::vector<Move>& move_history, const std::vector<BoardState>& history) {
    int last_capture_idx = -1;
    for (int i = static_cast<int>(move_history.size()) - 1; i >= 0; --i) {
        if (move_history[i].is_capture()) {
            last_capture_idx = i;
            break;
        }
    }

    std::vector<Move> player_moves;
    for (size_t i = last_capture_idx + 1; i < move_history.size(); ++i) {
        if (history[i].side_to_move == color) {
            player_moves.push_back(move_history[i]);
        }
    }

    int n = player_moves.size();
    if (n < 5) return false;

    for (int k = 1; k <= n / 5; ++k) {
        bool match = true;
        for (int i = 0; i < 5 * k; ++i) {
            if (player_moves[n - 5 * k + i] != player_moves[n - 5 * k + (i % k)]) {
                match = false;
                break;
            }
        }
        if (match) {
            return true;
        }
    }
    return false;
}

bool Board::IsDrawByRepetition() const {
    int count = 1;
    for (int i = static_cast<int>(history.size()) - 1; i >= 0; --i) {
        if (move_history[i].is_capture()) {
            break;
        }
        if (history[i].hash == current_hash) {
            count++;
        }
    }
    return count >= 3;
}

bool Board::IsDrawByOnePieceRepetition() const {
    int red_count = 0;
    int blue_count = 0;
    for (int sq = 0; sq < 64; ++sq) {
        if (board[sq].color == Color::RED) red_count++;
        else if (board[sq].color == Color::BLUE) blue_count++;
    }

    if (red_count == 1) {
        if (IsOnePieceRepetition(Color::RED, move_history, history)) {
            return true;
        }
    }
    if (blue_count == 1) {
        if (IsOnePieceRepetition(Color::BLUE, move_history, history)) {
            return true;
        }
    }
    return false;
}

bool Board::IsDrawByNoCaptureLimit() const {
    int plies_since_capture = 0;
    for (int i = static_cast<int>(move_history.size()) - 1; i >= 0; --i) {
        if (move_history[i].is_capture()) {
            break;
        }
        plies_since_capture++;
    }
    return plies_since_capture >= 40;
}

bool Board::IsGameOver() const {
    int red_count = 0;
    int blue_count = 0;
    for (int sq = 0; sq < 64; ++sq) {
        if (board[sq].color == Color::RED) red_count++;
        else if (board[sq].color == Color::BLUE) blue_count++;
    }
    if (red_count == 0 || blue_count == 0) {
        return true;
    }

    if (IsDrawByRepetition() || IsDrawByOnePieceRepetition() || IsDrawByNoCaptureLimit()) {
        return true;
    }

    auto moves = MoveGen::GenerateLegalMoves(*const_cast<Board*>(this));
    return moves.empty();
}

void Board::GetFinalScores(Fraction& red_final, Fraction& blue_final) const {
    red_final = red_score;
    blue_final = blue_score;
    for (int sq = 0; sq < 64; ++sq) {
        if (board[sq].color == Color::RED) {
            red_final = red_final + board[sq].value;
        } else if (board[sq].color == Color::BLUE) {
            blue_final = blue_final + board[sq].value;
        }
    }
}