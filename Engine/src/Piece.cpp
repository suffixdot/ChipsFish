#include "Piece.h"
#include <cctype>

bool Piece::operator==(const Piece& other) const {
    return color == other.color && value == other.value && is_king == other.is_king;
}

bool Piece::operator!=(const Piece& other) const {
    return !(*this == other);
}

std::string Piece::to_string() const {
    if (color == Color::NONE) return ".";
    std::string s = (color == Color::RED ? "r" : "b");
    if (is_king) {
        s = (color == Color::RED ? "R" : "B");
    }
    return s + "(" + value.to_string() + ")";
}