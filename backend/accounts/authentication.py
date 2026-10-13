"""JWT authentication that honours password changes.

An access token lives a day by default. If the account's password changes
while one is out there - a reset email rescuing a compromised account, say
- the token must stop working on the very next request instead of running
out its natural life. The check compares the token's `iat` claim against
the user's password_changed_at stamp (both whole-second precision)."""

from datetime import datetime, timezone as dt_timezone

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class PasswordAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        changed = getattr(user, "password_changed_at", None)
        issued_at = validated_token.get("iat")
        if changed is not None and issued_at is not None:
            minted = datetime.fromtimestamp(issued_at, tz=dt_timezone.utc)
            if minted < changed:
                raise AuthenticationFailed(
                    "Session expired after a password change. Please sign in again."
                )
        return user


try:
    from drf_spectacular.extensions import OpenApiAuthenticationExtension

    class PasswordAwareJWTScheme(OpenApiAuthenticationExtension):
        target_class = "accounts.authentication.PasswordAwareJWTAuthentication"
        name = "jwtAuth"

        def get_security_requirement(self, auto_schema):
            return {self.name: []}

        def get_security_definition(self, auto_schema):
            return {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT",
            }
except ImportError:
    pass
