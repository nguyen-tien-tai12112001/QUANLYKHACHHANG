"""Add supplemental POS source and processed POS status fields.

Revision ID: 20260923_0039
Revises: 20260923_0038
"""

import sqlalchemy as sa
from alembic import op


revision = "20260923_0039"
down_revision = "20260923_0038"
branch_labels = None
depends_on = None


POS_STATUS_COLUMNS = (
    ("pos", sa.Integer()),
    ("so_thiet_bi_pos", sa.Integer()),
    ("pos_moi", sa.Integer()),
    ("pos_khong_hoat_dong", sa.Integer()),
    ("pos_ngung_hoat_dong", sa.Integer()),
)


def upgrade():
    for table_name in ("customer_period_profiles", "customer_period_branch_details"):
        for column_name, column_type in POS_STATUS_COLUMNS:
            op.add_column(
                table_name,
                sa.Column(column_name, column_type, nullable=False, server_default="0"),
            )

    op.create_table(
        "supplemental_pos_records",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("optional_file_id", sa.Integer(), sa.ForeignKey("customer_processing_optional_files.id"), nullable=True),
        sa.Column("period_key", sa.String(length=8), nullable=False),
        sa.Column("source_period_key", sa.String(length=8), nullable=True),
        sa.Column("branch_code", sa.String(length=10), nullable=True),
        sa.Column("settlement_account", sa.String(length=120), nullable=True),
        sa.Column("customer_name", sa.String(length=255), nullable=True),
        sa.Column("store_name", sa.String(length=255), nullable=True),
        sa.Column("merchant_id", sa.String(length=100), nullable=True),
        sa.Column("terminal_id", sa.String(length=100), nullable=True),
        sa.Column("terminal_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("transaction_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_new", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_inactive", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_discontinued", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("raw_data", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_supplemental_pos_records_optional_file_id", "supplemental_pos_records", ["optional_file_id"])
    op.create_index("ix_supplemental_pos_records_period_key", "supplemental_pos_records", ["period_key"])
    op.create_index("ix_supplemental_pos_records_source_period_key", "supplemental_pos_records", ["source_period_key"])
    op.create_index("ix_supplemental_pos_records_branch_code", "supplemental_pos_records", ["branch_code"])
    op.create_index("ix_supplemental_pos_records_settlement_account", "supplemental_pos_records", ["settlement_account"])
    op.create_index("ix_supplemental_pos_records_merchant_id", "supplemental_pos_records", ["merchant_id"])
    op.create_index("ix_supplemental_pos_records_terminal_id", "supplemental_pos_records", ["terminal_id"])
    op.create_index("ix_supplemental_pos_period_account", "supplemental_pos_records", ["period_key", "settlement_account"])
    op.create_index("ix_supplemental_pos_period_merchant", "supplemental_pos_records", ["period_key", "merchant_id"])
    op.create_index("ix_dp01_period_account_pos", "dp01_deposit_accounts", ["period_key", "so_tai_khoan"])

    op.execute(sa.text("""
        UPDATE profile_metric_definitions
        SET status_code = 1,
            description = 'Có quan hệ POS: POS.SỐ_TÀI_KHOẢN → DP01.SO_TAI_KHOAN → DP01.MA_KH → Kho CIF',
            updated_at = now()
        WHERE metric_code = 'POS'
    """))
    op.execute(sa.text("""
        INSERT INTO profile_metric_definitions
            (metric_code, metric_name, group_code, data_type, unit, aggregation_type,
             default_visible, display_order, status_code, description, is_active)
        VALUES
            ('SO_THIET_BI_POS', 'Số thiết bị POS', 'CARD', 'NUMERIC', 'Thiết bị', 'SUM', true, 9001, 1,
             'Số lượng thiết bị POS sau khi gộp các dòng cùng tài khoản/Merchant', true),
            ('POS_MOI', 'POS mới trong kỳ', 'CARD', 'BOOLEAN', NULL, 'MAX', true, 9002, 1,
             'Quan hệ POS có ở kỳ này nhưng chưa có ở sheet kỳ liền trước', true),
            ('POS_KHONG_HOAT_DONG', 'POS không phát sinh giao dịch', 'CARD', 'BOOLEAN', NULL, 'MAX', true, 9003, 1,
             'Quan hệ POS vẫn tồn tại nhưng số món giao dịch trong kỳ bằng 0', true),
            ('POS_NGUNG_HOAT_DONG', 'POS ngừng hoạt động trong kỳ', 'CARD', 'BOOLEAN', NULL, 'MAX', true, 9004, 1,
             'Quan hệ POS có ở sheet kỳ trước nhưng không còn ở sheet kỳ này', true)
        ON CONFLICT (metric_code) DO UPDATE SET
            metric_name = EXCLUDED.metric_name,
            group_code = EXCLUDED.group_code,
            data_type = EXCLUDED.data_type,
            unit = EXCLUDED.unit,
            aggregation_type = EXCLUDED.aggregation_type,
            status_code = EXCLUDED.status_code,
            description = EXCLUDED.description,
            is_active = true,
            updated_at = now()
    """))


def downgrade():
    op.execute(sa.text("""
        DELETE FROM profile_metric_definitions
        WHERE metric_code IN ('SO_THIET_BI_POS', 'POS_MOI', 'POS_KHONG_HOAT_DONG', 'POS_NGUNG_HOAT_DONG')
    """))
    op.drop_index("ix_dp01_period_account_pos", table_name="dp01_deposit_accounts")
    op.drop_table("supplemental_pos_records")
    for table_name in ("customer_period_branch_details", "customer_period_profiles"):
        for column_name, _ in reversed(POS_STATUS_COLUMNS):
            op.drop_column(table_name, column_name)
