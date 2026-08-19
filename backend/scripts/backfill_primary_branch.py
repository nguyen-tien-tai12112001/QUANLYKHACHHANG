"""Backfill primary branch with the production priority used by C360 processing.

Priority: explicit USER_CIF assignment, then largest loan relationship, term
deposit, CASA average, payment turnover/service relationship, and CIF fallback.
DP01 negative balances never participate because they represent overdraft.
"""

import argparse

from sqlalchemy import text

from app.database import SessionLocal


SANITIZE_BRANCH_STAFF_SQL = text("""
    WITH invalid AS MATERIALIZED (
        SELECT detail.id, detail.ma_kh, detail.branch_code
        FROM customer_period_branch_details detail
        WHERE detail.period_key=:period_key
          AND (detail.ma_cb IS NOT NULL OR detail.officer_employee_code IS NOT NULL OR detail.ten_can_bo IS NOT NULL)
          AND NOT EXISTS (
            SELECT 1 FROM system_users users
            JOIN org_branches branch ON branch.id=users.branch_id
            WHERE users.is_active=true AND branch.branch_code=detail.branch_code
              AND (TRIM(users.employee_code)=TRIM(COALESCE(detail.officer_employee_code,''))
                OR TRIM(users.credit_officer_code)=TRIM(COALESCE(detail.ma_cb,'')))
          )
    ), cleared AS (
        UPDATE customer_period_branch_details detail
        SET ma_cb=NULL, officer_employee_code=NULL, ten_can_bo=NULL
        FROM invalid
        WHERE detail.id=invalid.id
        RETURNING detail.id
    ), rebuilt AS (
        SELECT profile.id,
               jsonb_agg(
                 CASE WHEN EXISTS (
                   SELECT 1 FROM invalid
                   WHERE invalid.ma_kh=profile.ma_kh
                     AND invalid.branch_code=item.value->>'branch_code'
                 ) THEN item.value || jsonb_build_object('ma_cb',NULL,'officer_employee_code',NULL,'ten_can_bo',NULL)
                 ELSE item.value END
                 ORDER BY item.ordinality
               ) AS branch_details
        FROM customer_period_profiles profile
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(profile.branch_details::jsonb,'[]'::jsonb)) WITH ORDINALITY item(value,ordinality)
        WHERE profile.period_key=:period_key
          AND EXISTS (SELECT 1 FROM invalid WHERE invalid.ma_kh=profile.ma_kh)
        GROUP BY profile.id
    )
    UPDATE customer_period_profiles profile
    SET branch_details=rebuilt.branch_details::json
    FROM rebuilt
    WHERE profile.id=rebuilt.id
""")


