/**
 * 小说统计信息管理工具
 */

/**
 * 更新小说统计信息
 * @param get - Zustand的get函数
 * @param novelId - 小说ID
 */
export const updateNovelStats = async (
  get: () => any,
  novelId: number
) => {
  try {
    const response = await fetch(`/api/novels/${novelId}/stats`, { method: 'POST' });
    if (!response.ok) {
      console.error('Failed to trigger novel stats update on the server.');
    }
    // After updating the source of truth, refresh the state
    await get().fetchNovelDetails(novelId);
  } catch (error) {
    console.error('Error calling stats update API:', error);
  }
};

/**
 * 记录小说扩展次数
 * @param get - Zustand的get函数
 * @param novelId - 小说ID
 */
export const recordExpansion = async (
  get: () => any,
  novelId: number
) => {
  try {
    const response = await fetch(`/api/novels/${novelId}/record-expansion`, { method: 'POST' });
    if (!response.ok) {
      console.error('Failed to trigger expansion record on the server.');
    }
    await get().fetchNovelDetails(novelId);
  } catch (error) {
    console.error('Error calling record expansion API:', error);
  }
}; 