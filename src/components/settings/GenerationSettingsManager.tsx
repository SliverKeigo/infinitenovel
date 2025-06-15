"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useGenerationSettingsStore } from "@/store/generation-settings";
import { GenerationSettings, PRESET_NAMES, PresetName } from "@/types/generation-settings";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const presetDisplayNames: Record<PresetName, string> = {
    'Default': '默认模式',
    'Creativity First': '创意优先',
    'Logic First': '逻辑优先',
    'Long-form Novel': '长篇小说',
    'Short Story': '短篇小说',
};


export function GenerationSettingsManager() {
    const { getSettings, updateSettings, applyPreset } = useGenerationSettingsStore();
    // Initialize with a call to getSettings to ensure we have the latest from DB
    const dbSettings = useLiveQuery(getSettings, []);

    const [localSettings, setLocalSettings] = useState<GenerationSettings | undefined>(dbSettings);

    useEffect(() => {
        setLocalSettings(dbSettings);
    }, [dbSettings]);

    const isDirty = useMemo(() => {
        if (!localSettings || !dbSettings) return false;
        // Ensure IDs are not compared if one is missing
        const dbComparable = { ...dbSettings };
        if ('id' in dbComparable) delete (dbComparable as any).id;
        const localComparable = { ...localSettings };
        if ('id' in localComparable) delete (localComparable as any).id;

        return JSON.stringify(localComparable) !== JSON.stringify(dbComparable);
    }, [localSettings, dbSettings]);

    if (!localSettings || !dbSettings) {
        return <div>正在加载设置...</div>;
    }

    const handlePresetChange = (presetName: PresetName) => {
       applyPreset(presetName);
       // The useLiveQuery will update dbSettings, and the useEffect will update localSettings
    };

    const handleNumericChange = (key: keyof GenerationSettings, value: string) => {
        const numValue = Number(value);
        if (!isNaN(numValue) && localSettings) {
            setLocalSettings({ ...localSettings, [key]: numValue });
        }
    };

    const handleSliderChange = (key: keyof GenerationSettings, value: number[]) => {
        if (localSettings) {
            setLocalSettings({ ...localSettings, [key]: value[0] });
        }
    };

    const handleSave = async () => {
        if (localSettings) {
            try {
                const { id, ...settingsToSave } = localSettings;
                await updateSettings(settingsToSave);
                toast.success("设置已成功保存！");
            } catch (error) {
                toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
    };

    const handleReset = () => {
        setLocalSettings(dbSettings);
    };

    return (
        <div className="space-y-8">
            <div>
                <Label htmlFor="preset-select">预设配置</Label>
                <Select onValueChange={(value) => handlePresetChange(value as PresetName)}>
                    <SelectTrigger id="preset-select" className="w-[280px]">
                        <SelectValue placeholder="选择一个预设..." />
                    </SelectTrigger>
                    <SelectContent>
                        {PRESET_NAMES.map(name => (
                            <SelectItem key={name} value={name}>{presetDisplayNames[name]}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground mt-2">
                    选择适合您创作风格的预设配置，快速开始创作。
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>核心生成设置</CardTitle>
                    <CardDescription>控制AI模型行为和输出结构的核心参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="grid gap-2">
                        <Label>最大Token数: {localSettings.max_tokens}</Label>
                        <Slider value={[localSettings.max_tokens]} onValueChange={value => handleSliderChange('max_tokens', value)} min={512} max={16384} step={256} />
                        <p className="text-sm text-muted-foreground">单次API调用允许生成的最大内容长度。注意：过高可能导致API错误。</p>
                    </div>
                    <div className="grid gap-2">
                        <Label>每章生成片段数: {localSettings.segments_per_chapter}</Label>
                        <Slider value={[localSettings.segments_per_chapter]} onValueChange={value => handleSliderChange('segments_per_chapter', value)} min={1} max={10} step={1} />
                        <p className="text-sm text-muted-foreground">将一章分为多个片段生成，总字数 ≈ (片段数 × Token数)。</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>创意与风格控制</CardTitle>
                    <CardDescription>调整这些参数以改变AI的写作风格和创造力。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                    <div className="grid gap-2">
                        <Label>创意度 (Temperature): {localSettings.temperature}</Label>
                        <Slider value={[localSettings.temperature]} onValueChange={value => handleSliderChange('temperature', value)} min={0.1} max={1.5} step={0.05} />
                        <p className="text-sm text-muted-foreground">越高结果越随机、越有创意；越低结果越稳定、越可预测。</p>
                    </div>
                     <div className="grid gap-2">
                        <Label>核心采样 (Top P): {localSettings.top_p}</Label>
                        <Slider value={[localSettings.top_p]} onValueChange={value => handleSliderChange('top_p', value)} min={0.1} max={1.0} step={0.05} />
                        <p className="text-sm text-muted-foreground">与创意度类似，但通过控制词汇选择范围来调整随机性，建议不要同时调高。</p>
                    </div>
                     <div className="grid gap-2">
                        <Label>人物创意度: {localSettings.character_creativity}</Label>
                        <Slider value={[localSettings.character_creativity]} onValueChange={value => handleSliderChange('character_creativity', value)} min={0.1} max={1.0} step={0.05} />
                        <p className="text-sm text-muted-foreground">影响人物设定（如性格、背景）的创新和丰富程度。</p>
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle>重复性惩罚</CardTitle>
                    <CardDescription>避免AI生成重复、单调的内容。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-8">
                     <div className="grid gap-2">
                        <Label>频率惩罚 (Frequency Penalty): {localSettings.frequency_penalty}</Label>
                        <Slider value={[localSettings.frequency_penalty]} onValueChange={value => handleSliderChange('frequency_penalty', value)} min={-2.0} max={2.0} step={0.1} />
                        <p className="text-sm text-muted-foreground">正值会根据词汇在文本中出现的频率来惩罚新词，降低重复同样词语的可能性。</p>
                    </div>
                     <div className="grid gap-2">
                        <Label>存在惩罚 (Presence Penalty): {localSettings.presence_penalty}</Label>
                        <Slider value={[localSettings.presence_penalty]} onValueChange={value => handleSliderChange('presence_penalty', value)} min={-2.0} max={2.0} step={0.1} />
                        <p className="text-sm text-muted-foreground">正值会惩罚文本中已出现的任何词汇，鼓励谈论新话题。</p>
                    </div>
                </CardContent>
            </Card>

            {isDirty && (
                <Card>
                    <CardHeader>
                        <CardTitle>保存更改</CardTitle>
                        <CardDescription>
                            您有未保存的更改。点击"保存"以应用，或"重置"以撤销。
                        </CardDescription>
                    </CardHeader>
                    <CardFooter className="flex justify-end gap-2">
                        <Button variant="outline" onClick={handleReset}>重置</Button>
                        <Button onClick={handleSave}>保存</Button>
                    </CardFooter>
                </Card>
            )}
        </div>
    )
} 