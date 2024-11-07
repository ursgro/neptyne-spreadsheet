from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from server.models import APIQuota, User
from server.users import has_premium_subscription

NEPTYNE_SERVICE = "neptyne"

DEFAULTS = {
    "openai": 1_000_000,  # about $4/user maximum. We multiply for gpt-4 and 32k
    "phantomjscloud": 500,  # Number of pages
    "bing": 500,  # Number of searches
    "google_maps_geocode": 500,  # Number of searches
    "iexfinance": 1000,  # Number of requests
    "neptyne": 4_000_000,  # 1 million per dollar
}

PREMIUM_DEFAULTS = {key: value * 2 for key, value in DEFAULTS.items()}
ORGANIZATION_DEFAULTS = {key: value * 10 for key, value in PREMIUM_DEFAULTS.items()}


class APIQuotaManager:
    def _get_user_organization_id(self, session: Session, user_id: int) -> int | None:
        user = session.execute(select(User).filter(User.id == user_id)).scalar_one()
        return user.organization.organization.id if user.organization else None

    def _get_api_quota(self, session: Session, user_id: int, service: str) -> APIQuota:
        org_id = self._get_user_organization_id(session, user_id)
        query = (
            select(APIQuota).filter(
                APIQuota.organization_id == org_id, APIQuota.service_name == service
            )
            if org_id is not None
            else select(APIQuota).filter(
                APIQuota.user_id == user_id, APIQuota.service_name == service
            )
        )
        return session.execute(query).scalar_one_or_none()

    def get_all(self, session: Session, user_id: int) -> dict[str, dict[str, int]]:
        org_id = self._get_user_organization_id(session, user_id)
        query = (
            (select(APIQuota).filter(APIQuota.organization_id == org_id))
            if org_id is not None
            else (select(APIQuota).filter(APIQuota.user_id == user_id))
        )
        quotas = session.execute(query).scalars().all()
        return {
            quota.service_name: {"limit": quota.limit, "usage": quota.usage}
            for quota in quotas
        }

    def get_quota(
        self,
        session: Session,
        user_id: int,
        service: str = NEPTYNE_SERVICE,
    ) -> int:
        org_id = self._get_user_organization_id(session, user_id)
        query = (
            select(APIQuota).filter(
                APIQuota.organization_id == org_id, APIQuota.service_name == service
            )
            if org_id is not None
            else select(APIQuota).filter(
                APIQuota.user_id == user_id, APIQuota.service_name == service
            )
        )
        quota = session.execute(query).scalar_one_or_none()
        if quota is None:
            return (
                self._get_usage_limit(session, service, organization_id=org_id)
                if org_id is not None
                else self._get_usage_limit(session, service, user_id=user_id)
            )
        return quota.limit - quota.usage

    def _get_usage_limit(
        self,
        session: Session,
        service: str,
        *,
        user_id: int | None = None,
        organization_id: int | None = None,
    ) -> int:
        assert user_id is not None

        user = session.execute(select(User).filter(User.id == user_id)).scalar_one()
        has_premium = has_premium_subscription(session, user)
        return PREMIUM_DEFAULTS[service] if has_premium else DEFAULTS[service]

    def _update_api_quota(
        self,
        session: Session,
        service: str,
        user_id: int,
        additional_usage: int | None = None,
        reset_usage: bool = False,
    ) -> None:
        org_id = self._get_user_organization_id(session, user_id)
        limit = (
            self._get_usage_limit(session, service, organization_id=org_id)
            if org_id is not None
            else self._get_usage_limit(session, service, user_id=user_id)
        )

        id: dict[str, Any] = (
            {"organization_id": org_id} if org_id is not None else {"user_id": user_id}
        )
        id["service_name"] = service

        quota = session.execute(select(APIQuota).filter_by(**id)).scalar_one_or_none()
        if quota is None:
            quota = APIQuota(**id)

        session.add(quota)

        if (
            reset_usage
            or quota.last_reset is None
            or quota.last_reset < datetime.now() - timedelta(days=30)
        ):
            quota.usage = 0
            quota.last_reset = datetime.now()

        if additional_usage is not None:
            quota.usage += additional_usage

        quota.limit = limit
        session.commit()

    def deduct_quota(
        self,
        session: Session,
        user_id: int,
        usage: int,
        service: str = NEPTYNE_SERVICE,
    ) -> None:
        self._update_api_quota(session, service, user_id, additional_usage=usage)

    def reset_quota(
        self, session: Session, user_id: int, service: str = NEPTYNE_SERVICE
    ) -> None:
        self._update_api_quota(session, service, user_id, reset_usage=True)
