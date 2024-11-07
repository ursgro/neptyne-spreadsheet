# mypy: ignore-errors
import enum
import os
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.orm import deferred, relationship
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.schema import UniqueConstraint
from sqlalchemy.sql import expression, func
from tornado_sqlalchemy import SQLAlchemy


class DB(SQLAlchemy):
    DEFAULT_MODE = "default"
    _DEFAULT_URL_FORMAT = "postgresql+pg8000://neptyne:{password}@/neptyne"

    @staticmethod
    def default_url() -> str:
        # pg8000 doesn't use the libpq environment variables, so we have to make up our own
        return DB._DEFAULT_URL_FORMAT.format(
            password=os.getenv("NEPTYNE_DB_PASSWORD", "")
        )

    def __init__(self):
        url = self.default_url()
        super().__init__(url)
        self.cached_config = {"url": url, "mode": DB.DEFAULT_MODE}

    def configure_preset(self, mode: str, **kwargs: str):
        if mode == "default":
            self.configure(url=self.default_url())
        elif mode == "sqlite":
            if path := kwargs.get("path"):
                self.configure(f"sqlite:///{path}?check_same_thread=False")
            else:
                self.configure("sqlite://?check_same_thread=False")
        elif mode == "cloudsql":
            import pg8000.dbapi
            from google.cloud.sql.connector import connector

            user = kwargs["user"]
            instance = kwargs["instance"]

            conn = connector.Connector(enable_iam_auth=True)

            def get_connection() -> "pg8000.dbapi.Connection":
                return conn.connect(
                    instance,
                    "pg8000",
                    user=user,
                    db="neptyne",
                )

            db.configure(
                url="postgresql+pg8000://", engine_options={"creator": get_connection}
            )
        else:
            raise ValueError(f"Unknown mode: {mode}")
        self.cached_config = {"mode": mode, **kwargs}

    def get_config(self) -> dict[str, str]:
        return {**self.cached_config}


db = DB()


def table_to_dict(tbl):
    def to_value(v):
        if isinstance(v, datetime):
            return v.isoformat()
        return v

    return {c.name: to_value(getattr(tbl, c.name)) for c in tbl.__table__.columns}


class NonUser(enum.Enum):
    ANONYMOUS = "ANONYMOUS"
    MAINTENANCE = "MAINTENANCE"
    GSHEET = "GSHEET"


class FirebaseUser(db.Model):
    __tablename__ = "firebase_user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(
        Integer,
        ForeignKey("user.id", ondelete="CASCADE"),
        nullable=False,
    )
    firebase_uid = Column(Text, unique=True)
    firebase_app = Column(Text, nullable=True)
    user = relationship("User", back_populates="firebase_users", uselist=False)


class User(db.Model):
    __tablename__ = "user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_owner_id = Column(ForeignKey("tyne_owner.id"))
    stripe_uid = Column(Text, unique=True)
    stripe_subscription_id = Column(Text, unique=True)
    tyne_owner = relationship("TyneOwner", back_populates="user")
    obsolete_firebase_uid = Column("firebase_uid", Text, unique=True)
    obsolete_firebase_app = Column("firebase_app", Text, nullable=True)
    firebase_users = relationship(
        "FirebaseUser", back_populates="user", cascade="all, delete-orphan"
    )
    name = Column(Text)
    email = Column(Text, index=True)
    gsheets_refresh_token = Column(Text, nullable=True)
    view_state = Column(JSON, nullable=True)
    shared_tynes = relationship(
        "Share", back_populates="user", cascade="all, delete-orphan"
    )
    quotas = relationship(
        "APIQuota", back_populates="user", cascade="all, delete-orphan"
    )
    tyne_users = relationship(
        "TyneUser", back_populates="user", cascade="all, delete-orphan"
    )
    organization = relationship("UserOrg", back_populates="user", uselist=False)
    google_sheets = relationship(
        "GoogleSheet", back_populates="charge_user", uselist=True, cascade="save-update"
    )
    google_users = relationship("GoogleUser", back_populates="user")
    api_keys = relationship("APIKey", back_populates="user")


