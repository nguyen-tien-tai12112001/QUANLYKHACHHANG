from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings


engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE IF EXISTS system_users ADD COLUMN IF NOT EXISTS data_scope VARCHAR(30) NOT NULL DEFAULT 'own'"))
        conn.execute(text("ALTER TABLE IF EXISTS org_departments ADD COLUMN IF NOT EXISTS department_type VARCHAR(50)"))
        conn.execute(text("ALTER TABLE IF EXISTS org_departments ADD COLUMN IF NOT EXISTS manager_user_id INTEGER"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS loai_vay VARCHAR(255)"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS ma_cb VARCHAR(50)"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS ten_can_bo VARCHAR(255)"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS telephone VARCHAR(50)"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS ghi_chu TEXT"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS tong_loi_ich_thang NUMERIC(20, 2) DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS e_banking INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS the_td_loc_viet INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS tt_tien_dien INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS tt_tien_nuoc INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS tt_cuoc_vien_thong INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS tra_luong_qua_the INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS batd INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS batk INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS bh_oto_xe_may INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS bh_khac INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS bao_lanh INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS loa_bien_dong_so_du INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS phan_mem_ban_hang INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS pos INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS chi_tra_kieu_hoi INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS phat_hanh_lc INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS thanh_toan_quoc_te INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE IF EXISTS customer_period_summaries ADD COLUMN IF NOT EXISTS mua_ban_ngoai_te INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_dp01_period_customer ON dp01_deposit_accounts (period_key, ma_kh_chuan)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_ln01_period_customer ON ln01_loans (period_key, ma_kh_chuan)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pf14_period_customer ON pf14_account_balances (period_key, ma_kh_chuan)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_cn05_period_customer ON cn05_customer_services (period_key, ma_kh_chuan)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_summary_period_customer ON customer_period_summaries (period_key, ma_kh_chuan)"))


def check_database_connection() -> tuple[bool, str | None]:
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True, None
    except SQLAlchemyError as exc:
        return False, str(exc)
    except Exception as exc:
        return False, str(exc)
