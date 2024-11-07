"""gsheets_token_both

Revision ID: 6f56f6bd485d
Revises: 7ba22bfa861c
Create Date: 2023-11-16 20:47:25.339054

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6f56f6bd485d'
down_revision = '7ba22bfa861c'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('tyne', sa.Column('gsheets_refresh_token', sa.Text(), nullable=True))
    op.add_column('user', sa.Column('gsheets_refresh_token', sa.Text(), nullable=True))
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_column('user', 'gsheets_refresh_token')
    op.drop_column('tyne', 'gsheets_refresh_token')
    # ### end Alembic commands ###