"""Make domain unique

Revision ID: 23ef743bdf52
Revises: 5fecc1140297
Create Date: 2022-12-20 02:15:31.742613

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '23ef743bdf52'
down_revision = '5fecc1140297'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_unique_constraint(None, 'organization', ['domain'])
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint(None, 'organization', type_='unique')
    # ### end Alembic commands ###
