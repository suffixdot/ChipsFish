#include "test_framework.h"
#include "Fraction.h"
#include "Board.h"
#include "MoveGen.h"
#include "Zobrist.h"
#include "Evaluate.h"
#include "Search.h"
#include "Perft.h"
#include "TranspositionTable.h"

void test_fraction_arithmetic() {
    // simplification
    Fraction f1(2, 4);
    ASSERT_EQ(f1.numerator(), 1);
    ASSERT_EQ(f1.denominator(), 2);

    Fraction f2(-6, 8);
    ASSERT_EQ(f2.numerator(), -3);
    ASSERT_EQ(f2.denominator(), 4);

    // arithmetic
    Fraction a(1, 2);
    Fraction b(3, 4);

    Fraction add = a + b; // 5/4
    ASSERT_EQ(add, Fraction(5, 4));

    Fraction sub = a - b; // -1/4
    ASSERT_EQ(sub, Fraction(-1, 4));

    Fraction mul = a * b; // 3/8
    ASSERT_EQ(mul, Fraction(3, 8));

    Fraction div = a / b; // 2/3
    ASSERT_EQ(div, Fraction(2, 3));
}

void test_starting_board() {
    Board board;
    // Check FEN serialization of start position matches default
    std::string start_fen = board.GetFen();
    Board board2;
    board2.LoadPosition(start_fen);
    ASSERT_EQ(board2.GetFen(), start_fen);

    // Check side to move is RED
    ASSERT_TRUE(board.GetSideToMove() == Color::RED);
}

void test_normal_moves() {
    Board board;
    // RED is side to move. Red pieces are at rows 0, 1, 2.
    // The front row of Red is Row 2.
    // Normal diagonal moves forward from row 2 pieces:
    // Red piece at (1,2) -> row 2, col 1. It can move to (0,3) or (2,3).
    // Let's verify move generator generates these moves.
    auto moves = MoveGen::GenerateLegalMoves(board);
    // Since it's the start of the game, there are no captures, so normal moves are generated.
    ASSERT_TRUE(!moves.empty());
    // All generated moves should not be captures
    for (const auto& m : moves) {
        ASSERT_TRUE(!m.is_capture());
    }
}

void test_forced_captures() {
    Board board;
    board.Clear();

    // Place a RED piece and a BLUE piece where RED must capture
    // RED at (1,2), BLUE at (2,3)
    board.SetPiece(make_square(1, 2), Piece{Color::RED, Fraction(3, 4), false});
    board.SetPiece(make_square(2, 3), Piece{Color::BLUE, Fraction(1, 2), false});
    board.SetSideToMove(Color::RED);

    auto moves = MoveGen::GenerateLegalMoves(board);
    // There is a capture available (1,2) -> (3,4) jumping over (2,3).
    // It should be the only generated move (or one of them if there are other captures, but no other pieces exist).
    ASSERT_EQ(moves.size(), 1);
    ASSERT_TRUE(moves[0].is_capture());
    ASSERT_EQ(moves[0].from, make_square(1, 2));
    ASSERT_EQ(moves[0].steps[0], make_square(3, 4));
}

void test_make_undo() {
    Board board;
    std::string initial_fen = board.GetFen();

    auto moves = MoveGen::GenerateLegalMoves(board);
    ASSERT_TRUE(!moves.empty());

    Move first = moves[0];
    board.MakeMove(first);
    ASSERT_TRUE(board.GetFen() != initial_fen);

    board.UndoMove();
    ASSERT_EQ(board.GetFen(), initial_fen);
}

