"""Resolve the client address only through the configured internal proxy."""

import ipaddress
import socket

from fastapi import Request


def _valid_ip(value: str | None) -> str | None:
    try:
        return str(ipaddress.ip_address(str(value or "").strip()))
    except ValueError:
        return None


def _is_trusted_proxy(peer_ip: str, hostname: str | None) -> bool:
    if not hostname:
        return False
    try:
        addresses = socket.getaddrinfo(hostname, None, type=socket.SOCK_STREAM)
    except OSError:
        return False
    return any(_valid_ip(item[4][0]) == peer_ip for item in addresses)


def request_ip(request: Request, trusted_proxy_hostname: str | None = None) -> str | None:
    peer_ip = _valid_ip(request.client.host if request.client else None)
    if peer_ip and _is_trusted_proxy(peer_ip, trusted_proxy_hostname):
        # The edge proxy overwrites the incoming X-Forwarded-For header. Nginx
        # appends its own peer address, so the first address is the LAN client.
        forwarded = str(request.headers.get("x-forwarded-for") or "").split(",", 1)[0]
        return _valid_ip(forwarded) or peer_ip
    return peer_ip
