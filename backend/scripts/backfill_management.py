"""Recalculate customer management assignment for an already processed period."""

import argparse

from sqlalchemy import text

from app.customer_processing import prepare_profile_enrichment
from app.database import SessionLocal


UPDATE_MANAGEMENT_SQL = text("""
    UPDATE customer_period_profiles p
    SET management_source=e.management_source,
        managing_branch_code=e.managing_branch_code,
        managing_department_code=e.managing_department_code,
        managing_department_name=e.managing_department_name,
        ma_cb=e.ma_cb,
        officer_employee_code=e.officer_employee_code,
        ten_can_bo=e.ten_can_bo,
        primary_branch_code=e.primary_branch_code,
        primary_pgd_code=e.primary_pgd_code,
        primary_pgd_name=e.primary_pgd_name
    FROM tmp_profile_enrichment e
    WHERE p.period_key=:period_key
      AND p.customer_id=e.customer_id
      AND (p.management_source, p.managing_branch_code, p.managing_department_code,
           p.managing_department_name, p.ma_cb, p.officer_employee_code, p.ten_can_bo,
           p.primary_branch_code, p.primary_pgd_code, p.primary_pgd_name)
          IS DISTINCT FROM
          (e.management_source, e.managing_branch_code, e.managing_department_code,
           e.managing_department_name, e.ma_cb, e.officer_employee_code, e.ten_can_bo,
           e.primary_branch_code, e.primary_pgd_code, e.primary_pgd_name)
""")

UPDATE_BRANCH_STAFF_SQL = text("""
    WITH dp_staff AS (
        SELECT DISTINCT ON (deposit.ma_kh, deposit.ma_cn)
            deposit.ma_kh, deposit.ma_cn AS branch_code,
            COALESCE(users.credit_officer_code, users.employee_code) AS ma_cb,
            users.full_name AS ten_can_bo, users.employee_code AS officer_employee_code
        FROM dp01_deposit_accounts deposit
        JOIN system_users users
          ON users.is_active=true AND TRIM(users.employee_code)=TRIM(deposit.employee_number)
        JOIN org_branches branch
          ON branch.id=users.branch_id AND branch.branch_code=TRIM(deposit.ma_cn)
        WHERE deposit.period_key=:period_key
          AND NULLIF(TRIM(deposit.employee_number), '') IS NOT NULL
        ORDER BY deposit.ma_kh, deposit.ma_cn,
                 COALESCE(deposit.current_balance, 0) DESC, deposit.id
    )
    UPDATE customer_period_branch_details detail
    SET ma_cb=staff.ma_cb, ten_can_bo=staff.ten_can_bo,
        officer_employee_code=staff.officer_employee_code
    FROM dp_staff staff
    WHERE detail.period_key=:period_key
      AND detail.ma_kh=staff.ma_kh AND detail.branch_code=staff.branch_code
      AND NULLIF(TRIM(detail.ma_cb), '') IS NULL
""")

REFRESH_BRANCH_SNAPSHOT_SQL = text("""
    WITH rebuilt AS (
        SELECT profile.id,
               jsonb_agg(item.value || jsonb_build_object(
                   'ma_cb', detail.ma_cb,
                   'ten_can_bo', detail.ten_can_bo,
                   'officer_employee_code', detail.officer_employee_code
               ) ORDER BY item.ordinality) AS branch_details
        FROM customer_period_profiles profile
        CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(profile.branch_details::jsonb, '[]'::jsonb)
        ) WITH ORDINALITY AS item(value, ordinality)
        LEFT JOIN customer_period_branch_details detail
          ON detail.period_key=profile.period_key AND detail.ma_kh=profile.ma_kh
         AND detail.branch_code=item.value->>'branch_code'
        WHERE profile.period_key=:period_key
        GROUP BY profile.id
    )
    UPDATE customer_period_profiles profile
    SET branch_details=rebuilt.branch_details::json
    FROM rebuilt
    WHERE profile.id=rebuilt.id
      AND profile.branch_details::jsonb IS DISTINCT FROM rebuilt.branch_details
""")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("period_key")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        prepare_profile_enrichment(db, args.period_key)
        branch_result = db.execute(UPDATE_BRANCH_STAFF_SQL, {"period_key": args.period_key})
        result = db.execute(UPDATE_MANAGEMENT_SQL, {"period_key": args.period_key})
        snapshot_result = db.execute(REFRESH_BRANCH_SNAPSHOT_SQL, {"period_key": args.period_key})
        db.commit()
        print(
            f"Updated {result.rowcount} profiles, {branch_result.rowcount} branch officers "
            f"and {snapshot_result.rowcount} snapshots for {args.period_key}",
            flush=True,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
