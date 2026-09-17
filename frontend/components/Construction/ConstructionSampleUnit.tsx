import React, { useMemo } from 'react';
import { DataRow, ColumnDefinition } from '../../types';

interface ConstructionSampleUnitProps {
  productionData: DataRow[];
  productionColumns: ColumnDefinition[];
  orderData: DataRow[];
  orderColumns: ColumnDefinition[];
  inventoryData: DataRow[];
  inventoryColumns: ColumnDefinition[];
  tkbvData: DataRow[];
  tkbvColumns: ColumnDefinition[];
  pthspData: DataRow[];
  pthspColumns: ColumnDefinition[];
  exportData: DataRow[];
  exportColumns: ColumnDefinition[];
  stockData: DataRow[];
  stockColumns: ColumnDefinition[];
  isGlobalLoading: boolean;
  // các field khác từ MainLayoutContext nếu cần dùng thêm
  [key: string]: any;
}

const ConstructionSampleUnit: React.FC<ConstructionSampleUnitProps> = (props) => {
  const { productionData, isGlobalLoading } = props;

  // TODO: thay điều kiện lọc "Căn mẫu" đúng theo cột thực tế
  // Ví dụ: lọc theo cột phân loại có giá trị 'Căn mẫu'
  const sampleUnitData = useMemo(() => {
    return productionData.filter((row) =>
      String(row['PHÂN LOẠI'] || row['LOẠI CĂN'] || '').toLowerCase().includes('mẫu')
    );
  }, [productionData]);

  if (isGlobalLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-wood-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <h2 className="text-xl font-bold text-slate-800 mb-4">Căn mẫu</h2>
      <p className="text-slate-500 mb-4">
        Hiện có {sampleUnitData.length} bản ghi được xác định là căn mẫu.
      </p>

      {/* Thay bằng DataGrid nếu muốn hiển thị dạng bảng, ví dụ: */}
      {/* <DataGrid data={sampleUnitData} columns={props.productionColumns} ... /> */}

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100">
            <tr>
              {props.productionColumns?.slice(0, 6).map((col: ColumnDefinition) => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold text-slate-600">
                  {col.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sampleUnitData.map((row, idx) => (
              <tr key={idx} className="border-t border-slate-100">
                {props.productionColumns?.slice(0, 6).map((col: ColumnDefinition) => (
                  <td key={col.key} className="px-3 py-2 text-slate-700">
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ConstructionSampleUnit;