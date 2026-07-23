#include "Evaluate.h"

namespace Evaluate {

Fraction EvaluateBoard(const Board& board) {
    Fraction red_eval(0);
    Fraction blue_eval(0);

    const Fraction KING_BONUS(2, 1);
    const Fraction ADVANCEMENT_BONUS_STEP(1, 10);
    const Fraction CENTER_BONUS(1, 20);

    for (int sq = 0; sq < 64; ++sq) {
        const Piece& p = board.GetPiece(sq);
        if (p.color == Color::RED) {
            red_eval = red_eval + p.value;
            if (p.is_king) {
                red_eval = red_eval + KING_BONUS;
            } else {
                int row = square_row(sq);
                red_eval = red_eval + (ADVANCEMENT_BONUS_STEP * Fraction(row));
            }
            int col = square_col(sq);
            if (col >= 2 && col <= 5) {
                red_eval = red_eval + CENTER_BONUS;
            }
        } else if (p.color == Color::BLUE) {
            blue_eval = blue_eval + p.value;
            if (p.is_king) {
                blue_eval = blue_eval + KING_BONUS;
            } else {
                int row = square_row(sq);
                blue_eval = blue_eval + (ADVANCEMENT_BONUS_STEP * Fraction(7 - row));
            }
            int col = square_col(sq);
            if (col >= 2 && col <= 5) {
                blue_eval = blue_eval + CENTER_BONUS;
            }
        }
    }

    red_eval = red_eval + board.GetRedScore();
    blue_eval = blue_eval + board.GetBlueScore();

    if (board.GetSideToMove() == Color::RED) {
        return red_eval - blue_eval;
    } else {
        return blue_eval - red_eval;
    }
}

} // namespace Evaluate
