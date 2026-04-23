"""Tests for roscode.tools.runtime_tools — pure-Python paths plus mocked shell."""

from __future__ import annotations

import json
import math

import pytest

from roscode.tools import runtime_tools as rt


# ---------------------------------------------------------------------------
# Safety envelope & Twist caps
# ---------------------------------------------------------------------------


def test_extract_numeric_field_twist_linear_x():
    msg = "{linear: {x: 0.25, y: 0.0, z: 0.0}, angular: {x: 0.0, y: 0.0, z: 0.5}}"
    assert rt._extract_numeric_field(msg, "linear.x") == pytest.approx(0.25)
    assert rt._extract_numeric_field(msg, "angular.z") == pytest.approx(0.5)
    assert rt._extract_numeric_field(msg, "angular.x") == pytest.approx(0.0)


def test_check_safety_twist_inside_envelope():
    ok, reason = rt._check_safety(
        "geometry_msgs/msg/Twist",
        "{linear: {x: 0.1}, angular: {z: 0.2}}",
    )
    assert ok
    assert reason == ""


def test_check_safety_rejects_over_cap():
    ok, reason = rt._check_safety(
        "geometry_msgs/msg/Twist",
        "{linear: {x: 5.0}, angular: {z: 0.1}}",
    )
    assert not ok
    assert "linear.x" in reason


def test_topic_publish_rejects_unsafe(fake_shell, shell_result):
    fake_shell(scripts={}, default=shell_result())
    out = rt.topic_publish(
        topic="/cmd_vel",
        msg_type="geometry_msgs/msg/Twist",
        message="{linear: {x: 10.0}, angular: {z: 0}}",
    )
    assert out.startswith("REJECTED")
    assert "linear.x" in out


def test_topic_publish_batched_uses_rate_and_count(fake_shell, shell_result):
    fake_shell(scripts={("ros2",): [shell_result(stdout="publishing...\n")]})
    out = rt.topic_publish(
        topic="/cmd_vel",
        msg_type="geometry_msgs/msg/Twist",
        message="{linear: {x: 0.1}, angular: {z: 0.0}}",
        count=20,
        rate_hz=10.0,
    )
    assert "20×" in out
    assert "/cmd_vel" in out


# ---------------------------------------------------------------------------
# analyze_signal — canonical shapes
# ---------------------------------------------------------------------------


def _series(vals: list[float], dt: float = 0.05) -> str:
    return json.dumps(
        {"samples": [{"t": round(i * dt, 4), "v": v} for i, v in enumerate(vals)]}
    )


def test_analyze_signal_detects_sustained_oscillation():
    # 2 Hz clean sine, ~5 full cycles
    vals = [math.sin(2 * math.pi * 2.0 * (i * 0.01)) for i in range(250)]
    out = json.loads(rt.analyze_signal(_series(vals, dt=0.01)))
    assert out["oscillating"] is True
    assert out["freq_hz"] == pytest.approx(2.0, rel=0.1)
    assert out["classification"] in ("sustained", "oscillating")


def test_analyze_signal_detects_damped_response():
    # Exponentially decaying sine
    vals = [math.exp(-0.5 * i * 0.01) * math.sin(2 * math.pi * 2.0 * i * 0.01) for i in range(400)]
    out = json.loads(rt.analyze_signal(_series(vals, dt=0.01)))
    assert out["oscillating"] is True
    assert out["classification"] == "damped"


def test_analyze_signal_detects_diverging_response():
    # Exponentially growing sine
    vals = [math.exp(0.4 * i * 0.01) * math.sin(2 * math.pi * 2.0 * i * 0.01) for i in range(250)]
    out = json.loads(rt.analyze_signal(_series(vals, dt=0.01)))
    assert out["oscillating"] is True
    assert out["classification"] == "diverging"


def test_analyze_signal_flat_signal_no_oscillation():
    vals = [0.5] * 50
    out = json.loads(rt.analyze_signal(_series(vals)))
    assert out["oscillating"] is False


# ---------------------------------------------------------------------------
# Controller tuning math
# ---------------------------------------------------------------------------


