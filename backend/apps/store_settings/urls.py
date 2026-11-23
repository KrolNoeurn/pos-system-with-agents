from django.urls import path

from apps.store_settings.views import ReceiptProfileAPIView, StoreSettingAPIView

urlpatterns = [
    path("settings/", StoreSettingAPIView.as_view(), name="api-v1-store-settings"),
    path(
        "settings/receipt-profile/",
        ReceiptProfileAPIView.as_view(),
        name="api-v1-receipt-profile",
    ),
]
