import { Card, Empty, Space, Table, Tag, Typography } from 'antd';
import { AimOutlined, TeamOutlined } from '@ant-design/icons';

import { money } from '../../utils/customerMetrics';
import { useReportColumns } from './reportColumns';

const { Text } = Typography;

export default function ReportCustomerTable({
  rows,
  loading,
  pagination,
  onPaginationChange,
  onDetailClick,
  pgdNameMap,
  filterOfficer,
  filterUnusedCount,
  onSortChange,
}) {
  const columns = useReportColumns(onDetailClick, pgdNameMap);

  return (
    <Card
      className="report-data-card"
      title={
        <Space>
          <Tag color="blue">Tổng: {Number(pagination.total || 0).toLocaleString('vi-VN')} KH</Tag>
          <Tag color="geekblue">Trang hiện tại: {rows.length} dòng</Tag>
        </Space>
      }
      extra={
        <Space size={12}>
          {filterUnusedCount > 0 && (
            <Tag color="orange" icon={<AimOutlined />}>
              Chưa dùng: {filterUnusedCount} dịch vụ
            </Tag>
          )}
          {filterOfficer && (
            <Tag color="purple" icon={<TeamOutlined />}>
              CB: {filterOfficer}
            </Tag>
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>
            Click tên KH để xem chi tiết
          </Text>
        </Space>
      }
    >
      <Table
        className="report-table"
        bordered
        size="small"
        rowKey="ma_kh_chuan"
        columns={columns}
        dataSource={rows}
        loading={loading}
        scroll={{ x: 'max-content', y: 560 }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200],
          showTotal: (total, range) => `${range[0]}-${range[1]} / ${money(total)} khách hàng`,
        }}
        onChange={(nextPagination, _filters, sorter) => {
          if (sorter?.field && sorter.order) {
            onSortChange?.({
              sortBy: sorter.field,
              sortOrder: sorter.order === 'ascend' ? 'asc' : 'desc',
            });
          }
          onPaginationChange({
            current: nextPagination.current,
            pageSize: nextPagination.pageSize,
            total: pagination.total,
          });
        }}
        locale={{ emptyText: <Empty description="Chưa có dữ liệu báo cáo cho kỳ này" /> }}
        rowClassName={(_, index) => (index % 2 === 0 ? 'row-even' : 'row-odd')}
      />
    </Card>
  );
}
