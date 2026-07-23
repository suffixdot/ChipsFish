#pragma once
#include "Types.h"
#include <cstdint>

class Board;

namespace Zobrist {
    void Initialize();
    std::uint64_t ComputeHash(const Board& board);
    std::uint64_t GetPieceKey(Square sq, Color color, bool is_king);
    std::uint64_t GetSideKey();
}
