"""Utility to execute an R script as a subprocess.

Contract:
  Inputs:
    - data: list[dict] (rows coming from frontend datatable)
    - script_path: path to an R script (default provided by caller)
  Behavior:
    - Writes input JSON to a temp file
    - Invokes: Rscript <script_path> <input_json> <output_json>
    - Captures stdout / stderr / returncode
    - If output JSON created, loads and returns it
    - Always removes temp files afterwards

The R script is expected (eventually) to:
  1. Read args[1] as input JSON
  2. Perform analysis
  3. Write JSON to args[2]

This module is resilient to an empty / placeholder R script (no output file).
"""

from __future__ import annotations

import subprocess, tempfile, json, os, uuid, shutil
from typing import List, Dict, Any, Optional, Sequence

class RExecutionError(RuntimeError):
    pass

def run_r_subprocess(data: List[Dict[str, Any]], script_path: str, model_syntax: Optional[str] = None, extra_args: Optional[Sequence[str]] = None) -> Dict[str, Any]:
    # Allow override via env var (useful for deployment / testing)
    script_path = os.getenv("R_SCRIPT_PATH", script_path)
    if not os.path.isabs(script_path):
        # Resolve relative to project root (file located in app/analysis/...)
        base_dir = os.path.dirname(os.path.dirname(__file__))  # app/analysis -> app
        script_path = os.path.join(base_dir, os.path.relpath(script_path))

    if not os.path.exists(script_path):
        raise FileNotFoundError(f"R script not found: {script_path}")

    # Verify Rscript binary exists
    rscript_bin = shutil.which("Rscript")
    if rscript_bin is None:
        return {
            "status": "error",
            "error": "Rscript executable not found in PATH. Install R or adjust PATH.",
        }

    tmp_dir = tempfile.mkdtemp(prefix="rjob_")
    in_path = os.path.join(tmp_dir, "input.json")
    model_path = os.path.join(tmp_dir, "model.txt")
    out_path = os.path.join(tmp_dir, "output.json")

    try:
        with open(in_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)

        # Write model syntax (can be empty file if not provided) so R script always gets a path
        with open(model_path, "w", encoding="utf-8") as mf:
            if model_syntax:
                mf.write(model_syntax)

        # Updated invocation includes model path before output path
        cmd = [rscript_bin, script_path, in_path, model_path, out_path]
        if extra_args:
            cmd.extend(list(map(str, extra_args)))
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 min safeguard
        )

        result: Dict[str, Any] = {
            "status": "ok" if proc.returncode == 0 else "r_error",
            "returncode": proc.returncode,
            "stdout": proc.stdout.strip(),
            "stderr": proc.stderr.strip(),
        }

        if proc.returncode != 0:
            return result

        if os.path.exists(out_path):
            try:
                with open(out_path, "r", encoding="utf-8") as f:
                    output_json = json.load(f)
                result["output"] = output_json
            except Exception as e:
                result["output_load_error"] = str(e)
        else:
            result["note"] = "R script produced no output file (placeholder script?)."

        return result
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "error": "R script exceeded 300s time limit"}
    except Exception as e:
        return {"status": "error", "error": str(e)}
    finally:
        try:
            shutil.rmtree(tmp_dir, ignore_errors=True)
        except Exception:
            pass
