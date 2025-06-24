import { parseStyleGuideEntries, getDynamicSceneDirectives, StyleGuideEntry } from '../../utils/style-utils';

describe('风格指导条目解析与动态指令拼接', () => {
  it('能正确解析结构化JSON风格指导', () => {
    const json = `[
      { "id": "hook", "type": "scene_end", "description": "每个场景结尾必须有强烈钩子，激发读者继续阅读", "trigger": "network_novel" },
      { "id": "爽点", "type": "scene_core", "description": "每场景需有至少一个爽点/反转/系统奖励", "trigger": "system_flow" }
    ]`;
    const entries = parseStyleGuideEntries(json);
    expect(entries.length).toBe(2);
    expect(entries[0].type).toBe('scene_end');
    expect(entries[1].type).toBe('scene_core');
    const directives = getDynamicSceneDirectives(entries);
    expect(directives).toContain('钩子');
    expect(directives).toContain('爽点');
  });

  it('能从自然语言风格指导中提取关键词条目', () => {
    const text = `1. 每个场景结尾必须有钩子或悬念，激发读者欲望\n2. 每场景需有至少一个爽点/反转/系统奖励\n3. 语言网络化、代入感强`;
    const entries = parseStyleGuideEntries(text);
    expect(entries.length).toBeGreaterThanOrEqual(2);
    const types = entries.map(e => e.type);
    expect(types).toContain('hook');
    expect(types).toContain('爽点');
    const directives = getDynamicSceneDirectives(entries);
    expect(directives).toContain('钩子');
    expect(directives).toContain('爽点');
  });

  it('无相关条目时不生成指令', () => {
    const text = '1. 语言优美，节奏明快\n2. 视角统一';
    const entries = parseStyleGuideEntries(text);
    expect(entries.length).toBe(0);
    const directives = getDynamicSceneDirectives(entries);
    expect(directives).toBe('');
  });
}); 