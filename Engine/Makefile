CXX = clang++
CXXFLAGS = -std=c++17 -O3 -Iinclude -Wall -Wextra

SOURCES = src/Fraction.cpp src/Piece.cpp src/Board.cpp src/MoveGen.cpp \
          src/Zobrist.cpp src/TranspositionTable.cpp src/Evaluate.cpp \
          src/Search.cpp src/Perft.cpp

.PHONY: all clean test gui

all: damath_engine damath_tests

damath_engine: $(SOURCES) src/main.cpp
	$(CXX) $(CXXFLAGS) $(SOURCES) src/main.cpp -o damath_engine

damath_tests: $(SOURCES) tests/main.cpp
	$(CXX) $(CXXFLAGS) $(SOURCES) tests/main.cpp -o damath_tests

clean:
	rm -f damath_engine damath_tests

test: damath_tests
	./damath_tests

gui: damath_engine
	python3 gui_server.py

