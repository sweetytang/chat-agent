"""SSRF-safe URL validation for user supplied HTTP MCP endpoints."""

import ipaddress
import socket
from urllib.parse import urljoin, urlparse


class NetworkPolicyError(ValueError):
    pass


def _blocked(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return bool(
        address.is_loopback
        or address.is_private
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    )


def validate_public_http_url(url: str, *, allow_http: bool = False) -> str:
    parsed = urlparse(url)
    allowed_schemes = {"https"} | ({"http"} if allow_http else set())
    if parsed.scheme not in allowed_schemes or not parsed.hostname:
        raise NetworkPolicyError("MCP 地址必须使用允许的 HTTP(S) scheme")
    if parsed.username or parsed.password:
        raise NetworkPolicyError("MCP 地址不能内嵌用户凭据")
    try:
        addresses = {
            ipaddress.ip_address(item[4][0])
            for item in socket.getaddrinfo(parsed.hostname, parsed.port, type=socket.SOCK_STREAM)
        }
    except OSError as error:
        raise NetworkPolicyError("MCP 地址无法解析") from error
    if not addresses or any(_blocked(address) for address in addresses):
        raise NetworkPolicyError("MCP 地址命中禁止访问的网络范围")
    return parsed.geturl()


def validate_redirect(base_url: str, location: str, *, allow_http: bool = False) -> str:
    """Resolve and re-apply policy to every redirect hop."""

    return validate_public_http_url(urljoin(base_url, location), allow_http=allow_http)
