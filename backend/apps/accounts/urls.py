from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.accounts.views import (
    ChangePasswordAPIView,
    LoginAPIView,
    LogoutAPIView,
    MeAPIView,
    TokenRefreshAPIView,
    UserViewSet,
)

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")

urlpatterns = [
    path("auth/login/", LoginAPIView.as_view(), name="api-v1-auth-login"),
    path("auth/refresh/", TokenRefreshAPIView.as_view(), name="api-v1-auth-refresh"),
    path("auth/logout/", LogoutAPIView.as_view(), name="api-v1-auth-logout"),
    path("auth/me/", MeAPIView.as_view(), name="api-v1-auth-me"),
    path("auth/change-password/", ChangePasswordAPIView.as_view(), name="api-v1-auth-change-password"),
    path("", include(router.urls)),
]
