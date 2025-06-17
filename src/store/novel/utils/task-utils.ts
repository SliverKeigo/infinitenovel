/**
 * 小说生成任务状态管理工具
 */

/**
 * 重置生成任务状态
 * @param get - Zustand的get函数
 * @param set - Zustand的set函数
 */
export const resetGenerationTask = (
  get: () => any,
  set: (partial: any) => void
) => {
  set({
    generationTask: {
      isActive: false,
      progress: 0,
      currentStep: '空闲',
      novelId: null,
      mode: 'idle',
    },
    generationLoading: false,
    generatedContent: null, // 同时清空生成的内容
  });
}; 