"""Parse the original planner PDF (extracted text) into structured roadmap JSON.

Source of truth: /app/backend/data/180_Day_DSA_MERN_Planner.pdf (Dhruv Sharma,
"180 Days to Interview-Ready — Striver's A2Z DSA + Full MERN Stack + Mock Interviews").
pypdf extracts text to /tmp/planner.txt; this module parses it deterministically —
no invented content. Checkbox glyphs vanish in extraction, so bullets are lines with
leading whitespace; wrapped lines are joined onto the previous item.

    cd /app/backend && python -m lib.planner_parser
    # → /app/backend/data/planner_roadmap.json
"""

import json
import re
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
PDF_TXT = Path("/tmp/planner.txt")
OUT = BACKEND / "data" / "planner_roadmap.json"

SECTION_TOKENS = ("DSA", "MERN", "REVISION", "SELF-MOCK", "LOG & PLAN", "EVENING")
PROBLEM_RE = re.compile(r"^\s*#(\d+)\s+(.*)$")
DAY_RE = re.compile(r"^DAY (\d+)$")
PAGE_RE = re.compile(r"^===== PAGE (\d+) =====$")
ITEM_START_RE = re.compile(
    r"^(Day \d+ DSA|Flashcards|MERN notes|Notes from|English chat|Commute"
    r"|Learn:|Build:|Project:|Note:|Redo|Re-dry-run|Re-attempt|Rebuild|Fix |Write \d)"
)


def is_section_header(line: str) -> str | None:
    s = line.strip()
    if not any(s.startswith(t) for t in SECTION_TOKENS):
        return None
    if "|" in s or re.search(r"\d:\d\d", s):  # headers carry a time or pipe; items like
        return s                              # "MERN notes + flashcards" do not
    return None


def section_of(header: str) -> str:
    if header.startswith("SELF-MOCK"):
        return "REVISION"
    if header.startswith("LOG"):
        return "LOG"
    return header.split()[0]


class ItemList:
    """Ordered checklist items; continuation lines join the previous item."""

    def __init__(self) -> None:
        self.items: list[str] = []

    def add(self, raw_line: str) -> None:
        s = raw_line.strip()
        if not self.items:
            self.items.append(s)
            return
        prev = self.items[-1]
        # A PDF line-wrap: the next line starts lowercase / with punctuation, or the
        # previous line visibly ends mid-phrase. Otherwise it is its own checkbox item.
        wrapped = (s[0].islower() or s[0] in "()+&/-,."
                   or prev.rstrip().endswith((",", "+", "/", "&", "-", "(", ":", ";")))
        starts_new = raw_line.startswith(" ") or ITEM_START_RE.match(s) or PROBLEM_RE.match(s)
        if starts_new or not wrapped:
            self.items.append(s)
        else:
            self.items[-1] = f"{prev} {s}".strip()


def split_day_blocks(text: str) -> list[list[str]]:
    lines = text.splitlines()
    blocks: list[list[str]] = []
    current: list[str] | None = None
    for line in lines:
        if PAGE_RE.match(line):
            continue
        if DAY_RE.match(line.strip()):
            if current:
                blocks.append(current)
            current = [line.strip()]
        elif current is not None:
            if "CHECKPOINT" in line or "180-Day Streak Tracker" in line or "Mock Interview Phase" in line:
                if len(current) > 5:
                    blocks.append(current)
                    current = None
                continue
            current.append(line)
    if current:
        blocks.append(current)
    return [b for b in blocks if DAY_RE.match(b[0])]