void test_multi_captures() {
    Board board;
    board.Clear();

    // Set up a multi-capture for RED:
    // RED at (1, 2)
    // Opponent pieces at (2, 3) and (4, 5)
    board.SetPiece(make_square(1, 2), Piece{Color::RED, Fraction(9, 10), false});
    board.SetPiece(make_square(2, 3), Piece{Color::BLUE, Fraction(2, 10), false});
    board.SetPiece(make_square(4, 5), Piece{Color::BLUE, Fraction(8, 10), false});
    board.SetSideToMove(Color::RED);

    // Jumps:
    // 1. (1,2) -> (3,4) jumping over (2,3) [op at (3,4) is ×]
    // 2. (3,4) -> (5,6) jumping over (4,5) [op at (5,6) is ÷]
    auto moves = MoveGen::GenerateLegalMoves(board);
    ASSERT_EQ(moves.size(), 1);
    ASSERT_TRUE(moves[0].is_capture());
    ASSERT_EQ(moves[0].captured_squares.size(), 2);
    ASSERT_EQ(moves[0].steps.size(), 2);
    ASSERT_EQ(moves[0].steps[0], make_square(3, 4));
    ASSERT_EQ(moves[0].steps[1], make_square(5, 6));
}

void test_promotion() {
    Board board;
    board.Clear();

    // RED normal piece at (6,6) moving to (7,7) [back rank]
    board.SetPiece(make_square(6, 6), Piece{Color::RED, Fraction(1), false});
    board.SetSideToMove(Color::RED);

    auto moves = MoveGen::GenerateLegalMoves(board);
    ASSERT_TRUE(!moves.empty());
    // Find the move to (7,7)
    bool found_prom = false;
    for (const auto& m : moves) {
        if (m.steps[0] == make_square(7, 7)) {
            ASSERT_TRUE(m.promoted);
            found_prom = true;

            // Make the move and verify the piece becomes a King
            board.MakeMove(m);
            ASSERT_TRUE(board.GetPiece(make_square(7, 7)).is_king);
            board.UndoMove();
            ASSERT_TRUE(!board.GetPiece(make_square(7, 7)).is_king);
            break;
        }
    }
    ASSERT_TRUE(found_prom);
}

void test_zobrist_consistency() {
    Board board;
    std::uint64_t hash_start = board.GetHash();
    auto moves = MoveGen::GenerateLegalMoves(board);
    ASSERT_TRUE(!moves.empty());
    
    board.MakeMove(moves[0]);
    std::uint64_t hash_after = board.GetHash();
    ASSERT_TRUE(hash_start != hash_after);
    
    std::uint64_t hash_full = Zobrist::ComputeHash(board);
    ASSERT_EQ(hash_after, hash_full);
    
    board.UndoMove();
    ASSERT_EQ(board.GetHash(), hash_start);
}

void test_eval_symmetry() {
    Board board;
    Fraction red_perspective = board.Evaluate();
    
    board.SetSideToMove(Color::BLUE);
    Fraction blue_perspective = board.Evaluate();
    
    ASSERT_EQ(red_perspective + blue_perspective, Fraction(0));
}

void test_search_tactical() {
    Board board;
    board.Clear();
    board.SetPiece(make_square(1, 2), Piece{Color::RED, Fraction(9, 10), false});
    board.SetPiece(make_square(2, 3), Piece{Color::BLUE, Fraction(2, 10), false});
    board.SetSideToMove(Color::RED);
    
    TranspositionTable tt;
    Move m = Search::SearchBestMove(board, 3, 0, tt);
    ASSERT_TRUE(m.from == make_square(1, 2));
    ASSERT_TRUE(!m.steps.empty() && m.steps[0] == make_square(3, 4));
}

void test_perft_counts() {
    Board board;
    std::uint64_t nodes1 = Perft::RunPerft(board, 1);
    ASSERT_EQ(nodes1, 7);
    
    std::uint64_t nodes2 = Perft::RunPerft(board, 2);
    ASSERT_TRUE(nodes2 > 0);
}

