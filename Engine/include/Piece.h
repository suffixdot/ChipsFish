#pragma once
#include "Types.h"
#include "Fraction.h"
#include <string>

struct Piece {
    Color color = Color::NONE;
    Fraction value = Fraction(0);
    bool is_king = false;

    bool operator==(const Piece& other) const;
    bool operator!=(const Piece& other) const;

    std::string to_string() const;
};