"""Master roadmap — built from the parsed planner PDF (data/planner_roadmap.json).

Single source of truth: 180_Day_DSA_MERN_Planner.pdf. The JSON is regenerated
verbatim by `python -m lib.planner_parser` (deterministic text extraction — no
invented content). This module only shapes it for the API.
"""

import json
from functools import lru_cache
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
DATA = BACKEND / "data" / "planner_roadmap.json"


@lru_cache(maxsize=1)
def _raw() -> dict:
    return json.loads(DATA.read_text())


def _day_title(entry: dict) -> str:
    if entry["is_sunday"]:
        return "Weekly Revision & Self-Mock"
    if entry["mern"] and entry["mern"][0]["title"]:
        return entry["mern"][0]["title"]
    return entry.get("tag") or f"Day {entry['day']}"


def build() -> dict:
    """Full master dataset shaped for the API: days, interview days, projects, weekly items."""
    raw = _raw()
    days: list[dict] = []
    for entry in raw["days"]:
        topic = entry.get("dsa_header") or "DSA practice"
        dsa = [
            {"key": f"d{i + 1}", "num": p["num"], "title": p["title"],
             "difficulty": p["difficulty"], "topic": topic}
            for i, p in enumerate(entry["dsa"])
        ]
        # One checkbox per MERN learning objective (each PDF bullet), grouped by the
        # day's topic heading.
        mern = []
        for block in entry["mern"]:
            topic_title = block["title"]
            kind = "project" if topic_title.startswith(("Project", "Month-1 Project")) else "learn"
            for bullet in block["bullets"] or [topic_title]:
                mern.append({"key": f"m{len(mern) + 1}", "title": bullet,
                             "detail": topic_title, "topic": topic_title, "kind": kind})
        revision = [{"key": f"r{i + 1}", "title": t} for i, t in enumerate(entry["revision"])]
        days.append({
            "day": entry["day"],
            "title": _day_title(entry),
            "phase": entry["phase"],
            "phase_name": entry["phase_name"],
            "dsa": dsa,
            "mern": mern,
            "revision": revision,
        })
    return {
        "days": days,
        "interview_days": raw["interview_days"],
        "projects": raw["projects"],
        "weekly_revision_items": raw["weekly_revision_items"],
        "phases": raw["phases"],
    }


if __name__ == "__main__":
    data = build()
    d = next(x for x in data["days"] if x["day"] == 1)
    print(json.dumps(d, indent=1)[:1200])
