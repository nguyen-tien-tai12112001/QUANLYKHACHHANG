import { useCallback, useEffect, useRef, useState } from 'react';
import { message } from 'antd';

import client from '../api/client';
import { normalizeProcessedProfile } from '../utils/reportHelpers';
import { buildReportParams } from '../utils/reportParams';

const DEFAULT_PAGINATION = { current: 1, pageSize: 25, total: 0 };

const DEFAULT_SUMMARY = {
  total_customers: 0,
  total_loan: 0,
  total_deposit: 0,
  total_casa: 0,
  no_service_customers: 0,
};

export function useCustomerReport({ periodKey, filters, filterCn, filterPgd, enabled = true }) {
  const [rows, setRows] = useState([]);
  const [reportPeriods, setReportPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(periodKey || null);
  const [pagination, setPagination] = useState(DEFAULT_PAGINATION);
  const [summary, setSummary] = useState(DEFAULT_SUMMARY);
  const [analytics, setAnalytics] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    branches: [],
    pgds: [],
    pgd_options: [],
    pgd_names: {},
    loan_types: [],
    officers: [],
  });
  const [loading, setLoading] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const paginationRef = useRef(pagination);

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  const loadPeriods = useCallback(async (preferredPeriod) => {
    const { data } = await client.get('/customer-processing/periods');
    const processedPeriods = (data || []).filter((item) => Number(item.profile_count || 0) > 0);
    setReportPeriods(processedPeriods);
    const nextPeriod = preferredPeriod || selectedPeriod || processedPeriods[0]?.period_key || null;
    setSelectedPeriod(nextPeriod);
    return nextPeriod;
  }, [selectedPeriod]);

  const loadFilterOptions = useCallback(async (period) => {
    if (!period) return;
    const params = buildReportParams(period, filters, filterCn, filterPgd);
    const { data } = await client.get('/customer-processing/profile-filter-options', {
      params: {
        period_key: params.period_key,
        branch_code: params.branch_code,
        pgd_code: params.pgd_code,
      },
    });
    setFilterOptions(data || { branches: [], pgds: [], pgd_options: [], pgd_names: {}, loan_types: [], officers: [] });
  }, [filters, filterCn, filterPgd]);

  const loadReport = useCallback(async (period = selectedPeriod, nextPagination = paginationRef.current) => {
    const periodKeyValue = period;
    if (!periodKeyValue) {
      message.warning('Chưa có kỳ dữ liệu đã xử lý để xem báo cáo');
      return;
    }

    const params = buildReportParams(periodKeyValue, filters, filterCn, filterPgd);
    const current = nextPagination?.current || 1;
    const pageSize = nextPagination?.pageSize || 25;

    setLoading(true);
    setAnalyticsLoading(true);
    try {
      const [profileResponse, summaryResponse, analyticsResponse] = await Promise.all([
        client.get('/customer-processing/profiles', {
          params: {
            ...params,
            include_total: true,
            page: current,
            page_size: pageSize,
          },
        }),
        client.get('/customer-processing/profile-summary', { params }),
        client.get('/customer-processing/profile-analytics', { params }).catch(() => ({ data: null })),
      ]);

      const profilePayload = profileResponse.data;
      const profileData = Array.isArray(profilePayload) ? profilePayload : profilePayload?.items;
      const normalizedRows = (Array.isArray(profileData) ? profileData : []).map(normalizeProcessedProfile);
      const total = Array.isArray(profilePayload) ? normalizedRows.length : Number(profilePayload?.total || 0);

      if (!normalizedRows.length && total === 0) {
        message.warning(`Kỳ ${periodKeyValue} chưa có dữ liệu khách hàng đã xử lý`);
      }

      setRows(normalizedRows);
      setPagination({ current, pageSize, total });
      setSummary(summaryResponse.data || DEFAULT_SUMMARY);
      setAnalytics(analyticsResponse.data);
    } catch (error) {
      message.error(error.response?.data?.detail || error.message);
    } finally {
      setLoading(false);
      setAnalyticsLoading(false);
    }
  }, [selectedPeriod, filters, filterCn, filterPgd]);

  const loadNoServiceCustomers = useCallback(async (nextPagination = DEFAULT_PAGINATION) => {
    if (!selectedPeriod) return { rows: [], pagination: nextPagination };
    const params = buildReportParams(selectedPeriod, { ...filters, noService: true }, filterCn, filterPgd);
    const current = nextPagination?.current || 1;
    const pageSize = nextPagination?.pageSize || 25;

    const { data } = await client.get('/customer-processing/profiles', {
      params: {
        ...params,
        no_service: true,
        include_total: true,
        page: current,
        page_size: pageSize,
      },
    });
    return {
      rows: (data?.items || []).map(normalizeProcessedProfile),
      pagination: { current, pageSize, total: Number(data?.total || 0) },
    };
  }, [selectedPeriod, filters, filterCn, filterPgd]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        const period = await loadPeriods(periodKey);
        if (!cancelled && period) {
          await loadReport(period, DEFAULT_PAGINATION);
          setReady(true);
        }
      } catch (error) {
        if (!cancelled) message.error(error.response?.data?.detail || error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!ready || !selectedPeriod) return;
    loadFilterOptions(selectedPeriod);
  }, [ready, selectedPeriod, filterCn, filterPgd, loadFilterOptions]);

  useEffect(() => {
    if (!ready || !selectedPeriod) return undefined;
    const timer = window.setTimeout(() => {
      loadReport(selectedPeriod, { ...paginationRef.current, current: 1 });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [ready, selectedPeriod, filters, filterCn, filterPgd, loadReport]);

  return {
    rows,
    reportPeriods,
    selectedPeriod,
    setSelectedPeriod,
    pagination,
    setPagination,
    summary,
    analytics,
    filterOptions,
    loading,
    analyticsLoading,
    ready,
    loadReport,
    loadPeriods,
    loadNoServiceCustomers,
  };
}
