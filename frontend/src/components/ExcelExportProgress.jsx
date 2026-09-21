import { CheckCircleFilled, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { Progress } from 'antd';
import { useEffect, useRef, useState } from 'react';
import client from '../api/client';
import './ExcelExportProgress.css';

const KEEP_FINISHED_MS = 6_000;

function elapsedLabel(startedAt, now) {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1_000));
  return seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút ${String(seconds % 60).padStart(2, '0')} giây`;
}

export default function ExcelExportProgress() {
  const [tasks, setTasks] = useState([]);
  const [now, setNow] = useState(Date.now());
  const activeTasksRef = useRef([]);

  useEffect(() => {
    activeTasksRef.current = tasks.filter((task) => !['complete', 'error', 'downloading'].includes(task.status));
  }, [tasks]);

  useEffect(() => {
    const handleExport = (event) => {
      const detail = event.detail || {};
      if (!detail.id) return;
      setTasks((current) => {
        const existing = current.find((task) => task.id === detail.id);
        const next = {
          ...(existing || { id: detail.id, startedAt: Date.now(), title: 'Dữ liệu Excel' }),
          ...detail,
          finishedAt: ['complete', 'error'].includes(detail.status) ? Date.now() : undefined,
        };
        return [...current.filter((task) => task.id !== detail.id), next].slice(-4);
      });
    };
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      setTasks((current) => current.filter((task) => !task.finishedAt || currentTime - task.finishedAt < KEEP_FINISHED_MS));
    }, 1_000);
    window.addEventListener('c360:excel-export', handleExport);
    return () => {
      window.removeEventListener('c360:excel-export', handleExport);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let busy = false;
    const poll = async () => {
      if (busy || !activeTasksRef.current.length) return;
      busy = true;
      try {
        await Promise.all(activeTasksRef.current.map(async ({ id }) => {
          try {
            const { data } = await client.get(`/exports/${encodeURIComponent(id)}`, {
              noCache: true,
              hideGlobalLoading: true,
              timeout: 5_000,
            });
            setTasks((current) => current.map((task) => task.id === id && !['complete', 'error', 'downloading'].includes(task.status)
              ? { ...task, percent: data.percent, stage: data.stage }
              : task));
          } catch {
            // The export request may not have reached its worker yet.
          }
        }));
      } finally {
        busy = false;
      }
    };
    const timer = window.setInterval(poll, 1_200);
    return () => window.clearInterval(timer);
  }, []);

  if (!tasks.length) return null;
  return (
    <div className="excel-export-progress" aria-live="polite" aria-label="Tiến độ xuất Excel">
      {tasks.map((task) => {
        const finished = task.status === 'complete';
        const failed = task.status === 'error';
        const percent = task.percent == null ? null : Math.max(0, Math.min(100, task.percent));
        return (
          <div className={`excel-export-progress__task${finished ? ' is-complete' : ''}${failed ? ' is-error' : ''}`} key={task.id}>
            <span className="excel-export-progress__icon">
              {finished ? <CheckCircleFilled /> : failed ? <CloseCircleFilled /> : <LoadingOutlined spin />}
            </span>
            <div className="excel-export-progress__content">
              <strong>{finished ? 'Đã xuất Excel' : failed ? 'Xuất Excel thất bại' : 'Đang xuất Excel'}</strong>
              <span className="excel-export-progress__title" title={task.title}>{task.title}</span>
              <div className="excel-export-progress__meta">
                <span>{failed ? task.message : finished ? 'File đã sẵn sàng để tải xuống' : task.status === 'downloading' ? 'Đang tải file về máy' : task.stage || 'Máy chủ đang chuẩn bị file'}</span>
                <b>{percent == null ? '—' : `${percent}%`}</b>
              </div>
              <Progress percent={percent || 0} showInfo={false} size="small" status={failed ? 'exception' : finished ? 'success' : 'active'} className={percent == null || task.status === 'preparing' ? 'is-indeterminate' : ''} />
              <small>Thời gian: {elapsedLabel(task.startedAt, task.finishedAt || now)}</small>
            </div>
          </div>
        );
      })}
    </div>
  );
}
