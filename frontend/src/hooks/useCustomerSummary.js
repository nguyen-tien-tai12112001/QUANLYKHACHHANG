import { useCallback, useEffect, useState } from 'react';

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

export function useCustomerSummary() {
  const [status, setStatus] = useState(initialStatus);
  const [rows, setRows] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [periodKey, setPeriodKey] = useState(null);
  const [isDemo, setIsDemo] = useState(false);
  const [dashboardAggregate, setDashboardAggregate] = useState(null);
  const [trends, setTrends] = useState(null);
  const [trendsLoading, setTrendsLoading] = useState(false);

  const loadData = useCallback(async (selectedPeriod, filters = {}) => {
    setStatus((prev) => ({ ...prev, loading: true }));
    setTrendsLoading(true);

    try {
      const { data: health } = await client.get('/health');
      const isOk = health.status === 'ok';
      const dbOk = health.database === 'connected';

      setStatus({
        loading: false,
        backend: isOk ? 'ok' : 'error',
        database: dbOk ? 'connected' : 'disconnected',
        message: health.message || '',
      });

      if (!isOk || !dbOk) {
        setRows(MOCK_ROWS);
        setIsDemo(true);
        setDashboardAggregate(buildMockDashboardAggregate());
        setTrends(null);
        setTrendsLoading(false);
        return;
      }

      let periodList = periods;
      if (!periodList.length) {
        const { data: periodData } = await client.get('/imports/periods');
        periodList = Array.isArray(periodData) ? periodData : [];
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
        return;
      }

      setPeriodKey(activePeriod);
      localStorage.setItem(DASHBOARD_PERIOD_STORAGE_KEY, activePeriod);

      const aggregateParams = { period_key: activePeriod, ...filters };
      const trendParams = { periods: 6, ...filters };

      const [aggregateRes, trendsRes] = await Promise.all([
        client.get('/dashboard/summary', { params: aggregateParams }),
        client.get('/dashboard/trends', { params: trendParams }).catch(() => ({ data: null })),
      ]);

      setRows([]);
      setDashboardAggregate(aggregateRes.data);
      setTrends(trendsRes.data);
      setIsDemo(false);
    } catch (error) {
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
      setTrendsLoading(false);
      setStatus((prev) => ({ ...prev, loading: false }));
    }
  }, [periods]);

  useEffect(() => {
    loadData();
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
