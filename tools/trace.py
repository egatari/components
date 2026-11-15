# /// script
# requires-python = ">=3.10"
# ///
"""Trace a short Python program line by line and write m-trace JSON.

    uv run tools/trace.py prog.py [--func NAME] [--show a,b] [--max-steps 60] [--out trace.json]

Runs the program (your own file, on your own machine) under sys.settrace. Each step is one line that has run, with the
FULL state of the shown variables after it (not a delta) and the output that line printed. The part never runs code;
it only draws what this script wrote. Without --func the module's top level is traced; with --func NAME, every call of
that function (its locals). Values beyond the part's grammar become {"repr": "..."}.
"""
import argparse
import hashlib
import io
import os
import json
import sys
import types

TOOL = "egatari-trace 0.1"
MAX_LINES, MAX_SHOW, MAX_STR, MAX_LIST, MAX_DICT, MAX_2D = 16, 6, 40, 12, 8, 6


class Stop(Exception):
    pass


def _repr(v):
    s = repr(v)
    return {"repr": s if len(s) <= MAX_STR else s[: MAX_STR - 1] + "…"}


def scalar(v):
    return v is None or isinstance(v, (bool, int, float, str))


def encode(v, depth=0):
    """A value in the part's grammar: scalars, lists (≤12, or 2-D ≤6×6), dicts (≤8 str keys), nesting ≤2, else repr."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, int):
        return v if abs(v) < 2**53 else _repr(v)
    if isinstance(v, float):
        # 2.0 stays "2.0" (JSON would read it back as the integer 2); inf and nan have no JSON number
        return v if v == v and v not in (float("inf"), float("-inf")) and not v.is_integer() else _repr(v)
    if isinstance(v, str):
        return v if len(v) <= MAX_STR else _repr(v)
    if depth >= 2:
        return _repr(v)
    if isinstance(v, list):
        if v and all(isinstance(x, list) for x in v):
            if len(v) <= MAX_2D and all(len(x) <= MAX_2D and all(scalar(y) for y in x) for x in v):
                return [[encode(y, 2) for y in x] for x in v]
            return _repr(v)
        if len(v) <= MAX_LIST and all(scalar(x) for x in v):
            return [encode(x, depth + 1) for x in v]
        return _repr(v)
    if isinstance(v, dict):
        if len(v) <= MAX_DICT and all(isinstance(k, str) for k in v) and all(scalar(x) or isinstance(x, list) for x in v.values()):
            return {k: encode(x, depth + 1) for k, x in v.items()}
        return _repr(v)
    return _repr(v)


def visible(name, v):
    return not name.startswith("__") and not isinstance(v, (types.ModuleType, types.FunctionType, type, types.BuiltinFunctionType))


def trace(path, func=None, show=None, max_steps=60):
    code = open(path, encoding="utf-8").read().rstrip("\n")
    n = len(code.split("\n"))
    if n > MAX_LINES:
        sys.exit(f"{path}: {n} lines; m-trace shows at most {MAX_LINES}. Trace a shorter program or one function.")
    steps, buf, prev, real_out = [], io.StringIO(), {}, sys.stdout
    seen, pending = {"at": 0}, {"at": None}
    target = compile(code + "\n", path, "exec")

    def wanted(frame):
        return frame.f_code.co_filename == path and (frame.f_code.co_name == func if func else frame.f_code.co_name == "<module>")

    def record(frame, line):
        names = show or [k for k, v in frame.f_locals.items() if visible(k, v)]
        vars_ = {k: encode(frame.f_locals[k]) for k in names if k in frame.f_locals and visible(k, frame.f_locals[k])}
        out = buf.getvalue()[seen["at"]:]
        seen["at"] = len(buf.getvalue())
        step = {"line": line, "vars": vars_}
        if out:
            step["out"] = out
        steps.append(step)
        if len(steps) >= max_steps:
            raise Stop

    def local(frame, event, arg):
        key = id(frame)
        if event in ("line", "return") and key in prev:
            record(frame, prev.pop(key))
        if event == "line":
            prev[key] = frame.f_lineno
        if event == "exception" and key in prev and not isinstance(arg[1], Stop):
            pending["at"] = (frame, prev[key])   # the line that raised; recorded only if the exception is never caught
        return local

    def glob(frame, event, arg):
        return local if event == "call" and wanted(frame) else None

    truncated = False
    sys.stdout = buf
    sys.settrace(glob)
    try:
        exec(target, {"__name__": "__main__", "__file__": path})
    except Stop:
        truncated = len(steps) >= max_steps
    except Exception as exc:
        if pending["at"]:
            buf.write(f"{type(exc).__name__}: {exc}\n")
            frame, line = pending["at"]
            if steps and steps[-1]["line"] == line:   # the frame's return already recorded the line: add the error to its output
                steps[-1]["out"] = steps[-1].get("out", "") + buf.getvalue()[seen["at"]:]
            else:
                try:
                    record(frame, line)
                except Stop:
                    pass
    finally:
        sys.settrace(None)
        sys.stdout = real_out
    if "random" in sys.modules and "seed(" not in code:
        print("warning: random is used without a seed; the trace will differ on the next run", file=sys.stderr)
    data = {"lang": "python", "code": code,
            "source": {"tool": TOOL, "python": sys.version.split()[0], "sha256": hashlib.sha256(code.encode("utf-8")).hexdigest(), "truncated": truncated}}
    names = show or list(dict.fromkeys(k for s in steps for k in s["vars"]))
    if len(names) > MAX_SHOW:
        print(f"warning: {len(names)} variables ({', '.join(names)}); the part shows {MAX_SHOW}. Choose them with --show.", file=sys.stderr)
    if show:
        data["show"] = show
    data["steps"] = steps
    return data


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("program")
    ap.add_argument("--func")
    ap.add_argument("--show", help="comma-separated variable names, in panel order (at most 6)")
    ap.add_argument("--max-steps", type=int, default=60)
    ap.add_argument("--out")
    a = ap.parse_args()
    show = [s.strip() for s in a.show.split(",") if s.strip()] if a.show else None
    if show and len(show) > MAX_SHOW:
        sys.exit(f"--show names {len(show)} variables; at most {MAX_SHOW}")
    data = trace(os.path.abspath(a.program), a.func, show, max(1, min(60, a.max_steps)))
    text = json.dumps(data, ensure_ascii=False)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(text + "\n")
    else:
        print(text)


if __name__ == "__main__":
    main()
