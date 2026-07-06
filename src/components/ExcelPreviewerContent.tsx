import React, { useState } from "react";

interface ExcelPreviewerContentProps {
  fileData: {
    name: string;
    sheets: {
      name: string;
      rows: any[][];
    }[];
  };
}

export function ExcelPreviewerContent({ fileData }: ExcelPreviewerContentProps) {
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);
  const activeSheet = fileData.sheets[selectedSheetIndex] || fileData.sheets[0];

  if (!activeSheet) {
    return (
      <div className="flex-grow flex items-center justify-center bg-[#0d1117] border border-[#30363d] rounded-lg min-h-[300px]">
        <p className="text-sm text-zinc-400">Empty Workbook</p>
      </div>
    );
  }

  // Calculate maximum columns in active sheet
  const maxCols = Math.max(10, ...activeSheet.rows.map(r => r.length));

  const getColumnLabel = (index: number) => {
    let label = "";
    let temp = index;
    while (temp >= 0) {
      label = String.fromCharCode((temp % 26) + 65) + label;
      temp = Math.floor(temp / 26) - 1;
    }
    return label;
  };

  return (
    <div className="flex-grow flex flex-col bg-[#0d1117] border border-[#30363d] rounded-lg overflow-hidden h-[70vh]" onClick={(e) => e.stopPropagation()}>
      {/* Sheets Tabs Header */}
      {fileData.sheets.length > 1 && (
        <div className="flex items-center gap-1 bg-[#161b22] border-b border-[#30363d] p-1.5 overflow-x-auto shrink-0 select-none">
          {fileData.sheets.map((sheet, index) => (
            <button
              key={`excel-sheet-tab-${sheet.name || index}-${index}`}
              onClick={() => setSelectedSheetIndex(index)}
              className={`px-3 py-1 text-xs font-semibold rounded transition-all whitespace-nowrap cursor-pointer ${
                selectedSheetIndex === index
                  ? "bg-emerald-600 text-white font-semibold"
                  : "bg-transparent text-zinc-400 hover:text-white hover:bg-[#21262d]"
              }`}
            >
              {sheet.name || `Sheet ${index + 1}`}
            </button>
          ))}
        </div>
      )}

      {/* Spreadsheet Table Grid Container */}
      <div className="flex-grow overflow-auto relative">
        <table className="border-collapse table-fixed select-text text-left text-xs text-zinc-300 w-full">
          <thead className="sticky top-0 z-10 text-[10px] uppercase font-bold text-zinc-400 bg-[#161b22] select-none border-b border-[#30363d] shadow-sm">
            <tr>
              {/* Corner Empty cell */}
              <th className="w-12 border-r border-[#30363d] bg-[#161b22] text-center sticky left-0 z-20 py-1.5 font-mono text-zinc-400">Row</th>
              {Array.from({ length: maxCols }).map((_, colIdx) => (
                <th key={`excel-header-col-${colIdx}`} className="px-3 py-1.5 border-r border-[#30363d] font-mono text-center min-w-[120px] max-w-[200px] bg-[#161b22] text-zinc-400">
                  {getColumnLabel(colIdx)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeSheet.rows.map((row, rowIdx) => (
              <tr 
                key={`excel-row-${rowIdx}`} 
                className={`border-b border-[#30363d]/45 hover:bg-zinc-800/40 transition-all ${
                  rowIdx % 2 === 0 ? "bg-[#0d1117]" : "bg-[#161b22]/40"
                }`}
              >
                {/* Row Number Sidebar */}
                <td className="sticky left-0 bg-[#161b22] font-mono text-center text-[10px] text-zinc-500 border-r border-[#30363d] select-none py-1 sticky-col z-10 font-bold">
                  {rowIdx + 1}
                </td>
                
                {/* Columns rendering with correct sizing */}
                {Array.from({ length: maxCols }).map((_, colIdx) => {
                  const val = row[colIdx];
                  let displayVal = "";
                  if (val !== undefined && val !== null) {
                    if (typeof val === "object") {
                      displayVal = JSON.stringify(val);
                    } else {
                      displayVal = String(val);
                    }
                  }
                  
                  return (
                    <td 
                      key={`excel-cell-${rowIdx}-${colIdx}`} 
                      className="px-3 py-1 border-r border-[#30363d]/30 max-w-[200px] truncate font-mono text-[11px] text-zinc-300 antialiased"
                      title={displayVal}
                    >
                      {displayVal}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export default ExcelPreviewerContent;
