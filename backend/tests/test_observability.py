import json
import logging

from pymongo.errors import AutoReconnect

from lib.observability import (
    log_event,
    mongo_server_diagnostics,
    mongo_uri_host_fingerprint,
)


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


def test_mongo_diagnostics_classify_server_errors_without_logging_raw_details(caplog):
    class Server:
        error = AutoReconnect(
            "TLS certificate verify failed for mongodb://user:secret@private-host"
        )

    class Description:
        @staticmethod
        def server_descriptions():
            return {("private-host", 27017): Server()}

    class Topology:
        description = Description()

    class Client:
        _topology = Topology()

    logger = logging.getLogger("test.mongo-diagnostics")
    with caplog.at_level(logging.ERROR, logger="test.mongo-diagnostics"):
        log_event(
            logger,
            logging.ERROR,
            "request.database_error",
            server_diagnostics=mongo_server_diagnostics(Client()),
        )

    payload = json.loads(caplog.records[0].message)
    assert payload["server_diagnostics"] == [
        {
            "server_index": 1,
            "exception_type": "AutoReconnect",
            "category": "tls",
        }
    ]
    assert "private-host" not in caplog.records[0].message
    assert "mongodb://" not in caplog.records[0].message
    assert "secret" not in caplog.records[0].message


def test_mongo_uri_fingerprint_hides_credentials_and_hostnames():
    fingerprint, count = mongo_uri_host_fingerprint(
        "mongodb+srv://username:password@cluster.example.mongodb.net/db"
    )

    assert fingerprint is not None
    assert len(fingerprint) == 16
    assert count == 1
    assert "cluster.example.mongodb.net" not in fingerprint


def test_mongo_server_diagnostics_distinguish_connection_failure_categories():
    messages = (
        "getaddrinfo failed",
        "connection timed out",
        "Authentication failed",
        "IP address is not allowed",
    )

    class Server:
        def __init__(self, message):
            self.error = AutoReconnect(message)

    class Description:
        @staticmethod
        def server_descriptions():
            return {
                (f"private-host-{index}", 27017): Server(message)
                for index, message in enumerate(messages, 1)
            }

    class Topology:
        description = Description()

    class Client:
        _topology = Topology()

    diagnostics = mongo_server_diagnostics(Client())

    assert [item["category"] for item in diagnostics] == [
        "dns",
        "socket_timeout",
        "authentication",
        "atlas_network_access_restriction",
    ]
    assert all("private-host" not in str(item) for item in diagnostics)
    assert all(message not in str(diagnostics) for message in messages)
