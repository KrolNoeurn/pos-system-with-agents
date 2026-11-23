"""Expenses, Expense Categories, and Cash Flow REST API views with server-side RBAC."""

from django.db.models import Count, Q
from django.utils.dateparse import parse_date
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.services import get_client_ip
from apps.expenses.models import Expense, ExpenseCategory
from apps.expenses.serializers import (
    ExpenseCategorySerializer,
    ExpenseCategoryUpdateSerializer,
    ExpenseCategoryWriteSerializer,
    ExpenseSerializer,
    ExpenseUpdateSerializer,
    ExpenseWriteSerializer,
)
from apps.expenses.services import (
    create_expense,
    create_expense_category,
    delete_expense,
    delete_expense_category,
    get_cash_flow_summary,
    update_expense,
    update_expense_category,
)
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission


class ExpenseCategoryViewSet(viewsets.ModelViewSet):
    """Manage operating expense categories with delete protection when in use."""

    serializer_class = ExpenseCategorySerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("expenses.view", "reports.view"),
        "POST": ("expenses.create",),
        "PUT": ("expenses.edit",),
        "PATCH": ("expenses.edit",),
        "DELETE": ("expenses.delete",),
    }

    def get_queryset(self):
        queryset = ExpenseCategory.objects.annotate(
            expenses_count=Count("expenses", distinct=True)
        ).order_by("name", "id")

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(name__icontains=term)
                | Q(name_km__icontains=term)
                | Q(description__icontains=term)
            )

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ExpenseCategoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = create_expense_category(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=category.pk)
        return Response(
            ExpenseCategorySerializer(refreshed).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = ExpenseCategoryUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_expense_category(
            actor=request.user,
            category=instance,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(ExpenseCategorySerializer(refreshed).data, status=status.HTTP_200_OK)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_expense_category(
            actor=request.user,
            category=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ExpenseViewSet(viewsets.ModelViewSet):
    """Audited operating expenses CRUD and exact Decimal cash-flow summary."""

    serializer_class = ExpenseSerializer
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("expenses.view",),
        "POST": ("expenses.create",),
        "PUT": ("expenses.edit",),
        "PATCH": ("expenses.edit",),
        "DELETE": ("expenses.delete",),
    }

    def get_queryset(self):
        queryset = Expense.objects.select_related(
            "category", "created_by", "updated_by"
        ).order_by("-expense_date", "-created_at", "-id")

        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(expense_number__icontains=term)
                | Q(title__icontains=term)
                | Q(vendor_name__icontains=term)
                | Q(reference_code__icontains=term)
                | Q(notes__icontains=term)
            )

        category_id = self.request.query_params.get("category")
        if category_id and category_id.isdigit():
            queryset = queryset.filter(category_id=int(category_id))

        payment_method = self.request.query_params.get("payment_method")
        if payment_method in Expense.PaymentMethod.values:
            queryset = queryset.filter(payment_method=payment_method)

        date_from = self.request.query_params.get("date_from")
        if date_from:
            parsed_from = parse_date(date_from)
            if parsed_from:
                queryset = queryset.filter(expense_date__gte=parsed_from)

        date_to = self.request.query_params.get("date_to")
        if date_to:
            parsed_to = parse_date(date_to)
            if parsed_to:
                queryset = queryset.filter(expense_date__lte=parsed_to)

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = ExpenseWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expense = create_expense(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=expense.pk)
        return Response(ExpenseSerializer(refreshed).data, status=status.HTTP_201_CREATED)

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = ExpenseUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_expense(
            actor=request.user,
            expense=instance,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = self.get_queryset().get(pk=instance.pk)
        return Response(ExpenseSerializer(refreshed).data, status=status.HTTP_200_OK)

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_expense(
            actor=request.user,
            expense=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=False,
        methods=["get"],
        url_path="summary",
        permission_classes=[
            IsActiveAuthenticated,
            require_permission("expenses.view", "reports.view"),
        ],
    )
    def summary(self, request: Request) -> Response:
        date_from = parse_date(request.query_params.get("date_from") or "")
        date_to = parse_date(request.query_params.get("date_to") or "")
        payload = get_cash_flow_summary(date_from=date_from, date_to=date_to)
        return Response(payload, status=status.HTTP_200_OK)
