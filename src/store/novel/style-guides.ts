/**
 * 小说风格指南相关的工具函数
 */

/**
 * 根据小说类型生成相应的风格指导
 * @param genre - 小说类型
 * @param style - 写作风格（可选）
 * @returns 针对该类型的风格指导字符串
 */
export const getGenreStyleGuide = (genre: string, style?: string): string => {
  // 将类型和风格转换为小写以便匹配
  const genreLower = genre.toLowerCase();
  const styleLower = style?.toLowerCase() || '';

  // 创建一个风格指导数组，用于收集所有匹配的风格指导
  const styleGuides: string[] = [];

  // 轻小说/幽默/搞笑类
  if (genreLower.includes('轻小说') || genreLower.includes('幽默') ||
    genreLower.includes('搞笑') || genreLower.includes('喜剧') ||
    styleLower.includes('轻松') || styleLower.includes('幽默')) {
    styleGuides.push(`
【轻小说/幽默风格指南】
1. 每个场景都应该包含至少一个幽默元素、梗或出人意料的转折
2. 角色对话要机智、诙谐，可以适度夸张
3. 可以巧妙地打破第四面墙或引用流行文化
4. 角色之间的互动要有趣，可以设计"笑果"
5. 不要害怕使用夸张的表现手法和戏剧性的对比
6. 可以加入轻松的吐槽、自嘲或调侃元素
7. 角色可以有些"萌点"或特定的口头禅
`);
  }

  // 悬疑/推理类
  if (genreLower.includes('悬疑') || genreLower.includes('推理') ||
    genreLower.includes('侦探') || genreLower.includes('谜题') ||
    styleLower.includes('悬疑') || styleLower.includes('推理')) {
    styleGuides.push(`
【悬疑/推理风格指南】
1. 线索铺设要合理且有逻辑性，避免"天降神迹"式的解决方案
2. 保持适当的悬念和紧张感，但不要过度拖延关键信息
3. 角色的行动和动机要符合逻辑，即使是误导读者的线索也要有合理性
4. 适当使用有限视角或不可靠叙述者技巧
5. 构建谜题时要"公平"，读者应该有机会在故事中找到解谜的关键
6. 解谜过程要有层次感，可以设置多重谜题
7. 人物心理描写要细腻，尤其是面对压力和危机时的反应
`);
  }

  // 玄幻/仙侠/奇幻类
  if (genreLower.includes('玄幻') || genreLower.includes('仙侠') ||
    genreLower.includes('奇幻') || genreLower.includes('修仙') ||
    genreLower.includes('异世界') || genreLower.includes('魔法')) {
    styleGuides.push(`
【玄幻/仙侠/奇幻风格指南】
1. 世界观设定要有内在一致性，魔法/功法系统要有规则和限制
2. 战斗/修炼场景要有张力和视觉冲击力，可以适度夸张但不失逻辑
3. 角色成长要有阶段性和挑战性，避免毫无理由的突然强大
4. 神通/法术的使用要有创意，不只是简单的力量对抗
5. 可以融入东方/西方神话元素，但要有新的诠释
6. 描绘异世界时注重感官细节，让读者能够身临其境
7. 设置合理的权力结构和社会体系，增强世界的真实感
`);
  }

  // 都市/职场类
  if (genreLower.includes('都市') || genreLower.includes('职场') ||
    genreLower.includes('商战') || genreLower.includes('现代') ||
    styleLower.includes('现实') || styleLower.includes('职场')) {
    styleGuides.push(`
【都市/职场风格指南】
1. 人际关系和职场政治要真实，避免过于简单化的敌友关系
2. 冲突要基于现实中可能发生的情况，即使有夸张也要有现实基础
3. 角色的职业技能和专业知识要有可信度
4. 可以融入当代社会热点和现象，增强时代感
5. 描写生活细节时要精准，展现都市生活的多样性
6. 角色面临的挑战应该平衡个人能力和外部环境因素
7. 成功不应该来得过于容易，要展现努力、智慧和机遇的结合
`);
  }

  // 科幻类
  if (genreLower.includes('科幻') || genreLower.includes('未来') ||
    genreLower.includes('太空') || genreLower.includes('科技') ||
    styleLower.includes('科幻') || styleLower.includes('未来主义')) {
    styleGuides.push(`
【科幻风格指南】
1. 科技设定要有一定的科学基础或合理的外推，避免"黑科技"无限万能
2. 未来社会的描绘要考虑技术对人类行为、社会结构的影响
3. 可以探讨科技伦理、人性、存在主义等深层次主题
4. 世界构建要注重细节，包括科技如何改变日常生活的方方面面
5. 科幻元素应该服务于故事和角色，而不仅仅是摆设
6. 可以设置"认知震撼"的场景，挑战读者的想象力
7. 在描述高科技设备和现象时，平衡技术细节和可读性
`);
  }

  // 言情/恋爱类
  if (genreLower.includes('言情') || genreLower.includes('恋爱') ||
    genreLower.includes('爱情') || genreLower.includes('romance') ||
    styleLower.includes('浪漫') || styleLower.includes('感性')) {
    styleGuides.push(`
【言情/恋爱风格指南】
1. 角色之间的情感发展要有层次和进程，避免毫无铺垫的感情爆发
2. 情感冲突要有深度，可以探索价值观差异、成长经历等深层原因
3. 对话和互动要有情感张力和微妙变化
4. 适当使用环境和气氛烘托情感发展
5. 角色的内心独白可以更细腻地展现情感变化
6. 感情线索可以与其他故事线索交织，增加复杂性
7. 浪漫场景要有创意，避免落入俗套
`);
  }

  // 历史/架空历史类
  if (genreLower.includes('历史') || genreLower.includes('古代') ||
    genreLower.includes('王朝') || genreLower.includes('架空') ||
    styleLower.includes('古风') || styleLower.includes('历史')) {
    styleGuides.push(`
【历史/架空历史风格指南】
1. 历史背景要有一定的准确性，即使是架空也要有内在逻辑
2. 人物的言行要符合时代背景，避免现代思维过度入侵
3. 可以巧妙融入历史事件或人物，但要有新的角度
4. 描写历史场景时注重细节，包括服饰、建筑、礼仪等
5. 政治、军事、文化等元素要有深度，展现时代特色
6. 在架空历史中，可以大胆想象，但变化要有合理性
7. 可以通过小人物视角反映大时代变迁
`);
  }

  // 游戏/竞技类
  if (genreLower.includes('游戏') || genreLower.includes('竞技') ||
    genreLower.includes('体育') || genreLower.includes('电竞') ||
    styleLower.includes('热血') || styleLower.includes('竞技')) {
    styleGuides.push(`
【游戏/竞技风格指南】
1. 比赛/对战场景要有张力和节奏感，可以使用专业术语增强真实感
2. 角色的成长要体现技术进步和心理成熟
3. 团队协作中展现不同角色的特点和价值
4. 对手不应该是单一维度的反派，可以有自己的故事和动机
5. 技战术分析要有深度，展现策略思考的过程
6. 可以融入行业内幕或专业知识，增强专业感
7. 挫折和失败是成长的必要部分，不要让主角总是轻易获胜
`);
  }

  // 默认风格指导（如果没有匹配到任何类型）
  if (styleGuides.length === 0) {
    styleGuides.push(`
【通用风格指南】
1. 保持情节的连贯性和角色的一致性
2. 场景描写要有代入感，让读者能够身临其境
3. 对话要自然流畅，符合角色特点
4. 冲突和转折要有意外性，但不失合理性
5. 节奏要有变化，紧张与舒缓相结合
6. 角色情感要有真实感，避免过于扁平化
7. 适当设置悬念和铺垫，保持读者的阅读兴趣
`);
  }

  // 将所有匹配的风格指导合并
  return styleGuides.join('\n');
}; 