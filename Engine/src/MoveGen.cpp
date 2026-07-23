#include "MoveGen.h"
#include <algorithm>
#include <cmath>

namespace {

Fraction calculate_score(const Piece& taker, const Piece& taken, OpType op) {
    Fraction base_score;
    if (op == OpType::ADD) {
        base_score = taker.value + taken.value;
    } else if (op == OpType::SUB) {
        base_score = taker.value - taken.value;
    } else if (op == OpType::MUL) {
        base_score = taker.value * taken.value;
    } else if (op == OpType::DIV) {
        if (taken.value == Fraction(0)) {
            base_score = Fraction(0); // Prohibited/No Score rule
        } else {
            base_score = taker.value / taken.value;
        }
    } else {
        base_score = Fraction(0);
    }

    int multiplier = 1;
    if (taker.is_king) multiplier *= 2;
    if (taken.is_king) multiplier *= 2;

    return base_score * Fraction(multiplier);
}

void get_captures_rec(Square current_sq, Piece p, Move current_move, std::vector<Move>& all_captures, Board& board, Color us, bool config_mid_move_promotion) {
    int col = square_col(current_sq);
    int row = square_row(current_sq);

    // Temporarily clear the moving piece's position so it doesn't block landing squares or subsequent jumps
    Piece original_p = board.GetPiece(current_sq);
    board.SetPiece(current_sq, Piece{Color::NONE, Fraction(0), false});

    bool has_next_captures = false;

    if (!p.is_king) {
        // Normal piece captures (can capture forward or backward)
        int dc[] = {-1, -1, 1, 1};
        int dr[] = {-1, 1, -1, 1};

        for (int i = 0; i < 4; ++i) {
            int adj_col = col + dc[i];
            int adj_row = row + dr[i];
            int land_col = col + 2 * dc[i];
            int land_row = row + 2 * dr[i];

            if (adj_col >= 0 && adj_col < 8 && adj_row >= 0 && adj_row < 8 &&
                land_col >= 0 && land_col < 8 && land_row >= 0 && land_row < 8) {
                
                Square adj = make_square(adj_col, adj_row);
                Square land = make_square(land_col, land_row);

                Piece taken = board.GetPiece(adj);
                Piece land_p = board.GetPiece(land);

                if (taken.color == ~us && land_p.color == Color::NONE) {
                    has_next_captures = true;

                    // Remove captured piece immediately from the board during search
                    board.SetPiece(adj, Piece{Color::NONE, Fraction(0), false});

                    bool promoted_this_step = ((us == Color::RED && land_row == 7) || (us == Color::BLUE && land_row == 0));
                    Piece next_piece = p;
                    if (promoted_this_step) {
                        next_piece.is_king = true;
                    }

                    Fraction step_score = calculate_score(next_piece, taken, board.GetOperator(land));

                    Move next_move = current_move;
                    next_move.steps.push_back(land);
                    next_move.captured_squares.push_back(adj);
                    next_move.captured_pieces.push_back(taken);
                    next_move.step_scores.push_back(step_score);
                    next_move.score_change = next_move.score_change + step_score;
                    next_move.promoted = next_move.promoted || promoted_this_step;

                    if (promoted_this_step && !config_mid_move_promotion) {
                        // Promotion ends the turn, so we save this move as a terminal capture path
                        all_captures.push_back(next_move);
                    } else {
                        // Recurse to find further jumps
                        get_captures_rec(land, next_piece, next_move, all_captures, board, us, config_mid_move_promotion);
                    }

                    // Restore captured piece
                    board.SetPiece(adj, taken);
                }
            }
        }
    } else {
        // King piece captures (any distance, must change direction or continue, jumps exactly one piece)
        int dc[] = {-1, -1, 1, 1};
        int dr[] = {-1, 1, -1, 1};

        for (int i = 0; i < 4; ++i) {
            for (int step = 1; step < 8; ++step) {
                int adj_col = col + step * dc[i];
                int adj_row = row + step * dr[i];

                if (adj_col < 0 || adj_col >= 8 || adj_row < 0 || adj_row >= 8) {
                    break;
                }

                Square adj = make_square(adj_col, adj_row);
                Piece taken = board.GetPiece(adj);

                if (taken.color == us) {
                    // Blocked by friendly piece
                    break;
                }

                if (taken.color == ~us) {
                    // Opponent piece found, check landing squares beyond it
                    for (int land_step = step + 1; land_step < 8; ++land_step) {
                        int land_col = col + land_step * dc[i];
                        int land_row = row + land_step * dr[i];

                        if (land_col < 0 || land_col >= 8 || land_row < 0 || land_row >= 8) {
                            break;
                        }

                        Square land = make_square(land_col, land_row);
                        Piece land_p = board.GetPiece(land);

                        if (land_p.color != Color::NONE) {
                            // Blocked by another piece
                            break;
                        }

                        has_next_captures = true;

                        // Remove captured piece immediately during search
                        board.SetPiece(adj, Piece{Color::NONE, Fraction(0), false});

                        Fraction step_score = calculate_score(p, taken, board.GetOperator(land));

                        Move next_move = current_move;
                        next_move.steps.push_back(land);
                        next_move.captured_squares.push_back(adj);
                        next_move.captured_pieces.push_back(taken);
                        next_move.step_scores.push_back(step_score);
                        next_move.score_change = next_move.score_change + step_score;

                        get_captures_rec(land, p, next_move, all_captures, board, us, config_mid_move_promotion);

                        // Restore captured piece
                        board.SetPiece(adj, taken);
                    }
                    // Cannot jump over more than one opponent piece on the same line
                    break;
                }
            }
        }
    }

    // Restore original piece
    board.SetPiece(current_sq, original_p);

    // If there were no further jumps from here, and we have made at least one capture, this is a valid complete capture path
    if (!has_next_captures && current_move.is_capture()) {
        all_captures.push_back(current_move);
    }
}

} // namespace

