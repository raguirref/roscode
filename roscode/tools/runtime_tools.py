"""Runtime control tools — let the agent actively drive the robot.

This is the bridge from "agentic coding" to "agentic robotics": publishing
commands, sampling sensor responses, calling actions, and analyzing time-
series data well enough to close autonomous tuning loops (e.g. Ziegler-
Nichols PID tuning).

Every tool here is a thin wrapper around either ``ros2`` CLI subprocess
calls (``_shell.run``) or pure-Python signal analysis. No rclpy is used
so the tools work identically whether the agent runs inside the container
or on the host with ``ros2`` forwarded.

## Safety model

1. **Hard programmatic caps** (``SAFETY_CAPS``) reject out-of-envelope
   Twist commands *before* the subprocess is spawned. No agent can bypass
   these from inside a tool call — the caps live in Python code, not in
   prompt text.
2. **Agent-loop confirmation gate** — publishes, action goals, and any
   other destructive call route through ``DESTRUCTIVE_TOOLS`` in
   ``agent.py`` so the human must approve each call (or batch).
3. **Batched publishes** — ``topic_publish`` supports ``count`` + ``rate``
   so a 3-second step input at 10 Hz is one confirmation, not thirty.
4. **Always-available e-stop** — ``robot_estop`` is *not* destructive and
   is expected to be called by the agent itself if ``analyze_signal``
   detects runaway behaviour.

Safety caps can be relaxed per-session via env vars:
    ROSCODE_CAP_TWIST_LINEAR=0.5
    ROSCODE_CAP_TWIST_ANGULAR=1.0

Values are *absolute* — both +x and -x are clamped to the same magnitude.
"""

from __future__ import annotations

import json
import math
import os
import re
import time
from typing import Any

from roscode.tools import _shell

# ---------------------------------------------------------------------------
# Safety envelope
# ---------------------------------------------------------------------------


