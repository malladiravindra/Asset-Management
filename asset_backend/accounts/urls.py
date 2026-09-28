from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ChangePasswordAPIView,
    LoginView,
    LogoutView,
    MeAPIView,
    PermissionListAPIView,
    RegisterAPIView,
    RequestPasswordResetView,
    ResendOTPView,
    ResetPasswordView,
    RoleDetailAPIView,
    RoleListCreateAPIView,
    UserListAPIView,
    UserRolesAPIView,
    VerifyForgotPasswordOTPView,
)

urlpatterns = [
    path("register/", RegisterAPIView.as_view()),
    path("login/", LoginView.as_view()),
    path("token/refresh/", TokenRefreshView.as_view()),
    path("resend-otp/", ResendOTPView.as_view()),
    path("logout/", LogoutView.as_view()),

    path("forgot-password/", RequestPasswordResetView.as_view()),
    path("verify-forgot-password-otp/", VerifyForgotPasswordOTPView.as_view()),
    path("reset-password/", ResetPasswordView.as_view()),

    # Current user (profile) — the one owner of "who am I, what may I do".
    path("me/", MeAPIView.as_view()),
    path("me/change-password/", ChangePasswordAPIView.as_view()),

    # Roles & Permissions (Django Group + Permission, APIViews only).
    path("roles/", RoleListCreateAPIView.as_view()),
    path("roles/<int:pk>/", RoleDetailAPIView.as_view()),
    path("permissions/", PermissionListAPIView.as_view()),
    path("users/", UserListAPIView.as_view()),
    path("users/<int:pk>/roles/", UserRolesAPIView.as_view()),
]
