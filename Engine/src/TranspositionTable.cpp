#include "TranspositionTable.h"

TranspositionTable::TranspositionTable(size_t num_entries) {
    // Ensure size is a power of 2 for fast masking
    size_t size = 1;
    while (size < num_entries) {
        size <<= 1;
    }
    table.resize(size);
    size_mask = size - 1;
}

void TranspositionTable::Clear() {
    for (auto& entry : table) {
        entry.key = 0;
        entry.depth = -1;
        entry.score = Fraction(0);
        entry.move_from = SQ_NONE;
        entry.move_to = SQ_NONE;
    }
}

void TranspositionTable::Store(std::uint64_t key, int depth, TTFlag flag, const Fraction& score, const Move& best_move) {
    size_t index = key & size_mask;
    TTEntry& entry = table[index];

    // Replacement strategy: Always replace if it's a different position (collision)
    // Or if the new search depth is greater or equal to the stored depth.
    if (entry.key != key || depth >= entry.depth) {
        entry.key = key;
        entry.depth = depth;
        entry.flag = flag;
        entry.score = score;
        
        if (best_move.from != SQ_NONE) {
            entry.move_from = best_move.from;
            entry.move_to = best_move.steps.empty() ? best_move.from : best_move.steps.back();
        } else {
            entry.move_from = SQ_NONE;
            entry.move_to = SQ_NONE;
        }
    }
}

bool TranspositionTable::Probe(std::uint64_t key, int depth, Fraction alpha, Fraction beta, 
                               Fraction& score, bool& use_score, Square& best_move_from, Square& best_move_to) {
    size_t index = key & size_mask;
    const TTEntry& entry = table[index];

    use_score = false;
    best_move_from = SQ_NONE;
    best_move_to = SQ_NONE;

    if (entry.key == key && entry.depth != -1) {
        best_move_from = entry.move_from;
        best_move_to = entry.move_to;

        if (entry.depth >= depth) {
            if (entry.flag == TT_EXACT) {
                score = entry.score;
                use_score = true;
                return true;
            }
            if (entry.flag == TT_LOWERBOUND) {
                if (entry.score >= beta) {
                    score = entry.score;
                    use_score = true;
                    return true;
                }
            }
            if (entry.flag == TT_UPPERBOUND) {
                if (entry.score <= alpha) {
                    score = entry.score;
                    use_score = true;
                    return true;
                }
            }
        }
        return true;
    }

    return false;
}
