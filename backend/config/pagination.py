from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """PageNumberPagination with a client-selectable page size (?page_size=)."""

    page_size_query_param = "page_size"
    page_size_query_max = 100
