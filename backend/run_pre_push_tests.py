"""Run the mocked backend regression suite without contacting live services.

Run from the repository root:
    py -3.11 backend/run_pre_push_tests.py

The manual ``*_live.py`` scripts are intentionally excluded. Tests receive
dummy database/Gemini credentials so accidental calls cannot use real secrets.
"""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
TESTS = BACKEND / "tests"
LIVE_FILE_MARKERS = ("_live.py", "live_")
def has_missing_external_dependency(output: str) -> bool:
    match = re.search(r"No module named ['\"]([^'\"]+)['\"]", output)
    if not match:
        return False
    module_path = Path(*match.group(1).split("."))
    project_candidates = (
        ROOT / module_path.with_suffix(".py"),
        BACKEND / module_path.with_suffix(".py"),
        ROOT / module_path / "__init__.py",
        BACKEND / module_path / "__init__.py",
    )
    return not any(candidate.is_file() for candidate in project_candidates)


def safe_test_environment() -> dict[str, str]:
    """Remove ambient credentials and install nonfunctional test placeholders."""
    environment = os.environ.copy()
    sensitive_markers = (
        "API_KEY", "DATABASE_URL", "PASSWORD", "SECRET", "TOKEN",
        "CREDENTIAL", "PRIVATE_KEY",
    )
    for key in list(environment):
        if any(marker in key.upper() for marker in sensitive_markers):
            environment.pop(key, None)

    environment["DATABASE_URL"] = "postgresql://prepush.invalid/not_a_database"
    environment["GEMINI_API_KEY"] = "pre-push-tests-no-live-key"
    environment["PYTEST_DISABLE_PLUGIN_AUTOLOAD"] = "1"
    environment["PYTHONDONTWRITEBYTECODE"] = "1"
    return environment


