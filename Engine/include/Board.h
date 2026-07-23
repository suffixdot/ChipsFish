#pragma once
#include "Types.h"
#include "Fraction.h"
#include "Piece.h"
#include "Move.h"
#include <array>
#include <vector>
#include <string>
#include <cstdint>

struct BoardState {
    Color side_to_move = Color::NONE;
    Fraction red_score = Fraction(0);
    Fraction blue_score = Fraction(0);
    std::uint64_t hash = 0;
};

class Board {
private:
    std::array<Piece, 64> board;
    std::array<OpType, 64> operators;
    Color side_to_move = Color::RED;
    Fraction red_score = Fraction(0);
    Fraction blue_score = Fraction(0);
    std::uint64_t current_hash = 0;
    std::vector<BoardState> history;
    std::vector<Move> move_history;
    bool mid_move_promotion = false;

    void init_operators();
    void init_starting_position();

public:
    Board();

    void Clear();
    void LoadPosition(const std::string& fen);
    std::string GetFen() const;

    const Piece& GetPiece(Square sq) const { return board[sq]; }
    void SetPiece(Square sq, const Piece& p) { board[sq] = p; }

    OpType GetOperator(Square sq) const { return operators[sq]; }
    void SetOperator(Square sq, OpType op) { operators[sq] = op; }

    Color GetSideToMove() const { return side_to_move; }
    void SetSideToMove(Color c) { side_to_move = c; }

    Fraction GetRedScore() const { return red_score; }
    Fraction GetBlueScore() const { return blue_score; }
    void SetRedScore(const Fraction& f) { red_score = f; }
    void SetBlueScore(const Fraction& f) { blue_score = f; }

    std::uint64_t GetHash() const { return current_hash; }

    const std::vector<Move>& GetMoveHistory() const { return move_history; }

    bool GetMidMovePromotion() const { return mid_move_promotion; }
    void SetMidMovePromotion(bool b) { mid_move_promotion = b; }

    void MakeMove(const Move& m);
    void UndoMove();

    void PrintBoard() const;

    bool IsDrawByRepetition() const;
    bool IsDrawByOnePieceRepetition() const;
    bool IsDrawByNoCaptureLimit() const;
    bool IsGameOver() const;
    void GetFinalScores(Fraction& red_final, Fraction& blue_final) const;

    Fraction Evaluate() const;
    Move Search(int depth_or_time_ms);
};