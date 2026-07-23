#pragma once

enum class Color {
    NONE,
    RED,
    BLUE
};

inline Color operator~(Color c) {
    if (c == Color::RED) return Color::BLUE;
    if (c == Color::BLUE) return Color::RED;
    return Color::NONE;
}

enum class OpType {
    NONE,
    ADD,
    SUB,
    MUL,
    DIV
};

using Square = int;
constexpr Square SQ_NONE = -1;

inline Square make_square(int col, int row) {
    return row * 8 + col;
}

inline int square_col(Square sq) {
    return sq % 8;
}

inline int square_row(Square sq) {
    return sq / 8;
}

inline bool square_is_ok(Square sq) {
    return sq >= 0 && sq < 64;
}

inline bool square_is_playable(Square sq) {
    if (!square_is_ok(sq)) return false;
    return (square_row(sq) + square_col(sq)) % 2 == 1;
}