void test_game_over_and_final() {
    Board board;
    board.Clear();
    ASSERT_TRUE(board.IsGameOver());
    
    board.SetPiece(make_square(0, 7), Piece{Color::BLUE, Fraction(1), false});
    board.SetPiece(make_square(2, 7), Piece{Color::RED, Fraction(1), true}); // Promoted King value 1 -> 2
    board.SetSideToMove(Color::BLUE);
    board.SetPiece(make_square(1, 6), Piece{Color::RED, Fraction(1), false}); // Normal value 1
    board.SetPiece(make_square(2, 5), Piece{Color::RED, Fraction(1), false}); // Normal value 1
    ASSERT_TRUE(board.IsGameOver());
    
    board.SetRedScore(Fraction(5));
    board.SetBlueScore(Fraction(3));
    Fraction red_final, blue_final;
    board.GetFinalScores(red_final, blue_final);
    // Red: capture (5) + king(2) + normal(1) + normal(1) = 9
    // Blue: capture (3) + normal(1) = 4
    ASSERT_EQ(red_final, Fraction(9));
    ASSERT_EQ(blue_final, Fraction(4));
}

void test_repetition_draw() {
    Board board;
    board.Clear();
    board.SetPiece(make_square(1, 2), Piece{Color::RED, Fraction(1), true});
    board.SetPiece(make_square(5, 4), Piece{Color::BLUE, Fraction(1), true});
    board.SetSideToMove(Color::RED);
    // Refresh hash since we modified board contents
    board.LoadPosition(board.GetFen());

    auto find_move = [](Board& b, Square from, Square to) {
        auto moves = MoveGen::GenerateLegalMoves(b);
        for (const auto& m : moves) {
            Square dest = m.steps.empty() ? m.from : m.steps.back();
            if (m.from == from && dest == to) {
                return m;
            }
        }
        std::cout << "DEBUG: find_move failed to find (" << square_col(from) << "," << square_row(from)
                  << ") -> (" << square_col(to) << "," << square_row(to) << ")" << std::endl;
        std::cout << "Side to move: " << (b.GetSideToMove() == Color::RED ? "RED" : "BLUE") << std::endl;
        std::cout << "Legal moves generated:" << std::endl;
        for (const auto& m : moves) {
            std::cout << "  (" << square_col(m.from) << "," << square_row(m.from) << ") -> ("
                      << square_col(m.steps.back()) << "," << square_row(m.steps.back()) << ")" << std::endl;
        }
        return Move{};
    };

    board.MakeMove(find_move(board, make_square(1, 2), make_square(0, 3)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(5, 4), make_square(6, 5)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(0, 3), make_square(1, 2)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(6, 5), make_square(5, 4)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(1, 2), make_square(0, 3)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(5, 4), make_square(6, 5)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(0, 3), make_square(1, 2)));
    ASSERT_TRUE(!board.IsGameOver());

    board.MakeMove(find_move(board, make_square(6, 5), make_square(5, 4)));
    ASSERT_TRUE(board.IsDrawByRepetition());
    ASSERT_TRUE(board.IsGameOver());
}

