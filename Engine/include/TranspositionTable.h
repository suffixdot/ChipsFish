#pragma once
#include "Types.h"
#include "Fraction.h"
#include "Move.h"
#include <vector>
#include <cstdint>

enum TTFlag {
    TT_EXACT = 0,
    TT_LOWERBOUND = 1, // Beta cutoff (score >= beta)
    TT_UPPERBOUND = 2  // Alpha cutoff (score <= alpha)
};

struct TTEntry {
    std::uint64_t key = 0;
    Fraction score = Fraction(0);
    int depth = -1;
    TTFlag flag = TT_EXACT;
    Square move_from = SQ_NONE;
    Square move_to = SQ_NONE; // final destination
};

class TranspositionTable {
private:
    std::vector<TTEntry> table;
    size_t size_mask;

public:
    TranspositionTable(size_t num_entries = 262144); // 2^18 entries (~10MB)

    void Clear();
    void Store(std::uint64_t key, int depth, TTFlag flag, const Fraction& score, const Move& best_move);
    
    // Probe returns true if an entry with the exact key exists.
    // If it returns true, best_move_from and best_move_to are updated if a move was stored.
    // if use_score is set to true, the score is valid for direct cutoff or return.
    bool Probe(std::uint64_t key, int depth, Fraction alpha, Fraction beta, 
               Fraction& score, bool& use_score, Square& best_move_from, Square& best_move_to);
};
