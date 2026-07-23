#pragma once
#include "Board.h"
#include "Fraction.h"

namespace Evaluate {
    // Returns the static evaluation of the board from the perspective of the side to move.
    // Positive values favor the side to move, negative values favor the opponent.
    Fraction EvaluateBoard(const Board& board);
}
