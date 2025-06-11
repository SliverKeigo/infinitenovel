"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { defaultSettings, useGenerationSettingsStore } from "@/store/generation-settings";
import { GenerationSettings, PRESET_NAMES, PresetName } from "@/types/generation-settings";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

const presetDisplayNames: Record<PresetName, string> = {
    'Balanced Mode': '平衡模式',
    'Creativity First': '创意优先',
    'Logic First': '逻辑优先',
    'Long-form Novel': '长篇小说',
    'Short Story': '短篇小说',
};

const presets: Record<PresetName, Omit<GenerationSettings, 'id'>> = {
    'Balanced Mode': {
        chapterWordCount: 3000,
        temperature: 0.7,
        maxTokens: 16384,
        maxCharacterCount: 5,
        characterCreativity: 0.6,
        contextChapters: 3,
    },
    'Creativity First': {
        chapterWordCount: 3000,
        temperature: 0.95,
        maxTokens: 16384,
        maxCharacterCount: 7,
        characterCreativity: 0.9,
        contextChapters: 2,
    },
    'Logic First': {
        chapterWordCount: 3000,
        temperature: 0.4,
        maxTokens: 16384,
        maxCharacterCount: 4,
        characterCreativity: 0.4,
        contextChapters: 5,
    },
    'Long-form Novel': {
        chapterWordCount: 4000,
        temperature: 0.65,
        maxTokens: 16384,
        maxCharacterCount: 10,
        characterCreativity: 0.5,
        contextChapters: 6,
    },
    'Short Story': {
        chapterWordCount: 2000,
        temperature: 0.8,
        maxTokens: 16384,
        maxCharacterCount: 3,
        characterCreativity: 0.7,
        contextChapters: 1,
    },
};

export function GenerationSettingsManager() {
    const { getSettings, updateSettings } = useGenerationSettingsStore();
    const dbSettings = useLiveQuery(() => getSettings(), [], defaultSettings);

    const [localSettings, setLocalSettings] = useState(dbSettings);

    useEffect(() => {
        setLocalSettings(dbSettings);
    }, [dbSettings]);

    const isDirty = useMemo(() => {
        if (!localSettings || !dbSettings) return false;
        return JSON.stringify(localSettings) !== JSON.stringify(dbSettings);
    }, [localSettings, dbSettings]);

    if (!localSettings || !dbSettings) {
        return <div>Loading settings...</div>;
    }

    const handlePresetChange = (presetName: PresetName) => {
        const preset = presets[presetName];
        if (preset) {
            setLocalSettings({ ...localSettings, ...preset });
        }
    };

    const handleNumericChange = (key: keyof GenerationSettings, value: string) => {
        const numValue = Number(value);
        if (!isNaN(numValue)) {
            setLocalSettings({ ...localSettings, [key]: numValue });
        }
    };

    const handleSliderChange = (key: keyof GenerationSettings, value: number[]) => {
        setLocalSettings({ ...localSettings, [key]: value[0] });
    };

    const handleSave = () => {
        updateSettings(localSettings);
    };

    const handleReset = () => {
        setLocalSettings(dbSettings);
    };


    return (
        <div className="space-y-8">
            <div>
                <Label htmlFor="preset-select">预设配置</Label>
                <Select onValueChange={handlePresetChange}>
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
                    <CardTitle>情节生成设置</CardTitle>
                    <CardDescription>控制故事叙述的参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-2">
                        <Label>章节字数</Label>
                        <Input type="number" value={localSettings.chapterWordCount} onChange={e => handleNumericChange('chapterWordCount', e.target.value)} className="w-40" />
                        <p className="text-sm text-muted-foreground">每章节的目标字数。</p>
                    </div>
                    <div className="grid gap-2">
                        <Label>创意度 (Temperature): {localSettings.temperature}</Label>
                        <Slider value={[localSettings.temperature]} onValueChange={value => handleSliderChange('temperature', value)} min={0.1} max={1.5} step={0.05} />
                        <p className="text-sm text-muted-foreground">数值越高，情节越有创意但可能不够稳定。</p>
                    </div>
                    <div className="grid gap-2">
                        <Label>最大Token数</Label>
                        <Input type="number" value={localSettings.maxTokens} onChange={e => handleNumericChange('maxTokens', e.target.value)} className="w-40" />
                        <p className="text-sm text-muted-foreground">影响生成内容的详细程度。</p>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>人物设置</CardTitle>
                    <CardDescription>控制小说中角色的参数。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid gap-2">
                        <Label>最大人物数量</Label>
                        <Input type="number" value={localSettings.maxCharacterCount} onChange={e => handleNumericChange('maxCharacterCount', e.target.value)} className="w-40" />
                        <p className="text-sm text-muted-foreground">小说中主要人物的数量。</p>
                    </div>
                    <div className="grid gap-2">
                        <Label>人物创意度: {localSettings.characterCreativity}</Label>
                        <Slider value={[localSettings.characterCreativity]} onValueChange={value => handleSliderChange('characterCreativity', value)} min={0.1} max={1.0} step={0.05} />
                        <p className="text-sm text-muted-foreground">影响人物性格的创新程度。</p>
                    </div>
                    <div className="grid gap-2">
                        <Label>上下文章节数</Label>
                        <Input type="number" value={localSettings.contextChapters} onChange={e => handleNumericChange('contextChapters', e.target.value)} className="w-40" />
                        <p className="text-sm text-muted-foreground">生成时参考的前文章节数量。</p>
                    </div>
                </CardContent>
            </Card>

            {isDirty && (
                <Card>
                    <CardHeader>
                        <CardTitle>保存更改</CardTitle>
                        <CardDescription>
                            您有未保存的更改。点击“保存”以应用，或“重置”以撤销。
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