def parse_day(block: list[str]) -> dict | None:
    m = DAY_RE.match(block[0])
    if not m:
        return None
    day = int(m.group(1))
    date_line = block[1].strip() if len(block) > 1 else ""
    tag = ""
    for line in block[2:6]:
        s = line.strip()
        if s == "DAY DONE":
            break
        if s and "," not in s and "ROADMAP" not in s and not re.match(r"^[A-Z][a-z]{2},", s):
            tag = s
            break

    problems: list[dict] = []
    problems_list = ItemList()  # numbered DSA items (provides continuation joining)
    dsa_checklist = ItemList()
    mern_title = ""
    mern_bullets = ItemList()
    mern_done = False  # a bullet seen → the title line is closed
    revision = ItemList()
    evening = ItemList()
    dsa_header = ""
    section: str | None = None

    for raw in block[2:]:
        line = raw.rstrip()
        s = line.strip()
        if not s:
            continue
        if s.startswith("Today I learned"):
            break
        header = is_section_header(line)
        if header:
            section = section_of(header)
            continue
        if section in (None, "LOG"):
            continue

        if section == "DSA":
            pm = PROBLEM_RE.match(line)
            if pm:
                problems.append({"num": int(pm.group(1)), "raw": pm.group(2).strip()})
            elif not dsa_header and not problems and not line.startswith(" ") and not dsa_checklist.items:
                dsa_header = s  # "Step 1 Basics" / "STEP REVIEW DAY - Step 3 Arrays" / "Days 1 - 6"
            elif line.startswith(" "):
                dsa_checklist.add(line)
            elif problems:
                problems[-1]["raw"] = f"{problems[-1]['raw']} {s}".strip()
            elif dsa_checklist.items:
                dsa_checklist.add(line)  # wrapped bullet
            else:
                dsa_header = f"{dsa_header} {s}".strip()

        elif section == "MERN":
            if line.startswith(" "):
                mern_bullets.add(line)
                mern_done = True
            elif ITEM_START_RE.match(s) and (mern_title.startswith("This week")
                                              or not re.match(r"^[A-Z][a-zA-Z]+( [IVX]+)?(-| -)", s)):
                mern_bullets.add(line)  # Learn:/Build:/Project:/Rebuild bullet
                mern_done = True
            elif not mern_done:
                mern_title = f"{mern_title} {s}".strip() if mern_title else s
            else:
                mern_bullets.add(line)  # wrapped bullet (e.g. "Tailwind)")

        elif section == "REVISION":
            revision.add(line)

        elif section == "EVENING":
            evening.add(line)

    is_sunday = date_line.startswith("Sun,") or "WEEKLY REVISION" in (tag or "")
    for p in problems:
        dm = re.search(r"\[([EMH])\]\s*$", p["raw"])
        p["difficulty"] = {"E": "Easy", "M": "Medium", "H": "Hard"}[dm.group(1)] if dm else "Medium"
        p["title"] = re.sub(r"\s*\[[EMH]\]\s*$", "", p["raw"]).strip()
        p["title"] = re.sub(r"\s+", " ", p["title"])
        del p["raw"]

    mern = [] if is_sunday else [{"title": mern_title.strip(), "bullets": mern_bullets.items}]
    # Sunday MERN-week-recap + self-mock + step-review bullets are revision activities
    revision_items = dsa_checklist.items + revision.items + (
        mern_bullets.items if is_sunday else []) + evening.items

    return {
        "day": day,
        "date_hint": date_line,
        "tag": tag,
        "is_sunday": is_sunday,
        "dsa_header": dsa_header,
        "dsa": problems,
        "mern": mern,
        "revision": revision_items,
    }


PHASE_NAMES = {
    1: "Foundation: HTML, CSS, JavaScript, React",
    2: "Backend: Node, Express, MongoDB, Auth + Project 1",
    3: "Level-up: Next.js, DevOps, SQL, System Design + Project 2",
    4: "Interview Core: CS Fundamentals, Deep Dives, Machine Coding",
    5: "Project 3, Behavioural and Mock Rounds",
    6: "Polish, Apply and Final Mock Loops",
}

# Page 72 — Mock Interview Phase (after Day 180): verbatim from the week table.
INTERVIEW_WEEKS = [
    {"week": 1, "days": [181, 187], "focus": "Baseline: find real gaps",
     "daily_mocks": "Mon-Sat: 1 DSA mock (2 problems, 45 min). Sun: full 4-round loop.",
     "applications": "Fix top-5 gaps; apply to 5 roles/day; ask 3 referrals."},
    {"week": 2, "days": [188, 194], "focus": "Role-specific rounds",
     "daily_mocks": "Mon JS, Tue React, Wed Node + DB, Thu System Design, Fri LLD / machine coding, Sat HR in English. Sun: full loop.",
     "applications": "Tailor resume per role; 5 applications/day; 2 mock sessions with peers."},
    {"week": 3, "days": [195, 201], "focus": "Real interviews + drills",
     "daily_mocks": "Mock the company's actual interview style (research on Glassdoor / LeetCode discuss). Sun: full loop.",
     "applications": "Interview whenever called; debrief each real interview within 1 hour."},
    {"week": 4, "days": [202, 208], "focus": "Peak performance",
     "daily_mocks": "2 full loops (Wed, Sun). Other days: weakest area drills.",
     "applications": "Negotiation practice: salary, notice period, offer comparison."},
]

INTERVIEW_CHECKLIST = [
    "Record every mock (audio is enough) and listen back for filler words and unclear explanations.",
    "Think aloud: restate problem, examples, brute force, optimise, code, test, complexity.",
    "Use a fresh question every time; never repeat a mock on the same prompt.",
    "Rate with the rubric (page 3). Any score under 3 becomes tomorrow's drill.",
    "Keep a 'real interview log': company, rounds, questions asked, what you missed.",
    "Practise the HR round in English: pitch, STAR stories, career-switch story, salary talk.",
]

# Page 3 — the three portfolio projects, verbatim.
PROJECTS = [
    {"key": "p1", "title": "Project 1 — Full MERN App",
     "description": "Full MERN app with auth, RBAC, deployment and a real-time feature (planner Days 46-55).",
     "due_day": 55},
    {"key": "p2", "title": "Project 2 — TypeScript Capstone",
     "description": "TypeScript capstone with Redis, queues, payments and CI/CD (planner Days 78-94, polish in Month 4).",
     "due_day": 94},
    {"key": "p3", "title": "Project 3 — Unique Idea Build",
     "description": "A small, unique idea built in 7 days — AI / real-time / productivity (planner Days 122-130).",
     "due_day": 130},
]

