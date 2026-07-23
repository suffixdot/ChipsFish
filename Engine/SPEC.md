{\rtf1\ansi\ansicpg1252\cocoartf2870
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\margl1440\margr1440\vieww29200\viewh15300\viewkind0
\pard\tx720\tx1440\tx2160\tx2880\tx3600\tx4320\tx5040\tx5760\tx6480\tx7200\tx7920\tx8640\pardirnatural\partightenfactor0

\f0\fs24 \cf0 # Rational Fractions Damath Engine Specification\
Version: 1.0\
\
## Purpose\
\
This project implements a competitive Damath engine for the Rational Fractions variant.\
\
The engine is responsible for:\
- Representing the board state.\
- Generating all legal moves.\
- Enforcing every official game rule.\
- Computing scores.\
- Searching for the strongest move.\
- Remaining completely independent from any GUI.\
\
The engine must never guess or modify game rules. If a rule is missing from this specification, implementation must stop until the specification is updated.\
\
---\
\
# Board\
\
Board size: 8 \'d7 8\
\
Only dark squares are playable.\
\
Coordinate system:\
Rows: 0-7\
Columns: 0-7\
\
Each square may contain:\
- Empty\
- Red piece\
- Blue piece\
\
Some playable squares contain an operation.\
\
Possible operations:\
\
+\
-\
\'d7\
\'f7\
\
The operation assigned to every playable square is fixed for the entire game.\
\
---\
\
# Players\
\
There are exactly two players.\
\
RED\
\
BLUE\
\
Players alternate turns.\
\
RED moves first.\
\
---\
\
# Pieces\
\
Every piece contains:\
\
Color\
Fraction value\
King status\
\
Example\
\
Red\
3/4\
King = false\
\
Each piece has exactly one owner.\
\
---\
\
# Fraction Rules\
\
Fractions are always stored in reduced form.\
\
Examples\
\
2/4 \uc0\u8594  1/2\
\
6/8 \uc0\u8594  3/4\
\
Denominator may never equal zero.\
\
Negative fractions produced by scoring are allowed.\
\
---\
\
# Initial Position\
\
The initial arrangement of every piece must exactly match the official Rational Fractions Damath setup.\
\
Each piece begins with its official fraction value.\
\
(The exact starting layout will be added separately.)\
\
---\
\
# Normal Movement\
\
A normal piece may move\
\
one diagonal square forward\
\
into an empty playable square.\
\
Normal movement never moves backward.\
\
---\
\
# Capturing\
\
Capturing is mandatory.\
\
If at least one capture exists,\
the player must perform a capture.\
\
A capture consists of\
\
jumping diagonally over one opponent piece\
\
landing on the immediately following empty square.\
\
The captured piece is removed immediately.\
\
Normal pieces may capture\
\
forward\
\
or backward.\
\
---\
\
# Multiple Captures\
\
After completing a capture,\
\
if another legal capture exists,\
\
the same piece must continue capturing.\
\
The sequence ends only when no additional capture exists.\
\
---\
\
# King (Dama)\
\
A piece becomes a King immediately after reaching the opponent's final row.\
\
Kings may move\
\
forward\
\
backward\
\
diagonally\
\
across any number of empty squares.\
\
Kings cannot jump over friendly pieces.\
\
---\
\
# King Capturing\
\
Kings may capture from any distance diagonally.\
\
The landing square may be any empty square beyond the captured piece on the same diagonal.\
\
If additional captures exist,\
\
the King must continue capturing.\
\
---\
\
# Capture Priority\
\
Priority rules are enforced exactly in this order.\
\
1.\
If any capture exists,\
a capture must be made.\
\
2.\
If any King can capture,\
a King capture must be chosen.\
\
3.\
If multiple capturing pieces remain,\
\
the move that captures the greatest number of opponent pieces must be chosen.\
\
If multiple moves still satisfy every rule,\
\
the player may choose any of them.\
\
---\
\
# Promotion\
\
Promotion occurs immediately after reaching the opponent's back rank.\
\
Whether promotion during a multi-capture immediately grants king movement in the same turn depends on the official tournament rules. This behavior should remain configurable until confirmed.\
\
---\
\
# Scoring\
\
Every capture immediately awards points.\
\
Score Formula\
\
CapturedScore\
\
=\
\
CapturingPieceValue\
\
(operation of landing square)\
\
CapturedPieceValue\
\
Examples\
\
9 lands on "-"\
\
capturing 10\
\
Score\
\
9 - 10\
\
=\
\
-1\
\
---\
\
# King Score Multipliers\
\
Normal captures Normal\
\
Multiplier = \'d71\
\
King captures Normal\
\
Multiplier = \'d72\
\
Normal captures King\
\
Multiplier = \'d72\
\
King captures King\
\
Multiplier = \'d74\
\
The multiplier applies after computing the operation.\
\
Example\
\
(3/4 \'d7 1/2)\
\
\'d7\
\
2\
\
---\
\
# Score Storage\
\
Each player has an accumulated score.\
\
Scores may become negative.\
\
Scores remain exact fractions.\
\
Fractions are simplified after every scoring operation.\
\
---\
\
# End Game\
\
The game immediately ends if\
\
A player has no remaining pieces.\
\
OR\
\
A player has no legal moves.\
\
Future support (not yet implemented)\
\
Five repeated moves with one remaining piece.\
\
Twenty-minute timer.\
\
Player surrender.\
\
Mutual agreement.\
\
---\
\
# Final Score\
\
When the game ends,\
\
FinalScore\
\
=\
\
AccumulatedCaptureScore\
\
+\
\
Sum(RemainingPieceValues)\
\
The player with the greater FinalScore wins.\
\
Equal FinalScores produce a draw.\
\
---\
\
# Move Timer\
\
Each move has a maximum thinking time of\
\
60 seconds.\
\
The engine must always return a move before the time expires.\
\
Random fallback behavior is a GUI responsibility,\
not an engine responsibility.\
\
---\
\
# Engine Requirements\
\
The engine must support\
\
GenerateLegalMoves()\
\
MakeMove()\
\
UndoMove()\
\
Evaluate()\
\
Search()\
\
LoadPosition()\
\
ClonePosition()\
\
---\
\
# Search\
\
The search algorithm must eventually support\
\
Negamax\
\
Alpha-Beta pruning\
\
Iterative Deepening\
\
Transposition Tables\
\
Move Ordering\
\
Time Management\
\
---\
\
# Code Rules\
\
The engine contains no GUI code.\
\
Every move must be completely reversible.\
\
Search must never permanently modify the board.\
\
No duplicated game logic.\
\
Every public method must have a single responsibility.\
\
All rules are implemented exactly once.\
\
---\
\
# Testing\
\
Every module must include automated tests.\
\
Minimum tests include\
\
Fraction arithmetic\
\
Move generation\
\
Forced captures\
\
King movement\
\
Multi-capturing\
\
Promotion\
\
Scoring\
\
Game over detection\
\
Final score computation\
\
Undo move correctness}