void test_sequential_moves_loading() {
    Board board;
    std::vector<std::string> moves_to_play = {"1,2", "2,3", "6,5", "5,4"};
    
    auto parse_sq = [](const std::string& str, Square& sq) {
        size_t comma = str.find(',');
        if (comma == std::string::npos) return false;
        int col = std::stoi(str.substr(0, comma));
        int row = std::stoi(str.substr(comma + 1));
        sq = make_square(col, row);
        return true;
    };

    size_t token_idx = 0;
    while (token_idx < moves_to_play.size()) {
        auto legal_moves = MoveGen::GenerateLegalMoves(board);
        bool found = false;
        for (const auto& m : legal_moves) {
            size_t needed_tokens = 1 + m.steps.size();
            if (token_idx + needed_tokens <= moves_to_play.size()) {
                Square start_sq;
                if (parse_sq(moves_to_play[token_idx], start_sq) && start_sq == m.from) {
                    bool steps_match = true;
                    for (size_t s = 0; s < m.steps.size(); ++s) {
                        Square step_sq;
                        if (!parse_sq(moves_to_play[token_idx + 1 + s], step_sq) || step_sq != m.steps[s]) {
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
            std::cout << "DEBUG: token_idx=" << token_idx << ", side_to_move=" << (board.GetSideToMove() == Color::RED ? "RED" : "BLUE") << std::endl;
            std::cout << "Target start: " << moves_to_play[token_idx] << std::endl;
            std::cout << "Legal moves generated:" << std::endl;
            for (const auto& m : legal_moves) {
                std::cout << "  (" << square_col(m.from) << "," << square_row(m.from) << ")";
                for (Square sq : m.steps) {
                    std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
                }
                std::cout << std::endl;
            }
        }
        ASSERT_TRUE(found);
    }

    ASSERT_TRUE(board.GetPiece(make_square(1, 2)).color == Color::NONE);
    ASSERT_TRUE(board.GetPiece(make_square(2, 3)).color == Color::RED);
    ASSERT_TRUE(board.GetPiece(make_square(6, 5)).color == Color::NONE);
    ASSERT_TRUE(board.GetPiece(make_square(5, 4)).color == Color::BLUE);
}

void test_killer_move_ordering() {
    Move quiet1;
    quiet1.from = make_square(1, 2);
    quiet1.steps = {make_square(2, 3)};
    
    Move quiet2;
    quiet2.from = make_square(3, 2);
    quiet2.steps = {make_square(4, 3)};

    Move capture;
    capture.from = make_square(1, 2);
    capture.steps = {make_square(3, 4)};
    capture.captured_squares = {make_square(2, 3)};
    capture.score_change = Fraction(2, 10);

    Search::SetKillerMoveForTest(1, quiet1, 0);
    Search::SetKillerMoveForTest(1, quiet2, 1);

    int score_cap = Search::ScoreMoveForTest(capture, SQ_NONE, SQ_NONE, 1);
    int score_k0 = Search::ScoreMoveForTest(quiet1, SQ_NONE, SQ_NONE, 1);
    int score_k1 = Search::ScoreMoveForTest(quiet2, SQ_NONE, SQ_NONE, 1);
    
    Move ordinary;
    ordinary.from = make_square(5, 2);
    ordinary.steps = {make_square(6, 3)};
    int score_ord = Search::ScoreMoveForTest(ordinary, SQ_NONE, SQ_NONE, 1);

    ASSERT_TRUE(score_cap > score_k0);
    ASSERT_TRUE(score_k0 > score_k1);
    ASSERT_TRUE(score_k1 > score_ord);
}

void test_one_piece_repetition_draw() {
    Board board;
    board.Clear();
    // RED has 1 piece: King at (1,2)
    board.SetPiece(make_square(1, 2), Piece{Color::RED, Fraction(1), true});
    // BLUE has 2 pieces: King at (7,6) and King at (1,0)
    board.SetPiece(make_square(7, 6), Piece{Color::BLUE, Fraction(1), true});
    board.SetPiece(make_square(1, 0), Piece{Color::BLUE, Fraction(1), true});
    board.SetSideToMove(Color::RED);
    // Refresh hash and setup
    board.LoadPosition(board.GetFen());

    auto find_move = [](Board& b, Square from, Square to) {
        auto moves = MoveGen::GenerateLegalMoves(b);
        for (const auto& m : moves) {
            Square dest = m.steps.empty() ? m.from : m.steps.back();
            if (m.from == from && dest == to) {
                return m;
            }
        }
        return Move{};
    };

    // BLUE King 1 path using only capture-free, allowed squares:
    // (7,6), (6,5), (5,4), (6,3), (5,2), (4,1), (5,0), (6,1), (7,2), (6,3), (7,4)
    std::vector<Square> blue_path = {
        make_square(7, 6),
        make_square(6, 5),
        make_square(5, 4),
        make_square(6, 3),
        make_square(5, 2),
        make_square(4, 1),
        make_square(5, 0),
        make_square(6, 1),
        make_square(7, 2),
        make_square(6, 3),
        make_square(7, 4)
    };

    // We make 10 pairs of moves.
    // RED will move (1,2) -> (0,3) and (0,3) -> (1,2).
    // BLUE will move along the blue_path: from blue_path[step] to blue_path[step + 1].
    for (int step = 0; step < 10; ++step) {
        // RED move
        Square red_from = (step % 2 == 0) ? make_square(1, 2) : make_square(0, 3);
        Square red_to = (step % 2 == 0) ? make_square(0, 3) : make_square(1, 2);
        Move red_m = find_move(board, red_from, red_to);
        ASSERT_TRUE(red_m.from != SQ_NONE);
        board.MakeMove(red_m);

        // Check if one-piece repetition draw triggers after RED's 10th move (step = 9)
        if (step == 9) {
            ASSERT_TRUE(board.IsDrawByOnePieceRepetition());
            ASSERT_TRUE(board.IsGameOver());
            break;
        }

        ASSERT_TRUE(!board.IsGameOver());

        // BLUE move
        Square blue_from = blue_path[step];
        Square blue_to = blue_path[step + 1];
        Move blue_m = find_move(board, blue_from, blue_to);
        ASSERT_TRUE(blue_m.from != SQ_NONE);
        board.MakeMove(blue_m);

        ASSERT_TRUE(!board.IsGameOver());
    }
}

void test_terminal_scores() {
    // 1. RED has higher score, BLUE has 0 pieces (terminal for BLUE)
    {
        Board board;
        board.Clear();
        board.SetRedScore(Fraction(50));
        board.SetBlueScore(Fraction(10));
        board.SetPiece(make_square(0, 7), Piece{Color::RED, Fraction(5), false});
        board.SetSideToMove(Color::BLUE); // BLUE turn, 0 legal moves

        Fraction term_score_blue = Search::GetTerminalScore(board, 0);
        // BLUE side to move, but BLUE final (10) < RED final (55) -> BLUE loses (-1000000)
        ASSERT_TRUE(term_score_blue.numerator() < -500000);

        board.SetSideToMove(Color::RED);
        Fraction term_score_red = Search::GetTerminalScore(board, 0);
        // RED side to move, RED final (55) > BLUE final (10) -> RED wins (+1000000)
        ASSERT_TRUE(term_score_red.numerator() > 500000);
    }

    // 2. BLUE has higher score, RED has 0 pieces (terminal for RED)
    {
        Board board;
        board.Clear();
        board.SetRedScore(Fraction(10));
        board.SetBlueScore(Fraction(50));
        board.SetPiece(make_square(7, 0), Piece{Color::BLUE, Fraction(5), false});
        board.SetSideToMove(Color::RED); // RED turn, 0 legal moves

        Fraction term_score_red = Search::GetTerminalScore(board, 0);
        // RED side to move, RED final (10) < BLUE final (55) -> RED loses (-1000000)
        ASSERT_TRUE(term_score_red.numerator() < -500000);
    }
}

int main() {
    RUN_TEST(test_fraction_arithmetic);
    RUN_TEST(test_starting_board);
    RUN_TEST(test_normal_moves);
    RUN_TEST(test_forced_captures);
    RUN_TEST(test_make_undo);
    RUN_TEST(test_multi_captures);
    RUN_TEST(test_promotion);
    RUN_TEST(test_zobrist_consistency);
    RUN_TEST(test_eval_symmetry);
    RUN_TEST(test_search_tactical);
    RUN_TEST(test_perft_counts);
    RUN_TEST(test_game_over_and_final);
    RUN_TEST(test_repetition_draw);
    RUN_TEST(test_sequential_moves_loading);
    RUN_TEST(test_killer_move_ordering);
    RUN_TEST(test_one_piece_repetition_draw);
    RUN_TEST(test_terminal_scores);

    std::cout << "\nTest Results: " << g_passed_tests << " Passed, " << g_failed_tests << " Failed." << std::endl;
    return g_failed_tests > 0 ? 1 : 0;
}
