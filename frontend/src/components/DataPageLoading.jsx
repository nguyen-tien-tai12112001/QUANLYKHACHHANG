import { useEffect, useState } from 'react';
import { LoadingOutlined } from '@ant-design/icons';

export default function DataPageLoading({ active, title = 'Đang tải dữ liệu', detail = 'Hệ thống đang truy vấn và tổng hợp dữ liệu, vui lòng chờ…' }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return undefined;
    }
    const startedAt = performance.now();
    const timer = window.setInterval(() => setSeconds((performance.now() - startedAt) / 1000), 200);
    return () => window.clearInterval(timer);
  }, [active]);

  if (!active) return null;
  return (
    <div className="data-page-loading" role="status" aria-live="polite">
      <div className="data-page-loading__panel">
        <span className="data-page-loading__icon"><LoadingOutlined spin /></span>
        <strong>{title}</strong>
        <small>{detail}</small>
        <span className="data-page-loading__time">Đã xử lý {seconds.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} giây</span>
      </div>
    </div>
  );
}
