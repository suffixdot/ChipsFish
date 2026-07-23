#include "Search.h"
#include "Evaluate.h"
#include "MoveGen.h"
#include "Zobrist.h"
#include <chrono>
#include <algorithm>
#include <iostream>
#include <cmath>

namespace Search {

namespace {
    std::chrono::steady_clock::time_point start_time;
    int time_limit_ms = 0;
    bool timeout_flag = false;
    long long nodes_visited = 0;
    const Fraction INF(9999999LL, 1LL);

    const int MAX_SEARCH_DEPTH = 64;
    Move killer_moves[MAX_SEARCH_DEPTH][2];

    int ScoreMove(const Move& m, Square tt_from, Square tt_to, int depth_from_root) {
        Square dest = m.steps.empty() ? m.from : m.steps.back();
        if (m.from == tt_from && dest == tt_to) {
            return 1000000; // TT move gets highest priority
        }
        if (m.is_capture()) {
            double val = (double)m.score_change.numerator() / m.score_change.denominator();
            return 10000 + (int)(val * 100.0);
        }
        
        // Killer move heuristic
        if (depth_from_root < MAX_SEARCH_DEPTH) {
            if (m == killer_moves[depth_from_root][0]) {
                return 9000;
            } else if (m == killer_moves[depth_from_root][1]) {
                return 8000;
            }
        }

        int score = 0;
        if (m.promoted) {
            score += 1000;
        }
        int from_row = square_row(m.from);
        int to_row = square_row(dest);
        int row_diff = std::abs(to_row - from_row);
        score += row_diff * 10;
        
        return score;
    }

    Fraction Quiescence(Board& board, Fraction alpha, Fraction beta) {
        if (timeout_flag) return Fraction(0);

        nodes_visited++;
        if (time_limit_ms > 0 && nodes_visited % 1024 == 0) {
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count();
            if (elapsed >= time_limit_ms) {
                timeout_flag = true;
                return Fraction(0);
            }
        }

        auto moves = MoveGen::GenerateLegalMoves(board);
        if (moves.empty()) {
            return GetTerminalScore(board);
        }

        // If no captures are available, this is a quiet position and we can stand pat
        if (!moves[0].is_capture()) {
            return Evaluate::EvaluateBoard(board);
        }

        // Captures are mandatory, no stand-pat option
        Fraction best_score = -INF;

        // Sort captures by score change descending
        std::sort(moves.begin(), moves.end(), [](const Move& a, const Move& b) {
            double val_a = (double)a.score_change.numerator() / a.score_change.denominator();
            double val_b = (double)b.score_change.numerator() / b.score_change.denominator();
            return val_a > val_b;
        });

        for (const auto& m : moves) {
            board.MakeMove(m);
            Fraction score = -Quiescence(board, -beta, -alpha);
            board.UndoMove();

            if (timeout_flag) return Fraction(0);

            if (score > best_score) {
                best_score = score;
            }
            alpha = std::max(alpha, score);
            if (alpha >= beta) {
                break; // Beta cutoff
            }
        }

        return best_score;
    }

