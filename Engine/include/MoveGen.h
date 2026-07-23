#pragma once
#include "Board.h"
#include "Move.h"
#include <vector>

class MoveGen {
public:
    static std::vector<Move> GenerateLegalMoves(Board& board);
    static std::vector<Move> GenerateLegalMoves(Board& board, bool config_mid_move_promotion);
};
