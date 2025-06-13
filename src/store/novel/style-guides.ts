/**
 * 小说风格指南相关的工具函数
 */

/**
 * 融合风格指导常量
 * 用于处理常见的风格组合，避免冲突
 */
const COMBINED_STYLE_GUIDES = {
  // 游戏+奇幻组合
  "游戏奇幻": `
【游戏奇幻融合风格指南】
1. 游戏世界观设定要有内在一致性，魔法/技能系统要有明确规则和限制
2. 角色成长应遵循游戏逻辑与奇幻元素的融合，避免无理由的突然强大
3. 战斗/冒险场景要有游戏化的张力和视觉表现，但保持奇幻世界的沉浸感
4. 可以融入游戏术语与奇幻元素的创造性结合
5. 在描绘奇幻世界时，可以加入游戏化的系统元素，但要自然融入世界观
6. 角色互动可以体现游戏中的团队协作与奇幻世界的人物关系
7. 挑战与成长应同时满足游戏进阶逻辑和奇幻故事的情感发展
`,

  // 古代+恋爱组合
  "古代恋爱": `
【古代恋爱融合风格指南】
1. 人物情感发展要符合古代社会背景与礼教约束，同时保持感情的真挚动人
2. 对话要融合古风雅韵与情感表达，注意古代语言的韵味与分寸
3. 社会环境与礼制对恋爱关系的影响要有合理展现
4. 角色的内心独白可以更细腻地展现在礼教约束下的情感挣扎
5. 古代场景描写要有历史感，包括服饰、建筑、礼仪等细节
6. 感情发展中的冲突可以结合门第、家族、政治等古代特有元素
7. 浪漫场景要既符合古代审美又能打动现代读者
`,

  // 学霸+恋爱组合
  "学霸恋爱": `
【学霸恋爱融合风格指南】
1. 知识与情感的平衡，展现学霸在学术与感情间的取舍与成长
2. 学术竞争与情感发展可以相互交织，形成独特的情感张力
3. 对话中可以融入学术元素，但不应过于生硬或专业化
4. 学霸角色的内心世界要丰富，不仅限于学术思维
5. 感情发展可以与学术成长相互促进或制约
6. 避免将学霸角色塑造为情感白痴的刻板印象
7. 学术场景与浪漫场景的节奏转换要自然流畅
`,

  // 知识+轻小说组合
  "知识轻小说": `
【知识轻小说融合风格指南】
1. 知识内容要准确但表达方式要轻松有趣，避免枯燥说教
2. 每个知识点的呈现都可以包含幽默元素或意外转折
3. 角色可以有与特定知识领域相关的独特性格特点
4. 知识的应用要融入故事情节，而非简单的知识堆砌
5. 可以通过角色间的对话或互动自然地引入知识点
6. 复杂知识可以通过比喻、类比或生活化的例子来简化表达
7. 保持轻小说的娱乐性，同时让读者在阅读中获取有价值的知识
`,

  // 科幻+商战组合
  "科幻商战": `
【科幻商战融合风格指南】
1. 科技创新与商业策略的结合要合理，展现未来商业生态
2. 商业竞争中融入科幻元素，如AI决策、太空资源争夺等
3. 人物动机要平衡商业利益与科技伦理考量
4. 未来商业模式要有合理的科学基础和社会影响
5. 商战策略要考虑科幻背景下的特殊规则和限制
6. 冲突可以围绕科技垄断、资源控制、伦理边界等展开
7. 保持商战的紧张感和科幻的想象力平衡
`
};

/**
 * 风格优先级映射，用于在多种风格组合时确定主导风格
 * 数字越大，优先级越高
 */
const STYLE_PRIORITIES = {
  "轻小说": 8,
  "恋爱": 7,
  "言情": 7,
  "古代": 6,
  "历史": 6,
  "学霸": 6,
  "知识": 5,
  "游戏": 5,
  "奇幻": 4,
  "玄幻": 4,
  "仙侠": 4,
  "科幻": 4,
  "都市": 3,
  "职场": 3,
  "悬疑": 3,
  "推理": 3,
  "竞技": 2,
  "体育": 2
};

/**
 * 检测风格组合并解决潜在冲突
 * @param genreKeywords - 从小说类型中提取的关键词数组
 * @param styleKeywords - 从写作风格中提取的关键词数组
 * @returns 最适合的风格指导或融合风格指导
 */
const resolveStyleConflicts = (genreKeywords: string[], styleKeywords: string[] = []): string => {
  // 如果没有关键词，返回空字符串
  if (genreKeywords.length === 0) {
    return '';
  }

  // 1. 检查是否有预定义的融合风格指导
  for (const [combinedKey, guide] of Object.entries(COMBINED_STYLE_GUIDES)) {
    // 检查组合关键词是否匹配当前小说类型
    const combinedKeywords = combinedKey.match(/[\u4e00-\u9fa5a-zA-Z]+/g) || [];
    if (combinedKeywords.every(keyword => 
      genreKeywords.some(genre => genre.includes(keyword)) || 
      styleKeywords.some(style => style.includes(keyword)))) {
      return guide;
    }
  }

  // 2. 如果没有预定义的融合风格，根据优先级确定主导风格
  let highestPriority = -1;
  let dominantKeyword = '';

  // 检查类型关键词
  for (const keyword of genreKeywords) {
    for (const [styleKey, priority] of Object.entries(STYLE_PRIORITIES)) {
      if (keyword.includes(styleKey) && priority > highestPriority) {
        highestPriority = priority;
        dominantKeyword = styleKey;
      }
    }
  }

  // 检查风格关键词
  for (const keyword of styleKeywords) {
    for (const [styleKey, priority] of Object.entries(STYLE_PRIORITIES)) {
      if (keyword.includes(styleKey) && priority > highestPriority) {
        highestPriority = priority;
        dominantKeyword = styleKey;
      }
    }
  }

  // 3. 返回空字符串，让后续逻辑处理
  return '';
};

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