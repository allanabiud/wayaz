"""JWT authentication that honours password changes: tokens minted before
the account's password_changed_at stamp stop working on the very next
request (iat vs stamp, both whole-second precision)."""

from datetime import UTC, datetime

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed


class PasswordAwareJWTAuthentication(JWTAuthentication):
    def get_user(self, validated_token):
        user = super().get_user(validated_token)

        changed = getattr(user, "password_changed_at", None)
        issued_at = validated_token.get("iat")
        if changed is not None and issued_at is not None:
            minted = datetime.fromtimestamp(issued_at, tz=UTC)
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