def test_ziegler_nichols_pid_classical():
    out = json.loads(rt.ziegler_nichols_gains(2.0, 0.8, controller="PID"))
    assert out["Kp"] == pytest.approx(1.2)
    assert out["Ki"] == pytest.approx(3.0)       # Kp/(Tu/2) = 1.2/0.4
    assert out["Kd"] == pytest.approx(0.12)      # Kp*(Tu/8) = 1.2*0.1


def test_tyreus_luyben_pid():
    out = json.loads(rt.tyreus_luyben_gains(2.0, 0.8, controller="PID"))
    assert out["Kp"] == pytest.approx(2.0 / 2.2)
    assert out["Ti"] == pytest.approx(2.2 * 0.8)


def test_cohen_coon_pid():
    out = json.loads(rt.cohen_coon_gains(1.0, 5.0, 1.0, controller="PID"))
    assert out["method"] == "Cohen-Coon"
    assert out["Kp"] > 0 and out["Ki"] > 0 and out["Kd"] > 0


def test_skogestad_simc_pi_defaults_tc_to_L():
    out = json.loads(rt.skogestad_simc_gains(1.0, 5.0, 1.0, controller="PI"))
    # Kc = τ / (K * (τc + L)) = 5 / (1 * (1 + 1)) = 2.5
    assert out["Kp"] == pytest.approx(2.5)
    assert out["tau_c"] == 1.0


def test_chr_setpoint_0pct_pid():
    out = json.loads(
        rt.chien_hrones_reswick_gains(1.0, 5.0, 1.0, target="setpoint",
                                      overshoot="0pct", controller="PID")
    )
    # Kc = 0.6 * τ/(K·L) = 0.6 * 5/(1*1) = 3.0
    assert out["Kp"] == pytest.approx(3.0)
    assert out["method"] == "CHR-setpoint-0pct"


# ---------------------------------------------------------------------------
# identify_fopdt
# ---------------------------------------------------------------------------


def test_identify_fopdt_recovers_K_tau_L():
    # Simulated step response: y(t) = K·(1 - exp(-(t-L)/τ)) for t ≥ L
    # step at t=2s so first 5% window is clean pre-step zeros
    K_true, tau_true, L_true = 2.0, 3.0, 2.0
    dt = 0.05
    samples = []
    for i in range(int(30.0 / dt)):  # 600 samples, pre-step 40, post-step 560
        t = i * dt
        y = 0.0 if t < L_true else K_true * (1.0 - math.exp(-(t - L_true) / tau_true))
        samples.append({"t": round(t, 4), "v": y})
    payload = json.dumps({"samples": samples})

    out = json.loads(rt.identify_fopdt(payload, step_magnitude=1.0))
    assert out["K"] == pytest.approx(K_true, rel=0.05)
    assert out["tau"] == pytest.approx(tau_true, rel=0.25)
    assert out["L"] == pytest.approx(L_true, abs=0.3)


# ---------------------------------------------------------------------------
# step_response_metrics
# ---------------------------------------------------------------------------


def test_step_response_metrics_underdamped():
    # Underdamped step: y(t) = 1 - exp(-ζωn t)·cos(ωd t) approximately
    zeta, wn = 0.3, 5.0
    wd = wn * math.sqrt(1 - zeta ** 2)
    dt = 0.005
    samples = []
    for i in range(int(3.0 / dt)):
        t = i * dt
        y = 1.0 - math.exp(-zeta * wn * t) * (
            math.cos(wd * t) + (zeta * wn / wd) * math.sin(wd * t)
        )
        samples.append({"t": round(t, 5), "v": y})
    payload = json.dumps({"samples": samples})

    out = json.loads(rt.step_response_metrics(payload, target=1.0))
    assert out["overshoot_pct"] > 0  # underdamped
    assert out["damping_ratio_zeta"] == pytest.approx(zeta, abs=0.05)
    assert out["rise_time_10_90"] is not None


# ---------------------------------------------------------------------------
# sensor_sanity_check
# ---------------------------------------------------------------------------


