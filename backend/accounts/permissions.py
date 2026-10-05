from rest_framework import permissions


class IsStaffOrAdminUser(permissions.BasePermission):
    """
    Allows access only to authenticated users with staff or admin role,
    or Django is_staff/is_superuser flags.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False

        if request.user.is_superuser or request.user.is_staff:
            return True

        return request.user.role in ("admin", "staff")
