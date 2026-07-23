#include "Zobrist.h"
#include "Board.h"
#include <random>

namespace {
    std::uint64_t piece_keys[64][4];
    std::uint64_t side_key;
    bool initialized = false;

    int get_piece_index(Color color, bool is_king) {
        if (color == Color::RED) {
            return is_king ? 1 : 0;
        } else if (color == Color::BLUE) {
            return is_king ? 3 : 2;
        }
        return -1;
    }
}

namespace Zobrist {

void Initialize() {
    if (initialized) return;

    // Use a fixed seed for deterministic / reproducible hashing
    std::mt19937_64 rng(0x9876543210FEDCBAULL);
    std::uniform_int_distribution<std::uint64_t> dist;

    for (int sq = 0; sq < 64; ++sq) {
        for (int p = 0; p < 4; ++p) {
            piece_keys[sq][p] = dist(rng);
        }
    }
    side_key = dist(rng);
    initialized = true;
}

std::uint64_t ComputeHash(const Board& board) {
    Initialize();
    std::uint64_t hash = 0;

    for (int sq = 0; sq < 64; ++sq) {
        const Piece& p = board.GetPiece(sq);
        if (p.color != Color::NONE) {
            int p_idx = get_piece_index(p.color, p.is_king);
            if (p_idx != -1) {
                hash ^= piece_keys[sq][p_idx];
            }
        }
    }

    if (board.GetSideToMove() == Color::BLUE) {
        hash ^= side_key;
    }

    return hash;
}

std::uint64_t GetPieceKey(Square sq, Color color, bool is_king) {
    Initialize();
    int p_idx = get_piece_index(color, is_king);
    if (p_idx == -1 || sq < 0 || sq >= 64) return 0;
    return piece_keys[sq][p_idx];
}

std::uint64_t GetSideKey() {
    Initialize();
    return side_key;
}

} // namespace Zobrist
