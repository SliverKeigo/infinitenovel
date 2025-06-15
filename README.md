# ∞ Infinite Novel

[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-blue?logo=postgresql)](https://www.postgresql.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![shadcn/ui](https://img.shields.io/badge/shadcn/ui-black?logo=shadcn-ui&logoColor=white)](https://ui.shadcn.com/)
[![Zustand](https://img.shields.io/badge/Zustand-black)](https://github.com/pmndrs/zustand)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **"让您的小说，永远有下一章。"**

**Infinite Novel** 是一个实验性的、基于多 Agent 协作的 AI 小说创作平台。它旨在探索解决长篇小说创作中上下文连贯性、角色一致性和情节可持续性的挑战，为创作者提供一个永不枯竭的灵感源泉和写作伙伴。

与早期版本不同，当前项目采用全栈架构，通过后端 API 与 PostgreSQL 数据库交互，确保了数据的持久性、安全性与可扩展性。

## 核心功能

-   **✍️ AI 驱动的创作流程**:
    -   **创建与设定**: 支持自定义小说名称、题材、风格，并提供"特殊要求"输入框以微调 AI 创作方向。
    -   **智能生成**: AI 根据初始设定，自动生成故事大纲、角色设定，并创作后续章节。
    -   **小说概要**: 在生成大纲后，AI 会自动提炼和生成整部小说的概要。

-   **🗄️ 后端驱动与数据持久化**:
    -   **PostgreSQL 数据库**: 所有小说、章节、角色等核心数据均存储在 PostgreSQL 数据库中，确保数据安全和持久化。
    -   **健壮的 API**: 通过 Next.js API Routes 提供稳定、类型安全的数据接口。

-   **🎭 动态的世界构建**:
    -   **自动角色创建**: AI 在生成大纲后，能自动分析并批量创建核心角色。
    -   **集成式管理**: 在统一的详情页中，集中管理和浏览所有章节、角色和数据。
    -   **沉浸式阅读**: 提供简洁的章节阅读器，优化阅读体验。

-   **🔐 安全的 AI 调用**:
    -   **后端代理**: 所有对 OpenAI API 的调用都通过后端代理进行，避免在客户端暴露 API 密钥。
    -   **集中配置**: 支持在应用内管理多个 AI 服务配置，方便切换和测试。

-   **🎨 现代化的技术与设计**:
    -   **技术栈**: 基于 Next.js 14 (App Router), React, TypeScript 构建。
    -   **UI/UX**: 使用 Tailwind CSS 和 `shadcn/ui` 构建美观、响应式的用户界面，并通过 `Framer Motion` 增强交互动画。
    -   **状态管理**: 使用 `Zustand` 进行轻量、高效的全局状态管理。

## 项目架构

```mermaid
graph TD
    subgraph "客户端 (Browser)"
        direction LR
        A1["React Components (UI)"]
        A2["Zustand (State Management)"]
    end

    subgraph "服务端 (Next.js Server)"
        direction LR
        B["API Routes"]
        C["AI Proxy Service"]
        D["Database Driver (pg)"]
    end
    
    subgraph "外部服务"
        E["OpenAI API"]
        F["PostgreSQL Database"]
    end

    %% Flow
    A1 -- "用户操作" --> A2
    A2 -- "1. 发起 API 请求 (e.g., /api/novels)" --> B
    
    B -- "2. 处理业务逻辑" --> D
    D -- "3. 读/写数据" --> F
    F -- "4. 返回数据" --> D
    D -- "5. 返回给 API Route" --> B
    B -- "6. 返回响应" --> A2
    A2 -- "7. 更新UI状态" --> A1

    B -- "发起AI任务" --> C
    C -- "调用外部AI服务" --> E
    E -- "返回结果" --> C
    C -- "返回给 API Route" --> B
```

## 技术栈

-   **框架**: [Next.js](https://nextjs.org/) 14 (App Router)
-   **语言**: [TypeScript](https://www.typescriptlang.org/)
-   **数据库**: [PostgreSQL](https://www.postgresql.org/)
-   **数据库驱动**: [node-postgres (pg)](https://node-postgres.com/)
-   **UI**: [React](https://reactjs.org/), [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/), [Framer Motion](https://www.framer.com/motion/)
-   **状态管理**: [Zustand](https://github.com/pmndrs/zustand)
-   **表单**: [React Hook Form](https://react-hook-form.com/) & [Zod](https://zod.dev/)
-   **AI**: [OpenAI](https://openai.com/)
-   **图标 & 通知**: [Lucide React](https://lucide.dev/), [Sonner](https://sonner.emilkowal.ski/)


## 本地运行

1.  **克隆仓库**
    ```bash
    git clone https://github.com/SliverKeigo/infinitenovel.git
    cd infinitenovel
    ```

2.  **安装依赖**
    ```bash
    npm install
    ```

3.  **设置数据库**
    -   确保你有一个正在运行的 PostgreSQL 实例。
    -   连接到你的数据库并执行 `db.sql` 文件中的 SQL 命令来创建所需的表。
    
4.  **配置环境变量**
    -   在项目根目录创建一个 `.env.local` 文件。
    -   复制以下内容到文件中，并替换为你的实际配置：

    ```env
    # .env.local

    # PostgreSQL 连接字符串
    # 格式: postgres://[user]:[password]@[host]:[port]/[database]
    POSTGRES_URL="postgres://user:password@localhost:5432/infinitenovel_db"

    # OpenAI API 配置 (可选, 如果你想在应用内管理之外使用)
    # OPENAI_API_KEY="sk-..."
    # OPENAI_API_BASE_URL="https://api.openai.com/v1"
    ```

5.  **启动开发服务器**
    ```bash
    npm run dev
    ```

6.  **打开浏览器**
    访问 [http://localhost:3000](http://localhost:3000) 开始使用。


## 许可证

本项目基于 [MIT License](https://opensource.org/licenses/MIT) 开源。
