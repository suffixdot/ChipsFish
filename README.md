# 🐟 ChipsFish

> **The #1 Damath Engine, Interactive Game Suite & Tablebase Solver**

ChipsFish is a high-performance engine, interactive web suite, and standalone game solver designed specifically for official DepEd Damath variants (Counting, Whole Number, Fraction, Integer, Rational, Radical, Polynomial, and Thermo Sci-Dama).

---

## ⚡ Quick Start

### 1. Interactive Game GUI (Play & Practice)
Launch the primary game website to play against the AI, PvP, or AI-vs-AI on `http://localhost:8080`:

```bash
./start_gui.command
```

### 2. Standalone Solver & Tablebase Analyzer
Launch the dedicated tablebase solver to analyze positions, view candidate moves, and export `.txt` analysis archives on `http://localhost:8081`:

```bash
./start_analyzer_gui.command
```

---

## ✨ Key Features

### 🎮 Interactive Game Suite (`Engine/play`)
- **Unbeatable Engine Logic**: Evaluates deep tactical capture sequences, king priority rules, and multi-step jump combinations.
- **Position Memory & Opening Book**: Caches deep search trees to build a master opening book over time.
- **Live Evaluation Bar & Best-Move Hints**: Displays dynamic win/advantage meters and glowing arrow overlays.
- **Multiple Game Modes**: Player vs. AI (PvAI with customizable depth/time limits), Player vs. Player (PvP), and AI vs. AI (AIvAI).
- **Sound Effects & History**: Custom audio synthesizer, move history timeline, and FEN position loader.

### 🧠 Solver & Tablebase Analyzer (`Engine/analyzer`)
- **Dedicated Solving Workspace**: Clean, distraction-free board interface built specifically for engine analysis.
- **Multi-PV Candidate Lines**: Ranks all legal moves for any position with individual evaluation scores and interactive hover previews.
- **Glowing Best-Move Arrows**: Dynamic SVG arrows with intermediate jump points for multi-hop capture sequences.
- **Tablebase Keepsake System**: Automatically archives all evaluated positions across variants into persistent storage.
- **One-Click Export to `.txt` & `.json`**: Download formatted `.txt` archives of all analyzed positions, evaluations, and candidate lines, or export/import JSON backups.
- **Auto-Solve Mode**: Continuously explores and solves game branches step-by-step, logging every state into the Tablebase.

### 🏆 Full DepEd Variant Support (All 8 Variants)
1. **Counting Damath** (Grades 1–2)
2. **Whole Number Damath** (Grades 3–4)
3. **Fraction Damath** (Grades 5–6)
4. **Integer Damath** (Grade 7)
5. **Rational Damath** (Grade 8)
6. **Radical Damath** (Grade 9)
7. **Polynomial Damath** (Grade 10)
8. **Thermo Sci-Dama** (Grade 10 — *lower score wins!*)

---

## 🛠️ Architecture

* **Unified Engine Core**: Both the Game Suite and Solver share a single source of truth (`Engine/play/engine.worker.js`), ensuring that any engine heuristic or search algorithm improvement is instantly shared across all interfaces without code duplication.
* **Pure In-Browser Web Worker**: Runs multithreaded AI search and BigInt rational arithmetic directly in the browser with zero external dependencies.

---

## 👤 Project Leadership & Author

ChipsFish was created, designed, and is maintained by **[@suffixdot](https://github.com/suffixdot)** (Project Lead & Original Author) with generative AI for assistance on the code.

---

## 📜 License

This project is licensed under the **[GNU General Public License v3.0](LICENSE)** — Copyright (c) 2026 **suffixdot** ([@suffixdot](https://github.com/suffixdot)).

*Under the GPL-3.0 copyleft license, anyone is free to view, use, or study this code, but any modified versions or derivative works MUST also be open-sourced under GPL-3.0 with full attribution to `@suffixdot`.*
