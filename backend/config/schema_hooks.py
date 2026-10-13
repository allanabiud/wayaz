"""drf-spectacular preprocessing hooks.

The uptime-monitor health probes are operational plumbing, not API surface:
all three routes (``/api/health/``, ``/health/``, ``/health``) mount the same
bare ``HealthView``, so the two alias paths collide on the operationId
``health_retrieve`` (and the view has no serializer to document anyway).
Dropping them keeps the generated OpenAPI document clean without touching
the routes themselves.

Hooks receive the endpoint enumerator's raw tuples:
``(path, path_regex, method, callback)``.
"""

import re

HEALTH_PATH = re.compile(r"^/(?:api/)?health/?$")


def exclude_health_endpoints(endpoints):
    """Filter the health probes out of schema generation."""
    return [endpoint for endpoint in endpoints if not HEALTH_PATH.match(endpoint[0])]
