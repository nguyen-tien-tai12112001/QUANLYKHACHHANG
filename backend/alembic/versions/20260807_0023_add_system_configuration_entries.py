"""Add editable system configuration entries.

Revision ID: 20260807_0023
Revises: 20260807_0022
"""
from alembic import op
import sqlalchemy as sa

revision = "20260807_0023"
down_revision = "20260807_0022"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "system_configuration_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("config_code", sa.String(100), nullable=False),
        sa.Column("config_name", sa.String(255), nullable=False),
        sa.Column("source_type", sa.String(50)),
        sa.Column("config_value", sa.JSON(), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("effective_from", sa.Date()),
        sa.Column("effective_to", sa.Date()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("updated_by", sa.String(100)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("category", "config_code", name="uq_system_config_category_code"),
    )
    op.create_index("ix_system_config_category_active", "system_configuration_entries", ["category", "active"])
    op.get_bind().exec_driver_sql("""
    INSERT INTO system_configuration_entries
      (category,config_code,config_name,source_type,config_value,description,effective_from,active)
    VALUES
      ('ACCOUNT_FORMULA','DS_TKTT','Doanh số tài khoản thanh toán','GL02','{"account_codes":["421101"],"transaction_types":["Normal"],"formula":"SUM(CRAMOUNT)"}','Tổng phát sinh Có theo mã KH','2026-01-01',true),
      ('ACCOUNT_FORMULA','PHI_BAOLANH','Phí bảo lãnh','KH02','{"account_prefixes":["7040"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Nhóm tài khoản phí bảo lãnh','2026-01-01',true),
      ('ACCOUNT_FORMULA','PHI_CHUYENTIEN','Phí chuyển tiền','KH02','{"account_prefixes":["711001","711002"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Nhóm tài khoản phí chuyển tiền','2026-01-01',true),
      ('ACCOUNT_FORMULA','PHI_NHDT','Phí ngân hàng điện tử','KH02','{"account_prefixes":["711036","711037","711039"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Nhóm tài khoản phí NHĐT','2026-01-01',true),
      ('ACCOUNT_FORMULA','ABIC_BATD','Phí Bảo an tín dụng','KH02','{"account_prefixes":["714"],"formula":"SUM(CRAMT)-SUM(DRAMT)"}','Nhóm tài khoản ABIC BATD','2026-01-01',true),
      ('ACCOUNT_FORMULA','DPRR_CHUNG','Dự phòng rủi ro chung','LN01','{"debt_groups":["1","2","3","4"],"rate":0.0075,"formula":"DU_NO*RATE"}','Tỷ lệ và nhóm nợ tính DPRR chung','2026-01-01',true),
      ('BUSINESS_CATALOG','PF10_LOAN_TYPES','Loại vay PF10','PF10','{"items":{"100":"Ngắn hạn","110":"Trung hạn","120":"Dài hạn","241":"Thấu chi"}}','Danh mục mã loại vay','2026-01-01',true),
      ('BUSINESS_CATALOG','TKTT_ACTIVITY','Trạng thái hoạt động TKTT','GL02','{"active_max_days":7,"low_activity_max_days":30,"inactive_label":"Không hoạt động"}','Mốc số ngày xác định trạng thái TKTT','2026-01-01',true),
      ('BUSINESS_CATALOG','CUSTOMER_THRESHOLDS','Ngưỡng phân nhóm khách hàng','PROFILE','{"deposit":1000000000,"loan":1000000000,"casa":500000000}','Ngưỡng tài chính cho bộ lọc và phân nhóm','2026-01-01',true),
      ('BUSINESS_CATALOG','RETAIL_CUSTOMER_TYPES','Loại khách hàng bán lẻ','CIF','{"items":["Cá nhân","KHCN"]}','Các loại KH áp dụng gợi ý bán lẻ','2026-01-01',true)
    """)


def downgrade():
    op.drop_index("ix_system_config_category_active", table_name="system_configuration_entries")
    op.drop_table("system_configuration_entries")
