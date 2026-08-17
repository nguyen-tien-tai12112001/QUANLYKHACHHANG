import { useEffect, useRef, useState } from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export default function GlobalApiLoading() {
  const pendingRef = useRef(0);
  const timerRef = useRef(null);
  const [visible, setVisible] = useState(false);

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

  return (
    <div className={`global-api-loading${visible ? ' global-api-loading--visible' : ''}`} aria-live="polite">
      <div className="global-api-loading__backdrop">
        <LoadingOutlined spin className="global-api-loading__spinner" />
        <strong>Đang tải dữ liệu</strong>
        <span>Hệ thống đang truy vấn và tổng hợp dữ liệu, vui lòng chờ…</span>
      </div>
    </div>
  );
}
