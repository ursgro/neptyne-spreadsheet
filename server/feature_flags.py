from typing import TYPE_CHECKING

from server.models import User

if TYPE_CHECKING:
    from tornado.httputil import HTTPServerRequest
    from tornado.web import Application


class FeatureFlags:
    def is_enabled(
        self, firebase_uid: str, feature_name: str, email: str | None
    ) -> bool:
        return self.default(feature_name)

    def default(self, feature_name: str) -> bool:
        return True


class FeatureFlagsMixin:
    application: "Application"
    request: "HTTPServerRequest"

    def is_feature_enabled(
        self, user: User, feature_name: str, email: str | None
    ) -> bool:
        flags: FeatureFlags | None = self.application.settings.get("feature_flags")
        if flags is None:
            raise ValueError("Feature flags are not configured")

        return flags.default(feature_name)
