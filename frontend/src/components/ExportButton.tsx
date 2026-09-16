import ExcelJS from 'exceljs';

interface ExportButtonProps {
  data: any[];
  fileName: string;
  sums?: { [key: string]: number };
  baseColumns?: string[];
}

export function ExportButton({ data, fileName, sums, baseColumns }: ExportButtonProps) {
  const handleExport = async () => {
    if (data.length === 0) {
      alert('No data to export');
      return;
    }

    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Report');

      // Get ALL column headers from all rows (in case some columns are null in first row)
      const headerSet = new Set<string>();
      data.forEach((row) => {
        Object.keys(row).forEach((key) => headerSet.add(key));
      });
      const headers = Array.from(headerSet);

      // Add header row
      const headerRow = worksheet.addRow(headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' },
      };
      headerRow.alignment = { horizontal: 'center', vertical: 'center' };

      // Add summary rows if provided
      if (sums && baseColumns) {
        // Install Booked row
        const installBookedValues = headers.map((header, idx) => {
          if (idx === 0) return 'Install Booked';
          if (baseColumns.includes(header)) return '';
          return sums[header] !== undefined ? sums[header] : 0;
        });
        const installBookedRow = worksheet.addRow(installBookedValues);
        installBookedRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFBFDBFE' },
        };
        installBookedRow.font = { bold: true };

        // Total Required row
        const totalRequiredValues = headers.map((header, idx) => {
          if (idx === 0) return 'Total Required';
          if (baseColumns.includes(header)) return '';
          return sums[header] !== undefined ? sums[header] : 0;
        });
        const totalRequiredRow = worksheet.addRow(totalRequiredValues);
        totalRequiredRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFEF08A' },
        };
        totalRequiredRow.font = { bold: true };

        // Kanban row
        const kanbanValues = headers.map((header, idx) => {
          if (idx === 0) return 'Kanban Minimum Stock Level';
          if (baseColumns.includes(header)) return '';
          return 0;
        });
        const kanbanRow = worksheet.addRow(kanbanValues);
        kanbanRow.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF3F4F6' },
        };
        kanbanRow.font = { bold: true };
      }

      // Add data rows
      data.forEach((row) => {
        const values = headers.map((header) => row[header] ?? '');
        worksheet.addRow(values);
      });

      // Auto-size columns
      headers.forEach((_, index) => {
        const column = worksheet.getColumn(index + 1);
        let maxLength = headers[index].length;

        data.forEach((row) => {
          const cellValue = String(row[headers[index]] ?? '');
          maxLength = Math.max(maxLength, cellValue.length);
        });

        column.width = Math.min(maxLength + 2, 50);
      });

      // Freeze first row
      worksheet.views = [
        {
          state: 'frozen',
          ySplit: 1,
        },
      ];

      // Generate file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data');
    }
  };

  return (
    <button
      onClick={handleExport}
      className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 font-medium"
    >
      📥 Export
    </button>
  );
}