# A simplified version of subscription status to drive our UI + access control.
# Stripe has many more states and active can have many meanings based on other fields.
class StripeSubscriptionStatus(enum.Enum):
    PENDING = "PENDING"  # The customer has not paid yet. We should not grant access.
    ACTIVE = "ACTIVE"  # The subscription is active with autopayment configured.
    CANCELED = "CANCELED"  # The customer has triggered cancellation but there is remaining time.
    EXPIRED = "EXPIRED"  # The subscription has ended. We should revoke access.


# A simple mechanism to separate between individual + organization subscription.
#   Can be extended to include different tiers of subscription when we add more benefits
class StripeSubscriptionType(enum.Enum):
    INDIVIDUAL_BASE = "INDIVIDUAL_BASE"
    ORGANIZATION_BASE = "ORGANIZATION_BASE"


class StripeSubscription(db.Model):
    __tablename__ = "stripe_subscription"
    id = Column(Text, primary_key=True)
    user_id = Column(ForeignKey("user.id"))
    status = Column(Enum(StripeSubscriptionStatus))
    last_modified = Column(
        DateTime, server_default=func.now(), onupdate=func.current_timestamp()
    )
    created = Column(DateTime, server_default=func.now())
    subscription_type = Column(
        Enum(StripeSubscriptionType),
        server_default=StripeSubscriptionType.INDIVIDUAL_BASE.value,
    )


## TODO: invoices table


class Organization(db.Model):
    __tablename__ = "organization"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text)
    domain = Column(Text, unique=True)
    subscription_id = Column(ForeignKey("stripe_subscription.id"))
    trial_end = Column(DateTime)

    users = relationship("UserOrg", back_populates="organization")
    quotas = relationship("APIQuota", back_populates="organization")


