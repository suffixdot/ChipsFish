#include "Perft.h"
#include "MoveGen.h"
#include <iostream>
#include <chrono>

namespace Perft {

std::uint64_t RunPerft(Board& board, int depth) {
    if (depth <= 0) {
        return 1ULL;
    }

    auto moves = MoveGen::GenerateLegalMoves(board);
    if (depth == 1) {
        return moves.size();
    }

    std::uint64_t total = 0;
    for (const auto& m : moves) {
        board.MakeMove(m);
        total += RunPerft(board, depth - 1);
        board.UndoMove();
    }

    return total;
}

void RunDivide(Board& board, int depth) {
    if (depth <= 0) return;

    auto moves = MoveGen::GenerateLegalMoves(board);
    std::uint64_t grand_total = 0;

    auto start_time = std::chrono::steady_clock::now();

    for (const auto& m : moves) {
        board.MakeMove(m);
        std::uint64_t count = RunPerft(board, depth - 1);
        board.UndoMove();

        grand_total += count;

        std::cout << "(" << square_col(m.from) << "," << square_row(m.from) << ")";
        for (Square sq : m.steps) {
            std::cout << " -> (" << square_col(sq) << "," << square_row(sq) << ")";
        }
        std::cout << ": " << count << std::endl;
    }

    auto end_time = std::chrono::steady_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time).count();

    std::cout << "\nTotal nodes: " << grand_total << std::endl;
    std::cout << "Time: " << elapsed << " ms" << std::endl;
}

} // namespace Perft
