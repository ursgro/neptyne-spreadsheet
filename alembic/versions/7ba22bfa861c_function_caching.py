"""Function Caching

Revision ID: 7ba22bfa861c
Revises: dc02622a9a42
Create Date: 2023-11-14 16:43:24.998963

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '7ba22bfa861c'
down_revision = 'dc02622a9a42'
branch_labels = None
depends_on = None


def upgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.create_table('function_call_cache',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('tyne_id', sa.Integer(), nullable=False),
    sa.Column('expression', sa.Text(), nullable=False),
    sa.Column('code_panel', sa.Text(), nullable=False),
    sa.Column('date', sa.DateTime(), nullable=True),
    sa.Column('mime_type', sa.Text(), nullable=False),
    sa.Column('result', sa.Text(), nullable=False),
    sa.ForeignKeyConstraint(['tyne_id'], ['tyne.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_tyne_code_expression', 'function_call_cache', ['tyne_id', 'code_panel', 'expression'], unique=False)
    op.create_index('idx_tyne_date', 'function_call_cache', ['tyne_id', 'date'], unique=False)
    op.create_index('idx_tyne_id', 'function_call_cache', ['tyne_id'], unique=False)
    # ### end Alembic commands ###


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_index('idx_tyne_id', table_name='function_call_cache')
    op.drop_index('idx_tyne_date', table_name='function_call_cache')
    op.drop_index('idx_tyne_code_expression', table_name='function_call_cache')
    op.drop_table('function_call_cache')
    # ### end Alembic commands ###