"""Update doanh_so_chuyen_tien_ve_tk on existing profiles (no schema change, no full reprocess)."""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.customer_processing import apply_transfer_inflow_to_profiles
from app.database import SessionLocal
from app.models import ImportBatch


def main() -> None:
    db = SessionLocal()
    try:
        periods = [
            row[0]
            for row in db.query(ImportBatch.period_key).order_by(ImportBatch.period_key).all()
        ]
        for period_key in periods:
            apply_transfer_inflow_to_profiles(db, period_key)
            db.commit()
            print(f"Updated transfer inflow for {period_key}")
        print("Done.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
