"""gsheet_owner_columns

Revision ID: 9ba894d60e05
Revises: 2a482ada0805
Create Date: 2024-05-01 14:59:37.097951

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9ba894d60e05'
down_revision = '2a482ada0805'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.add_column('google_sheet', sa.Column('charge_user_id', sa.Integer(), nullable=True))
    op.add_column('google_sheet', sa.Column('owner_email', sa.Text(), nullable=True))
    op.create_foreign_key(None, 'google_sheet', 'user', ['charge_user_id'], ['id'])
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_constraint(None, 'google_sheet', type_='foreignkey')
    op.drop_column('google_sheet', 'owner_email')
    op.drop_column('google_sheet', 'charge_user_id')
    # ### end Alembic commands ###