    Fraction Negamax(Board& board, int depth, Fraction alpha, Fraction beta, TranspositionTable& tt, int depth_from_root) {
        if (timeout_flag) return Fraction(0);

        nodes_visited++;
        if (time_limit_ms > 0 && nodes_visited % 1024 == 0) {
            auto now = std::chrono::steady_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count();
            if (elapsed >= time_limit_ms) {
                timeout_flag = true;
                return Fraction(0);
            }
        }

        auto moves = MoveGen::GenerateLegalMoves(board);
        if (moves.empty()) {
            return GetTerminalScore(board);
        }

        // TT Probe
        bool use_score = false;
        Square tt_from = SQ_NONE;
        Square tt_to = SQ_NONE;
        Fraction tt_score(0);
        std::uint64_t key = board.GetHash();

        if (tt.Probe(key, depth, alpha, beta, tt_score, use_score, tt_from, tt_to)) {
            if (use_score) {
                return tt_score;
            }
        }

        if (depth <= 0) {
            return Quiescence(board, alpha, beta);
        }

        // Sort moves
        std::vector<std::pair<int, Move>> scored_moves;
        scored_moves.reserve(moves.size());
        for (const auto& m : moves) {
            scored_moves.push_back({ScoreMove(m, tt_from, tt_to, depth_from_root), m});
        }
        std::sort(scored_moves.begin(), scored_moves.end(), [](const auto& a, const auto& b) {
            return a.first > b.first;
        });

        TTFlag flag = TT_UPPERBOUND;
        Fraction best_score = -INF;
        Move best_move;

        for (const auto& sm : scored_moves) {
            const Move& m = sm.second;
            board.MakeMove(m);
            Fraction score = -Negamax(board, depth - 1, -beta, -alpha, tt, depth_from_root + 1);
            board.UndoMove();

            if (timeout_flag) return Fraction(0);

            if (score > best_score) {
                best_score = score;
                best_move = m;
            }

            if (score > alpha) {
                alpha = score;
                flag = TT_EXACT;
            }

            if (alpha >= beta) {
                flag = TT_LOWERBOUND;
                if (!m.is_capture() && depth_from_root < MAX_SEARCH_DEPTH) {
                    if (killer_moves[depth_from_root][0] != m) {
                        killer_moves[depth_from_root][1] = killer_moves[depth_from_root][0];
                        killer_moves[depth_from_root][0] = m;
                    }
                }
                break; // Beta cutoff
            }
        }

        if (!timeout_flag) {
            tt.Store(key, depth, flag, best_score, best_move);
        }

        return best_score;
    }
} // namespace

Fraction GetTerminalScore(const Board& board) {
    Fraction red_final = board.GetRedScore();
    Fraction blue_final = board.GetBlueScore();
    for (int sq = 0; sq < 64; ++sq) {
        const Piece& p = board.GetPiece(sq);
        if (p.color == Color::RED) {
            red_final = red_final + p.value;
        } else if (p.color == Color::BLUE) {
            blue_final = blue_final + p.value;
        }
    }
    
    if (board.GetSideToMove() == Color::RED) {
        return red_final - blue_final;
    } else {
        return blue_final - red_final;
    }
}

Move SearchBestMove(Board& board, int depth_limit, int time_limit_ms_arg, TranspositionTable& tt) {
    start_time = std::chrono::steady_clock::now();
    time_limit_ms = time_limit_ms_arg;
    timeout_flag = false;
    nodes_visited = 0;

    for (int i = 0; i < MAX_SEARCH_DEPTH; ++i) {
        killer_moves[i][0] = Move{};
        killer_moves[i][1] = Move{};
    }

    Move best_move;

    auto root_moves = MoveGen::GenerateLegalMoves(board);
    if (root_moves.empty()) {
        return Move{};
    }
    best_move = root_moves[0]; // fallback default

    int target_depth = (depth_limit > 0) ? depth_limit : 64;

    if (time_limit_ms <= 0) {
        // Fixed depth search
        Fraction score = Negamax(board, target_depth, -INF, INF, tt, 0);
        if (!timeout_flag) {
            Square tt_from = SQ_NONE, tt_to = SQ_NONE;
            Fraction tt_score(0);
            bool use_score = false;
            if (tt.Probe(board.GetHash(), target_depth, -INF, INF, tt_score, use_score, tt_from, tt_to)) {
                for (const auto& m : root_moves) {
                    Square dest = m.steps.empty() ? m.from : m.steps.back();
                    if (m.from == tt_from && dest == tt_to) {
                        best_move = m;
                        break;
                    }
                }
            }
            // Print score so callers (e.g. eval bar) can parse it
            auto now = std::chrono::steady_clock::now();
            auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count();
            std::cout << "info depth " << target_depth
                      << " score " << score.to_string()
                      << " nodes " << nodes_visited
                      << " time " << elapsed_ms
                      << " pv (" << square_col(best_move.from) << "," << square_row(best_move.from) << ")";
            for (size_t s = 0; s < best_move.steps.size(); ++s) {
                std::cout << " -> (" << square_col(best_move.steps[s]) << "," << square_row(best_move.steps[s]) << ")";
            }
            std::cout << std::endl;
        }
    } else {
        // Iterative deepening
        for (int d = 1; d <= target_depth; ++d) {
            Fraction score = Negamax(board, d, -INF, INF, tt, 0);
            if (timeout_flag) {
                break; // Use the best move from the last fully searched depth
            }

            Square tt_from = SQ_NONE, tt_to = SQ_NONE;
            Fraction tt_score(0);
            bool use_score = false;
            if (tt.Probe(board.GetHash(), d, -INF, INF, tt_score, use_score, tt_from, tt_to)) {
                for (const auto& m : root_moves) {
                    Square dest = m.steps.empty() ? m.from : m.steps.back();
                    if (m.from == tt_from && dest == tt_to) {
                        best_move = m;
                        break;
                    }
                }
            }

            auto now = std::chrono::steady_clock::now();
            auto elapsed_ms = std::chrono::duration_cast<std::chrono::milliseconds>(now - start_time).count();
            std::cout << "info depth " << d 
                      << " score " << score.to_string() 
                      << " nodes " << nodes_visited 
                      << " time " << elapsed_ms 
                      << " pv (" << square_col(best_move.from) << "," << square_row(best_move.from) << ")";
            for (size_t s = 0; s < best_move.steps.size(); ++s) {
                std::cout << " -> (" << square_col(best_move.steps[s]) << "," << square_row(best_move.steps[s]) << ")";
            }
            std::cout << std::endl;
        }
    }

    return best_move;
}

int ScoreMoveForTest(const Move& m, Square tt_from, Square tt_to, int depth_from_root) {
    return ScoreMove(m, tt_from, tt_to, depth_from_root);
}

void SetKillerMoveForTest(int depth, const Move& m, int slot) {
    if (depth >= 0 && depth < MAX_SEARCH_DEPTH && slot >= 0 && slot < 2) {
        killer_moves[depth][slot] = m;
    }
}

} // namespace Search
