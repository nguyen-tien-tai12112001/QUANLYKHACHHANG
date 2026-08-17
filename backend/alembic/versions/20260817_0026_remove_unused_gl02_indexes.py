"""Remove unused GL02 reference/hash indexes.

Revision ID: 20260817_0026
Revises: 20260811_0025

The columns and their values remain intact. Only the standalone indexes are
removed because neither customer processing nor reporting queries use them.
"""

from alembic import op


revision = "20260817_0026"
down_revision = "20260811_0025"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_index(
        "ix_gl02_ledger_transactions_reference",
        table_name="gl02_ledger_transactions",
    )
    op.drop_index(
        "ix_gl02_ledger_transactions_source_row_hash",
        table_name="gl02_ledger_transactions",
    )


def downgrade():
    op.create_index(
        "ix_gl02_ledger_transactions_source_row_hash",
        "gl02_ledger_transactions",
        ["source_row_hash"],
        unique=False,
    )
    op.create_index(
        "ix_gl02_ledger_transactions_reference",
        "gl02_ledger_transactions",
        ["reference"],
        unique=False,
    )
