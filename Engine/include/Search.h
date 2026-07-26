#pragma once
#include "Board.h"
#include "Move.h"
#include "TranspositionTable.h"

namespace Search {
    // Searches the board for the best move.
    // If depth_limit > 0, searches up to that depth.
    // If time_limit_ms > 0, searches using iterative deepening until time expires.
    // Prints search info/stats to stdout.
    Move SearchBestMove(Board& board, int depth_limit, int time_limit_ms, TranspositionTable& tt);

    // Helper to get the terminal score if the game is over in the current board state.
    Fraction GetTerminalScore(const Board& board, int depth_from_root = 0);

    int ScoreMoveForTest(const Move& m, Square tt_from, Square tt_to, int depth_from_root);
    void SetKillerMoveForTest(int depth, const Move& m, int slot);
}
