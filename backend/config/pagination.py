from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """PageNumberPagination that also lets clients request a page size.

    The default remains settings.PAGE_SIZE; clients opt in with e.g.
    ``?page_size=10``.
    """

    page_size_query_param = "page_size"
    page_size_query_max = 100