# Page 2/7 — the seven weekly-revision activities (canonical keys stay stable).
WEEKLY_ITEMS = [
    {"key": "redo6", "title": "Redo the 6 toughest DSA problems of this week (no hints)"},
    {"key": "pattern_notes", "title": "Re-dry-run every pattern learned this week; update your pattern notes"},
    {"key": "unsolved", "title": "Re-attempt any problem you could not solve alone (watch the solution only after 30 min)"},
    {"key": "rebuild", "title": "Rebuild one small thing from this week from scratch (no copy-paste)"},
    {"key": "bugs", "title": "Fix pending bugs / unfinished tasks and push to GitHub"},
    {"key": "five_questions", "title": "Write 5 interview questions from this week and answer them aloud"},
    {"key": "mock45", "title": "45-min timed self-mock (1 DSA problem + 10 concept questions), score 1-5"},
]


def build_interview_days() -> list[dict]:
    days = []
    for week in INTERVIEW_WEEKS:
        start, end = week["days"]
        for day_no in range(start, end + 1):
            idx = (day_no - start) % 7  # 0 = Monday … 6 = Sunday
            weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][idx]
            tasks = []
            dm = week["daily_mocks"]
            if dm.startswith("Mon-Sat:"):
                tasks.append("1 DSA mock (2 problems, 45 min)" if idx < 6 else "Full 4-round loop mock")
            elif dm.startswith("Mon JS"):
                per_day = {"Mon": "JS mock interview", "Tue": "React mock interview",
                           "Wed": "Node + DB mock interview", "Thu": "System Design mock",
                           "Fri": "LLD / machine coding mock", "Sat": "HR mock interview (in English)",
                           "Sun": "Full interview loop"}
                tasks.append(per_day[weekday])
            elif dm.startswith("Mock the company"):
                tasks.append("Mock the company's actual interview style (research on Glassdoor / LeetCode discuss)"
                             if idx < 6 else "Full interview loop")
            else:
                tasks.append("Full interview loop" if weekday in ("Wed", "Sun") else "Weakest-area drill")
            tasks.append(f"Applications & output: {week['applications']}")
            if weekday == "Sun":
                tasks.append(INTERVIEW_CHECKLIST[3])
            days.append({
                "day": day_no - 180,
                "week": week["week"],
                "title": f"Interview Day {day_no - 180} ({weekday})",
                "phase_name": f"Week {week['week']}: {week['focus']}",
                "tasks": [{"key": f"i{i + 1}", "title": t, "kind": "practice"} for i, t in enumerate(tasks)],
            })
    return days


PDF_PATH = BACKEND / "data" / "180_Day_DSA_MERN_Planner.pdf"


def extract_text() -> str:
    """Extract the planner text straight from the PDF (reproducible, no temp files)."""
    from pypdf import PdfReader
    reader = PdfReader(str(PDF_PATH))
    return "\n".join(f"\n===== PAGE {i + 1} =====\n{p.extract_text() or ''}"
                     for i, p in enumerate(reader.pages))


def main() -> None:
    text = extract_text()
    PDF_TXT.write_text(text)
    blocks = split_day_blocks(text)
    days = [d for d in (parse_day(b) for b in blocks) if d]
    days.sort(key=lambda d: d["day"])

    for d in days:
        d["phase"] = (d["day"] - 1) // 30 + 1
        d["phase_name"] = PHASE_NAMES[d["phase"]]

    # Project milestones = the planner's project-day MERN blocks, in day order.
    project_days: dict[str, list[tuple[int, str]]] = {"p1": [], "p2": [], "p3": []}
    for d in days:
        for block in d["mern"]:
            title = block["title"]
            if title.startswith("Project 1"):
                project_days["p1"].append((d["day"], title))
            elif title.startswith("Project 2"):
                project_days["p2"].append((d["day"], title))
            elif title.startswith("Project 3"):
                project_days["p3"].append((d["day"], title))
    projects = []
    for tpl in PROJECTS:
        milestones = [t for _, t in project_days[tpl["key"]]]
        projects.append({**tpl, "milestones": milestones})

    data = {
        "source": "180_Day_DSA_MERN_Planner.pdf (Dhruv Sharma) — parsed verbatim",
        "phases": PHASE_NAMES,
        "weekly_revision_items": WEEKLY_ITEMS,
        "projects": projects,
        "interview_weeks": INTERVIEW_WEEKS,
        "interview_checklist": INTERVIEW_CHECKLIST,
        "interview_days": build_interview_days(),
        "days": days,
    }
    OUT.write_text(json.dumps(data, indent=1))

    total_problems = sum(len(d["dsa"]) for d in days)
    print(f"days={len(days)} problems={total_problems} mern_blocks={sum(1 for d in days if d['mern'])} "
          f"sundays={sum(1 for d in days if d['is_sunday'])}")
    for n in (1, 2, 7, 8, 30, 31, 60, 91, 150, 179, 180):
        d = next(x for x in days if x["day"] == n)
        print(f"  D{n:>3} [{d['tag'][:18]:<18}] dsa={len(d['dsa'])} hdr='{d['dsa_header'][:40]}' "
              f"mern={[b['title'] for b in d['mern']]} rev={len(d['revision'])}")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
