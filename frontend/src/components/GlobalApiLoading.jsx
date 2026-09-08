import { useEffect, useRef, useState } from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export default function GlobalApiLoading() {
  const pendingRef = useRef(0);
  const timerRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [preload, setPreload] = useState({ active: false, completed: 0, total: 0, stage: '', elapsed: 0 });

  useEffect(() => {
    function handleLoading(event) {
      pendingRef.current = Math.max(0, pendingRef.current + Number(event.detail?.delta || 0));
      if (pendingRef.current > 0) {
        if (!timerRef.current) {
          timerRef.current = window.setTimeout(() => {
            timerRef.current = null;
            if (pendingRef.current > 0) setVisible(true);
          }, 250);
        }
        return;
      }
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setVisible(false);
    }

    window.addEventListener('c360:api-loading', handleLoading);
    return () => {
      window.removeEventListener('c360:api-loading', handleLoading);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let startedAt = 0;
    function handlePreload(event) {
      const detail = event.detail || {};
      if (detail.startedAt) startedAt = detail.startedAt;
      setPreload((current) => ({
        ...current,
        active: Boolean(detail.active),
        completed: Number(detail.completed || 0),
        total: Number(detail.total || 0),
        stage: detail.stage || current.stage,
        elapsed: startedAt ? Math.max(0, (performance.now() - startedAt) / 1000) : 0,
      }));
    }
    const timer = window.setInterval(() => {
      if (!startedAt) return;
      setPreload((current) => current.active ? { ...current, elapsed: Math.max(0, (performance.now() - startedAt) / 1000) } : current);
    }, 250);
    window.addEventListener('c360:preload-state', handlePreload);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('c360:preload-state', handlePreload);
    };
  }, []);

  const show = visible || preload.active;
  const percent = preload.total ? Math.min(100, Math.round((preload.completed / preload.total) * 100)) : 0;

  return (
    <div className={`global-api-loading${show ? ' global-api-loading--visible' : ''}`} aria-live="polite">
      <div className="global-api-loading__backdrop">
        <LoadingOutlined spin className="global-api-loading__spinner" />
        <strong>{preload.active ? 'Đang chuẩn bị toàn bộ phiên C360' : 'Đang tải dữ liệu'}</strong>
        <span>{preload.active ? preload.stage : 'Hệ thống đang truy vấn và tổng hợp dữ liệu, vui lòng chờ…'}</span>
        {preload.active ? <div className="global-api-loading__progress"><i style={{ width: `${percent}%` }} /><small>{percent}% · {preload.elapsed.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giây</small></div> : null}
      </div>
    </div>
  );
}