class Role(enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"
    GUEST = "GUEST"


class OrgInvite(db.Model):
    __tablename__ = "org_invite"
    organization_id = Column(ForeignKey("organization.id"), primary_key=True)
    email = Column(Text, primary_key=True)
    invite_token = Column(Text)
    role = Column(Enum(Role))
    created = Column(DateTime, server_default=func.now())
    claimed = Column(DateTime)


class UserOrg(db.Model):
    __tablename__ = "user_org"
    user_id = Column(ForeignKey("user.id", ondelete="CASCADE"), primary_key=True)
    organization_id = Column(ForeignKey("organization.id"), primary_key=True)
    role = Column(Enum(Role))

    organization = relationship("Organization", back_populates="users")
    user = relationship("User", back_populates="organization")


class TyneOwner(db.Model):
    __tablename__ = "tyne_owner"
    id = Column(Integer, primary_key=True, autoincrement=True)
    handle = Column(Text, unique=True)
    user = relationship("User", back_populates="tyne_owner", uselist=False)
    tynes = relationship("Tyne", back_populates="tyne_owner")


class AccessLevel(enum.Enum):
    VIEW = "VIEW"
    COMMENT = "COMMENT"
    EDIT = "EDIT"


class Share(db.Model):
    __tablename__ = "share"
    user_id = Column(ForeignKey("user.id"), primary_key=True)
    tyne_id = Column(ForeignKey("tyne.id"), primary_key=True)

    user = relationship("User", back_populates="shared_tynes")
    tyne = relationship("Tyne", back_populates="shared_to_users")

    access_level = Column(Enum(AccessLevel))


class EmailShare(db.Model):
    __tablename__ = "email_share"
    tyne_id = Column(ForeignKey("tyne.id"), primary_key=True)
    email = Column(Text, primary_key=True)
    access_level = Column(Enum(AccessLevel))
    tyne = relationship("Tyne", back_populates="shared_to_emails")


class OrganizationShare(db.Model):
    __tablename__ = "organization_share"
    tyne_id = Column(ForeignKey("tyne.id", ondelete="CASCADE"), primary_key=True)
    organization_id = Column(
        ForeignKey("organization.id", ondelete="CASCADE"), primary_key=True
    )
    access_level = Column(Enum(AccessLevel))

    tyne = relationship("Tyne", back_populates="shared_to_organization")


class TyneUser(db.Model):
    __tablename__ = "tyne_user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(
        ForeignKey("tyne.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tyne = relationship("Tyne", back_populates="tyne_users")
    user_id = Column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user = relationship("User", back_populates="tyne_users")
    last_opened = Column(DateTime, server_default=func.now())
    properties = Column(JSON)


class Tyne(db.Model):
    __tablename__ = "tyne"
    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(Integer, server_default=text("0"))
    screenshot_url = Column(Text, nullable=True)
    in_gallery = Column(Boolean, index=True, server_default=expression.false())

    # file_name is the bit that shows up in the url and is unique for the owner
    file_name = Column(Text, index=True)
    last_modified = Column(
        DateTime, server_default=func.now(), onupdate=func.current_timestamp()
    )
    tyne_owner_id = Column(ForeignKey("tyne_owner.id"), nullable=True)
    tyne_owner = relationship("TyneOwner", back_populates="tynes")
    __table_args__ = (
        UniqueConstraint("tyne_owner_id", "file_name", name="_owner_file_name_uc"),
    )
    name = Column(Text, index=True)
    # default_access has only meaning if this tyne is owned by an organization
    default_access = Column(Enum(AccessLevel))
    notebooks = relationship(
        "Notebook", back_populates="tyne", cascade="all, delete-orphan"
    )
    sheets = relationship("Sheet", back_populates="tyne", cascade="all, delete-orphan")
    shared_to_users = relationship("Share", back_populates="tyne")
    shared_to_emails = relationship("EmailShare", back_populates="tyne")
    shared_to_organization = relationship(
        "OrganizationShare", back_populates="tyne", uselist=False
    )
    published = Column(Boolean, index=True, default=False)
    next_sheet_id = Column(Integer)
    properties = Column(JSON)
    events = relationship("Event", back_populates="tyne", cascade="all, delete-orphan")
    has_tick = Column(Boolean, index=True, default=False, nullable=False)
    next_tick = Column(Integer, index=True, nullable=True)
    gsheets_refresh_token = Column(Text, nullable=True)
    requires_recompile = Column(
        Boolean, server_default=expression.false(), nullable=False
    )
    environment_variables = Column(JSON, nullable=True)

    secrets = relationship(
        "TyneSecrets", back_populates="tyne", cascade="all, delete-orphan"
    )
    tyne_users = relationship(
        "TyneUser", back_populates="tyne", cascade="all, delete-orphan"
    )
    google_sheet = relationship("GoogleSheet", back_populates="tyne", uselist=False)
    function_call_cache = relationship(
        "FunctionCallCache", back_populates="tyne", cascade="all, delete-orphan"
    )
    api_keys = relationship("APIKey", back_populates="tyne")

    def url(self, domain=""):
        return domain + f"/-/{self.file_name}"

    def to_dict(self):
        res = table_to_dict(self)
        res["sheets"] = [sheet.to_dict() for sheet in self.sheets]
        res["notebooks"] = [notebook.to_dict() for notebook in self.notebooks]
        return res


class Notebook(db.Model):
    __tablename__ = "notebook"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(ForeignKey("tyne.id"), index=True)
    tyne = relationship("Tyne", back_populates="notebooks")
    contents = deferred(Column(JSON))
    # The unique identifier for this notebook within the tyne
    notebook_id = Column(Integer)
    name = Column(Text)
    requirements = Column(Text)

    def to_dict(self):
        return table_to_dict(self)


class Sheet(db.Model):
    __tablename__ = "sheet"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(ForeignKey("tyne.id"), index=True)
    tyne = relationship("Tyne", back_populates="sheets")
    contents = deferred(Column(JSON))
    attributes = Column(JSON)
    n_rows = Column(Integer, default=1000)
    n_cols = Column(Integer, default=26)
    # The unique identifier for this sheet within the tyne
    sheet_id = Column(Integer)
    name = Column(Text)

    def to_dict(self):
        return table_to_dict(self)


class TyneSecrets(db.Model):
    __tablename__ = "tyne_secrets"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(ForeignKey("tyne.id"))
    user_id = Column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=True
    )  # nullable for tyne level secrets
    values = Column(JSON)
    tyne = relationship("Tyne", back_populates="secrets")
    __table_args__ = (
        UniqueConstraint("tyne_id", "user_id", name="_tyne_id_user_id_uc"),
    )


class Waitlist(db.Model):
    __tablename__ = "waitlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    firebase_uid = Column(Text, unique=True)
    created = Column(DateTime, server_default=func.now())
    hidden = Column(Boolean, server_default=expression.false(), nullable=False)
    self_removed = Column(Boolean, server_default=expression.false(), nullable=False)


class SignUpToken(db.Model):
    __tablename__ = "invite_tokens"
    id = Column(Integer, primary_key=True, autoincrement=True)
    token = Column(Text, index=True)
    used_by_firebase_uid = Column(Text)


class EmailWaitlist(db.Model):
    __tablename__ = "email_waitlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(Text, unique=True, index=True)
    name = Column(Text)
    extra = Column(JSON)
    created = Column(DateTime, server_default=func.now())
    hidden = Column(Boolean, server_default=expression.false(), nullable=False)
    invite_sent_at = Column(DateTime)
    invite_token = Column(Text, index=True)


class Event(db.Model):
    __tablename__ = "tyne_event"
    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(ForeignKey("tyne.id"))
    tyne = relationship("Tyne", back_populates="events")

    message = Column(Text)
    severity = Column(Text)
    extra = Column(JSON)
    created = Column(DateTime, server_default=func.now())


class FeatureToggle(db.Model):
    __tablename__ = "feature_toggle"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(Text, unique=True)
    enabled = Column(Boolean, server_default=expression.false(), nullable=False)


class APIQuota(db.Model):
    __tablename__ = "api_quota"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("user.id"), nullable=True, index=True)
    organization_id = Column(ForeignKey("organization.id"), nullable=True, index=True)
    user = relationship("User", back_populates="quotas")
    organization = relationship("Organization", back_populates="quotas")
    service_name = Column(Text, nullable=False)
    usage = Column(Integer, nullable=False, default=0)
    limit = Column(Integer, nullable=False, default=0)
    last_reset = Column(DateTime, nullable=True, server_default=func.now())

    __table_args__ = (
        Index("user_service_name_idx", "user_id", "service_name", unique=True),
        Index("org_service_name_idx", "organization_id", "service_name", unique=True),
    )


