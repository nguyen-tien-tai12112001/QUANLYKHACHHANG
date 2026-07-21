"""Reprocess all periods to apply transfer-inflow formula on existing doanh_so_chuyen_tien_ve_tk column."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.customer_processing import create_processing_job, process_customer_period
from app.database import SessionLocal
from app.models import ImportBatch


def main() -> None:
    db = SessionLocal()
    try:
        periods = [
            row[0]
            for row in db.query(ImportBatch.period_key).order_by(ImportBatch.period_key).all()
        ]
        print(f"Reprocessing {len(periods)} periods: {', '.join(periods)}")
        for period_key in periods:
            job = create_processing_job(db, period_key)
            print(f"  {period_key} (job #{job.id})...")
            process_customer_period(job.id)
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
