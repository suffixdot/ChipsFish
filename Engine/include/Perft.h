#pragma once
#include "Board.h"
#include <cstdint>

namespace Perft {
    // Counts the leaf nodes at a given depth
    std::uint64_t RunPerft(Board& board, int depth);

    // Runs a perft divide, printing the leaf nodes count for each legal move at root
    void RunDivide(Board& board, int depth);
}
