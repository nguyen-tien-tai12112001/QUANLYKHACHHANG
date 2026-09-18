import socket
import unittest
from unittest.mock import patch

from starlette.requests import Request

from app.client_ip import request_ip


def make_request(peer, forwarded=None):
    headers = [] if forwarded is None else [(b"x-forwarded-for", forwarded.encode())]
    return Request({
        "type": "http",
        "http_version": "1.1",
        "method": "POST",
        "path": "/api/auth/login",
        "headers": headers,
        "client": (peer, 12345),
        "server": ("127.0.0.1", 8000),
        "scheme": "http",
    })


class ClientIpTests(unittest.TestCase):
    @patch("app.client_ip.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.22.0.3", 0)),
    ])
    def test_trusted_frontend_uses_edge_client_ip(self, _):
        request = make_request("172.22.0.3", "10.8.0.120, 172.22.0.1")
        self.assertEqual(request_ip(request, "frontend"), "10.8.0.120")

    @patch("app.client_ip.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.22.0.3", 0)),
    ])
    def test_direct_backend_cannot_spoof_forwarded_address(self, _):
        request = make_request("172.22.0.1", "10.8.0.120")
        self.assertEqual(request_ip(request, "frontend"), "172.22.0.1")

    @patch("app.client_ip.socket.getaddrinfo", return_value=[
        (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("172.22.0.3", 0)),
    ])
    def test_invalid_forwarded_address_falls_back_to_peer(self, _):
        request = make_request("172.22.0.3", "not-an-ip, 172.22.0.1")
        self.assertEqual(request_ip(request, "frontend"), "172.22.0.3")

    def test_forwarded_address_is_ignored_without_trust(self):
        request = make_request("172.22.0.3", "10.8.0.120")
        self.assertEqual(request_ip(request), "172.22.0.3")

    @patch("app.client_ip.socket.getaddrinfo", side_effect=socket.gaierror("DNS unavailable"))
    def test_proxy_dns_failure_ignores_forwarded_address(self, _):
        request = make_request("172.22.0.3", "10.8.0.120")
        self.assertEqual(request_ip(request, "frontend"), "172.22.0.3")


if __name__ == "__main__":
    unittest.main()