std::vector<Move> MoveGen::GenerateLegalMoves(Board& board) {
    return GenerateLegalMoves(board, board.GetMidMovePromotion());
}

std::vector<Move> MoveGen::GenerateLegalMoves(Board& board, bool config_mid_move_promotion) {
    Color us = board.GetSideToMove();
    std::vector<Move> all_captures;

    // 1. Generate all capture sequences
    for (int sq = 0; sq < 64; ++sq) {
        Piece p = board.GetPiece(sq);
        if (p.color == us) {
            Move m;
            m.from = sq;
            get_captures_rec(sq, p, m, all_captures, board, us, config_mid_move_promotion);
        }
    }

    // If any captures exist, enforce priority rules and return
    if (!all_captures.empty()) {
        // Rule 2: If any King can capture, a King capture must be chosen
        bool king_can_capture = false;
        for (const auto& m : all_captures) {
            if (board.GetPiece(m.from).is_king) {
                king_can_capture = true;
                break;
            }
        }

        std::vector<Move> filtered_captures;
        if (king_can_capture) {
            for (const auto& m : all_captures) {
                if (board.GetPiece(m.from).is_king) {
                    filtered_captures.push_back(m);
                }
            }
        } else {
            filtered_captures = all_captures;
        }

        // Rule 3: The move that captures the greatest number of opponent pieces must be chosen
        size_t max_caps = 0;
        for (const auto& m : filtered_captures) {
            max_caps = std::max(max_caps, m.captured_squares.size());
        }

        std::vector<Move> final_captures;
        for (const auto& m : filtered_captures) {
            if (m.captured_squares.size() == max_caps) {
                final_captures.push_back(m);
            }
        }

        return final_captures;
    }

    // 2. If no captures exist, generate normal diagonal moves
    std::vector<Move> normal_moves;
    for (int sq = 0; sq < 64; ++sq) {
        Piece p = board.GetPiece(sq);
        if (p.color == us) {
            int col = square_col(sq);
            int row = square_row(sq);

            if (!p.is_king) {
                // Normal pieces move forward diagonally only
                int dr = (us == Color::RED) ? 1 : -1;
                int dc[] = {-1, 1};

                for (int i = 0; i < 2; ++i) {
                    int dest_col = col + dc[i];
                    int dest_row = row + dr;

                    if (dest_col >= 0 && dest_col < 8 && dest_row >= 0 && dest_row < 8) {
                        Square dest = make_square(dest_col, dest_row);
                        if (board.GetPiece(dest).color == Color::NONE) {
                            bool promoted = ((us == Color::RED && dest_row == 7) || (us == Color::BLUE && dest_row == 0));
                            Move m;
                            m.from = sq;
                            m.steps = {dest};
                            m.promoted = promoted;
                            normal_moves.push_back(m);
                        }
                    }
                }
            } else {
                // Kings can move any number of empty squares in all 4 diagonal directions
                int dc[] = {-1, -1, 1, 1};
                int dr[] = {-1, 1, -1, 1};

                for (int i = 0; i < 4; ++i) {
                    for (int step = 1; step < 8; ++step) {
                        int dest_col = col + step * dc[i];
                        int dest_row = row + step * dr[i];

                        if (dest_col < 0 || dest_col >= 8 || dest_row < 0 || dest_row >= 8) {
                            break;
                        }

                        Square dest = make_square(dest_col, dest_row);
                        if (board.GetPiece(dest).color != Color::NONE) {
                            break;
                        }

                        Move m;
                        m.from = sq;
                        m.steps = {dest};
                        normal_moves.push_back(m);
                    }
                }
            }
        }
    }

    return normal_moves;
}
