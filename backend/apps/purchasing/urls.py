from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.purchasing.views import PurchaseViewSet, SupplierViewSet

router = DefaultRouter()
router.register("suppliers", SupplierViewSet, basename="supplier")
router.register("purchases", PurchaseViewSet, basename="purchase")

urlpatterns = [
    path("", include(router.urls)),
]
