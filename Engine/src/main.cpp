#include "Board.h"
#include "MoveGen.h"
#include "Search.h"
#include "Perft.h"
#include "Evaluate.h"
#include "TranspositionTable.h"
#include <iostream>
#include <string>
#include <sstream>
#include <vector>
#include <algorithm>

namespace {

bool parse_square(const std::string& str, Square& sq) {
    size_t comma = str.find(',');
    if (comma == std::string::npos) return false;
    try {
        int col = std::stoi(str.substr(0, comma));
        int row = std::stoi(str.substr(comma + 1));
        if (col < 0 || col >= 8 || row < 0 || row >= 8) return false;
        sq = make_square(col, row);
        return true;
    } catch (...) {
        return false;
    }
}

} // namespace

int main() {
    Board board;
    TranspositionTable tt;
    std::string line;

    std::cout << "========================================" << std::endl;
    std::cout << "    Rational Fractions Damath Engine    " << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "Type 'help' for a list of commands." << std::endl;

    board.PrintBoard();

    while (true) {
        std::cout << "\ndamath> ";
        if (!std::getline(std::cin, line)) {
            break;
        }

        std::istringstream iss(line);
        std::string cmd;
        if (!(iss >> cmd)) continue;

        if (cmd == "quit" || cmd == "exit") {
            break;
        } else if (cmd == "help") {
            std::cout << "Available commands:\n"
                      << "  position startpos [moves ...]      - Load starting board position, optionally play moves\n"
                      << "  position fen <fen> [moves ...]     - Load board from FEN, optionally play moves\n"
                      << "  setoption name <name> value <val>  - Set option variable (e.g. MidMovePromotion)\n"
                      << "  d / print / show                   - Display the current board\n"
                      << "  eval                               - Print static evaluation of current position\n"
                      << "  go depth <N>                       - Search using depth N\n"
                      << "  go movetime <ms>                   - Search using time limit in milliseconds\n"
                      << "  go                                 - Search using default 5000ms time limit\n"
                      << "  perft <depth>                      - Run a perft benchmark\n"
                      << "  move <col,row> <col,row> ...       - Play a move (e.g. 'move 1,2 2,3')\n"
                      << "  moves / legal                      - Print list of legal moves\n"
                      << "  undo                               - Undo the last move\n"
                      << "  quit / exit                        - Exit the engine" << std::endl;
        } else if (cmd == "setoption") {
            std::string name_keyword, name, value_keyword, value;
            if (iss >> name_keyword >> name >> value_keyword >> value) {
                if (name_keyword == "name" && value_keyword == "value") {
                    if (name == "MidMovePromotion") {
                        if (value == "true") {
                            board.SetMidMovePromotion(true);
                            std::cout << "Option MidMovePromotion set to true" << std::endl;
                        } else if (value == "false") {
                            board.SetMidMovePromotion(false);
                            std::cout << "Option MidMovePromotion set to false" << std::endl;
                        } else {
                            std::cout << "Invalid value: " << value << ". Must be 'true' or 'false'." << std::endl;
                        }
                    } else {
                        std::cout << "Unknown option name: " << name << std::endl;
                    }
                } else {
                    std::cout << "Usage: setoption name <name> value <val>" << std::endl;
                }
            } else {
                std::cout << "Usage: setoption name <name> value <val>" << std::endl;
            }
        } else if (cmd == "position") {
            std::string sub;
            if (iss >> sub) {
                std::string fen_or_startpos = "";
                std::vector<std::string> moves_to_play;
                bool reading_moves = false;

                if (sub == "startpos") {
                    fen_or_startpos = "startpos";
                    std::string token;
                    while (iss >> token) {
                        if (token == "moves") {
                            reading_moves = true;
                            continue;
                        }
                        if (reading_moves) {
                            moves_to_play.push_back(token);
                        }
                    }
                } else if (sub == "fen") {
                    std::string token;
                    std::vector<std::string> fen_parts;
                    while (iss >> token) {
                        if (token == "moves") {
                            reading_moves = true;
                            break;
                        }
                        fen_parts.push_back(token);
                    }
                    std::string fen = "";
                    for (size_t i = 0; i < fen_parts.size(); ++i) {
                        if (i > 0) fen += " ";
                        fen += fen_parts[i];
                    }
                    fen_or_startpos = fen;

                    if (reading_moves) {
                        while (iss >> token) {
                            moves_to_play.push_back(token);
                        }
                    }
                }

                bool prev_mid_promotion = board.GetMidMovePromotion();
                if (fen_or_startpos == "startpos") {
                    board = Board();
                } else {
                    board.LoadPosition(fen_or_startpos);
                }
                board.SetMidMovePromotion(prev_mid_promotion);

                bool moves_ok = true;
                size_t token_idx = 0;
                while (token_idx < moves_to_play.size()) {
                    auto legal_moves = MoveGen::GenerateLegalMoves(board);
                    bool found = false;
                    for (const auto& m : legal_moves) {
                        size_t needed_tokens = 1 + m.steps.size();
                        if (token_idx + needed_tokens <= moves_to_play.size()) {
                            Square start_sq;
                            if (parse_square(moves_to_play[token_idx], start_sq) && start_sq == m.from) {
                                bool steps_match = true;
                                for (size_t s = 0; s < m.steps.size(); ++s) {
                                    Square step_sq;
                                    if (!parse_square(moves_to_play[token_idx + 1 + s], step_sq) || step_sq != m.steps[s]) {
                                        steps_match = false;
                                        break;
                                    }
                                }
                                if (steps_match) {
                                    board.MakeMove(m);
                                    token_idx += needed_tokens;
                                    found = true;
                                    break;
                                }
                            }
                        }
                    }
                    if (!found) {
                        std::cout << "Illegal or malformed move sequence starting at token: " 
                                  << moves_to_play[token_idx] << std::endl;
                        moves_ok = false;
                        break;
                    }
                }
                if (moves_ok) {
                    board.PrintBoard();
                }
            } else {
                std::cout << "Usage: position [startpos | fen <fen_string>] [moves <move1> <move2> ...]" << std::endl;
            }
        } else if (cmd == "d" || cmd == "print" || cmd == "show") {
            board.PrintBoard();
        } else if (cmd == "eval") {
            std::cout << "Static Evaluation: " << Evaluate::EvaluateBoard(board) << std::endl;
        } else if (cmd == "go") {
            std::string sub = "";
            int val = 0;
            int depth = 0;
            int time_ms = 0;
            if (iss >> sub >> val) {
                if (sub == "depth") {
                    depth = val;
                } else if (sub == "movetime") {
                    time_ms = val;
                }
            } else {
                time_ms = 5000;
            }

            if (board.IsGameOver()) {
                std::cout << "Game is already over!" << std::endl;
                continue;
            }

            std::cout << "Searching..." << std::endl;
            Move best_move = Search::SearchBestMove(board, depth, time_ms, tt);

            if (best_move.from == SQ_NONE) {
                std::cout << "No moves found!" << std::endl;
            } else {
                std::cout << "bestmove (" << square_col(best_move.from) << "," << square_row(best_move.from) << ")";
                for (Square sq : best_move.steps) {
                    std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
                }
                std::cout << std::endl;

                board.MakeMove(best_move);

                if (board.IsGameOver()) {
                    std::cout << "Game Over!" << std::endl;
                    if (board.IsDrawByRepetition()) {
                        std::cout << "Draw by Threefold Repetition!" << std::endl;
                    } else if (board.IsDrawByOnePieceRepetition()) {
                        std::cout << "Draw by One Piece Repetition (5-move sequence repeated)!" << std::endl;
                    } else if (board.IsDrawByNoCaptureLimit()) {
                        std::cout << "Draw by No Capture Limit (40 plies without captures)!" << std::endl;
                    }
                    Fraction red_final, blue_final;
                    board.GetFinalScores(red_final, blue_final);
                    std::cout << "Final Scores - RED: " << red_final << " | BLUE: " << blue_final << std::endl;
                    if (red_final > blue_final) {
                        std::cout << "RED wins!" << std::endl;
                    } else if (blue_final > red_final) {
                        std::cout << "BLUE wins!" << std::endl;
                    } else {
                        std::cout << "Draw!" << std::endl;
                    }
                } else {
                    board.PrintBoard();
                }
            }
        } else if (cmd == "perft") {
            int depth = 0;
            if (iss >> depth) {
                Perft::RunDivide(board, depth);
            } else {
                std::cout << "Usage: perft <depth>" << std::endl;
            }
        } else if (cmd == "move") {
            std::vector<std::string> steps_str;
            std::string step;
            while (iss >> step) {
                steps_str.push_back(step);
            }
            if (steps_str.empty()) {
                std::cout << "Usage: move <col,row> <col,row> ..." << std::endl;
                continue;
            }
            Square start_sq = SQ_NONE;
            if (!parse_square(steps_str[0], start_sq)) {
                std::cout << "Invalid start square format! Use col,row (e.g. 1,2)" << std::endl;
                continue;
            }
            std::vector<Square> steps;
            bool ok = true;
            for (size_t i = 1; i < steps_str.size(); ++i) {
                Square step_sq = SQ_NONE;
                if (!parse_square(steps_str[i], step_sq)) {
                    std::cout << "Invalid step square format: " << steps_str[i] << std::endl;
                    ok = false;
                    break;
                }
                steps.push_back(step_sq);
            }
            if (!ok) continue;

            auto legal_moves = MoveGen::GenerateLegalMoves(board);
            bool found = false;
            for (const auto& m : legal_moves) {
                if (m.from == start_sq && m.steps == steps) {
                    board.MakeMove(m);
                    found = true;
                    std::cout << "Played move: (" << square_col(m.from) << "," << square_row(m.from) << ")";
                    for (Square sq : m.steps) {
                        std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
                    }
                    if (m.is_capture()) {
                        std::cout << " [Capture, Score Change: " << m.score_change << "]";
                    }
                    std::cout << std::endl;

                    if (board.IsGameOver()) {
                        std::cout << "Game Over!" << std::endl;
                        if (board.IsDrawByRepetition()) {
                            std::cout << "Draw by Threefold Repetition!" << std::endl;
                        } else if (board.IsDrawByOnePieceRepetition()) {
                            std::cout << "Draw by One Piece Repetition (5-move sequence repeated)!" << std::endl;
                        } else if (board.IsDrawByNoCaptureLimit()) {
                            std::cout << "Draw by No Capture Limit (40 plies without captures)!" << std::endl;
                        }
                        Fraction red_final, blue_final;
                        board.GetFinalScores(red_final, blue_final);
                        std::cout << "Final Scores - RED: " << red_final << " | BLUE: " << blue_final << std::endl;
                        if (red_final > blue_final) {
                            std::cout << "RED wins!" << std::endl;
                        } else if (blue_final > red_final) {
                            std::cout << "BLUE wins!" << std::endl;
                        } else {
                            std::cout << "Draw!" << std::endl;
                        }
                    } else {
                        board.PrintBoard();
                    }
                    break;
                }
            }
            if (!found) {
                std::cout << "Illegal move! Legal moves are:" << std::endl;
                for (size_t i = 0; i < legal_moves.size(); ++i) {
                    const auto& lm = legal_moves[i];
                    std::cout << "  " << i + 1 << ". (" << square_col(lm.from) << "," << square_row(lm.from) << ")";
                    for (Square sq : lm.steps) {
                        std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
                    }
                    std::cout << std::endl;
                }
            }
        } else if (cmd == "moves" || cmd == "legal") {
            auto legal_moves = MoveGen::GenerateLegalMoves(board);
            std::cout << "Legal moves (" << legal_moves.size() << "):" << std::endl;
            for (size_t i = 0; i < legal_moves.size(); ++i) {
                const auto& lm = legal_moves[i];
                std::cout << "  " << i + 1 << ". (" << square_col(lm.from) << "," << square_row(lm.from) << ")";
                for (Square sq : lm.steps) {
                    std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
                }
                if (lm.is_capture()) {
                    std::cout << " [Capture, Score Change: " << lm.score_change << "]";
                }
                std::cout << std::endl;
            }
        } else if (cmd == "fen") {
            std::cout << board.GetFen() << std::endl;
        } else if (cmd == "undo") {
            board.UndoMove();
            board.PrintBoard();
        } else {
            std::cout << "Unknown command: " << cmd << ". Type 'help' for details." << std::endl;
        }
    }

    return 0;
}