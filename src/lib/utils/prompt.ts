/**
 * 转义字符串中的特殊字符，以便在正则表达式中使用。
 * 这可以防止字符串被当作包含特殊字符的正则表达式来处理。
 * @param str 要转义的字符串。
 * @returns 转义后的字符串，可以安全地在 RegExp 中使用。
 */
function escapeRegExp(str: string): string {
  // $& 代表整个匹配到的字符串，所以这里是用转义后的字符替换它自身。
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 通用的 prompt 插值函数
 * @param template - 包含 \`${key}\` 占位符的模板字符串
 * @param values - 一个包含要替换的键和值的对象
 * @returns 替换了占位符的字符串
 */
export function interpolatePrompt(
  template: string,
  values: Record<string, string>,
): string {
  return Object.entries(values).reduce((acc, [key, value]) => {
    // 在创建正则表达式之前，对 key 进行转义以防止正则表达式注入漏洞
    const escapedKey = escapeRegExp(key);
    // 使用全局替换，以防一个 key 在模板中出现多次
    return acc.replace(new RegExp(`\\$\\{${escapedKey}\\}`, "g"), value);
  }, template);
}
