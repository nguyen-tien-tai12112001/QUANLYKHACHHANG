import { useCallback, useState } from 'react';

import { INITIAL_REPORT_FILTERS } from '../utils/reportParams';

export function useReportFilters() {
  const [filters, setFilters] = useState(INITIAL_REPORT_FILTERS);
  const [searchText, setSearchText] = useState('');

  const updateFilter = useCallback((key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(INITIAL_REPORT_FILTERS);
    setSearchText('');
  }, []);

  const mergedFilters = { ...filters, searchText };

  return {
    filters: mergedFilters,
    searchText,
    setSearchText,
    updateFilter,
    resetFilters,
    setFilters,
  };
}
