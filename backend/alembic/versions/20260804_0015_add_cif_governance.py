"""Add CIF governance, review and audit data.

Revision ID: 20260804_0015
Revises: 20260804_0014
"""

from alembic import op
import sqlalchemy as sa

revision = "20260804_0015"
down_revision = "20260804_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("cif_import_batches", sa.Column("uploaded_by", sa.String(100)))
    op.add_column("cif_import_batches", sa.Column("importer_version", sa.String(30)))
    op.add_column("cif_import_batches", sa.Column("column_stats", sa.JSON()))
    op.add_column("cif_import_batches", sa.Column("comparison_summary", sa.JSON()))
    op.create_index("ix_cif_import_batches_uploaded_by", "cif_import_batches", ["uploaded_by"])
    for name, column in (
        ("comparison_status", sa.String(30)), ("changed_fields", sa.JSON()),
        ("current_snapshot", sa.JSON()), ("review_status", sa.String(30)),
        ("reviewed_by", sa.String(100)), ("reviewed_at", sa.DateTime(timezone=True)),
        ("review_note", sa.Text()),
    ):
        op.add_column("cif_source_records", sa.Column(name, column))
    op.create_index("ix_cif_source_records_comparison_status", "cif_source_records", ["comparison_status"])
    op.create_index("ix_cif_source_records_review_status", "cif_source_records", ["review_status"])
    op.add_column("cif_identity_conflicts", sa.Column("resolved_by", sa.String(100)))
    op.create_table(
        "cif_change_audits",
        sa.Column("id", sa.BigInteger(), primary_key=True),
        sa.Column("source_record_id", sa.BigInteger(), sa.ForeignKey("cif_source_records.id")),
        sa.Column("import_batch_id", sa.Integer(), sa.ForeignKey("cif_import_batches.id")),
        sa.Column("customer_id", sa.BigInteger(), sa.ForeignKey("cif_customers.id")),
        sa.Column("full_cif_code", sa.String(32)), sa.Column("action", sa.String(40), nullable=False),
        sa.Column("before_data", sa.JSON()), sa.Column("after_data", sa.JSON()),
        sa.Column("changed_fields", sa.JSON()), sa.Column("performed_by", sa.String(100), nullable=False),
        sa.Column("note", sa.Text()), sa.Column("performed_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    for name in ("source_record_id", "import_batch_id", "customer_id", "full_cif_code", "action", "performed_at"):
        op.create_index(f"ix_cif_change_audits_{name}", "cif_change_audits", [name])
    op.create_table(
        "cif_golden_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("target_field", sa.String(100), nullable=False, unique=True),
        sa.Column("source_columns", sa.JSON(), nullable=False),
        sa.Column("strategy", sa.String(50), nullable=False),
        sa.Column("priority_order", sa.JSON()),
        sa.Column("requires_review_on_conflict", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("description", sa.Text()), sa.Column("updated_by", sa.String(100)),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_cif_golden_rules_target_field", "cif_golden_rules", ["target_field"], unique=True)
    op.create_index("ix_cif_golden_rules_is_active", "cif_golden_rules", ["is_active"])
    rules = sa.table(
        "cif_golden_rules",
        sa.column("target_field", sa.String()),
        sa.column("source_columns", sa.JSON()),
        sa.column("strategy", sa.String()),
        sa.column("priority_order", sa.JSON()),
        sa.column("requires_review_on_conflict", sa.Boolean()),
        sa.column("description", sa.Text()),
    )
    op.bulk_insert(rules, [
        {"target_field":"customer_name","source_columns":["nmloc","nm"],"strategy":"first_non_empty","priority_order":["nmloc","nm"],"requires_review_on_conflict":True,"description":"Tên tiếng Việt ưu tiên nmloc."},
        {"target_field":"registration_number","source_columns":["regno"],"strategy":"manual_on_conflict","priority_order":["regno"],"requires_review_on_conflict":True,"description":"CCCD/đăng ký không tự ghi đè khi thay đổi."},
        {"target_field":"telephone","source_columns":["name_4","telnoctry","telnoarea","telno","telnoextn"],"strategy":"first_non_empty","priority_order":["name_4","telno"],"requires_review_on_conflict":False,"description":"Điện thoại chính ưu tiên name_4."},
        {"target_field":"birth_date","source_columns":["name_1"],"strategy":"manual_on_conflict","priority_order":["name_1"],"requires_review_on_conflict":True,"description":"Ngày sinh YYYYMMDD."},
        {"target_field":"gender_code","source_columns":["name_3"],"strategy":"manual_on_conflict","priority_order":["name_3"],"requires_review_on_conflict":False,"description":"Giới tính từ name_3."},
        {"target_field":"full_address","source_columns":["addr1loc","addr2loc","addr3loc","addr1","addr2","addr3"],"strategy":"prefer_local","priority_order":["addr1loc","addr2loc","addr3loc"],"requires_review_on_conflict":False,"description":"Ưu tiên địa chỉ local."},
        {"target_field":"status","source_columns":["stscd"],"strategy":"latest_approved","priority_order":["stscd"],"requires_review_on_conflict":False,"description":"Trạng thái chỉ đổi khi phê duyệt record mới."},
    ])


def downgrade() -> None:
    op.drop_table("cif_golden_rules")
    op.drop_table("cif_change_audits")
    op.drop_column("cif_identity_conflicts", "resolved_by")
    for name in ("review_note","reviewed_at","reviewed_by","review_status","current_snapshot","changed_fields","comparison_status"):
        op.drop_column("cif_source_records", name)
    for name in ("comparison_summary","column_stats","importer_version","uploaded_by"):
        op.drop_column("cif_import_batches", name)
