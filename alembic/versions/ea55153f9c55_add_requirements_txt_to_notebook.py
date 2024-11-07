"""add requirements.txt to notebook

Revision ID: ea55153f9c55
Revises: 61a97fc94052
Create Date: 2022-06-29 12:30:44.781593

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ea55153f9c55'
down_revision = '61a97fc94052'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('notebook', sa.Column('requirements', sa.Text(), nullable=True))
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('notebook', 'requirements')
    # ### end Alembic commands ###