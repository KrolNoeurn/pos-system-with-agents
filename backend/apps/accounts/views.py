"""Authentication, profile, and user management API views."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet

from apps.accounts.serializers import (
    ChangePasswordSerializer,
    LoginSerializer,
    LogoutSerializer,
    ProfileUpdateSerializer,
    TokenRefreshInputSerializer,
    UserCreateSerializer,
    UserReadSerializer,
    UserRolesAssignSerializer,
    UserUpdateSerializer,
)
from apps.accounts.services import (
    assign_user_roles,
    authenticate_user,
    change_own_password,
    create_user_account,
    delete_user_account,
    logout_user,
    refresh_user_token,
    set_user_active_status,
    update_own_profile,
    update_user_account,
)
from apps.audit.services import get_client_ip
from apps.rbac.permissions import HasRBACPermission, IsActiveAuthenticated, require_permission

User = get_user_model()


class LoginAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request: Request) -> str:
        return 'Bearer realm="api"'

    def post(self, request: Request) -> Response:
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = authenticate_user(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
            ip_address=get_client_ip(request),
        )
        return Response(
            {
                "access": result["access"],
                "refresh": result["refresh"],
                "user": UserReadSerializer(result["user"], context={"request": request}).data,
            },
            status=status.HTTP_200_OK,
        )


class TokenRefreshAPIView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def get_authenticate_header(self, request: Request) -> str:
        return 'Bearer realm="api"'

    def post(self, request: Request) -> Response:
        serializer = TokenRefreshInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tokens = refresh_user_token(refresh_token_str=serializer.validated_data["refresh"])
        return Response(tokens, status=status.HTTP_200_OK)


class LogoutAPIView(APIView):
    permission_classes = [IsActiveAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        logout_user(
            actor=request.user,
            refresh_token_str=serializer.validated_data.get("refresh"),
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeAPIView(APIView):
    permission_classes = [IsActiveAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request: Request) -> Response:
        user = User.objects.prefetch_related("roles__permissions").get(pk=request.user.pk)
        return Response(
            UserReadSerializer(user, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def patch(self, request: Request) -> Response:
        serializer = ProfileUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_own_profile(
            user=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=request.user.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )


class ChangePasswordAPIView(APIView):
    permission_classes = [IsActiveAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        change_own_password(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
            ip_address=get_client_ip(request),
        )
        return Response({"detail": "Password changed successfully."}, status=status.HTTP_200_OK)


class UserViewSet(ModelViewSet):
    """Protected user administration endpoints with server-side RBAC."""

    serializer_class = UserReadSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    permission_classes = [IsActiveAuthenticated, HasRBACPermission]
    permission_map = {
        "GET": ("users.view",),
        "POST": ("users.create",),
        "PUT": ("users.edit",),
        "PATCH": ("users.edit",),
        "DELETE": ("users.delete",),
    }

    def get_queryset(self):
        queryset = User.objects.prefetch_related("roles__permissions").all()
        search = self.request.query_params.get("search")
        if search:
            term = search.strip()
            queryset = queryset.filter(
                Q(username__icontains=term)
                | Q(email__icontains=term)
                | Q(full_name__icontains=term)
            )

        is_active = self.request.query_params.get("is_active")
        if is_active in ("true", "false"):
            queryset = queryset.filter(is_active=(is_active == "true"))

        role_id = self.request.query_params.get("role")
        if role_id and role_id.isdigit():
            queryset = queryset.filter(roles__id=int(role_id)).distinct()

        return queryset

    def create(self, request: Request, *args, **kwargs) -> Response:
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = create_user_account(
            actor=request.user,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=user.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        serializer = UserUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        update_user_account(
            actor=request.user,
            target=instance,
            ip_address=get_client_ip(request),
            **serializer.validated_data,
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=instance.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    def destroy(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        delete_user_account(
            actor=request.user,
            target=instance,
            ip_address=get_client_ip(request),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(
        detail=True,
        methods=["post"],
        url_path="activate",
        permission_classes=[IsActiveAuthenticated, require_permission("users.deactivate", "users.edit")],
    )
    def activate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_user_active_status(
            actor=request.user,
            target=instance,
            is_active=True,
            ip_address=get_client_ip(request),
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=instance.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="deactivate",
        permission_classes=[IsActiveAuthenticated, require_permission("users.deactivate", "users.edit")],
    )
    def deactivate(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        set_user_active_status(
            actor=request.user,
            target=instance,
            is_active=False,
            ip_address=get_client_ip(request),
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=instance.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )

    @action(
        detail=True,
        methods=["put"],
        url_path="roles",
        permission_classes=[IsActiveAuthenticated, require_permission("users.edit")],
    )
    def assign_roles(self, request: Request, pk=None) -> Response:
        instance = self.get_object()
        serializer = UserRolesAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        assign_user_roles(
            actor=request.user,
            target=instance,
            role_ids=serializer.validated_data["role_ids"],
            ip_address=get_client_ip(request),
        )
        refreshed = User.objects.prefetch_related("roles__permissions").get(pk=instance.pk)
        return Response(
            UserReadSerializer(refreshed, context={"request": request}).data,
            status=status.HTTP_200_OK,
        )
