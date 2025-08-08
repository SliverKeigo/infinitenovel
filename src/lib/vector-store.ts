import logger from "@/lib/logger";
import { ChromaClient, Collection } from "chromadb";
import { ModelConfig } from "@/types/ai";
import { getEmbeddings } from "./ai-client";

// 从环境变量读取 ChromaDB 的地址，如果没有则使用你的 IP 作为默认值
const CHROMA_URL = process.env.CHROMA_URL || "http://10.241.158.161:8000";

// 创建一个 ChromaDB 客户端实例
// 我们将它设置为单例模式，确保整个应用共享同一个客户端连接
let client: ChromaClient | null = null;

function getClient(): ChromaClient {
  if (!client) {
    const url = new URL(CHROMA_URL);
    client = new ChromaClient({
      host: url.hostname,
      port: Number(url.port),
      ssl: url.protocol === "https:",
    });
  }
  return client;
}

/**
 * 获取或创建一个集合（Collection）。
 * @param {string} name - 集合的名称。
 * @returns {Promise<Collection>}
 */
export async function getOrCreateCollection(name: string): Promise<Collection> {
  const chroma = getClient();
  try {
    const collection = await chroma.getOrCreateCollection({ name });
    logger.info(`成功连接到集合: ${name}`);
    return collection;
  } catch (e) {
    logger.error(`获取或创建集合 '${name}' 失败`, e);
    throw new Error(`无法连接到集合: ${name}`);
  }
}

interface WorldElement {
  id: string;
  name: string;
  content: string;
}

/**
 * 将一批世界设定元素（角色、场景、线索）嵌入并添加到指定的集合中。
 * 这是“记忆填充”的核心功能。
 * @param collectionName - 目标集合的名称。
 * @param elements - 世界设定元素的数组。
 * @param embeddingConfig - 用于生成向量的 AI 模型配置。
 */
export async function addElementsToCollection(
  collectionName: string,
  elements: WorldElement[],
  embeddingConfig: ModelConfig,
) {
  if (elements.length === 0) {
    return;
  }

  const collection = await getOrCreateCollection(collectionName);

  // 1. 准备要嵌入的文本内容
  const contents = elements.map(
    (element) => `${element.name}: ${element.content}`,
  );

  // 2. 调用 AI 服务生成向量嵌入
  const embeddings = await getEmbeddings(embeddingConfig, contents);
  if (!embeddings) {
    throw new Error("为世界元素生成嵌入向量失败。");
  }

  // 3. 将元素添加到 ChromaDB 集合中
  await collection.add({
    ids: elements.map((element) => element.id),
    embeddings: embeddings,
    documents: contents,
    metadatas: elements.map((el) => ({ name: el.name, content: el.content })), // 存储除id外的其他信息
  });

  logger.info(
    `成功向集合 '${collectionName}' 添加了 ${elements.length} 个元素。`,
  );
}

/**
 * 在指定集合中进行语义查询，以检索相关的上下文信息。
 * 这是“检索服务”的核心功能。
 * @param collectionName - 目标集合的名称。
 * @param queryText - 用于查询的文本（例如，章节大纲）。
 * @param embeddingConfig - 用于生成查询向量的 AI 模型配置。
 * @param nResults - 需要返回的结果数量。
 * @returns {Promise<string[]>} 返回一个包含最相关文档内容的字符串数组。
 */
export async function queryCollection(
  collectionName: string,
  queryText: string,
  embeddingConfig: ModelConfig,
  nResults: number = 3,
): Promise<string[]> {
  const collection = await getOrCreateCollection(collectionName);

  // 1. 为查询文本生成向量
  const queryEmbedding = await getEmbeddings(embeddingConfig, queryText);
  if (!queryEmbedding) {
    throw new Error("为查询文本生成嵌入向量失败。");
  }

  // 2. 在集合中执行查询
  const results = await collection.query({
    queryEmbeddings: queryEmbedding,
    nResults: nResults,
  });

  // 3. 提取并返回文档内容，同时过滤掉任何 null 或 undefined 的值
  return (results.documents[0] ?? []).filter((doc): doc is string => doc !== null);
}

/**
 * 嵌入一批世界设定元素，并在指定的集合中进行“更新或插入”操作。
 * @param collectionName - 目标集合的名称。
 * @param elements - 世界设定元素的数组。
 * @param embeddingConfig - 用于生成向量的 AI 模型配置。
 */
export async function upsertElementsInCollection(
  collectionName: string,
  elements: WorldElement[],
  embeddingConfig: ModelConfig,
) {
  if (elements.length === 0) {
    return;
  }

  const collection = await getOrCreateCollection(collectionName);

  const contents = elements.map(
    (element) => `${element.name}: ${element.content}`,
  );
  const embeddings = await getEmbeddings(embeddingConfig, contents);
  if (!embeddings) {
    throw new Error("为更新插入元素生成嵌入向量失败。");
  }

  await collection.upsert({
    ids: elements.map((element) => element.id),
    embeddings: embeddings,
    documents: contents,
    metadatas: elements.map((el) => ({ name: el.name, content: el.content })),
  });

  logger.info(
    `成功在集合 '${collectionName}' 中更新插入了 ${elements.length} 个元素。`,
  );
}
