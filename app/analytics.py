"""
analytics.py — Vitals Statistics & Trend Analysis Engine
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pure Python — no LLMs, no external dependencies beyond math.

Provides:
  - Statistical summaries (avg, min, max, std_dev) for BP and sugar
  - Linear trend direction (improving / worsening / stable)
  - Clinical risk classification based on standard medical thresholds
  - Time-windowed filtering (7d / 30d / 90d / all)

Clinical Thresholds Used:
  Blood Pressure (systolic/diastolic):
    Normal    : systolic <  120 and diastolic <  80
    Elevated  : systolic  120–129 and diastolic < 80
    High      : systolic  130–139 or diastolic  80–89
    Crisis    : systolic >= 140 or diastolic  >= 90

  Blood Sugar (fasting/post-meal):
    Normal      : fasting < 100 and post_meal < 140
    Pre-Diabetic: fasting 100–125 or post_meal 140–199
    Diabetic    : fasting >= 126 or post_meal >= 200
    Critical    : fasting >= 250 or post_meal >= 300
"""

import math
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================================================
# Helpers
# ============================================================================

def _filter_by_days(records: list, days: Optional[int], date_attr: str = "recorded_at") -> list:
    """
    Filters a list of ORM records to those recorded within the last `days` days.
    If days is None, returns all records.
    """
    if days is None:
        return records
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = []
    for r in records:
        recorded = getattr(r, date_attr)
        # Handle both tz-aware and tz-naive datetimes
        if recorded.tzinfo is None:
            recorded = recorded.replace(tzinfo=timezone.utc)
        if recorded >= cutoff:
            result.append(r)
    return result


def _std_dev(values: list[float]) -> float:
    """Population standard deviation. Returns 0.0 for fewer than 2 values."""
    if len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    variance = sum((x - mean) ** 2 for x in values) / len(values)
    return round(math.sqrt(variance), 1)


def _linear_trend(values: list[float], label: str = "value") -> str:
    """
    Fits a simple linear regression on the series (treating index as x).
    Returns 'improving', 'worsening', or 'stable' based on the slope
    relative to the mean magnitude.

    'improving' means values are going DOWN (lower BP/sugar is better).
    'worsening' means values are going UP.
    """
    n = len(values)
    if n < 3:
        return "stable"  # not enough data for a meaningful trend

    # Simple linear regression: slope = (n·Σxy - Σx·Σy) / (n·Σx² - (Σx)²)
    x_vals = list(range(n))
    sum_x  = sum(x_vals)
    sum_y  = sum(values)
    sum_xy = sum(x * y for x, y in zip(x_vals, values))
    sum_x2 = sum(x ** 2 for x in x_vals)

    denom = n * sum_x2 - sum_x ** 2
    if denom == 0:
        return "stable"

    slope = (n * sum_xy - sum_x * sum_y) / denom
    mean  = sum_y / n

    # Threshold: slope must be >1% of mean to be considered meaningful
    threshold = 0.01 * mean if mean != 0 else 0.5

    if slope > threshold:
        direction = "worsening"     # rising vitals = bad
    elif slope < -threshold:
        direction = "improving"     # falling vitals = good
    else:
        direction = "stable"

    logger.debug("[Analytics] %s trend: slope=%.3f, mean=%.1f → %s", label, slope, mean, direction)
    return direction


def _stat_block(values: list[float], label: str) -> dict:
    """Builds a statistics dictionary for a single metric series."""
    if not values:
        return {"avg": None, "min": None, "max": None, "std_dev": None, "trend": None}
    return {
        "avg":     round(sum(values) / len(values), 1),
        "min":     round(min(values), 1),
        "max":     round(max(values), 1),
        "std_dev": _std_dev(values),
        "trend":   _linear_trend(values, label=label),
    }


# ============================================================================
# Blood Pressure Risk Classification
# ============================================================================

def classify_bp_risk(avg_systolic: float, avg_diastolic: float) -> tuple[str, str]:
    """
    Returns (risk_level, risk_description) based on AHA blood pressure categories.
    Uses average readings over the selected period.
    """
    sys = avg_systolic
    dia = avg_diastolic

    if sys >= 180 or dia >= 120:
        return (
            "HYPERTENSIVE_CRISIS",
            "⚠️ CRITICAL: Hypertensive crisis. Seek emergency medical care immediately.",
        )
    if sys >= 140 or dia >= 90:
        return (
            "HIGH",
            "Blood pressure is consistently high (Stage 2 Hypertension). "
            "Medical evaluation and treatment are strongly recommended.",
        )
    if sys >= 130 or dia >= 80:
        return (
            "ELEVATED_HIGH",
            "Blood pressure is in Stage 1 Hypertension range. "
            "Lifestyle changes and physician consultation are advised.",
        )
    if sys >= 120 and dia < 80:
        return (
            "ELEVATED",
            "Systolic pressure is slightly elevated. Monitor regularly and reduce sodium intake.",
        )
    return (
        "NORMAL",
        "Blood pressure is within the normal range. Keep up the good work! 💚",
    )


