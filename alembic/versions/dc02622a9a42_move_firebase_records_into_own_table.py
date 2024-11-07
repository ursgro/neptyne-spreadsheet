"""Move firebase records into own table

Revision ID: dc02622a9a42
Revises: ccbd3313a60f
Create Date: 2023-09-13 08:00:09.428734

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker

from server.models import User, FirebaseUser

# revision identifiers, used by Alembic.
revision = "dc02622a9a42"
down_revision = "ccbd3313a60f"
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table(
        "firebase_user",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("firebase_uid", sa.Text(), nullable=True),
        sa.Column("firebase_app", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["user.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("firebase_uid"),
    )
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("firebase_user")
    # ### end Alembic commands ###