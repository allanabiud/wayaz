"""drf-spectacular preprocessing hooks. The health probes and their /health
aliases share one view, colliding on operationId; dropping them keeps the
document clean without touching the routes."""

import re

HEALTH_PATH = re.compile(r"^/(?:api/)?health/?$")


def exclude_health_endpoints(endpoints):
    """Filter the health probes out of schema generation."""
    return [endpoint for endpoint in endpoints if not HEALTH_PATH.match(endpoint[0])]
