'use client';

import { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { DbEditorSheet } from '@/components/dev/db-editor-sheet';
import { toast } from 'sonner';
import { Trash2, FilePenLine, Database, ChevronRight } from 'lucide-react';
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNovelStore } from '@/store/use-novel-store';
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ITEMS_PER_PAGE = 20;

export default function DbViewerPage() {
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [fullTableData, setFullTableData] = useState<any[]>([]);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [rowToDelete, setRowToDelete] = useState<any | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<any>>(new Set());
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [filterOperator, setFilterOperator] = useState('contains');
  const [filterValue, setFilterValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  
  const deleteNovel = useNovelStore((state) => state.deleteNovel);

  useEffect(() => {
    const tableNames = db.tables.map((table) => table.name);
    setTables(tableNames);
  }, []);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const filteredData = useMemo(() => {
    if (!filterColumn || !filterValue) {
      return fullTableData;
    }
    return fullTableData.filter((row) => {
      const cellValue = row[filterColumn];
      const lowerCaseFilterValue = filterValue.toLowerCase();

      if (cellValue === null || typeof cellValue === 'undefined') {
        return false;
      }

      const stringCellValue = String(cellValue).toLowerCase();

      switch (filterOperator) {
        case 'contains':
          return stringCellValue.includes(lowerCaseFilterValue);
        case 'not_contains':
          return !stringCellValue.includes(lowerCaseFilterValue);
        case 'equals':
          if (!isNaN(Number(filterValue)) && !isNaN(Number(cellValue))) {
            return Number(cellValue) === Number(filterValue);
          }
          return stringCellValue === lowerCaseFilterValue;
        case 'not_equals':
          if (!isNaN(Number(filterValue)) && !isNaN(Number(cellValue))) {
            return Number(cellValue) !== Number(filterValue);
          }
          return stringCellValue !== lowerCaseFilterValue;
        case 'gt':
          if (!isNaN(Number(filterValue)) && !isNaN(Number(cellValue))) {
            return Number(cellValue) > Number(filterValue);
          }
          return false;
        case 'lt':
          if (!isNaN(Number(filterValue)) && !isNaN(Number(cellValue))) {
            return Number(cellValue) < Number(filterValue);
          }
          return false;
        default:
          return true;
      }
    });
  }, [fullTableData, filterColumn, filterOperator, filterValue]);

  const totalPages = useMemo(() => {
    return Math.ceil(filteredData.length / ITEMS_PER_PAGE);
  }, [filteredData]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  const resetFilters = () => {
    setFilterColumn(null);
    setFilterOperator('contains');
    setFilterValue('');
    setCurrentPage(1);
  };

  const loadTableData = async (tableName: string) => {
    setSelectedTable(tableName);
    resetFilters();
    setSelectedRowIds(new Set());
    try {
      const data = await db.table(tableName).toArray();
      setFullTableData(data);
      if (data.length > 0) {
        setColumns(Object.keys(data[0]));
      } else {
        setColumns([]);
      }
    } catch (error) {
      console.error(`Failed to load data for table ${tableName}:`, error);
      toast.error(`加载表 [${tableName}] 数据失败`);
    } finally {
      setRowToDelete(null);
    }
  };

  const handleEdit = (row: any) => {
    setEditingRow(row);
    setIsSheetOpen(true);
  };

  const handleDeleteConfirmation = (row: any) => {
    setRowToDelete(row);
  };

  const handleDelete = async () => {
    if (!rowToDelete || !selectedTable) return;
    try {
      if (selectedTable === 'novels') {
        await deleteNovel(rowToDelete.id);
        toast.success(`小说及其所有关联数据已成功删除 (ID: ${rowToDelete.id})`);
      } else {
        await db.table(selectedTable).delete(rowToDelete.id);
        toast.success(`在表 [${selectedTable}] 中成功删除记录 ID: ${rowToDelete.id}`);
      }
      setSelectedRowIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(rowToDelete.id);
        return newSet;
      });
      loadTableData(selectedTable); // Refresh data
    } catch (error) {
      console.error('Failed to delete record:', error);
      toast.error(`删除记录失败: ${error}`);
    } finally {
      setRowToDelete(null);
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedTable || selectedRowIds.size === 0) return;
    try {
      const idsToDelete = Array.from(selectedRowIds);
      if (selectedTable === 'novels') {
        for (const id of idsToDelete) {
          await deleteNovel(id);
        }
        toast.success(`在表 [${selectedTable}] 中成功批量删除 ${idsToDelete.length} 本小说及其所有关联数据。`);
      } else {
        await db.table(selectedTable).bulkDelete(idsToDelete);
        toast.success(`在表 [${selectedTable}] 中成功批量删除 ${idsToDelete.length} 条记录。`);
      }
      setSelectedRowIds(new Set());
      loadTableData(selectedTable);
    } catch (error) {
      console.error('Failed to bulk delete records:', error);
      toast.error(`批量删除记录失败: ${error}`);
    } finally {
      setIsBulkDeleteConfirmOpen(false);
    }
  };

  const handleSave = () => {
    setIsSheetOpen(false);
    setEditingRow(null);
    if(selectedTable) {
      loadTableData(selectedTable);
    }
  };

  const handleRowSelect = (id: any) => {
    setSelectedRowIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    if (selectedRowIds.size === filteredData.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredData.map(row => row.id)));
    }
  };

  const handlePageJump = () => {
    const pageNum = parseInt(pageInput, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
    } else {
      toast.error(`请输入一个介于 1 和 ${totalPages} 之间的有效页码`);
      setPageInput(String(currentPage)); // Reset to current page
    }
  };

  const renderCell = (item: any, column: string) => {
    const value = item[column];
    if (typeof value === 'object' && value !== null) {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    return String(value);
  }

  return (
    <div className="container mx-auto p-4 grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
      <div className="md:col-span-1">
        <h2 className="text-xl font-semibold mb-4 flex items-center"><Database className="mr-2 h-5 w-5"/> 数据库表</h2>
        <Card className="p-2">
          <ul className="space-y-1">
            {tables.map((table) => (
              <li key={table}>
                <Button
                  variant={selectedTable === table ? 'secondary' : 'ghost'}
                  className="w-full justify-between"
                  onClick={() => loadTableData(table)}
                >
                  <span className="capitalize">{table}</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="md:col-span-3">
        {selectedTable ? (
          <div>
            <div className="flex justify-between items-center mb-4">
               <h2 className="text-2xl font-bold capitalize">
                  <span className="text-primary">{selectedTable}</span>
                  <span className="text-muted-foreground text-lg ml-2 font-normal">({filteredData.length} / {fullTableData.length})</span>
               </h2>
              {selectedRowIds.size > 0 && (
                <Button variant="destructive" onClick={() => setIsBulkDeleteConfirmOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  批量删除 ({selectedRowIds.size})
                </Button>
              )}
            </div>
             <div className="flex items-center space-x-2 mb-4">
                <Select
                    value={filterColumn || ''}
                    onValueChange={(value) => setFilterColumn(value === 'null' ? null : value)}
                    disabled={columns.length === 0}
                >
                    <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="选择字段" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="null">-- 选择字段 --</SelectItem>
                        {columns.map(col => <SelectItem key={col} value={col}>{col}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select value={filterOperator} onValueChange={setFilterOperator} disabled={!filterColumn}>
                    <SelectTrigger className="w-[150px]">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="contains">包含</SelectItem>
                        <SelectItem value="not_contains">不包含</SelectItem>
                        <SelectItem value="equals">等于 (=)</SelectItem>
                        <SelectItem value="not_equals">不等于 (!=)</SelectItem>
                        <SelectItem value="gt">大于 (&gt;)</SelectItem>
                        <SelectItem value="lt">小于 (&lt;)</SelectItem>
                    </SelectContent>
                </Select>
                <Input
                    placeholder="输入筛选值..."
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    className="w-full"
                    disabled={!filterColumn}
                />
                <Button onClick={resetFilters} variant="outline">清除</Button>
            </div>
            <Card>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={filteredData.length > 0 && selectedRowIds.size === filteredData.length}
                          onCheckedChange={handleSelectAll}
                          disabled={filteredData.length === 0}
                        />
                      </TableHead>
                      {columns.map((col) => (
                        <TableHead key={col} className="capitalize">{col}</TableHead>
                      ))}
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedData.map((item) => (
                      <TableRow key={item.id} data-state={selectedRowIds.has(item.id) && "selected"}>
                        <TableCell>
                          <Checkbox
                            checked={selectedRowIds.has(item.id)}
                            onCheckedChange={() => handleRowSelect(item.id)}
                          />
                        </TableCell>
                        {columns.map((col) => (
                          <TableCell key={col} className="max-w-xs truncate">
                            {renderCell(item, col)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(item)}>
                            <FilePenLine className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteConfirmation(item)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
            {fullTableData.length > 0 && paginatedData.length === 0 && (
                <p className="text-muted-foreground text-center mt-8">没有匹配筛选条件的数据。</p>
            )}
            {fullTableData.length === 0 && <p className="text-muted-foreground text-center mt-8">该表没有数据。</p>}

             <div className="flex items-center justify-end space-x-2 py-4">
                <span className="text-sm text-muted-foreground">
                    第 {currentPage} / {totalPages > 0 ? totalPages : 1} 页
                </span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                >
                    上一页
                </Button>
                 <div className="flex items-center space-x-1">
                    <Input
                        type="number"
                        value={pageInput}
                        onChange={(e) => setPageInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handlePageJump();
                            }
                        }}
                        className="w-16 h-9 text-center"
                        disabled={totalPages <= 1}
                    />
                    <Button size="sm" onClick={handlePageJump} disabled={totalPages <= 1}>跳转</Button>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                >
                    下一页
                </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-20">
            <Database className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">请从左侧选择一个表</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              选择后，该表的数据将在此处显示。
            </p>
          </div>
        )}
      </div>

      {editingRow && selectedTable && (
        <DbEditorSheet
          tableName={selectedTable}
          initialData={editingRow}
          isOpen={isSheetOpen}
          onClose={() => setIsSheetOpen(false)}
          onSave={handleSave}
        />
      )}

      <AlertDialog open={!!rowToDelete} onOpenChange={(open) => !open && setRowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要删除吗?</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。这将从数据库中永久删除记录 ID: <span className="font-semibold text-destructive">{rowToDelete?.id}</span>。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRowToDelete(null)}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>继续删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isBulkDeleteConfirmOpen} onOpenChange={setIsBulkDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确定要批量删除吗?</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。这将从数据库中永久删除 <span className="font-semibold text-destructive">{selectedRowIds.size}</span> 条记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete}>继续删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 