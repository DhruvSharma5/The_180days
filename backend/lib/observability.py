"""Safe structured logging helpers for application diagnostics."""

import hashlib
import json
import logging
import traceback
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

_SAFE_FIELDS = {
    "collection",
    "database_name_present",
    "error_code",
    "exception_type",
    "mongo_host_count",
    "mongo_host_fingerprint",
    "index",
    "method",
    "missing_variables",
    "request_id",
    "route",
    "server_diagnostics",
    "stack",
    "status_code",
}


def log_event(
    logger: logging.Logger, level: int, event: str, **fields: object
) -> None:
    payload: dict[str, object] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "level": logging.getLevelName(level),
        "event": event,
    }
    payload.update(
        {key: value for key, value in fields.items() if key in _SAFE_FIELDS}
    )
    logger.log(level, json.dumps(payload, separators=(",", ":"), sort_keys=True))


def safe_stack_frames(exc: BaseException) -> list[dict[str, str | int]]:
    return [
        {
            "file": Path(frame.filename).name,
            "function": frame.name,
            "line": frame.lineno,
        }
        for frame in traceback.extract_tb(exc.__traceback__)[-8:]
    ]


def mongo_uri_host_fingerprint(uri: str) -> tuple[str | None, int]:
    authority = urlsplit(uri).netloc.rsplit("@", 1)[-1]
    hosts = []
    for item in authority.split(","):
        host = item.strip()
        if host.startswith("["):
            host = host[1 : host.index("]")]
        else:
            host = host.split(":", 1)[0]
        if host:
            hosts.append(host.lower())
    if not hosts:
        return None, 0
    fingerprint = hashlib.sha256("\n".join(sorted(hosts)).encode()).hexdigest()[:16]
    return fingerprint, len(hosts)


def mongo_server_diagnostics(client: object) -> list[dict[str, str | int]]:
    topology = getattr(client, "_topology", None)
    if topology is None:
        return []
    description = getattr(topology, "description", None)
    get_descriptions = getattr(description, "server_descriptions", None)
    if not callable(get_descriptions):
        return []

    diagnostics = []
    for index, server in enumerate(get_descriptions().values(), 1):
        error = getattr(server, "error", None)
        if error is None:
            continue
        message = str(error).lower()
        cause = getattr(error, "__cause__", None)
        if cause is not None:
            message += " " + str(cause).lower()
        if (
            "not in the access list" in message
            or "not on the access list" in message
            or (
                "ip address" in message
                and ("not allowed" in message or "denied" in message)
            )
        ):
            category = "atlas_network_access_restriction"
        elif any(term in message for term in ("authentication failed", "sasl", "authfailed")):
            category = "authentication"
        elif any(
            term in message
            for term in (
                "certificate verify failed",
                "certificate_verify_failed",
                "unable to get local issuer",
                "self-signed certificate",
                "certificate has expired",
                "certificate is not yet valid",
            )
        ):
            category = "tls_certificate_verification"
        elif any(term in message for term in ("ssl", "tls", "certificate")):
            category = (
                "tls_handshake"
                if any(term in message for term in ("handshake", "tlsv1 alert"))
                else "tls_other"
            )
        elif any(
            term in message
            for term in (
                "getaddrinfo",
                "name resolution",
                "nodename",
                "name or service not known",
                "no address associated with hostname",
            )
        ):
            category = "dns"
        elif any(term in message for term in ("timed out", "timeout")):
            category = "socket_timeout"
        elif "connection refused" in message:
            category = "connection_refused"
        elif any(term in message for term in ("connection reset", "connection closed")):
            category = "connection_closed"
        else:
            category = "other"

        diagnostics.append(
            {
                "server_index": index,
                "exception_type": type(error).__name__,
                "category": category,
            }
        )
    return diagnostics
