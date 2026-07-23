# Implementation Plan - HTML GUI for Damath Engine

This plan describes the creation of a premium web-based graphical user interface (GUI) for the Rational Fractions Damath Engine. 

Since Node.js is not installed on the system, we will use a lightweight, zero-dependency Python 3 bridge server to serve static assets and communicate with the compiled C++ `damath_engine` binary.

---

## User Review Required

> [!IMPORTANT]
> - **Zero-Dependency Server:** The Python bridge will run out-of-the-box using macOS standard libraries (no `pip install` needed).
> - **Game Modes:** The GUI will support Player vs. AI (play as RED or BLUE), Player vs. Player (local hotseat), and AI vs. AI (watch the engine play against itself).
> - **Integration:** The C++ engine remains the single source of truth. The frontend will sync the board by querying legal moves and requesting AI moves via stdout/stdin.

---

## Open Questions

> [!NOTE]
> - **Drag-and-Drop vs. Click-to-Move:** We will implement **Click-to-Move** as the default (click piece, then click highlighted destination square), which is highly responsive and mobile-friendly, with optional drag-and-drop support.
> - **AI Thinking Visualizer:** Should the interface display the raw search logs (depth, nodes, evaluation score) from the engine during its search? We propose a sliding "Engine Output Console" at the bottom of the screen.

---

## Proposed Changes

### 1. Build & Execution Automation

#### [MODIFY] [Makefile](file:///Users/elviespua/Desktop/DamathEngine/Makefile)
- Adds a `make gui` target that builds the binaries and launches the Python server automatically.

#### [NEW] [gui_server.py](file:///Users/elviespua/Desktop/DamathEngine/gui_server.py)
- A lightweight HTTP and subprocess server using python's `http.server`.
- Exposes a POST endpoint `/api/command` to securely execute commands (like `position` and `go`) on the C++ `damath_engine` binary and return stdout.
- Serves static assets from the `gui/` directory.

---

### 2. Frontend Layout & Aesthetics

#### [NEW] [gui/index.html](file:///Users/elviespua/Desktop/DamathEngine/gui/index.html)
- Main layout structured with HTML5 semantic tags.
- Includes board container, game control panel, scoreboards (showing fraction scores), and engine output window.
- Embeds Google Fonts (Outfit and Inter) and font icons.

#### [NEW] [gui/index.css](file:///Users/elviespua/Desktop/DamathEngine/gui/index.css)
- Premium dark theme design with deep indigo and obsidian glassmorphism surfaces.
- **Color Palette:**
  - Board dark squares: Deep navy/purple gray.
  - RED pieces: Amber/Crimson glowing gradient.
  - BLUE pieces: Cyan/Teal glowing gradient.
- Centered, stylized mathematical operators (`+`, `-`, `×`, `÷`) on corresponding squares.
- Animations for piece selection, sliding movements, jump captures (fade/shrink), active turn glow, and win screens.

#### [NEW] [gui/index.js](file:///Users/elviespua/Desktop/DamathEngine/gui/index.js)
- Manages the client-side game state (board representation, turn, score).
- Implements interactive piece selection, legal move highlighting, and sound effects (using web audio synth).
- Synchronizes game actions with the engine backend.
- Renders the interactive Chess-style evaluation bar.
- Streams engine search progress (depth, nodes, PV line) to the UI console.

---

## Verification Plan

### Automated Build Check
Build and verify the engine binary compiles clean:
```bash
make clean && make
```

### Manual Verification
1. Run `python3 gui_server.py` (or `make gui`).
2. Open `http://localhost:8000` in the browser.
3. Start a "Player vs. AI" game as RED:
   - Make a move and check if the engine generates a correct, legal response.
   - Verify that mandatory captures are enforced (non-captures are blocked when a jump is available).
4. Start an "AI vs. AI" game:
   - Observe the engine playing against itself.
   - Verify that the game status updates, scores accumulate as fractions, and the game correctly ends on threefold repetition, 1-piece sequence repetition, or no moves.
