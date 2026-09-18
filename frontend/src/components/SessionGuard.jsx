import { useCallback, useEffect, useRef, useState } from 'react';
import { ClockCircleOutlined, LogoutOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { Button, Modal, Progress } from 'antd';

import client from '../api/client';
import './SessionGuard.css';

const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_WARNING_SECONDS = 120;
const HEARTBEAT_MS = 30_000;
const ACTIVITY_WRITE_THROTTLE_MS = 2_000;
const ACTIVITY_KEY = 'c360_last_activity_at';

function formatCountdown(totalSeconds) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SessionGuard({ currentUser, onSessionExpired, onLogout }) {
  const policy = (() => {
    try {
      return JSON.parse(localStorage.getItem('c360_session_policy') || '{}');
    } catch {
      return {};
    }
  })();
  const idleSeconds = Number(policy.idle_minutes || DEFAULT_IDLE_MINUTES) * 60;
  const warningSeconds = Number(policy.warning_seconds || DEFAULT_WARNING_SECONDS);
  const [remainingSeconds, setRemainingSeconds] = useState(idleSeconds);
  const lastActivityRef = useRef(Number(localStorage.getItem(ACTIVITY_KEY)) || Date.now());
  const lastPersistedRef = useRef(0);
  const expiredRef = useRef(false);

  const markActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    setRemainingSeconds(idleSeconds);
    if (now - lastPersistedRef.current >= ACTIVITY_WRITE_THROTTLE_MS) {
      lastPersistedRef.current = now;
      localStorage.setItem(ACTIVITY_KEY, String(now));
    }
  }, [idleSeconds]);

  const heartbeat = useCallback(async (force = false) => {
    if (!currentUser || expiredRef.current) return;
    if (!force && Date.now() - lastActivityRef.current > 60_000) return;
    try {
      await client.post('/auth/session/heartbeat', {}, { hideGlobalLoading: true });
    } catch {
      // Bộ chặn API sẽ hiển thị đúng nguyên nhân và kết thúc phiên khi máy chủ từ chối.
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return undefined;
    expiredRef.current = false;
    const initialActivity = Date.now();
    lastActivityRef.current = initialActivity;
    lastPersistedRef.current = initialActivity;
    localStorage.setItem(ACTIVITY_KEY, String(initialActivity));
    setRemainingSeconds(idleSeconds);

    const activityEvents = ['pointerdown', 'keydown', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActivity, { capture: true, passive: true }));
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') markActivity();
    };
    const handleStorage = (event) => {
      if (event.key !== ACTIVITY_KEY || !event.newValue) return;
      const value = Number(event.newValue);
      if (Number.isFinite(value) && value > lastActivityRef.current) {
        lastActivityRef.current = value;
        setRemainingSeconds(idleSeconds);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);

    const countdownTimer = window.setInterval(() => {
      const remaining = Math.max(0, idleSeconds - ((Date.now() - lastActivityRef.current) / 1000));
      setRemainingSeconds(remaining);
      if (remaining <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onSessionExpired(`Phiên đăng nhập đã kết thúc do không hoạt động trong ${Math.round(idleSeconds / 60)} phút`);
      }
    }, 1000);
    const heartbeatTimer = window.setInterval(() => heartbeat(false), HEARTBEAT_MS);
    heartbeat(true);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActivity, { capture: true }));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
      window.clearInterval(countdownTimer);
      window.clearInterval(heartbeatTimer);
    };
  }, [currentUser, heartbeat, idleSeconds, markActivity, onSessionExpired]);

  const continueSession = async () => {
    markActivity();
    await heartbeat(true);
  };
  const warningOpen = remainingSeconds > 0 && remainingSeconds <= warningSeconds;
  const elapsedPercent = Math.min(100, Math.max(0, ((idleSeconds - remainingSeconds) / idleSeconds) * 100));

  return (
    <Modal
      open={warningOpen}
      closable={false}
      maskClosable={false}
      keyboard={false}
      footer={null}
      width={480}
      centered
      className="session-warning-modal"
    >
      <div className="session-warning-content">
        <span className="session-warning-icon"><ClockCircleOutlined /></span>
        <span className="session-warning-kicker"><SafetyCertificateOutlined /> BẢO VỆ PHIÊN ĐĂNG NHẬP</span>
        <h3>Bạn vẫn đang sử dụng C360?</h3>
        <p>Phiên sẽ tự động kết thúc nếu không có hoạt động để bảo vệ dữ liệu khách hàng đang hiển thị.</p>
        <strong className="session-warning-countdown">{formatCountdown(remainingSeconds)}</strong>
        <Progress percent={elapsedPercent} showInfo={false} strokeColor={{ '0%': '#d6a033', '100%': '#8f1438' }} />
        <div className="session-warning-actions">
          <Button icon={<LogoutOutlined />} onClick={onLogout}>Đăng xuất</Button>
          <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={continueSession}>Tiếp tục sử dụng</Button>
        </div>
      </div>
    </Modal>
  );
}
