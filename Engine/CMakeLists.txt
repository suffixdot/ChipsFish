cmake_minimum_required(VERSION 3.12)
project(DamathEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(include)

# Source files
set(SOURCES
    src/Fraction.cpp
    src/Piece.cpp
    src/Board.cpp
    src/MoveGen.cpp
    src/Zobrist.cpp
    src/TranspositionTable.cpp
    src/Evaluate.cpp
    src/Search.cpp
    src/Perft.cpp
)

# Engine CLI binary
add_executable(damath_engine ${SOURCES} src/main.cpp)

# Tests binary
add_executable(damath_tests ${SOURCES} tests/main.cpp)