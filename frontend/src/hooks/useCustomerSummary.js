import { useCallback, useEffect, useRef, useState } from 'react';

import client from '../api/client';
import { buildMockDashboardAggregate } from '../constants/mockDashboardAggregate';
import { MOCK_ROWS } from '../constants/mockData';
import { DASHBOARD_PERIOD_STORAGE_KEY } from '../utils/periodUtils';

const initialStatus = {
  loading: true,
  backend: 'checking',
  database: 'checking',
  message: '',
};

function isAbortError(error) {
  return error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || error?.name === 'AbortError';
}

export function useCustomerSummary() {
  const [status, setStatus] = useState(initialStatus);
  const [rows, setRows] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [periodKey, setPeriodKey] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [dashboardAggregate, setDashboardAggregate] = useState(null);
  const [trends, setTrends] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const periodsRef = useRef(periods);
  periodsRef.current = periods;

  const loadData = useCallback(async (selectedPeriod, filters = {}) => {
    const requestId = ++requestIdRef.current;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus((prev) => ({ ...prev, loading: true }));
    setTrendsLoading(true);

    try {
      const { data: health } = await client.get('/health', { signal: controller.signal });
      if (requestId !== requestIdRef.current) return;

      const isOk = health.status === 'ok';
      const dbOk = health.database === 'connected';

      setStatus((prev) => ({
        ...prev,
        loading: true,
        backend: isOk ? 'ok' : 'error',
        database: dbOk ? 'connected' : 'disconnected',
        message: health.message || '',
      }));

      if (!isOk || !dbOk) {
        setRows(MOCK_ROWS);
        setIsDemo(true);
        setDashboardAggregate(buildMockDashboardAggregate());
        setTrends(null);
        setTrendsLoading(false);
        setStatus((prev) => ({ ...prev, loading: false }));
        return;
      }

      let periodList = periodsRef.current;
      if (!periodList.length) {
        const { data: periodData } = await client.get('/customer-processing/periods', {
          signal: controller.signal,
        });
        if (requestId !== requestIdRef.current) return;
        periodList = Array.isArray(periodData) ? periodData.filter((item) => Number(item.profile_count || 0) > 0) : [];
        setPeriods(periodList);
      }

      const savedPeriod = localStorage.getItem(DASHBOARD_PERIOD_STORAGE_KEY);
      const latestPeriod = periodList[0]?.period_key || null;
      const activePeriod = selectedPeriod || savedPeriod || latestPeriod;

      if (!activePeriod) {
        setRows(MOCK_ROWS);
        setIsDemo(true);
        setPeriodKey(null);
        setDashboardAggregate(buildMockDashboardAggregate());
        setTrends(null);
        setTrendsLoading(false);
        setStatus((prev) => ({ ...prev, loading: false }));
        return;
      }

      setPeriodKey(activePeriod);
      localStorage.setItem(DASHBOARD_PERIOD_STORAGE_KEY, activePeriod);

      const aggregateParams = { period_key: activePeriod, ...filters };
      const trendParams = { periods: 6, ...filters };

      const [aggregateRes, trendsRes] = await Promise.all([
        client.get('/dashboard/summary', { params: aggregateParams, signal: controller.signal }),
        client.get('/dashboard/trends', { params: trendParams, signal: controller.signal }).catch((error) => {
          if (isAbortError(error)) throw error;
          return { data: null };
        }),
      ]);

      if (requestId !== requestIdRef.current) return;

      // Bỏ qua response lệch phạm vi (phòng trường hợp race ngoài AbortController).
      const responseCn = aggregateRes.data?.ma_cn ?? null;
      const responsePgd = aggregateRes.data?.ma_pgd ?? null;
      const requestedCn = filters.ma_cn ?? null;
      const requestedPgd = filters.ma_pgd ?? null;
      if (responseCn !== requestedCn || responsePgd !== requestedPgd) {
        return;
      }

      setRows([]);
      setDashboardAggregate(aggregateRes.data);
      setTrends(trendsRes.data);
      setIsDemo(false);
    } catch (error) {
      if (isAbortError(error) || requestId !== requestIdRef.current) {
        return;
      }
      setStatus({
        loading: false,
        backend: 'error',
        database: 'disconnected',
        message: error.response?.data?.detail || error.message || 'Không thể kết nối backend',
      });
      setRows(MOCK_ROWS);
      setIsDemo(true);
      setDashboardAggregate(buildMockDashboardAggregate());
      setTrends(null);
    } finally {
      if (requestId === requestIdRef.current) {
        setTrendsLoading(false);
        setStatus((prev) => ({ ...prev, loading: false }));
      }
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(
    (nextPeriod, filters) => loadData(nextPeriod, filters),
    [loadData],
  );

  const changePeriod = useCallback(
    (nextPeriod) => {
      setPeriodKey(nextPeriod);
      reload(nextPeriod);
    },
    [reload],
  );

  return {
    status,
    rows,
    periods,
    periodKey,
    setPeriodKey: changePeriod,
    isDemo,
    reload,
    dashboardAggregate,
    trends,
    trendsLoading,
  };
}
