#pragma once
#include "Types.h"
#include "Piece.h"
#include <vector>

struct Move {
    Square from = SQ_NONE;
    std::vector<Square> steps;
    std::vector<Square> captured_squares;
    std::vector<Piece> captured_pieces;
    std::vector<Fraction> step_scores;
    bool promoted = false;
    Fraction score_change = Fraction(0);

    bool is_capture() const {
        return !captured_squares.empty();
    }

    bool operator==(const Move& other) const {
        return from == other.from &&
               steps == other.steps &&
               captured_squares == other.captured_squares &&
               captured_pieces == other.captured_pieces &&
               step_scores == other.step_scores &&
               promoted == other.promoted &&
               score_change == other.score_change;
    }

    bool operator!=(const Move& other) const {
        return !(*this == other);
    }
};