def test_sensor_sanity_flat_is_flagged():
    vals = [0.0] * 50
    out = json.loads(rt.sensor_sanity_check(_series(vals)))
    assert "flat" in out["verdict"] or "stuck" in out["verdict"]


def test_sensor_sanity_healthy_signal_passes():
    vals = [0.5 + 0.05 * math.sin(0.3 * i) for i in range(100)]
    out = json.loads(rt.sensor_sanity_check(_series(vals)))
    assert out["verdict"] == "healthy"


# ---------------------------------------------------------------------------
# robot_estop
# ---------------------------------------------------------------------------


def test_robot_estop_publishes_zero_twist(fake_shell, shell_result):
    fake_shell(scripts={("ros2",): [shell_result(stdout="published\n")]})
    out = rt.robot_estop()
    assert "ESTOP" in out
    assert "/cmd_vel" in out


# ---------------------------------------------------------------------------
# Nonlinear / robust control tools
# ---------------------------------------------------------------------------


def test_sliding_mode_gains_recovers_lambda_from_settling():
    out = json.loads(rt.sliding_mode_gains(settling_time_sec=0.4, uncertainty_bound=1.5))
    # λ = 4/Ts = 10
    assert out["sliding_slope_lambda"] == pytest.approx(10.0)
    # k = F + η = 1.5 + 0.1 = 1.6
    assert out["switching_gain_k"] == pytest.approx(1.6)


def test_smith_predictor_default_tau_c_is_tau_over_3():
    out = json.loads(rt.smith_predictor_gains(2.0, 3.0, 2.0))
    # tc = tau/3 = 1, Kc = tau/(K*tc) = 3/(2*1) = 1.5
    assert out["tau_c"] == pytest.approx(1.0)
    assert out["Kp"] == pytest.approx(1.5)
    assert out["Ti"] == pytest.approx(3.0)


def test_cascaded_pid_inner_faster_than_outer():
    out = json.loads(rt.cascaded_pid_design(1.0, 0.5, 0.05, bandwidth_ratio=5.0))
    assert out["inner_loop"]["bandwidth_hz"] > out["outer_loop"]["bandwidth_hz"]
    assert out["bandwidth_ratio"] == 5.0


def test_gain_schedule_interp_midpoint():
    table = json.dumps([
        {"op": 0.0, "Kp": 1.0, "Ki": 0.0, "Kd": 0.0},
        {"op": 1.0, "Kp": 3.0, "Ki": 0.4, "Kd": 0.08},
    ])
    out = json.loads(rt.gain_schedule_interp(table, 0.5))
    assert out["Kp"] == pytest.approx(2.0)
    assert out["Ki"] == pytest.approx(0.2)
    assert out["Kd"] == pytest.approx(0.04)


def test_gain_schedule_interp_clamps_high():
    table = json.dumps([
        {"op": 0.0, "Kp": 1.0, "Ki": 0.0, "Kd": 0.0},
        {"op": 1.0, "Kp": 3.0, "Ki": 0.4, "Kd": 0.08},
    ])
    out = json.loads(rt.gain_schedule_interp(table, 5.0))
    assert out["Kp"] == pytest.approx(3.0)
    assert "clamped" in out["source"]


def test_mrac_gamma_default_is_fraction_of_max():
    out = json.loads(rt.mrac_adaptation_sizing(reference_omega_n=4.0, signal_rms_estimate=1.0))
    assert out["gamma_recommended"] < out["gamma_stability_upper_bound"]
    assert out["gamma_recommended"] == pytest.approx(0.2 * out["gamma_stability_upper_bound"])


def test_relay_autotune_rejects_over_envelope():
    out = rt.relay_autotune(
        cmd_topic="/cmd_vel",
        cmd_msg_type="geometry_msgs/msg/Twist",
        cmd_field="angular.z",
        feedback_topic="/odom",
        feedback_msg_type="nav_msgs/msg/Odometry",
        feedback_field="twist.twist.angular.z",
        relay_amplitude=10.0,  # exceeds default cap 0.5 rad/s on angular.z
    )
    assert out.startswith("REJECTED")
    assert "angular.z" in out
