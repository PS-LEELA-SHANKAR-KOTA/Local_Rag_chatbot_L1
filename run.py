"""
run.py — RAG Chatbot Backend Watchdog (v2)
==========================================
Fixes:
  - Kills the ENTIRE process tree (not just parent PID) so uvicorn child
    never keeps holding port 8000 after a restart
  - Lock file prevents two watchdog instances from conflicting
  - Aggressive port cleanup using both psutil tree-kill and netstat fallback
  - Waits for port to actually become free before starting next attempt

Usage:  python run.py
Stop:   Ctrl+C
"""

import subprocess
import sys
import os
import time
import signal
import socket
import datetime
import atexit

# ── Try importing psutil; install inline if missing ───────────────────────────
try:
    import psutil
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil", "-q"])
    import psutil

# ─── Configuration ────────────────────────────────────────────────────────────
PORT = 8000
RESTART_DELAY_SECONDS = 2       # wait before restarting after a crash
HEALTH_CHECK_INTERVAL = 1       # seconds between alive-checks
PORT_FREE_TIMEOUT = 8           # max seconds to wait for port to be released
LOCK_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".watchdog.lock")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(SCRIPT_DIR, "venv", "Scripts", "python.exe")
PYTHON = VENV_PYTHON if os.path.exists(VENV_PYTHON) else sys.executable

# ─── Helpers ──────────────────────────────────────────────────────────────────
def log(msg: str, level: str = "INFO"):
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[WATCHDOG {ts}] [{level}] {msg}", flush=True)


def kill_tree(pid: int):
    """Kill a process AND all its children (the entire process tree)."""
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        # Kill children first
        for child in children:
            try:
                child.kill()
            except psutil.NoSuchProcess:
                pass
        # Kill parent
        try:
            parent.kill()
        except psutil.NoSuchProcess:
            pass
        # Wait for all to die
        gone, alive = psutil.wait_procs([parent] + children, timeout=3)
        for p in alive:
            try:
                p.kill()
            except Exception:
                pass
    except psutil.NoSuchProcess:
        pass
    except Exception as e:
        log(f"kill_tree({pid}) error: {e}", "WARN")


def force_free_port(port: int):
    """Forcefully kill every process (and its tree) that is listening on the port."""
    killed_any = False
    for _ in range(3):  # retry up to 3 times
        pids_on_port = set()
        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.laddr and conn.laddr.port == port and conn.pid:
                    pids_on_port.add(conn.pid)
        except Exception:
            pass

        if not pids_on_port:
            break

        for pid in pids_on_port:
            log(f"Killing PID {pid} (and its tree) holding port {port}", "WARN")
            kill_tree(pid)
            killed_any = True

        time.sleep(0.5)

    if killed_any:
        log(f"Freed port {port}.")
    else:
        log(f"Port {port} is already free.")


def wait_for_port_free(port: int, timeout: int = PORT_FREE_TIMEOUT) -> bool:
    """Wait until the port is no longer in use. Returns True if free, False if timeout."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.2)
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return True  # port is free
        time.sleep(0.3)
    return False


# ─── Lock File (prevents two watchdog instances) ───────────────────────────────
def acquire_lock():
    """Write our PID to the lock file. Abort if another live watchdog is running."""
    if os.path.exists(LOCK_FILE):
        try:
            with open(LOCK_FILE, "r") as f:
                old_pid = int(f.read().strip())
            if psutil.pid_exists(old_pid):
                log(f"Another watchdog is already running (PID {old_pid}). Killing it…", "WARN")
                kill_tree(old_pid)
                time.sleep(1)
        except Exception:
            pass
    with open(LOCK_FILE, "w") as f:
        f.write(str(os.getpid()))
    atexit.register(release_lock)


def release_lock():
    try:
        os.remove(LOCK_FILE)
    except Exception:
        pass


# ─── Main Watchdog Loop ────────────────────────────────────────────────────────
_current_proc: subprocess.Popen | None = None


def shutdown(signum=None, frame=None):
    log("Shutting down watchdog…", "WARN")
    if _current_proc and _current_proc.poll() is None:
        log(f"Terminating backend (PID {_current_proc.pid}) and its tree…")
        kill_tree(_current_proc.pid)
    release_lock()
    log("Watchdog stopped.")
    sys.exit(0)


signal.signal(signal.SIGINT, shutdown)
signal.signal(signal.SIGTERM, shutdown)


def start_backend() -> subprocess.Popen:
    log(f"Starting backend -> {PYTHON} -m backend.main")
    proc = subprocess.Popen(
        [PYTHON, "-m", "backend.main"],
        cwd=SCRIPT_DIR,
    )
    log(f"Backend started (watchdog PID {proc.pid})")
    return proc


def main():
    global _current_proc

    acquire_lock()

    log("=" * 55)
    log("  RAG Chatbot Backend Watchdog v2")
    log(f"  Port={PORT} | RestartDelay={RESTART_DELAY_SECONDS}s | CheckInterval={HEALTH_CHECK_INTERVAL}s")
    log("=" * 55)

    restart_count = 0

    while True:
        # 1. Kill anything on the port + wait for it to be truly free
        force_free_port(PORT)
        if not wait_for_port_free(PORT, timeout=PORT_FREE_TIMEOUT):
            log(f"Port {PORT} still busy after {PORT_FREE_TIMEOUT}s — trying harder…", "WARN")
            force_free_port(PORT)
            time.sleep(1)

        # 2. Start the backend
        _current_proc = start_backend()

        # 3. Monitor until it exits
        while True:
            time.sleep(HEALTH_CHECK_INTERVAL)
            exit_code = _current_proc.poll()
            if exit_code is None:
                continue  # still alive — good

            # Exited
            log(
                f"Backend exited (code={exit_code}, restart #{restart_count + 1})",
                "ERROR" if exit_code not in (0, -15) else "WARN"
            )
            break

        restart_count += 1

        # 4. Kill entire tree to make sure no zombie uvicorn holds the port
        log("Cleaning up process tree before restart…")
        kill_tree(_current_proc.pid)

        log(f"Restarting in {RESTART_DELAY_SECONDS}s…", "WARN")
        time.sleep(RESTART_DELAY_SECONDS)


if __name__ == "__main__":
    main()
