import json
import logging

from lib.observability import log_event


def test_log_event_keeps_safe_fields_and_omits_sensitive_values(caplog):
    logger = logging.getLogger("test.observability")

    with caplog.at_level(logging.ERROR, logger="test.observability"):
        log_event(
            logger,
            logging.ERROR,
            "request.unhandled_exception",
            request_id="request-123",
            route="/api/auth/login",
            exception_type="RuntimeError",
            email="person@example.com",
            password="do-not-log",
            mongo_url="mongodb://secret",
        )

    payload = json.loads(caplog.records[0].message)
    assert payload["event"] == "request.unhandled_exception"
    assert payload["request_id"] == "request-123"
    assert payload["route"] == "/api/auth/login"
    assert "email" not in payload
    assert "password" not in payload
    assert "mongo_url" not in payload
    assert "person@example.com" not in caplog.records[0].message
    assert "do-not-log" not in caplog.records[0].message
