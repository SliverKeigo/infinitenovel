'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet';
import { db } from '@/lib/db';
import { toast } from 'sonner';
import { Textarea } from "@/components/ui/textarea";

interface DbEditorSheetProps {
  tableName: string;
  initialData: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
}

export function DbEditorSheet({
  tableName,
  initialData,
  isOpen,
  onClose,
  onSave,
}: DbEditorSheetProps) {
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleInputChange = (key: string, value: string | number) => {
    setFormData((prev: any) => ({ ...prev, [key]: value }));
  };
  
  const handleJsonChange = (key: string, value: string) => {
    try {
      const parsed = JSON.parse(value);
      setFormData((prev: any) => ({ ...prev, [key]: parsed }));
    } catch (e) {
      // Potentially show an error to the user that JSON is invalid
      console.error("Invalid JSON format");
    }
  };

  const handleSave = async () => {
    if (!tableName || !formData || !formData.id) return;
    try {
      await db.table(tableName).put(formData);
      toast.success(`在表 [${tableName}] 中成功更新记录 ID: ${formData.id}`);
      onSave();
    } catch (error: any) {
      console.error('Failed to update record:', error);
      toast.error(`更新记录失败: ${error.message || String(error)}`);
    }
  };
  
  const renderField = (key: string, value: any) => {
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      return (
        <div key={key}>
          <Label htmlFor={key} className="capitalize">{key}</Label>
          <Input id={key} value={String(value)} disabled className="mt-1" />
        </div>
      );
    }
    
    const fieldType = typeof value;
    if (fieldType === 'string' && value.length > 100) {
        return (
            <div key={key}>
                <Label htmlFor={key} className="capitalize">{key}</Label>
                <Textarea
                    id={key}
                    value={value}
                    onChange={(e) => handleInputChange(key, e.target.value)}
                    className="mt-1 h-32"
                />
            </div>
        )
    }

    if (fieldType === 'string' || fieldType === 'number') {
      return (
        <div key={key}>
          <Label htmlFor={key} className="capitalize">{key}</Label>
          <Input
            id={key}
            value={String(value)}
            type={fieldType === 'number' ? 'number' : 'text'}
            onChange={(e) => handleInputChange(key, fieldType === 'number' ? parseFloat(e.target.value) : e.target.value)}
            className="mt-1"
          />
        </div>
      );
    }
    
    if (fieldType === 'object' || Array.isArray(value)) {
       return (
         <div key={key}>
           <Label htmlFor={key} className="capitalize">{key} (JSON)</Label>
           <Textarea
             id={key}
             value={JSON.stringify(value, null, 2)}
             onChange={(e) => handleJsonChange(key, e.target.value)}
             className="mt-1 h-32 font-mono"
           />
         </div>
       );
    }

    // Fallback for other types like boolean
    return (
        <div key={key}>
          <Label htmlFor={key} className="capitalize">{key}</Label>
          <Input id={key} value={String(value)} onChange={(e) => handleInputChange(key, e.target.value)} className="mt-1" />
        </div>
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>编辑记录</SheetTitle>
          <SheetDescription>
            正在编辑表 <span className="font-semibold text-primary">{tableName}</span> 中的记录。
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-4 py-4 max-h-[80vh] overflow-y-auto pr-4">
          {Object.entries(formData).map(([key, value]) => renderField(key, value))}
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline">取消</Button>
          </SheetClose>
          <SheetClose asChild>
            <Button type="submit" onClick={handleSave}>保存更改</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
} 