class APIKey(db.Model):
    __tablename__ = "api_key"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(ForeignKey("user.id"), nullable=False, index=True)
    tyne_id = Column(ForeignKey("tyne.id"), nullable=False, index=True)
    tyne = relationship("Tyne", back_populates="api_keys")
    user = relationship("User", back_populates="api_keys")
    key = Column(Text, nullable=False, unique=True, index=True)


class GoogleSheet(db.Model):
    __tablename__ = "google_sheet"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sheet_id = Column(Text, nullable=False, unique=True, index=True)
    tyne_id = Column(ForeignKey("tyne.id"), nullable=False, index=True)
    charge_user_id = Column(ForeignKey("user.id"), nullable=True)
    owner_email = Column(Text, nullable=True)

    charge_user = relationship("User", back_populates="google_sheets", uselist=False)
    tyne = relationship("Tyne", back_populates="google_sheet", uselist=False)


class FunctionCallCache(db.Model):
    __tablename__ = "function_call_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tyne_id = Column(ForeignKey("tyne.id"), nullable=False)
    tyne = relationship("Tyne", back_populates="function_call_cache")
    expression = Column(Text, nullable=False)
    code_panel = Column(Text, nullable=False)
    date = Column(DateTime, default=func.now())
    mime_type = Column(Text, nullable=False)
    combined_hash = Column(String(64), index=True)
    result = Column(Text, nullable=False)

    __table_args__ = (
        Index("idx_tyne_combined_hash", tyne_id, "combined_hash"),
        Index("idx_tyne_date", tyne_id, date),
        Index("idx_tyne_id", tyne_id),
    )


class GoogleUser(db.Model):
    __tablename__ = "google_workspace_user"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email_deprecated = Column("email", Text, unique=True, index=True)
    profile_data_deprecated = Column("profile_data", JSON)
    user_id = Column(ForeignKey("user.id"), index=True)
    user = relationship("User", back_populates="google_users")
    google_id = Column(Text, unique=True, index=True)
    domain = Column(Text)


def set_tyne_property(tyne: Tyne, key: str, value: Any) -> None:
    properties = tyne.properties or {}
    properties[key] = value
    tyne.properties = properties
    flag_modified(tyne, "properties")