def import_smoke_check(environment: dict[str, str]) -> tuple[str, str]:
    """Import backend modules with networking and DB connections blocked."""
    code = f"""
import importlib
import socket
import sys
sys.path.insert(0, {str(BACKEND)!r})

def blocked(*args, **kwargs):
    raise RuntimeError("external connection blocked by pre-push import check")

socket.create_connection = blocked

try:
    import requests
    requests.get = blocked
    requests.head = blocked
    requests.post = blocked
except ImportError:
    pass

try:
    import psycopg2
    psycopg2.connect = blocked
except ImportError:
    pass

try:
    import httpx
    httpx.Client.send = blocked
    httpx.AsyncClient.send = blocked
except ImportError:
    pass

modules = (
    "Scrapper", "webScrap.nsp", "utils", "llm", "db", "api",
    "main", "test_matching",
)
for name in modules:
    try:
        importlib.import_module(name)
    except BaseException as error:
        print(f"IMPORT_FAIL|{{name}}|{{type(error).__name__}}|{{error}}")
        raise SystemExit(1)
    print(f"IMPORT_PASS|{{name}}")
"""
    completed = subprocess.run(
        [sys.executable, "-c", code],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    if completed.returncode == 0:
        return "PASS", output

    if has_missing_external_dependency(output):
        return "BLOCKED", output
    return "FAIL", output


def run_pytest_group(
    label: str,
    paths: list[Path],
    environment: dict[str, str],
    extra_args: tuple[str, ...] = (),
) -> tuple[str, str]:
    if not paths:
        return "FAIL", "No test files were supplied for this required group."

    if importlib.util.find_spec("pytest") is None:
        return "BLOCKED", "pytest is not installed in this Python environment."

    command = [
        sys.executable, "-m", "pytest",
        *(str(path.relative_to(ROOT)) for path in paths),
        *extra_args,
        "-p", "no:cacheprovider",
        "-v", "--tb=short",
    ]
    print(f"\n--- {label} ---")
    print("Command:", " ".join(command))
    try:
        with tempfile.TemporaryDirectory(prefix="scholar-sathi-prepush-") as guard_dir:
            guard_path = Path(guard_dir) / "sitecustomize.py"
            guard_path.write_text(
                """
def _blocked(*args, **kwargs):
    raise RuntimeError("external service access blocked by pre-push test runner")

try:
    import socket
    socket.create_connection = _blocked
except ImportError:
    pass
try:
    import urllib.request
    urllib.request.urlopen = _blocked
except ImportError:
    pass
try:
    import requests
    requests.sessions.Session.request = _blocked
except ImportError:
    pass
try:
    import httpx
    httpx.Client.send = _blocked
    httpx.AsyncClient.send = _blocked
except ImportError:
    pass
try:
    import psycopg2
    psycopg2.connect = _blocked
except ImportError:
    pass
""",
                encoding="utf-8",
            )
            guarded_environment = environment.copy()
            existing_pythonpath = guarded_environment.get("PYTHONPATH", "")
            guarded_environment["PYTHONPATH"] = os.pathsep.join(
                part for part in (guard_dir, existing_pythonpath) if part
            )
            completed = subprocess.run(
                command,
                cwd=ROOT,
                env=guarded_environment,
                text=True,
                capture_output=True,
                check=False,
            )
    except OSError as error:
        return "BLOCKED", f"Could not start the Python test process ({type(error).__name__})."

    output = "\n".join(part for part in (completed.stdout, completed.stderr) if part)
    if output:
        print(output, end="" if output.endswith("\n") else "\n")
    if completed.returncode == 0:
        return "PASS", output
    if "No module named pytest" in output or has_missing_external_dependency(output):
        return "BLOCKED", output
    return "FAIL", output


def main() -> int:
    if not TESTS.is_dir():
        print(f"FAIL: test directory not found: {TESTS}")
        return 1

    environment = safe_test_environment()
    all_test_files = sorted(TESTS.glob("test_*.py"))
    live_files = [
        path for path in all_test_files
        if any(marker in path.name.lower() for marker in LIVE_FILE_MARKERS)
    ]
    safe_files = [path for path in all_test_files if path not in live_files]
    print("Live integration scripts excluded:",
          ", ".join(path.name for path in live_files) or "none")
    print("Database and Gemini settings use dummy values; no secrets are printed.")

    results: list[tuple[str, str, str]] = []
    print("\n--- Backend import/configuration smoke check ---")
    try:
        status, output = import_smoke_check(environment)
    except OSError as error:
        status, output = "BLOCKED", (
            f"Could not start the isolated import process ({type(error).__name__})."
        )
    if output:
        print(output)
    results.append(("Imports/configuration", status, output))

    by_name = {path.name: path for path in safe_files}
    grouped_names = {
        "Database/profile mocked tests": {"test_student_scholarships_mocked.py"},
        "PDF and Gemini mocked tests": {"test_pdf_pipeline_optimization.py"},
        "Ingestion pipeline mocked tests": {"test_ingestion_safety_regressions.py"},
    }

    database_paths = [by_name[name] for name in grouped_names[
        "Database/profile mocked tests"] if name in by_name]
    regression = by_name.get("test_ingestion_safety_regressions.py")
    status, output = run_pytest_group(
        "Database/profile mocked tests", database_paths, environment
    )
    if regression:
        db_status, db_output = run_pytest_group(
            "Ingestion database helper tests",
            [regression],
            environment,
            ("-k", "database_"),
        )
        output = "\n".join(part for part in (output, db_output) if part)
        if db_status == "FAIL" or status == "FAIL":
            status = "FAIL"
        elif db_status == "BLOCKED" or status == "BLOCKED":
            status = "BLOCKED"
    results.append(("Database/profile mocked tests", status, output))

    pdf_paths = [by_name[name] for name in grouped_names[
        "PDF and Gemini mocked tests"] if name in by_name]
    status, output = run_pytest_group(
        "PDF and Gemini mocked tests", pdf_paths, environment
    )
    results.append(("PDF and Gemini mocked tests", status, output))

    pipeline_paths = [by_name[name] for name in grouped_names[
        "Ingestion pipeline mocked tests"] if name in by_name]
    status, output = run_pytest_group(
        "Ingestion pipeline mocked tests",
        pipeline_paths,
        environment,
        ("-k", "not database_"),
    )
    results.append(("Ingestion pipeline mocked tests", status, output))

    known = set().union(*grouped_names.values())
    other_paths = [
        path for path in safe_files
        if path.name not in known
    ]
    if other_paths:
        status, output = run_pytest_group(
            "Other non-live mocked tests", other_paths, environment
        )
        results.append(("Other non-live mocked tests", status, output))

    print("\n=== Pre-push check summary ===")
    for label, status, _ in results:
        print(f"{status}: {label}")

    failures = sum(status == "FAIL" for _, status, _ in results)
    blocked = sum(status == "BLOCKED" for _, status, _ in results)
    if failures:
        print(f"\nResult: FAIL ({failures} group(s) failed; {blocked} blocked).")
        return 1
    if blocked:
        print(f"\nResult: BLOCKED ({blocked} required group(s) could not run).")
        return 2
    print("\nResult: PASS (all required local checks completed).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