# ============================================================================
# Blood Sugar Risk Classification
# ============================================================================

def classify_sugar_risk(avg_fasting: float, avg_post_meal: float) -> tuple[str, str]:
    """
    Returns (risk_level, risk_description) based on ADA blood glucose categories.
    Uses average readings over the selected period.
    """
    fast = avg_fasting
    post = avg_post_meal

    if fast >= 250 or post >= 300:
        return (
            "CRITICAL",
            "⚠️ CRITICAL: Blood sugar levels are dangerously high. "
            "Seek immediate medical attention.",
        )
    if fast >= 126 or post >= 200:
        return (
            "DIABETIC_RANGE",
            "Blood sugar levels are consistently in the diabetic range. "
            "Please consult your physician immediately for treatment planning.",
        )
    if fast >= 100 or post >= 140:
        return (
            "PRE_DIABETIC",
            "Blood sugar levels are in the pre-diabetic range. "
            "Dietary changes and regular monitoring are strongly recommended.",
        )
    return (
        "NORMAL",
        "Blood sugar levels are within the normal range. Excellent control! 💚",
    )


# ============================================================================
# Blood Pressure Statistics
# ============================================================================

def compute_bp_stats(records: list, days: Optional[int]) -> dict:
    """
    Computes comprehensive blood pressure statistics for a given patient.

    Args:
        records: List of VitalsBP ORM objects (all readings, unfiltered).
        days:    Number of days to look back. None = all time.

    Returns:
        A statistics dict ready to be returned as a JSON response.
    """
    filtered = _filter_by_days(records, days)

    if not filtered:
        return {
            "reading_count": 0,
            "period_days": days,
            "message": f"No blood pressure readings found in the {'last ' + str(days) + ' days' if days else 'entire history'}.",
        }

    # Sort chronologically for accurate trend computation
    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)

    sys_vals  = [r.systolic  for r in filtered_sorted]
    dia_vals  = [r.diastolic for r in filtered_sorted]

    sys_stats = _stat_block(sys_vals,  label="systolic")
    dia_stats = _stat_block(dia_vals,  label="diastolic")

    risk_level, risk_desc = classify_bp_risk(sys_stats["avg"], dia_stats["avg"])

    period_start = filtered_sorted[0].recorded_at.isoformat()
    period_end   = filtered_sorted[-1].recorded_at.isoformat()

    return {
        "reading_count":    len(filtered),
        "period_days":      days,
        "period_start":     period_start,
        "period_end":       period_end,
        "systolic":         sys_stats,
        "diastolic":        dia_stats,
        "overall_risk":     risk_level,
        "risk_description": risk_desc,
        "thresholds": {
            "normal":  "systolic < 120 AND diastolic < 80",
            "elevated": "systolic 120–129 AND diastolic < 80",
            "high":    "systolic ≥ 130 OR diastolic ≥ 80",
            "crisis":  "systolic ≥ 180 OR diastolic ≥ 120",
        },
    }


# ============================================================================
# Blood Sugar Statistics
# ============================================================================

def compute_sugar_stats(records: list, days: Optional[int]) -> dict:
    """
    Computes comprehensive blood sugar statistics for a given patient.

    Args:
        records: List of VitalsSugar ORM objects (all readings, unfiltered).
        days:    Number of days to look back. None = all time.

    Returns:
        A statistics dict ready to be returned as a JSON response.
    """
    filtered = _filter_by_days(records, days)

    if not filtered:
        return {
            "reading_count": 0,
            "period_days": days,
            "message": f"No blood sugar readings found in the {'last ' + str(days) + ' days' if days else 'entire history'}.",
        }

    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)

    fast_vals = [r.fasting_sugar   for r in filtered_sorted]
    post_vals = [r.post_meal_sugar for r in filtered_sorted]

    fast_stats = _stat_block(fast_vals, label="fasting_sugar")
    post_stats = _stat_block(post_vals, label="post_meal_sugar")

    risk_level, risk_desc = classify_sugar_risk(fast_stats["avg"], post_stats["avg"])

    period_start = filtered_sorted[0].recorded_at.isoformat()
    period_end   = filtered_sorted[-1].recorded_at.isoformat()

    return {
        "reading_count":    len(filtered),
        "period_days":      days,
        "period_start":     period_start,
        "period_end":       period_end,
        "fasting_sugar":    fast_stats,
        "post_meal_sugar":  post_stats,
        "overall_risk":     risk_level,
        "risk_description": risk_desc,
        "thresholds": {
            "normal":       "fasting < 100 mg/dL AND post-meal < 140 mg/dL",
            "pre_diabetic": "fasting 100–125 mg/dL OR post-meal 140–199 mg/dL",
            "diabetic":     "fasting ≥ 126 mg/dL OR post-meal ≥ 200 mg/dL",
            "critical":     "fasting ≥ 250 mg/dL OR post-meal ≥ 300 mg/dL",
        },
    }