BACKFILL_SQL = text("""
    WITH ranked AS MATERIALIZED (
        SELECT detail.*,
               GREATEST(
                   COALESCE(detail.so_du_tien_vay,0),
                   COALESCE(detail.du_no_ngan_han,0)+COALESCE(detail.du_no_trung_dai_han,0)+COALESCE(detail.du_no_thau_chi,0)
               ) AS loan_value,
               ROW_NUMBER() OVER (
                   PARTITION BY detail.ma_kh
                   ORDER BY
                     CASE WHEN GREATEST(COALESCE(detail.so_du_tien_vay,0), COALESCE(detail.du_no_ngan_han,0)+COALESCE(detail.du_no_trung_dai_han,0)+COALESCE(detail.du_no_thau_chi,0)) > 0 THEN 1 ELSE 0 END DESC,
                     GREATEST(COALESCE(detail.so_du_tien_vay,0), COALESCE(detail.du_no_ngan_han,0)+COALESCE(detail.du_no_trung_dai_han,0)+COALESCE(detail.du_no_thau_chi,0)) DESC,
                     COALESCE(detail.so_du_tien_gui,0) DESC,
                     COALESCE(detail.so_du_tgtt_binh_quan,0) DESC,
                     COALESCE(detail.doanh_so_cramt,0) DESC,
                     detail.branch_code, detail.ma_pgd
               ) AS position
        FROM customer_period_branch_details detail
        JOIN customer_period_profiles target
          ON target.period_key=detail.period_key AND target.ma_kh=detail.ma_kh
         AND target.branch_count > 1
         AND COALESCE(target.management_source,'') <> 'USER_CIF'
        WHERE detail.period_key=:period_key
    ), chosen AS (
        SELECT ranked.*,
               CASE
                 WHEN loan_value > 0 THEN 'LOAN_BALANCE'
                 WHEN COALESCE(so_du_tien_gui,0) > 0 THEN 'TERM_DEPOSIT_BALANCE'
                 WHEN COALESCE(so_du_tgtt_binh_quan,0) > 0 THEN 'CASA_AVERAGE_BALANCE'
                 WHEN COALESCE(doanh_so_cramt,0) > 0 THEN 'PAYMENT_TURNOVER'
                 ELSE 'CIF_BRANCH'
               END AS location_source
        FROM ranked WHERE position=1
    ), staff AS (
        SELECT chosen.*,
               CASE WHEN branch.id IS NOT NULL THEN users.employee_code END AS valid_employee_code,
               CASE WHEN branch.id IS NOT NULL THEN COALESCE(users.credit_officer_code, users.employee_code) END AS valid_officer_code,
               CASE WHEN branch.id IS NOT NULL THEN users.full_name END AS valid_officer_name,
               CASE WHEN branch.id IS NOT NULL THEN department.department_code END AS department_code,
               CASE WHEN branch.id IS NOT NULL THEN department.department_name END AS department_name
        FROM chosen
        LEFT JOIN system_users users ON users.is_active=true AND (
          TRIM(users.employee_code)=TRIM(COALESCE(chosen.officer_employee_code,'')) OR
          TRIM(users.credit_officer_code)=TRIM(COALESCE(chosen.ma_cb,''))
        )
        LEFT JOIN org_branches branch ON branch.id=users.branch_id AND branch.branch_code=chosen.branch_code
        LEFT JOIN org_departments department ON department.id=users.department_id
    )
    UPDATE customer_period_profiles profile SET
        primary_branch_code=staff.branch_code,
        primary_pgd_code=staff.ma_pgd,
        primary_pgd_name=staff.ten_pgd,
        management_source=staff.location_source,
        managing_branch_code=staff.branch_code,
        managing_department_code=staff.department_code,
        managing_department_name=staff.department_name,
        ma_cb=staff.valid_officer_code,
        officer_employee_code=staff.valid_employee_code,
        ten_can_bo=staff.valid_officer_name
    FROM staff
    WHERE profile.period_key=:period_key
      AND profile.ma_kh=staff.ma_kh
      AND COALESCE(profile.management_source,'') <> 'USER_CIF'
      AND (
        profile.primary_branch_code, profile.primary_pgd_code, profile.primary_pgd_name,
        profile.management_source, profile.managing_branch_code,
        profile.managing_department_code, profile.managing_department_name,
        profile.ma_cb, profile.officer_employee_code, profile.ten_can_bo
      ) IS DISTINCT FROM (
        staff.branch_code, staff.ma_pgd, staff.ten_pgd,
        staff.location_source, staff.branch_code,
        staff.department_code, staff.department_name,
        staff.valid_officer_code, staff.valid_employee_code, staff.valid_officer_name
      )
""")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("period_key")
    args = parser.parse_args()
    db = SessionLocal()
    try:
        sanitized = db.execute(SANITIZE_BRANCH_STAFF_SQL, {"period_key": args.period_key})
        result = db.execute(BACKFILL_SQL, {"period_key": args.period_key})
        db.commit()
        print(
            f"Updated {result.rowcount} primary customer relationships and "
            f"{sanitized.rowcount} affected snapshots for {args.period_key}",
            flush=True,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
