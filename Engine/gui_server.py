#!/usr/bin/env python3
import http.server
import socketserver
import subprocess
import json
import re
import os
import urllib.parse
import threading
import queue
import time

PORT = 8000

# ---------------------------------------------------------------------------
# Persistent engine for best-move analysis
# ---------------------------------------------------------------------------
# Unlike the stateless run_engine_commands() helper (which spawns a fresh
# process per call), PersistentEngine keeps ONE engine process alive for the
# lifetime of the server.  The engine's Transposition Table (TT) is therefore
# preserved between moves, so every depth-15 search benefits from analysis
# done in all previous positions — getting faster as the game progresses.
# ---------------------------------------------------------------------------

class PersistentEngine:
    """A long-lived C++ engine process that retains its TT between searches."""

    def __init__(self):
        self._proc = None
        self._q = queue.Queue()
        self._reader = None
        self._lock = threading.Lock()
        self._last_mid_move_promotion = None  # cache to avoid redundant setoption

    # ── internal helpers ────────────────────────────────────────────────────

    def _alive(self):
        return self._proc is not None and self._proc.poll() is None

    def _start(self):
        """Spawn the engine and start the background reader thread."""
        binary_path = "./damath_engine"
        if not os.path.exists(binary_path):
            return False
        self._proc = subprocess.Popen(
            [binary_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,   # line-buffered
        )
        self._reader = threading.Thread(target=self._read_loop, daemon=True)
        self._reader.start()
        # Give the engine a moment to print its startup banner, then drain it
        time.sleep(0.25)
        self._drain()
        return True

    def _read_loop(self):
        """Background thread: push every stdout line into the queue."""
        try:
            for line in self._proc.stdout:
                self._q.put(line.rstrip("\n"))
        except Exception:
            pass

    def _drain(self):
        """Discard all lines currently sitting in the queue."""
        while True:
            try:
                self._q.get_nowait()
            except queue.Empty:
                break

    def _send(self, cmd: str):
        self._proc.stdin.write(cmd + "\n")
        self._proc.stdin.flush()

    def _ensure_running(self):
        if not self._alive():
            self._drain()          # clear any stale output from a previous (dead) proc
            return self._start()
        return True

    # ── public API ──────────────────────────────────────────────────────────

    def get_best_move(self, fen: str, mid_move_promotion=None,
                      depth: int = 15, timeout: float = 60.0):
        """
        Search *fen* to *depth* and return (bestmove_coords, raw_output).
        bestmove_coords is a list of [col, row] pairs, or None on failure.
        The TT is retained across calls — subsequent searches are faster.
        """
        with self._lock:
            if not self._ensure_running():
                return None, "Error: damath_engine binary not found."

            # Drain any residual output from a prior search
            self._drain()

            # Only send setoption if the value changed (avoids redundant cmds)
            if mid_move_promotion is not None and \
               mid_move_promotion != self._last_mid_move_promotion:
                val = "true" if mid_move_promotion else "false"
                self._send(f"setoption name MidMovePromotion value {val}")
                self._last_mid_move_promotion = mid_move_promotion

            self._send(f"position fen {fen}")
            self._send(f"go depth {depth}")

            # Collect lines until we see "bestmove …" or we time out
            collected = []
            bestmove_coords = None
            deadline = time.time() + timeout

            while time.time() < deadline:
                try:
                    line = self._q.get(timeout=0.2)
                    collected.append(line)
                    if line.startswith("bestmove"):
                        coords = re.findall(r'\((\d+),(\d+)\)', line)
                        if coords:
                            bestmove_coords = [[int(c[0]), int(c[1])]
                                               for c in coords]
                        break
                except queue.Empty:
                    if not self._alive():
                        break   # engine crashed — exit loop and return what we have

            return bestmove_coords, "\n".join(collected)


# One global instance — lives for the lifetime of the server process
_analysis_engine = PersistentEngine()


# ---------------------------------------------------------------------------
# Position Memory & Opening Book Storage
# ---------------------------------------------------------------------------

BOOK_FILE = os.path.join(os.path.dirname(__file__), "book", "opening_book.json")

class OpeningBook:
    """Manages reading and persisting memorized best moves in JSON format."""

    def __init__(self, filepath=BOOK_FILE):
        self.filepath = filepath
        self._lock = threading.Lock()
        self.data = {}
        self._load()

    def _load(self):
        with self._lock:
            if os.path.exists(self.filepath):
                try:
                    with open(self.filepath, "r", encoding="utf-8") as f:
                        self.data = json.load(f)
                except Exception as e:
                    print(f"Warning: Could not load opening book: {e}")
                    self.data = {}
            else:
                self.data = {}

    def get(self, fen: str, target_depth: int = 1):
        """
        Look up FEN in opening book.
        Returns (bestmove_coords, depth) if found with stored depth >= target_depth,
        otherwise (None, 0).
        """
        with self._lock:
            entry = self.data.get(fen)
            if entry:
                stored_depth = entry.get("depth", 0)
                bestmove = entry.get("bestmove")
                if bestmove and stored_depth >= target_depth:
                    return bestmove, stored_depth
            return None, 0

    def save(self, fen: str, bestmove: list, depth: int):
        """Save an analyzed best move to disk."""
        if not fen or not bestmove:
            return
        with self._lock:
            existing = self.data.get(fen)
            if existing and existing.get("depth", 0) > depth:
                return

            self.data[fen] = {
                "bestmove": bestmove,
                "depth": depth,
                "timestamp": time.time()
            }
            os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
            try:
                tmp_file = self.filepath + ".tmp"
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(self.data, f, indent=2)
                os.replace(tmp_file, self.filepath)
            except Exception as e:
                print(f"Warning: Could not save opening book: {e}")


_opening_book = OpeningBook()


# ---------------------------------------------------------------------------
# Variant Starting Positions
# ---------------------------------------------------------------------------
# Each Damath variant uses the same board squares but different piece values.
# The layout is always:
#   Red   row 0 (odd cols  1,3,5,7): chips A, B, C, D
#   Red   row 1 (even cols 0,2,4,6): chips E, F, G, H
#   Red   row 2 (odd cols  1,3,5,7): chips I, J, K, L
#   Blue  row 5 (even cols 0,2,4,6): mirror (D reversed)
#   Blue  row 6 (odd cols  1,3,5,7): mirror (H reversed)
#   Blue  row 7 (even cols 0,2,4,6): mirror (A reversed)
#
# All variants share the same 12 chip values, just expressed differently.
# We store them as exact strings that Fraction::parse() can read.
# ---------------------------------------------------------------------------

# 12 canonical chip values for each variant, in board order:
# [r0c1, r0c3, r0c5, r0c7,  r1c0, r1c2, r1c4, r1c6,  r2c1, r2c3, r2c5, r2c7]
VARIANT_VALUES = {
    'integer':    ['-11', '8',     '-5',    '2',
                   '0',   '-3',    '10',    '-7',
                   '-9',  '6',     '-1',    '4'],
    'rational':   ['-11/10', '8/10',  '-5/10', '2/10',
                   '0',      '-3/10', '10/10', '-7/10',
                   '-9/10',  '6/10',  '-1/10', '4/10'],
    # Radical: simplified values that evaluate to the same number as the chip label.
    # -121√18 = -121*√18 ≈ -513.  We store integer approximations so scoring is exact.
    # Since the engine uses Fraction arithmetic, we store the chip *coefficients*
    # (the numeric part) as integers — matching the reference layout numeric ordering.
    'radical':    ['-121', '-81',  '100',  '144',
                   '-49',  '-25',  '36',   '64',
                   '-9',   '-1',   '4',    '16'],
    'counting':   ['11', '8',  '5',  '2',
                   '12', '3',  '10', '7',
                   '9',  '6',  '1',  '4'],
    'whole':      ['11', '8',  '5',  '2',
                   '0',  '3',  '10', '7',
                   '9',  '6',  '1',  '4'],
    'fraction':   ['11/10', '8/10',  '5/10', '2/10',
                   '12/10', '3/10',  '10/10', '7/10',
                   '9/10',  '6/10',  '1/10',  '4/10'],
    'polynomial': ['-3', '-1',  '6',   '10',
                   '-55', '-45', '66',  '78',
                   '-21', '-15', '28',  '36'],
}

def _frac_str(val):
    """Return val as-is; used for readability."""
    return val

def build_variant_fen(variant='rational'):
    """
    Build the starting position FEN for the given Damath variant.
    The engine's Fraction::parse() accepts integers, 'a/b', and negative forms.
    FEN format (engine convention): rows 7..0 separated by '/', pieces as
      r(value) / R(value) for red normal/king, b(value)/B(value) for blue.
    Empty squares use digit counts.
    """
    vals = VARIANT_VALUES.get(variant, VARIANT_VALUES['rational'])
    # Unpack the 12 chip values
    (a, b, c, d,   # red row 0: cols 1,3,5,7
     e, f, g, h,   # red row 1: cols 0,2,4,6
     i, j, k, l    # red row 2: cols 1,3,5,7
    ) = vals

    # Blue is a mirror of red (reflected across the centre):
    # Blue row 5 (even cols 0,2,4,6) = red row 2 reversed: l,k,j,i  → but positionally mirrored col-wise
    # The official layout mirrors left-right AND swaps rows symmetrically.
    # Checking Board.cpp: blue r5=[D,C,B,A] style... actually:
    #   blue row 5 cols 0,2,4,6 = [d-mirror, c-mirror, b-mirror, a-mirror]
    #   i.e., same numeric values, mirrored positions.
    # From Board.cpp:
    #   r5 = {4/10, -1/10, 6/10, -9/10}  which is {d, k, j, i} for rational — actually {l,k,j,i}
    # Let's be precise matching Board.cpp blue layout:
    #   r5 cols 0,2,4,6 = l, k, j, i   (row2 reversed)
    #   r6 cols 1,3,5,7 = h, g, f, e   (row1 reversed) — wait, checking...
    #   Board.cpp r6 = {-7/10, 10/10, -3/10, 0} = {h, g, f, e} ✓
    #   r7 cols 0,2,4,6 = d, c, b, a   (row0 reversed)
    #   Board.cpp r7 = {2/10, -5/10, 8/10, -11/10} = {d, c, b, a} ✓

    # Build each of the 8 rows (row 7 first in FEN, down to row 0)
    # Row 7: blue pieces at even cols 0,2,4,6  → values d,c,b,a
    # odd cols 1,3,5,7 empty
    row7 = f"b({d})1b({c})1b({b})1b({a})"
    # Row 6: blue pieces at odd cols 1,3,5,7 → values h,g,f,e
    # even cols empty
    row6 = f"1b({h})1b({g})1b({f})1b({e})1"
    # Row 5: blue pieces at even cols 0,2,4,6 → values l,k,j,i
    row5 = f"b({l})1b({k})1b({j})1b({i})"
    # Rows 3,4: empty (4 playable squares each, but easiest to just count all 8 cols)
    row4 = "8"
    row3 = "8"
    # Row 2: red pieces at odd cols 1,3,5,7 → values i,j,k,l
    row2 = f"1r({i})1r({j})1r({k})1r({l})1"
    # Row 1: red pieces at even cols 0,2,4,6 → values e,f,g,h
    row1 = f"r({e})1r({f})1r({g})1r({h})1"
    # Row 0: red pieces at odd cols 1,3,5,7 → values a,b,c,d
    row0 = f"1r({a})1r({b})1r({c})1r({d})1"

    board_str = "/".join([row7, row6, row5, row4, row3, row2, row1, row0])
    return f"{board_str} r 0 0"


def run_engine_commands(commands):
    """
    Spawns the C++ engine binary statelessly, writes the commands to its stdin,
    and returns its stdout and stderr.
    """
    # Ensure binary exists
    binary_path = "./damath_engine"
    if not os.path.exists(binary_path):
        return "Error: damath_engine binary not found. Please compile the C++ source first.", ""

    p = subprocess.Popen(
        [binary_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    input_data = "\n".join(commands) + "\nquit\n"
    stdout, stderr = p.communicate(input=input_data)
    return stdout, stderr

def parse_legal_moves(stdout):
    """
    Parses the C++ engine stdout from the 'moves' command.
    Example lines:
      1. (1,2) -> (0,3)
      2. (1,2) -> (2,3)
      3. (1,2) -> (3,4) [Capture, Score Change: 1/2]
    """
    moves = []
    lines = stdout.splitlines()
    start_idx = -1
    for idx, line in enumerate(lines):
        if "Legal moves" in line:
            start_idx = idx
            break
    if start_idx == -1:
        return moves

    for i in range(start_idx + 1, len(lines)):
        line = lines[i].strip()
        if not line:
            continue
        if "damath>" in line or "Unknown command" in line:
            break
        if "->" in line:
            coords = re.findall(r'\((\d+),(\d+)\)', line)
            if coords:
                from_sq = [int(coords[0][0]), int(coords[0][1])]
                steps = [[int(c[0]), int(c[1])] for c in coords[1:]]
                is_capture = "[Capture" in line
                score_change = ""
                if is_capture:
                    match = re.search(r'Score Change:\s*([-0-9/]+)', line)
                    if match:
                        score_change = match.group(1)
                
                moves.append({
                    "from": from_sq,
                    "steps": steps,
                    "is_capture": is_capture,
                    "score_change": score_change,
                    "raw": line
                })
    return moves

class DamathHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress logging every request to stdout to keep console clean
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        path = self.path
        # Remove query parameters if any
        if "?" in path:
            path = path.split("?")[0]

        if path == "/" or path == "/index.html":
            file_path = "gui/index.html"
            content_type = "text/html"
        elif path == "/index.css" or path == "/gui/index.css":
            file_path = "gui/index.css"
            content_type = "text/css"
        elif path == "/index.js" or path == "/gui/index.js":
            file_path = "gui/index.js"
            content_type = "text/javascript"
        elif path in ["/logo.png", "/gui/logo.png", "/favicon.png", "/favicon.ico"]:
            file_path = "gui/logo.png"
            content_type = "image/png"
        else:
            self.send_error(404, f"File not found: {path}")
            return

        if not os.path.exists(file_path):
            self.send_error(404, f"File {file_path} not found")
            return

        with open(file_path, "rb") as f:
            content = f.read()

        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else ""

        try:
            req_data = json.loads(post_data) if post_data else {}
        except Exception:
            req_data = {}

        response_data = {}
        status_code = 200

        if parsed_url.path == "/api/initialize":
            variant = req_data.get("variant", "rational")
            starting_fen = build_variant_fen(variant)
            response_data = {"fen": starting_fen}

        elif parsed_url.path == "/api/moves":
            fen = req_data.get("fen", "")
            if not fen:
                response_data = {"error": "Missing FEN"}
                status_code = 400
            else:
                stdout, stderr = run_engine_commands([f"position fen {fen}", "moves"])
                moves = parse_legal_moves(stdout)
                response_data = {"moves": moves, "output": stdout}

        elif parsed_url.path == "/api/move":
            fen = req_data.get("fen", "")
            move_steps = req_data.get("move", [])
            mid_move_promotion = req_data.get("mid_move_promotion", None)
            if not fen or not move_steps:
                response_data = {"error": "Missing FEN or move"}
                status_code = 400
            else:
                commands = []
                if mid_move_promotion is not None:
                    val_str = "true" if mid_move_promotion else "false"
                    commands.append(f"setoption name MidMovePromotion value {val_str}")
                commands.append(f"position fen {fen}")
                
                # Format move command
                move_str = " ".join([f"{step[0]},{step[1]}" for step in move_steps])
                commands.append(f"move {move_str}")
                commands.append("fen")
                
                stdout, stderr = run_engine_commands(commands)
                
                fen_match = re.search(r'([rRbB0-9\(\)/.-]+\s+[rb]\s+[-0-9/]+\s+[-0-9/]+)', stdout)
                new_fen = fen_match.group(1) if fen_match else None
                
                is_game_over = "Game Over!" in stdout
                game_over_reason = ""
                winner = ""
                if is_game_over:
                    for line in stdout.splitlines():
                        if "Draw by" in line:
                            game_over_reason = line.strip()
                        elif "wins!" in line:
                            winner = line.replace("wins!", "").strip()
                        elif "Draw!" in line:
                            winner = "Draw"

                response_data = {
                    "fen": new_fen,
                    "is_game_over": is_game_over,
                    "game_over_reason": game_over_reason,
                    "winner": winner,
                    "output": stdout
                }

        elif parsed_url.path == "/api/ai_move":
            fen = req_data.get("fen", "")
            depth = int(req_data.get("depth", 0))
            time_ms = int(req_data.get("time_ms", 0))
            mid_move_promotion = req_data.get("mid_move_promotion", None)
            
            if not fen:
                response_data = {"error": "Missing FEN"}
                status_code = 400
            else:
                target_depth = depth if depth > 0 else 15
                cached_bestmove, cached_depth = _opening_book.get(fen, target_depth=target_depth)
                if cached_bestmove:
                    response_data = {
                        "bestmove": cached_bestmove,
                        "output": f"Loaded best move from memory (depth {cached_depth})",
                        "from_cache": True
                    }
                else:
                    commands = []
                    if mid_move_promotion is not None:
                        val_str = "true" if mid_move_promotion else "false"
                        commands.append(f"setoption name MidMovePromotion value {val_str}")
                    commands.append(f"position fen {fen}")
                    if depth > 0:
                        depth = max(1, min(15, depth))  # Cap depth at 15
                        commands.append(f"go depth {depth}")
                    elif time_ms > 0:
                        commands.append(f"go movetime {time_ms}")
                    else:
                        commands.append("go")
                    
                    stdout, stderr = run_engine_commands(commands)
                    
                    bestmove = None
                    for line in stdout.splitlines():
                        if line.startswith("bestmove"):
                            coords = re.findall(r'\((\d+),(\d+)\)', line)
                            if coords:
                                bestmove = [[int(c[0]), int(c[1])] for c in coords]
                    
                    if bestmove:
                        _opening_book.save(fen, bestmove, target_depth)

                    response_data = {
                        "bestmove": bestmove,
                        "output": stdout,
                        "from_cache": False
                    }
        elif parsed_url.path == "/api/best_move":
            fen = req_data.get("fen", "")
            mid_move_promotion = req_data.get("mid_move_promotion", None)
            depth = int(req_data.get("depth", 15))
            depth = max(1, min(15, depth))  # Cap depth at 15

            if not fen:
                response_data = {"error": "Missing FEN"}
                status_code = 400
            else:
                # Check opening book / position memory first
                cached_bestmove, cached_depth = _opening_book.get(fen, target_depth=depth)
                if cached_bestmove:
                    response_data = {
                        "bestmove": cached_bestmove,
                        "output": f"Loaded best move from memory (depth {cached_depth})",
                        "from_cache": True,
                        "cached_depth": cached_depth
                    }
                else:
                    # Use the persistent engine — TT is preserved across all calls
                    bestmove, output = _analysis_engine.get_best_move(
                        fen,
                        mid_move_promotion=mid_move_promotion,
                        depth=depth
                    )
                    if bestmove:
                        _opening_book.save(fen, bestmove, depth)
                    response_data = {
                        "bestmove": bestmove,
                        "output": output,
                        "from_cache": False
                    }

        else:
            self.send_error(404, "Endpoint not found")
            return

        response_bytes = json.dumps(response_data).encode('utf-8')
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response_bytes)

if __name__ == "__main__":
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), DamathHandler) as httpd:
        print(f"Damath GUI Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
