from sqlalchemy import text

from app.cif_importer import _refresh_registration_conflicts
from app.database import SessionLocal


NORMALIZE_SQL = """
UPDATE {table_name}
SET {column_name} = NULLIF(
    UPPER(REGEXP_REPLACE({column_name}, '\\s+', '', 'g')),
    ''
)
WHERE {column_name} IS NOT NULL
"""


def main():
    db = SessionLocal()
    try:
        for table_name, column_names in {
            "cif_customers": (
                "registration_number",
                "passport_number",
                "tax_number",
            ),
            "cif_customer_identifiers": (
                "registration_number",
                "passport_number",
                "driver_license_number",
                "tax_number",
            ),
        }.items():
            for column_name in column_names:
                db.execute(
                    text(
                        NORMALIZE_SQL.format(
                            table_name=table_name,
                            column_name=column_name,
                        )
                    )
                )

        _refresh_registration_conflicts(db, None)
        db.commit()

        pending_conflicts = db.execute(
            text(
                """
                SELECT COUNT(*)
                FROM cif_identity_conflicts
                WHERE status = 'pending'
                """
            )
        ).scalar_one()
        print(f"Normalized CIF identities. Pending conflicts: {pending_conflicts}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
