#include "Evaluate.h"

namespace Evaluate {

Fraction EvaluateBoard(const Board& board, const std::string& variant) {
    Fraction red_eval(0);
    Fraction blue_eval(0);

    const Fraction KING_BONUS(2, 1);
    const Fraction ADVANCEMENT_BONUS_STEP(1, 10);
    const Fraction CENTER_BONUS(1, 20);
    const Fraction OPERATOR_MUL_DIV_BONUS(1, 15);

    bool is_thermo = (variant == "thermo");

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
            OpType op = board.GetOperator(sq);
            if (op == OpType::MUL || op == OpType::DIV) {
                red_eval = red_eval + OPERATOR_MUL_DIV_BONUS;
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
            OpType op = board.GetOperator(sq);
            if (op == OpType::MUL || op == OpType::DIV) {
                blue_eval = blue_eval + OPERATOR_MUL_DIV_BONUS;
            }
        }
    }

    red_eval = red_eval + board.GetRedScore();
    blue_eval = blue_eval + board.GetBlueScore();

    if (is_thermo) {
        // Thermo Sci-Dama: lower score wins
        if (board.GetSideToMove() == Color::RED) {
            return blue_eval - red_eval;
        } else {
            return red_eval - blue_eval;
        }
    } else {
        if (board.GetSideToMove() == Color::RED) {
            return red_eval - blue_eval;
        } else {
            return blue_eval - red_eval;
        }
    }
}

} // namespace Evaluate