def _env_cap(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except ValueError:
        return default


_TWIST_LIN_CAP = _env_cap("ROSCODE_CAP_TWIST_LINEAR", 0.3)
_TWIST_ANG_CAP = _env_cap("ROSCODE_CAP_TWIST_ANGULAR", 0.5)

# Map (msg_type) -> {field_path: abs_cap}. Field paths use '.' separators.
SAFETY_CAPS: dict[str, dict[str, float]] = {
    "geometry_msgs/msg/Twist": {
        "linear.x": _TWIST_LIN_CAP,
        "linear.y": _TWIST_LIN_CAP,
        "linear.z": _TWIST_LIN_CAP,
        "angular.x": _TWIST_ANG_CAP,
        "angular.y": _TWIST_ANG_CAP,
        "angular.z": _TWIST_ANG_CAP,
    },
    "geometry_msgs/msg/TwistStamped": {
        "twist.linear.x": _TWIST_LIN_CAP,
        "twist.linear.y": _TWIST_LIN_CAP,
        "twist.linear.z": _TWIST_LIN_CAP,
        "twist.angular.x": _TWIST_ANG_CAP,
        "twist.angular.y": _TWIST_ANG_CAP,
        "twist.angular.z": _TWIST_ANG_CAP,
    },
}


def _extract_numeric_field(msg_str: str, field: str) -> float | None:
    """Pull a numeric value for a dotted field path out of a flow-style YAML
    message string like ``{linear: {x: 0.1, y: 0.0, ...}, angular: {z: 0.2}}``.

    Returns ``None`` if the field isn't present (treated as 0 by ros2 pub).
    Brittle for deeply nested or unusual layouts, but reliable for the
    common Twist / TwistStamped shapes we cap against.
    """
    parts = field.split(".")
    # Build a regex that requires the leading key(s) to open braces, then
    # finds the leaf key's value. Each intermediate key opens a `{...}`.
    pat = ""
    for key in parts[:-1]:
        pat += rf"\b{re.escape(key)}\s*:\s*\{{[^}}]*?"
    pat += rf"\b{re.escape(parts[-1])}\s*:\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)"
    m = re.search(pat, msg_str)
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _check_safety(msg_type: str, message: str) -> tuple[bool, str]:
    """Return (ok, reason). Empty reason means no violation found."""
    caps = SAFETY_CAPS.get(msg_type)
    if caps is None:
        return True, ""
    violations: list[str] = []
    for field, cap in caps.items():
        value = _extract_numeric_field(message, field)
        if value is None:
            continue
        if abs(value) > cap + 1e-9:
            violations.append(f"{field}={value:+.3f} exceeds |cap|={cap:.3f}")
    if violations:
        return False, "; ".join(violations)
    return True, ""


def safety_envelope() -> str:
    """Return the currently enforced safety caps as text. Non-destructive."""
    lines = ["Current safety envelope (abs-value caps applied before ros2 topic pub):", ""]
    for msg_type, caps in SAFETY_CAPS.items():
        lines.append(f"  {msg_type}")
        for field, cap in caps.items():
            lines.append(f"    {field:<20} ≤ {cap:.3f}")
        lines.append("")
    lines.append(
        "Override per-session via env vars ROSCODE_CAP_TWIST_LINEAR / "
        "ROSCODE_CAP_TWIST_ANGULAR (m/s, rad/s)."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# topic_publish
# ---------------------------------------------------------------------------


def topic_publish(
    topic: str,
    msg_type: str,
    message: str,
    count: int = 1,
    rate_hz: float = 10.0,
) -> str:
    """Publish a message to a ROS 2 topic. DESTRUCTIVE.

    For a step response or continuous drive, use count>1 + rate_hz; one
    confirmation from the human will cover the whole burst. For a one-
    shot latched command, leave count=1.
    """
    ok, reason = _check_safety(msg_type, message)
    if not ok:
        return (
            f"REJECTED by safety envelope: {reason}.\n"
            f"If this is intentional, have the user raise the cap via "
            f"ROSCODE_CAP_TWIST_LINEAR / ROSCODE_CAP_TWIST_ANGULAR and "
            f"retry. The agent must not bypass this gate."
        )

    if count < 1:
        return "Error: count must be ≥ 1."
    if count == 1:
        cmd = ["ros2", "topic", "pub", "--once", topic, msg_type, message]
        timeout = 5.0
    else:
        if rate_hz <= 0:
            return "Error: rate_hz must be > 0 when count > 1."
        cmd = [
            "ros2", "topic", "pub",
            "-t", str(count),
            "-r", str(rate_hz),
            topic, msg_type, message,
        ]
        # expected wall time + overhead
        timeout = count / rate_hz + 3.0

    result = _shell.run(cmd, timeout=timeout)
    if not result.ok and result.returncode != 124:
        return f"Error: ros2 topic pub failed: {result.stderr.strip() or result.stdout.strip()}"

    tail = (result.stdout or "").strip().splitlines()[-3:]
    return (
        f"Published {count}× to {topic} ({msg_type}) at {rate_hz:.1f} Hz.\n"
        f"Message: {message}\n"
        + ("\n".join(tail) if tail else "(no stdout)")
    )


# ---------------------------------------------------------------------------
# topic_sample — time-stamped captures for downstream analysis
# ---------------------------------------------------------------------------


_FLOAT_RE = re.compile(r"-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?")
_MSG_SEP_RE = re.compile(r"^---\s*$", re.MULTILINE)


def topic_sample(
    topic: str,
    duration_sec: float = 3.0,
    field: str | None = None,
    max_samples: int = 500,
) -> str:
    """Subscribe to a topic for *duration_sec* seconds and return a JSON
    time series. If *field* is supplied (dotted path like
    ``twist.twist.linear.x``), only that numeric column is returned —
    exactly what ``analyze_signal`` wants as input.

    Timestamps are seconds-from-sample-start (monotonic from the receiver's
    POV). If the message itself carries a ``header.stamp`` we prefer that.

    Non-destructive — observation only.
    """
    start = time.monotonic()
    result = _shell.run(
        ["timeout", f"{duration_sec}", "ros2", "topic", "echo",
         "--no-arr", "--flow-style", topic],
        timeout=duration_sec + 2.0,
    )

    if not result.stdout and result.returncode not in (0, 124):
        return f"Error: topic_sample failed: {result.stderr.strip() or '(no stderr)'}"

    chunks = [c.strip() for c in _MSG_SEP_RE.split(result.stdout) if c.strip()]
    if not chunks:
        return (
            f"topic_sample: no messages on {topic} in {duration_sec}s. "
            f"Check ros_graph — is anything publishing it?"
        )

    # Evenly distribute wall-time timestamps across the window when the
    # message has no header. Good enough for PID analysis; not for hard
    # real-time measurement.
    n = min(len(chunks), max_samples)
    samples: list[dict[str, Any]] = []
    for i, chunk in enumerate(chunks[:n]):
        # Prefer header.stamp if present
        t_stamp = _extract_numeric_field(chunk, "header.stamp.sec")
        ns_stamp = _extract_numeric_field(chunk, "header.stamp.nanosec")
        if t_stamp is not None:
            t = t_stamp + (ns_stamp or 0.0) * 1e-9
        else:
            t = round(duration_sec * i / max(1, n - 1), 4)

        if field is None:
            samples.append({"t": t, "raw": chunk[:400]})
        else:
            value = _extract_numeric_field(chunk, field)
            samples.append({"t": t, "v": value})

    if field is not None:
        # Normalize t to start-at-zero monotonic for easier downstream math
        t0 = samples[0]["t"] if samples else 0.0
        series = [
            {"t": round(s["t"] - t0, 4), "v": s["v"]}
            for s in samples
            if s.get("v") is not None
        ]
        meta = {
            "topic": topic,
            "field": field,
            "n_samples": len(series),
            "duration_sec": round(time.monotonic() - start, 3),
            "samples": series,
        }
    else:
        meta = {
            "topic": topic,
            "n_samples": len(samples),
            "duration_sec": round(time.monotonic() - start, 3),
            "samples": samples,
        }
    return json.dumps(meta, default=float)


# ---------------------------------------------------------------------------
# analyze_signal — oscillation detection in pure Python
# ---------------------------------------------------------------------------


def analyze_signal(samples_json: str) -> str:
    """Given a JSON time series (as produced by ``topic_sample`` with a
    ``field`` argument), detect oscillation and return a structured
    summary: period, amplitude, mean, peaks, trough, sustained/diverging/
    damped classification.

    The agent calls this between publish steps when tuning a controller
    — it's the 'did the system settle?' judge.
    """
    try:
        payload = json.loads(samples_json)
    except json.JSONDecodeError as e:
        return f"Error: analyze_signal expected JSON from topic_sample: {e}"

    series = payload.get("samples") or []
    points = [(float(s["t"]), float(s["v"])) for s in series if s.get("v") is not None]
    if len(points) < 10:
        return json.dumps(
            {"error": f"need ≥10 samples, got {len(points)}", "n_samples": len(points)}
        )

    times = [p[0] for p in points]
    vals = [p[1] for p in points]
    mean = sum(vals) / len(vals)
    detrended = [v - mean for v in vals]

    # Zero-crossings via linear interpolation
    crossings: list[float] = []
    for i in range(1, len(detrended)):
        a, b = detrended[i - 1], detrended[i]
        if a == 0.0:
            crossings.append(times[i - 1])
        elif a * b < 0:
            t1, t2 = times[i - 1], times[i]
            crossings.append(t1 - a * (t2 - t1) / (b - a))

    # Peaks / troughs (strict local extrema)
    peaks: list[tuple[float, float]] = []
    troughs: list[tuple[float, float]] = []
    for i in range(1, len(detrended) - 1):
        if detrended[i] > detrended[i - 1] and detrended[i] > detrended[i + 1]:
            peaks.append((times[i], detrended[i]))
        elif detrended[i] < detrended[i - 1] and detrended[i] < detrended[i + 1]:
            troughs.append((times[i], detrended[i]))

    result: dict[str, Any] = {
        "n_samples": len(points),
        "duration_sec": round(times[-1] - times[0], 3),
        "mean": round(mean, 4),
        "n_crossings": len(crossings),
        "n_peaks": len(peaks),
        "n_troughs": len(troughs),
    }

    if len(crossings) < 3 or not peaks or not troughs:
        result.update(
            oscillating=False,
            period_sec=None,
            freq_hz=None,
            amplitude=None,
            classification="no-oscillation",
            note="insufficient zero crossings / peaks for period estimate",
        )
        return json.dumps(result)

    half_periods = sorted(crossings[i + 1] - crossings[i] for i in range(len(crossings) - 1))
    median_half = half_periods[len(half_periods) // 2]
    period = 2.0 * median_half

    peak_vals = [p[1] for p in peaks]
    trough_vals = [t[1] for t in troughs]
    amplitude = (sum(peak_vals) / len(peak_vals) - sum(trough_vals) / len(trough_vals)) / 2.0

    # Classify trajectory of amplitude envelope
    classification = "oscillating"
    env_ratio: float | None = None
    if len(peak_vals) >= 4:
        half = len(peak_vals) // 2
        first_half = sum(peak_vals[:half]) / half
        last_half = sum(peak_vals[half:]) / (len(peak_vals) - half)
        if first_half > 1e-9:
            env_ratio = last_half / first_half
            if env_ratio > 1.25:
                classification = "diverging"
            elif env_ratio < 0.80:
                classification = "damped"
            else:
                classification = "sustained"

    result.update(
        oscillating=amplitude > 1e-6,
        period_sec=round(period, 4),
        freq_hz=round(1.0 / period, 4) if period > 0 else None,
        amplitude=round(amplitude, 4),
        envelope_ratio=round(env_ratio, 3) if env_ratio is not None else None,
        classification=classification,
        interpretation=(
            "sustained oscillation → Ku found; read period_sec as Tu" if classification == "sustained"
            else "amplitude shrinking → increase gain"           if classification == "damped"
            else "amplitude growing → reduce gain immediately"   if classification == "diverging"
            else "oscillation present, insufficient cycles to classify"
        ),
    )
    return json.dumps(result)


# ---------------------------------------------------------------------------
# Ziegler-Nichols (closed-loop, ultimate-cycle)
# ---------------------------------------------------------------------------


def ziegler_nichols_gains(
    critical_gain_ku: float,
    oscillation_period_tu: float,
    controller: str = "PID",
) -> str:
    """Classical Ziegler-Nichols ultimate-cycle tuning. controller ∈
    {P, PI, PID, PID-noovershoot, PID-someovershoot}.
    """
    Ku, Tu = float(critical_gain_ku), float(oscillation_period_tu)
    if Ku <= 0 or Tu <= 0:
        return "Error: Ku and Tu must both be positive."
    ctrl = controller.strip().lower()
    if   ctrl == "p":   kp, ti, td = 0.50 * Ku, math.inf, 0.0
    elif ctrl == "pi":  kp, ti, td = 0.45 * Ku, Tu / 1.2, 0.0
    elif ctrl == "pid": kp, ti, td = 0.60 * Ku, Tu / 2.0, Tu / 8.0
    elif ctrl in ("pid-noovershoot", "conservative"):   kp, ti, td = 0.20 * Ku, Tu / 2.0, Tu / 3.0
    elif ctrl in ("pid-someovershoot", "some"):         kp, ti, td = 0.33 * Ku, Tu / 2.0, Tu / 3.0
    else:
        return f"Error: unknown controller {controller!r}."
    return _gains_json("Ziegler-Nichols", ctrl.upper(), kp, ti, td, extra={"Ku": Ku, "Tu": Tu})


# ---------------------------------------------------------------------------
# Tyreus-Luyben (robust Z-N variant — less aggressive, better noise tolerance)
# ---------------------------------------------------------------------------


def tyreus_luyben_gains(
    critical_gain_ku: float,
    oscillation_period_tu: float,
    controller: str = "PID",
) -> str:
    """Tyreus-Luyben rules — derived from Ku, Tu like Z-N but tuned for
    robustness and less oscillation. Industrial process-control default
    when Z-N is too aggressive (common on real robots with sensor noise)."""
    Ku, Tu = float(critical_gain_ku), float(oscillation_period_tu)
    if Ku <= 0 or Tu <= 0:
        return "Error: Ku and Tu must both be positive."
    ctrl = controller.strip().lower()
    if   ctrl == "pi":  kp, ti, td = Ku / 3.2, 2.2 * Tu, 0.0
    elif ctrl == "pid": kp, ti, td = Ku / 2.2, 2.2 * Tu, Tu / 6.3
    else:
        return "Error: Tyreus-Luyben supports only PI or PID."
    return _gains_json("Tyreus-Luyben", ctrl.upper(), kp, ti, td, extra={"Ku": Ku, "Tu": Tu})


# ---------------------------------------------------------------------------
# Cohen-Coon (open-loop, needs FOPDT model K·e^(-Ls)/(τs+1))
# ---------------------------------------------------------------------------


def cohen_coon_gains(
    process_gain_k: float,
    time_constant_tau: float,
    dead_time_l: float,
    controller: str = "PID",
) -> str:
    """Cohen-Coon open-loop tuning from an identified FOPDT model. Better
    disturbance rejection than Z-N; favored on processes where dead-time L
    is a significant fraction of the time constant τ (L/τ > 0.3)."""
    K, tau, L = float(process_gain_k), float(time_constant_tau), float(dead_time_l)
    if K == 0 or tau <= 0 or L <= 0:
        return "Error: K≠0, τ>0, L>0 required."
    a = K * L / tau
    if   controller.lower() == "p":
        kc, ti, td = (1.0 / a) * (1.0 + L / (3.0 * tau)), math.inf, 0.0
    elif controller.lower() == "pi":
        kc = (0.9 / a) * (1.0 + L / (12.0 * tau))
        ti = L * (30.0 * tau + 3.0 * L) / (9.0 * tau + 20.0 * L)
        td = 0.0
    elif controller.lower() == "pid":
        kc = (1.0 / a) * (4.0 / 3.0 + L / (4.0 * tau))
        ti = L * (32.0 * tau + 6.0 * L) / (13.0 * tau + 8.0 * L)
        td = (4.0 * tau * L) / (11.0 * tau + 2.0 * L)
    else:
        return f"Error: unknown controller {controller!r}."
    return _gains_json(
        "Cohen-Coon", controller.upper(), kc, ti, td,
        extra={"K": K, "tau": tau, "L": L, "L_over_tau": round(L / tau, 3)},
    )


# ---------------------------------------------------------------------------
# Skogestad SIMC (Internal Model Control — industrial workhorse)
# ---------------------------------------------------------------------------


def skogestad_simc_gains(
    process_gain_k: float,
    time_constant_tau: float,
    dead_time_l: float,
    closed_loop_tau_c: float | None = None,
    controller: str = "PI",
) -> str:
    """Skogestad SIMC (Simple Internal Model Control) tuning for FOPDT.
    Ships one knob — closed-loop time constant τc. Default τc = L gives
    the 'fast but robust' trade-off; τc = 4L gives conservative.

    Reference: Skogestad, 'Simple analytic rules for model reduction and
    PID controller tuning', J. Process Control, 2003."""
    K, tau, L = float(process_gain_k), float(time_constant_tau), float(dead_time_l)
    if K == 0 or tau <= 0 or L < 0:
        return "Error: K≠0, τ>0, L≥0 required."
    tc = float(closed_loop_tau_c) if closed_loop_tau_c is not None else L
    if tc <= 0:
        return "Error: τc must be positive."
    ctrl = controller.strip().lower()
    if ctrl == "pi":
        kc = tau / (K * (tc + L))
        ti = min(tau, 4.0 * (tc + L))
        td = 0.0
    elif ctrl == "pid":
        # SIMC for PID requires second-order model; approximate by
        # letting Td = L/2 (common extension)
        kc = tau / (K * (tc + L))
        ti = min(tau, 4.0 * (tc + L))
        td = L / 2.0
    else:
        return "Error: Skogestad SIMC supports PI or PID."
    return _gains_json(
        "Skogestad SIMC", ctrl.upper(), kc, ti, td,
        extra={"K": K, "tau": tau, "L": L, "tau_c": tc,
               "robustness": "fast" if tc <= L else "conservative"},
    )


# ---------------------------------------------------------------------------
# Chien-Hrones-Reswick (FOPDT-based, explicit setpoint/disturbance variant)
# ---------------------------------------------------------------------------


def chien_hrones_reswick_gains(
    process_gain_k: float,
    time_constant_tau: float,
    dead_time_l: float,
    target: str = "setpoint",
    overshoot: str = "0pct",
    controller: str = "PID",
) -> str:
    """Chien-Hrones-Reswick (CHR) rules. Unlike Z-N/CC, CHR distinguishes
    *setpoint tracking* from *disturbance rejection*, and provides 0% or
    20% overshoot variants.

    target ∈ {setpoint, disturbance}
    overshoot ∈ {0pct, 20pct}
    """
    K, tau, L = float(process_gain_k), float(time_constant_tau), float(dead_time_l)
    if K == 0 or tau <= 0 or L <= 0:
        return "Error: K≠0, τ>0, L>0 required."
    tgt, ov, ctrl = target.strip().lower(), overshoot.strip().lower(), controller.strip().lower()

    # Table of coefficients [Kc_coef, Ti_coef (in τ or L), Td_coef (in L)]
    tables = {
        ("setpoint", "0pct"): {
            "p":   (0.3, math.inf, 0.0),
            "pi":  (0.35, 1.17, 0.0),       # Ti = 1.17 * tau
            "pid": (0.60, 1.00, 0.50),      # Ti = 1.00 * tau, Td = 0.50 * L
        },
        ("setpoint", "20pct"): {
            "p":   (0.70, math.inf, 0.0),
            "pi":  (0.60, 1.00, 0.0),
            "pid": (0.95, 1.36, 0.473),
        },
        ("disturbance", "0pct"): {
            "p":   (0.30, math.inf, 0.0),
            "pi":  (0.60, 4.00, 0.0),       # Ti = 4*L
            "pid": (0.95, 2.38, 0.42),      # Ti = 2.38*L, Td = 0.42*L
        },
        ("disturbance", "20pct"): {
            "p":   (0.70, math.inf, 0.0),
            "pi":  (0.70, 2.30, 0.0),
            "pid": (1.20, 2.00, 0.42),
        },
    }
    key = (tgt, ov)
    if key not in tables or ctrl not in tables[key]:
        return f"Error: unsupported CHR combo target={tgt} overshoot={ov} ctrl={ctrl}."
    kc_c, ti_c, td_c = tables[key][ctrl]

    kc = kc_c * (tau / (K * L))
    # For setpoint table Ti is scaled by tau; for disturbance by L
    if tgt == "setpoint":
        ti = ti_c * tau if ti_c != math.inf else math.inf
    else:
        ti = ti_c * L if ti_c != math.inf else math.inf
    td = td_c * L

    return _gains_json(
        f"CHR-{tgt}-{ov}", ctrl.upper(), kc, ti, td,
        extra={"K": K, "tau": tau, "L": L, "target": tgt, "overshoot": ov},
    )


# ---------------------------------------------------------------------------
# Shared gains formatter
# ---------------------------------------------------------------------------


def _gains_json(
    method: str, controller: str, kp: float, ti: float, td: float, extra: dict[str, Any]
) -> str:
    ki = kp / ti if ti not in (0.0, math.inf) else 0.0
    kd = kp * td
    payload: dict[str, Any] = {
        "method": method,
        "controller": controller,
        "Kp": round(kp, 6),
        "Ki": round(ki, 6),
        "Kd": round(kd, 6),
        "Ti": (round(ti, 6) if ti != math.inf else None),
        "Td": round(td, 6),
        **extra,
    }
    return json.dumps(payload)


# ---------------------------------------------------------------------------
# System identification: FOPDT via two-point method
# ---------------------------------------------------------------------------


def identify_fopdt(samples_json: str, step_magnitude: float = 1.0) -> str:
    """Fit a first-order-plus-dead-time model ``K·e^(-Ls) / (τs+1)`` to a
    step response using the two-point method (28.3% / 63.2%).

    *step_magnitude* is Δu — the size of the input step in control units.
    The samples must span from pre-step steady-state through post-step
    settling. Returns {K, tau, L} ready to feed Cohen-Coon, Skogestad,
    or CHR tuning tools."""
    try:
        payload = json.loads(samples_json)
    except json.JSONDecodeError as e:
        return f"Error: identify_fopdt expected JSON from topic_sample: {e}"

    series = payload.get("samples") or []
    pts = [(float(s["t"]), float(s["v"])) for s in series if s.get("v") is not None]
    if len(pts) < 20:
        return json.dumps({"error": f"need ≥20 samples, got {len(pts)}"})

    t0 = pts[0][0]
    vals = [p[1] for p in pts]
    times = [p[0] - t0 for p in pts]

    # Estimate pre-step baseline (first 5% of samples) and post-step SS
    # (last 10% of samples).
    pre_n = max(2, len(vals) // 20)
    post_n = max(3, len(vals) // 10)
    y0 = sum(vals[:pre_n]) / pre_n
    y_ss = sum(vals[-post_n:]) / post_n
    dy = y_ss - y0
    if abs(dy) < 1e-9:
        return json.dumps({"error": "no detectable step change in response"})
    if step_magnitude == 0:
        return json.dumps({"error": "step_magnitude must be non-zero"})

    K = dy / float(step_magnitude)

    def _time_at_frac(f: float) -> float | None:
        target = y0 + f * dy
        # Increasing or decreasing response handled by sign of dy
        for i in range(1, len(vals)):
            a, b = vals[i - 1], vals[i]
            if (a - target) * (b - target) <= 0 and a != b:
                # Linear interp
                frac = (target - a) / (b - a)
                return times[i - 1] + frac * (times[i] - times[i - 1])
        return None

    t28 = _time_at_frac(0.283)
    t63 = _time_at_frac(0.632)
    if t28 is None or t63 is None or t63 <= t28:
        return json.dumps({
            "error": "could not locate 28.3%/63.2% crossings",
            "y0": y0, "y_ss": y_ss,
        })
    tau = 1.5 * (t63 - t28)
    L = max(0.0, t63 - tau)

    return json.dumps({
        "method": "two-point (28.3%/63.2%)",
        "K": round(K, 6),
        "tau": round(tau, 6),
        "L": round(L, 6),
        "y_initial": round(y0, 6),
        "y_steady_state": round(y_ss, 6),
        "step_magnitude": step_magnitude,
        "t28_3pct": round(t28, 4),
        "t63_2pct": round(t63, 4),
        "L_over_tau": round(L / tau if tau > 0 else float("inf"), 3),
        "note": (
            "L/τ < 0.3 → use Z-N/Tyreus; 0.3 ≤ L/τ ≤ 1 → Cohen-Coon or "
            "Skogestad; L/τ > 1 → dead-time-dominant, use Smith predictor."
        ),
    })


# ---------------------------------------------------------------------------
# Step-response quality metrics
# ---------------------------------------------------------------------------


def step_response_metrics(
    samples_json: str,
    target: float | None = None,
    settling_tolerance: float = 0.02,
) -> str:
    """Compute classical step-response performance metrics: rise time
    (10-90%), settling time (±settling_tolerance), peak, overshoot %,
    steady-state error, damping ratio ζ, natural frequency ωn (from
    overshoot + period if underdamped).

    If *target* is None, infer from tail steady-state."""
    try:
        payload = json.loads(samples_json)
    except json.JSONDecodeError as e:
        return f"Error: step_response_metrics expected JSON from topic_sample: {e}"

    series = payload.get("samples") or []
    pts = [(float(s["t"]), float(s["v"])) for s in series if s.get("v") is not None]
    if len(pts) < 10:
        return json.dumps({"error": f"need ≥10 samples, got {len(pts)}"})

    times = [p[0] for p in pts]
    vals = [p[1] for p in pts]
    t0 = times[0]
    times = [t - t0 for t in times]

    pre_n = max(2, len(vals) // 20)
    y0 = sum(vals[:pre_n]) / pre_n
    y_ss = sum(vals[-max(3, len(vals) // 10):]) / max(3, len(vals) // 10)
    tgt = float(target) if target is not None else y_ss
    dy = y_ss - y0
    sign = 1.0 if dy >= 0 else -1.0

    # Peak
    if sign > 0:
        peak_val = max(vals)
    else:
        peak_val = min(vals)
    peak_idx = vals.index(peak_val)
    t_peak = times[peak_idx]

    overshoot_pct = None
    if abs(y_ss - y0) > 1e-9:
        overshoot_pct = ((peak_val - y_ss) / (y_ss - y0)) * 100.0 * sign
        overshoot_pct = max(0.0, overshoot_pct)

    # Damping ratio from overshoot (underdamped SOS)
    damping_zeta = None
    omega_n = None
    if overshoot_pct and overshoot_pct > 0.5:
        os_frac = overshoot_pct / 100.0
        ln_os = math.log(os_frac)
        damping_zeta = -ln_os / math.sqrt(math.pi ** 2 + ln_os ** 2)
        if t_peak > 0:
            omega_d = math.pi / t_peak
            omega_n = omega_d / math.sqrt(max(1e-9, 1.0 - damping_zeta ** 2))

    # Rise time (10-90% of Δy, first passage)
    t10 = t90 = None
    for i in range(1, len(vals)):
        v = vals[i]
        if t10 is None and sign * (v - (y0 + 0.10 * dy)) >= 0:
            t10 = times[i]
        if t90 is None and sign * (v - (y0 + 0.90 * dy)) >= 0:
            t90 = times[i]
            break
    rise_time = t90 - t10 if (t10 is not None and t90 is not None) else None

    # Settling time: last index where error > tol * |Δy|
    tol_abs = settling_tolerance * abs(dy) if abs(dy) > 1e-9 else settling_tolerance
    t_settle = None
    for i in range(len(vals) - 1, -1, -1):
        if abs(vals[i] - y_ss) > tol_abs:
            if i + 1 < len(times):
                t_settle = times[i + 1]
            break
    if t_settle is None and len(vals) > 0:
        t_settle = 0.0  # already settled at start

    ss_error = tgt - y_ss

    return json.dumps({
        "y_initial": round(y0, 6),
        "y_steady_state": round(y_ss, 6),
        "target": round(tgt, 6),
        "steady_state_error": round(ss_error, 6),
        "peak_value": round(peak_val, 6),
        "time_to_peak": round(t_peak, 4),
        "overshoot_pct": round(overshoot_pct, 3) if overshoot_pct is not None else None,
        "rise_time_10_90": round(rise_time, 4) if rise_time is not None else None,
        "settling_time": round(t_settle, 4) if t_settle is not None else None,
        "damping_ratio_zeta": round(damping_zeta, 4) if damping_zeta is not None else None,
        "natural_freq_omega_n": round(omega_n, 4) if omega_n is not None else None,
        "note": (
            "Underdamped (ζ<1) if overshoot>0; critical damping ζ≈0.707 "
            "gives fastest settle with no overshoot."
        ),
    })


# ---------------------------------------------------------------------------
# Sensor sanity check
# ---------------------------------------------------------------------------


def sensor_sanity_check(samples_json: str) -> str:
    """Audit a topic sample for common failure modes: flat (variance near
    zero — sensor possibly offline), stuck (long runs of identical values
    — frozen driver), saturated (clipping to min/max), and noisy (SNR too
    low for useful control). Non-destructive."""
    try:
        payload = json.loads(samples_json)
    except json.JSONDecodeError as e:
        return f"Error: sensor_sanity_check expected JSON: {e}"

    series = payload.get("samples") or []
    pts = [(float(s["t"]), float(s["v"])) for s in series if s.get("v") is not None]
    n = len(pts)
    if n < 10:
        return json.dumps({"verdict": "insufficient-data", "n_samples": n})

    vals = [p[1] for p in pts]
    mean = sum(vals) / n
    var = sum((v - mean) ** 2 for v in vals) / n
    std = math.sqrt(var)
    vmin, vmax = min(vals), max(vals)
    vrange = vmax - vmin

    # Longest identical-value run
    longest_run, cur_run = 1, 1
    for i in range(1, n):
        if vals[i] == vals[i - 1]:
            cur_run += 1
            longest_run = max(longest_run, cur_run)
        else:
            cur_run = 1

    # Clipping: samples at min or max (within 1e-6)
    clip_n = sum(1 for v in vals if abs(v - vmin) < 1e-9 or abs(v - vmax) < 1e-9)

    flags: list[str] = []
    if std < 1e-6:
        flags.append("flat")
    if longest_run >= max(10, n // 2):
        flags.append("stuck")
    if clip_n > n * 0.3 and vrange > 0:
        flags.append("saturated")
    if std > 0 and abs(mean) > 0 and std / abs(mean) > 3.0:
        flags.append("noisy-high-SNR-required")

    verdict = "healthy" if not flags else ", ".join(flags)
    return json.dumps({
        "verdict": verdict,
        "n_samples": n,
        "mean": round(mean, 6),
        "stddev": round(std, 6),
        "min": round(vmin, 6),
        "max": round(vmax, 6),
        "range": round(vrange, 6),
        "longest_identical_run": longest_run,
        "clipped_samples": clip_n,
        "clipped_fraction": round(clip_n / n, 3),
    })


# ---------------------------------------------------------------------------
# Rosbag record + inspect (postmortem / reproducibility)
# ---------------------------------------------------------------------------


def bag_record(
    topics: list[str],
    duration_sec: float = 10.0,
    output_name: str | None = None,
) -> str:
    """Record listed topics to a rosbag for *duration_sec*. Bags land in
    ``<workspace>/rosbags/<output_name>`` (auto-created). Tuning sessions
    should always record — reproducibility and postmortem analysis are
    non-negotiable at engineering level."""
    from roscode.tools._state import get_workspace
    if not topics:
        return "Error: at least one topic required."
    try:
        ws = get_workspace()
    except RuntimeError as e:
        return f"Error: {e}"
    bag_dir = ws / "rosbags"
    bag_dir.mkdir(exist_ok=True)
    name = output_name or f"tune_{int(time.time())}"
    out_path = bag_dir / name

    cmd = [
        "timeout", f"{duration_sec}",
        "ros2", "bag", "record",
        "-o", str(out_path),
        *topics,
    ]
    result = _shell.run(cmd, timeout=duration_sec + 5.0)
    if result.returncode not in (0, 124):
        return f"Error: ros2 bag record failed: {result.stderr.strip()}"
    return (
        f"Recorded {len(topics)} topic(s) to {out_path} for ~{duration_sec}s.\n"
        f"Topics: {', '.join(topics)}\n"
        f"Inspect with: ros2 bag info {out_path}"
    )


def bag_info(bag_path: str) -> str:
    """Summarize a rosbag: duration, message counts, topic types. Read-only."""
    result = _shell.run(["ros2", "bag", "info", bag_path], timeout=10.0)
    if not result.ok:
        return f"Error: ros2 bag info failed: {result.stderr.strip() or result.stdout.strip()}"
    return result.stdout.strip()


# ---------------------------------------------------------------------------
# Action goals
# ---------------------------------------------------------------------------


def action_send_goal(
    action: str,
    action_type: str,
    goal: str,
    timeout_sec: float = 60.0,
    with_feedback: bool = True,
) -> str:
    """Send a goal to a ROS 2 action server and wait for the result.

    DESTRUCTIVE — action servers typically command motion (Nav2 NavigateTo,
    MoveIt MoveGroup, etc.). The agent loop confirms this call.
    """
    cmd = ["timeout", f"{timeout_sec}", "ros2", "action", "send_goal"]
    if with_feedback:
        cmd.append("-f")
    cmd.extend([action, action_type, goal])
    result = _shell.run(cmd, timeout=timeout_sec + 3.0)
    if not result.ok and result.returncode != 124:
        return f"Error: ros2 action send_goal failed: {result.stderr.strip() or result.stdout.strip()}"
    return result.stdout.strip() or "(action completed with no output)"


# ---------------------------------------------------------------------------
# E-stop — always available, never gated
# ---------------------------------------------------------------------------


def robot_estop(cmd_vel_topic: str = "/cmd_vel", msg_type: str = "geometry_msgs/msg/Twist") -> str:
    """Emergency stop: publish a single zero-velocity Twist. Failsafe — NOT
    in DESTRUCTIVE_TOOLS so the agent can invoke it without waiting on a
    human if ``analyze_signal`` reports a diverging response."""
    zero_msg = (
        "{linear: {x: 0.0, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.0}}"
    )
    result = _shell.run(
        ["ros2", "topic", "pub", "--once", cmd_vel_topic, msg_type, zero_msg],
        timeout=3.0,
    )
    if not result.ok:
        return f"Error: e-stop publish failed on {cmd_vel_topic}: {result.stderr.strip()}"
    return f"ESTOP: zero Twist published on {cmd_vel_topic}."


# ---------------------------------------------------------------------------
# Schemas + dispatch table
# ---------------------------------------------------------------------------


SCHEMAS: list[dict[str, Any]] = [
    {
        "name": "topic_publish",
        "description": (
            "Publish a message to a ROS 2 topic. DESTRUCTIVE — moves the robot. "
            "Use count>1 + rate_hz to batch a step-response or continuous drive "
            "into a single confirmation (e.g. count=30 rate_hz=10 = 3 s at 10 Hz). "
            "Twist / TwistStamped messages are rejected if they exceed the safety "
            "envelope (call safety_envelope first to read the limits). "
            "For autonomous controller tuning, ALWAYS pair each publish with a "
            "topic_sample on the response topic and an analyze_signal call before "
            "deciding the next step."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string", "description": "Full topic name, e.g. /cmd_vel."},
                "msg_type": {
                    "type": "string",
                    "description": "Fully-qualified type, e.g. geometry_msgs/msg/Twist.",
                },
                "message": {
                    "type": "string",
                    "description": (
                        "Flow-style YAML (also valid JSON) payload, e.g. "
                        "'{linear: {x: 0.1}, angular: {z: 0.0}}'."
                    ),
                },
                "count": {
                    "type": "integer",
                    "description": "Number of messages to publish. 1 = one-shot. Default 1.",
                    "default": 1,
                },
                "rate_hz": {
                    "type": "number",
                    "description": "Publish rate when count>1. Default 10.",
                    "default": 10.0,
                },
            },
            "required": ["topic", "msg_type", "message"],
        },
    },
    {
        "name": "topic_sample",
        "description": (
            "Collect a time-stamped series of messages from a topic for "
            "duration_sec seconds. If `field` is given (dotted path such as "
            "'twist.twist.linear.x'), the returned JSON contains only {t, v} "
            "pairs — ready to feed straight into analyze_signal. Without `field`, "
            "raw message text is returned. Non-destructive observation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topic": {"type": "string"},
                "duration_sec": {"type": "number", "default": 3.0},
                "field": {
                    "type": "string",
                    "description": (
                        "Dotted path into the message to extract as 'v'. Example: "
                        "'pose.pose.position.x' for Odometry, 'twist.linear.x'."
                    ),
                },
                "max_samples": {"type": "integer", "default": 500},
            },
            "required": ["topic"],
        },
    },
    {
        "name": "analyze_signal",
        "description": (
            "Analyze a time series (from topic_sample with `field`) and return a "
            "JSON summary: period, frequency, amplitude, envelope trend "
            "(sustained / diverging / damped), and a one-line interpretation. "
            "This is the judge for closed-loop tuning: 'sustained' means Ku found; "
            "'damped' means raise gain; 'diverging' means drop gain and e-stop."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "samples_json": {
                    "type": "string",
                    "description": "JSON output from topic_sample (with `field`).",
                },
            },
            "required": ["samples_json"],
        },
    },
    {
        "name": "ziegler_nichols_gains",
        "description": (
            "Compute PID gains from measured ultimate gain Ku and period Tu using "
            "classical Ziegler-Nichols (closed-loop, ultimate-cycle method). Best for "
            "stable plants without significant dead time. On real robots with noise, "
            "prefer tyreus_luyben_gains instead — Z-N is known to be aggressive."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "critical_gain_ku": {"type": "number"},
                "oscillation_period_tu": {"type": "number"},
                "controller": {
                    "type": "string",
                    "enum": ["P", "PI", "PID", "PID-noovershoot", "PID-someovershoot"],
                    "default": "PID",
                },
            },
            "required": ["critical_gain_ku", "oscillation_period_tu"],
        },
    },
    {
        "name": "tyreus_luyben_gains",
        "description": (
            "Robust Tyreus-Luyben PID tuning from Ku, Tu. Uses smaller Kp and larger "
            "Ti than Z-N for better noise tolerance and less overshoot. Industrial "
            "default when Z-N is too aggressive — recommended for wheeled robots, "
            "drones, and anything with measurement noise."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "critical_gain_ku": {"type": "number"},
                "oscillation_period_tu": {"type": "number"},
                "controller": {"type": "string", "enum": ["PI", "PID"], "default": "PID"},
            },
            "required": ["critical_gain_ku", "oscillation_period_tu"],
        },
    },
    {
        "name": "cohen_coon_gains",
        "description": (
            "Cohen-Coon open-loop tuning from an identified FOPDT model "
            "(K·e^(-Ls)/(τs+1)). Best choice for disturbance rejection when L/τ is "
            "significant (>0.3). Call identify_fopdt first to obtain K, τ, L."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "process_gain_k": {"type": "number"},
                "time_constant_tau": {"type": "number"},
                "dead_time_l": {"type": "number"},
                "controller": {"type": "string", "enum": ["P", "PI", "PID"], "default": "PID"},
            },
            "required": ["process_gain_k", "time_constant_tau", "dead_time_l"],
        },
    },
    {
        "name": "skogestad_simc_gains",
        "description": (
            "Skogestad SIMC (Simple Internal Model Control) tuning from a FOPDT "
            "model. Industrial workhorse — exposes closed-loop_tau_c (τc) as the "
            "single robustness knob. τc = L: fast; τc = 4L: conservative. "
            "If omitted, defaults to τc = L."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "process_gain_k": {"type": "number"},
                "time_constant_tau": {"type": "number"},
                "dead_time_l": {"type": "number"},
                "closed_loop_tau_c": {
                    "type": "number",
                    "description": "Desired closed-loop time constant τc. Default L.",
                },
                "controller": {"type": "string", "enum": ["PI", "PID"], "default": "PI"},
            },
            "required": ["process_gain_k", "time_constant_tau", "dead_time_l"],
        },
    },
    {
        "name": "chien_hrones_reswick_gains",
        "description": (
            "Chien-Hrones-Reswick (CHR) tuning from FOPDT. Unlike Z-N/CC, CHR "
            "explicitly distinguishes setpoint tracking vs disturbance rejection, "
            "and offers 0% or 20% overshoot variants."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "process_gain_k": {"type": "number"},
                "time_constant_tau": {"type": "number"},
                "dead_time_l": {"type": "number"},
                "target": {
                    "type": "string",
                    "enum": ["setpoint", "disturbance"],
                    "default": "setpoint",
                },
                "overshoot": {"type": "string", "enum": ["0pct", "20pct"], "default": "0pct"},
                "controller": {"type": "string", "enum": ["P", "PI", "PID"], "default": "PID"},
            },
            "required": ["process_gain_k", "time_constant_tau", "dead_time_l"],
        },
    },
    {
        "name": "identify_fopdt",
        "description": (
            "Fit a first-order-plus-dead-time model K·e^(-Ls)/(τs+1) to a step "
            "response using the two-point (28.3%/63.2%) method. Feed the result "
            "into cohen_coon_gains / skogestad_simc_gains / chien_hrones_reswick_gains. "
            "step_magnitude is Δu (size of the input step applied just before sampling)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "samples_json": {
                    "type": "string",
                    "description": "JSON output from topic_sample (with `field`).",
                },
                "step_magnitude": {"type": "number", "default": 1.0},
            },
            "required": ["samples_json"],
        },
    },
    {
        "name": "step_response_metrics",
        "description": (
            "Compute classical step-response quality: rise time (10-90%), settling "
            "time (±tolerance), overshoot %, steady-state error, damping ratio ζ, "
            "natural frequency ωn (when underdamped). Use this after applying new "
            "gains to quantitatively verify the tuning meets spec."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "samples_json": {"type": "string"},
                "target": {
                    "type": "number",
                    "description": "Commanded setpoint. If omitted, uses tail steady-state.",
                },
                "settling_tolerance": {"type": "number", "default": 0.02},
            },
            "required": ["samples_json"],
        },
    },
    {
        "name": "sensor_sanity_check",
        "description": (
            "Audit a topic sample for flat/stuck/saturated/noisy sensor states. "
            "ALWAYS call this on the feedback topic before tuning — a bad sensor "
            "produces bad models produces bad gains. Returns a verdict and per-"
            "metric stats."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"samples_json": {"type": "string"}},
            "required": ["samples_json"],
        },
    },
    {
        "name": "bag_record",
        "description": (
            "Record listed topics to a rosbag for postmortem analysis. Bags land in "
            "<workspace>/rosbags/<output_name>. Every tuning iteration should be "
            "recorded for reproducibility."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "topics": {"type": "array", "items": {"type": "string"}},
                "duration_sec": {"type": "number", "default": 10.0},
                "output_name": {
                    "type": "string",
                    "description": "Bag name (no extension). Default tune_<unix_ts>.",
                },
            },
            "required": ["topics"],
        },
    },
    {
        "name": "bag_info",
        "description": "Summarize a recorded rosbag (duration, counts, topic types).",
        "input_schema": {
            "type": "object",
            "properties": {"bag_path": {"type": "string"}},
            "required": ["bag_path"],
        },
    },
    {
        "name": "action_send_goal",
        "description": (
            "Send a goal to a ROS 2 action server and wait for the result. "
            "DESTRUCTIVE — typically commands motion (Nav2, MoveIt). Use "
            "with_feedback=true to stream progress."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "action": {"type": "string", "description": "Full action name."},
                "action_type": {
                    "type": "string",
                    "description": "Action type, e.g. nav2_msgs/action/NavigateToPose.",
                },
                "goal": {
                    "type": "string",
                    "description": "Flow-style YAML / JSON goal payload.",
                },
                "timeout_sec": {"type": "number", "default": 60.0},
                "with_feedback": {"type": "boolean", "default": True},
            },
            "required": ["action", "action_type", "goal"],
        },
    },
    {
        "name": "robot_estop",
        "description": (
            "Emergency stop — publish a zero-velocity Twist. NOT gated, "
            "intended as a failsafe the agent calls itself when "
            "analyze_signal reports diverging behaviour."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "cmd_vel_topic": {"type": "string", "default": "/cmd_vel"},
                "msg_type": {"type": "string", "default": "geometry_msgs/msg/Twist"},
            },
        },
    },
    {
        "name": "safety_envelope",
        "description": (
            "Return the safety caps currently enforced on topic_publish. "
            "Always call this BEFORE the first publish of a tuning session "
            "so you know how high you can push gains without hitting the "
            "hard wall."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]

TOOLS = {
    "topic_publish": topic_publish,
    "topic_sample": topic_sample,
    "analyze_signal": analyze_signal,
    "ziegler_nichols_gains": ziegler_nichols_gains,
    "tyreus_luyben_gains": tyreus_luyben_gains,
    "cohen_coon_gains": cohen_coon_gains,
    "skogestad_simc_gains": skogestad_simc_gains,
    "chien_hrones_reswick_gains": chien_hrones_reswick_gains,
    "identify_fopdt": identify_fopdt,
    "step_response_metrics": step_response_metrics,
    "sensor_sanity_check": sensor_sanity_check,
    "bag_record": bag_record,
    "bag_info": bag_info,
    "action_send_goal": action_send_goal,
    "robot_estop": robot_estop,
    "safety_envelope": safety_envelope,
}
