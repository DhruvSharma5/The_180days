import uuid

from .test_core import _login, _signup


def test_roadmap_progress_and_personal_trackers_persist_after_relogin(client):
    email, password, signup = _signup(client, name="Feature Flow")
    assert signup.status_code == 201
    assert _login(client, email, password).status_code == 200

    roadmap = client.get("/roadmap/day/1")
    assert roadmap.status_code == 200
    assert roadmap.json()["dsa"]
    assert roadmap.json()["mern"]

    started = client.post(
        "/journey/start", json={"timezone": "Asia/Kolkata", "confirm": True}
    )
    assert started.status_code == 201
    projects = client.get("/journey/projects")
    assert projects.status_code == 200
    assert len(projects.json()) == 3

    roadmap_tasks = (
        roadmap.json()["dsa"] + roadmap.json()["mern"] + roadmap.json()["revision"]
    )
    assert roadmap_tasks
    task_key = roadmap_tasks[0]["key"]
    saved = client.put(
        "/progress/day/1",
        json={
            "tasks": {
                task_key: {
                    "completed": True,
                    "notes": "Saved from the deployment test",
                    "revised": True,
                }
            },
            "log": {
                "study_minutes": 75,
                "learning": "Practiced a roadmap task",
                "notes": "Daily reflection",
            },
        },
    )
    assert saved.status_code == 200
    assert saved.json()["tasks"][task_key]["notes"] == "Saved from the deployment test"
    assert saved.json()["log"]["study_minutes"] == 75

    mock = client.put(
        "/mocks/week/2",
        json={"score": 4, "dsa_solved": 6, "time_minutes": 45, "notes": "Weekly mock"},
    )
    assert mock.status_code == 200
    assert client.get("/mocks").json()[0]["score"] == 4

    revision = client.put(
        "/revision/week/2",
        json={"items": {"redo6": True}, "notes": "Review notes"},
    )
    assert revision.status_code == 200
    assert revision.json()["notes"] == "Review notes"
    assert revision.json()["items"]["redo6"] is True

    checkpoint = client.put(
        "/checkpoints/month/1",
        json={"worked_well": "Daily consistency", "goals": "Keep practicing"},
    )
    assert checkpoint.status_code == 200
    assert client.get("/checkpoints").json()[0]["goals"] == "Keep practicing"

    project = projects.json()[0]
    project["milestones"][0]["done"] = True
    updated_project = client.put(
        f"/projects/{project['key']}",
        json={
            "status": "in_progress",
            "notes": "Project notes",
            "milestones": project["milestones"],
        },
    )
    assert updated_project.status_code == 200
    assert updated_project.json()["status"] == "in_progress"
    assert client.get("/progress/calendar").status_code == 200

    summary = client.get("/progress/summary")
    assert summary.status_code == 200
    assert summary.json()["streak_longest"] >= 1
    assert summary.json()["active_today"] is True

    client.post("/auth/logout")
    assert _login(client, email, password).status_code == 200
    reread = client.get("/progress/day/1")
    assert reread.status_code == 200
    assert reread.json()["progress"]["tasks"][task_key]["revised"] is True
    saved_revision = client.get("/revision/week/2")
    assert saved_revision.json()["notes"] == "Review notes"
    assert saved_revision.json()["items"]["redo6"] is True
    assert client.get(f"/journey/projects").json()[0]["key"] == project["key"]


def test_public_analytics_event_accepts_unique_session(client):
    response = client.post(
        "/analytics/event",
        json={
            "type": "page_view",
            "session_id": f"deploy-{uuid.uuid4().hex}",
            "path": "/dashboard",
        },
    )
    assert response.status_code == 204