# ============================================================================
# Chart Data Formatters
# ============================================================================

def format_bp_chart_data(records: list, days: Optional[int]) -> dict:
    """
    Formats blood pressure readings as chart-ready time-series data.

    Returns chronologically sorted list of {date, systolic, diastolic} points,
    plus reference lines for clinical thresholds.
    """
    filtered = _filter_by_days(records, days)
    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)

    data_points = [
        {
            "date":      r.recorded_at.isoformat(),
            "date_label": r.recorded_at.strftime("%b %d"),
            "systolic":  r.systolic,
            "diastolic": r.diastolic,
            "status": (
                "ELEVATED"
                if r.systolic > 140 or r.diastolic > 90
                else "NORMAL"
            ),
        }
        for r in filtered_sorted
    ]

    return {
        "reading_count": len(data_points),
        "period_days":   days,
        "data":          data_points,
        "reference_lines": {
            "systolic": {
                "normal_max":  120,
                "elevated_max": 129,
                "high_max":    139,
                "crisis_min":  180,
            },
            "diastolic": {
                "normal_max":  80,
                "high_max":    89,
                "crisis_min":  120,
            },
        },
    }


def format_sugar_chart_data(records: list, days: Optional[int]) -> dict:
    """
    Formats blood sugar readings as chart-ready time-series data.

    Returns chronologically sorted list of {date, fasting_sugar, post_meal_sugar} points,
    plus reference lines for clinical thresholds.
    """
    filtered = _filter_by_days(records, days)
    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)

    data_points = [
        {
            "date":           r.recorded_at.isoformat(),
            "date_label":     r.recorded_at.strftime("%b %d"),
            "fasting_sugar":  r.fasting_sugar,
            "post_meal_sugar": r.post_meal_sugar,
            "fasting_status": (
                "DIABETIC"     if r.fasting_sugar >= 126
                else "PRE_DIABETIC" if r.fasting_sugar >= 100
                else "NORMAL"
            ),
            "post_meal_status": (
                "DIABETIC"     if r.post_meal_sugar >= 200
                else "PRE_DIABETIC" if r.post_meal_sugar >= 140
                else "NORMAL"
            ),
        }
        for r in filtered_sorted
    ]

    return {
        "reading_count": len(data_points),
        "period_days":   days,
        "data":          data_points,
        "reference_lines": {
            "fasting_sugar": {
                "normal_max":       99,
                "pre_diabetic_max": 125,
                "diabetic_min":     126,
                "critical_min":     250,
            },
            "post_meal_sugar": {
                "normal_max":       139,
                "pre_diabetic_max": 199,
                "diabetic_min":     200,
                "critical_min":     300,
            },
        },
    }


# ============================================================================
# Custom Home Tests Analytics
# ============================================================================

def compute_custom_stats(records: list, days: Optional[int], test_name: str) -> dict:
    """Computes stats for a generic custom test."""
    filtered = _filter_by_days(records, days)
    if not filtered:
        return {
            "reading_count": 0,
            "period_days": days,
            "message": f"No {test_name} readings found.",
        }

    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)
    values = [r.value for r in filtered_sorted]
    stats = _stat_block(values, label=test_name)
    
    return {
        "reading_count": len(filtered),
        "period_days": days,
        "test_name": test_name,
        "unit": filtered_sorted[0].unit,
        "stats": stats,
    }


def format_custom_chart_data(records: list, days: Optional[int], test_name: str) -> dict:
    """Formats generic custom test readings for charting."""
    filtered = _filter_by_days(records, days)
    filtered_sorted = sorted(filtered, key=lambda r: r.recorded_at)

    data_points = [
        {
            "date": r.recorded_at.isoformat(),
            "date_label": r.recorded_at.strftime("%b %d"),
            "value": r.value,
            "unit": r.unit
        }
        for r in filtered_sorted
    ]

    return {
        "reading_count": len(data_points),
        "period_days": days,
        "test_name": test_name,
        "data": data_points
    }
