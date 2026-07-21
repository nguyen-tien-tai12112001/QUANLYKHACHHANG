"""Chuyển khách hàng từ PGD Marketing (mã 02) sang Phòng KTNQ (mã 00) tại chi nhánh 2600."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from sqlalchemy import text

from app.customer_processing import create_processing_job, process_customer_period
from app.database import SessionLocal

BRANCH_CODE = "2600"
FROM_PGD = "02"
TO_PGD = "00"
TO_PGD_NAME = "Phòng KTNQ"
MARKETING_FILTER = "%marketing%"


def migrate_dp01(db) -> int:
    result = db.execute(
        text(
            """
            UPDATE dp01_deposit_accounts
            SET ma_pgd = :to_pgd,
                ten_pgd = :to_pgd_name
            WHERE ma_cn = :branch_code
              AND ma_pgd = :from_pgd
              AND ten_pgd ILIKE :marketing_filter
            """
        ),
        {
            "branch_code": BRANCH_CODE,
            "from_pgd": FROM_PGD,
            "to_pgd": TO_PGD,
            "to_pgd_name": TO_PGD_NAME,
            "marketing_filter": MARKETING_FILTER,
        },
    )
    return result.rowcount or 0


def reprocess_periods(db, period_keys: list[str]) -> None:
    for period_key in period_keys:
        existing = db.execute(
            text(
                """
                SELECT COUNT(*) FROM customer_period_profiles
                WHERE period_key = :period_key
                """
            ),
            {"period_key": period_key},
        ).scalar()
        if not existing:
            print(f"  Skip {period_key}: no processed data")
            continue
        job = create_processing_job(db, period_key)
        print(f"  Reprocess {period_key} (job #{job.id})...")
        process_customer_period(job.id)


def main() -> None:
    db = SessionLocal()
    try:
        updated = migrate_dp01(db)
        db.commit()
        print(f"Updated {updated} DP01 rows (2600 / 02 Marketing -> 00 KTNQ)")

        periods_with_marketing = db.execute(
            text(
                """
                SELECT DISTINCT period_key
                FROM customer_period_branch_details
                WHERE branch_code = :branch_code
                  AND ma_pgd = :from_pgd
                  AND ten_pgd ILIKE :marketing_filter
                ORDER BY period_key
                """
            ),
            {
                "branch_code": BRANCH_CODE,
                "from_pgd": FROM_PGD,
                "marketing_filter": MARKETING_FILTER,
            },
        ).all()
        period_keys = sorted({row[0] for row in periods_with_marketing})

        if not period_keys:
            print("No processed periods need reprocessing.")
            return

        print(f"Reprocessing {len(period_keys)} periods: {', '.join(period_keys)}")
        reprocess_periods(db, period_keys)
        print("Done.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
