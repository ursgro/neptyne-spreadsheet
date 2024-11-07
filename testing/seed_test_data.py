from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from server.models import (
    FeatureToggle,
    FirebaseUser,
    Notebook,
    Sheet,
    Tyne,
    TyneOwner,
    User,
    db,
)


def create_single_user_models(session: Session) -> None:
    owner = TyneOwner(
        handle="user",
        user=User(
            firebase_users=[FirebaseUser(firebase_uid="<single-user-firebase-uid>")],
            email="user@example.com",
            name="Neptyne User",
        ),
    )

    feature_toggle = FeatureToggle(name="open_access", enabled=True)

    session.add(feature_toggle)
    session.add(owner)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()


def create_test_models(session: Session) -> str:
    owner = TyneOwner(
        handle="test_user",
        user=User(
            firebase_users=[FirebaseUser(firebase_uid="vBY7MnU9yfhUZiIjakiUjYtarSn2")],
            email="test-user-0@neptyne.com",
            name="Test User",
        ),
    )

    tyne = Tyne(
        file_name="test",
        tyne_owner=owner,
        name="Test Tyne",
        notebooks=[
            Notebook(
                contents={},
            ),
        ],
        sheets=[
            Sheet(),
        ],
    )

    feature_toggle = FeatureToggle(name="open_access", enabled=True)

    session.add(feature_toggle)
    session.add(owner)
    session.add(tyne)
    session.commit()
    return tyne.file_name


def main() -> None:
    print("seeding test user")
    with db.sessionmaker() as session:
        create_test_models(session)


if __name__ == "__main__":
    main()
