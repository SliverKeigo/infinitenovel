# Novel AI Website

Novel AI Website is a powerful platform for creating and managing AI-generated novels. It leverages modern AI models to assist authors in generating story outlines, detailed chapter structures, and even full chapter content, ensuring narrative consistency through a sophisticated world-building and memory system.

This project is built with a cutting-edge tech stack, including Next.js, Prisma, and ChromaDB, to deliver a seamless and interactive writing experience.

---

# Novel AI 网站

Novel AI 网站是一个用于创作和管理 AI 生成小说的强大平台。它利用先进的 AI 模型，帮助作者生成故事大纲、详细的章节结构乃至完整的章节内容，并通过一套精密的世界观和记忆系统来确保叙事的连贯性。

本项目采用前沿技术栈构建，包括 Next.js、Prisma 和 ChromaDB，旨在提供无缝且交互性强的写作体验。

## Core Features | 核心功能

- **Dynamic Outline Generation**: Automatically generate a multi-volume main outline based on a simple novel concept.
  - **动态大纲生成**：基于简单的构想，自动生成多卷本的小说主线大纲。
- **Structured Chapter Generation**: Create detailed, event-driven chapter outlines that adhere strictly to the main narrative.
  - **结构化章节生成**：创建严格遵循主线叙事的、事件驱动的详细章节大纲。
- **AI-Powered Content Creation**: Generate full chapter content based on the structured outlines.
  - **AI 驱动的内容创作**：基于结构化大纲，生成完整的章节内容。
- **World Evolution System**: A sophisticated memory system that uses a vector database (ChromaDB) to track characters, scenes, and clues, ensuring long-term narrative consistency.
  - **世界演化系统**：一套精密的记忆系统，使用向量数据库（ChromaDB）来追踪角色、场景和线索，确保长期的叙事连贯性。
- **Interactive UI**: A modern, responsive user interface for managing novels and generating content.
  - **交互式用户界面**：一个现代化的、响应式的用户界面，用于管理小说和生成内容。

## Tech Stack | 技术栈

- **Framework**: Next.js (with App Router)
- **Backend**: Node.js
- **Database ORM**: Prisma
- **Vector Database**: ChromaDB (for AI memory)
- **AI Integration**: OpenAI, Google Gemini
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI
- **State Management**: Zustand
- **Testing**: Vitest

## Local Development Guide | 本地开发指南

To run this project locally, follow these steps:

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/SliverKeigo/infinitenovel.git
    cd novel-ai-website
    ```

2.  **Install dependencies**:

    ```bash
    npm install
    ```

3.  **Set up the database**:
    This project uses PostgreSQL with Prisma. Make sure you have a PostgreSQL server running.
    - Create a `.env` file based on `.env.example` and configure your `DATABASE_URL`.
    - Run the database migrations:
      ```bash
      npx prisma migrate dev
      ```

4.  **Run the development server**:
    ```bash
    npm run dev
    ```

The application will be available at `http://localhost:3000`. For colorized logs, use `npm run dev | npx pino-pretty`.

---

若要在本地运行此项目，请按以下步骤操作：

1.  **克隆仓库**：

    ```bash
    git clone https://github.com/SliverKeigo/infinitenovel.git
    cd novel-ai-website
    ```

2.  **安装依赖**：

    ```bash
    npm install
    ```

3.  **设置数据库**：
    本项目使用 PostgreSQL 和 Prisma。请确保您有一个正在运行的 PostgreSQL 服务器。
    - 基于 `.env.example` 文件创建一个 `.env` 文件，并配置您的 `DATABASE_URL`。
    - 运行数据库迁移：
      ```bash
      npx prisma migrate dev
      ```

4.  **运行开发服务器**：

    ```bash
    npm run dev
    ```

    应用程序将在 `http://localhost:3000` 上可用。如需查看带颜色的日志，请使用 `npm run dev | npx pino-pretty` 命令。

## Available Scripts | 可用命令

- `npm run dev`: Starts the development server.
  - 启动开发服务器。
- `npm run build`: Builds the application for production.
  - 为生产环境构建应用程序。
- `npm run start`: Starts the production server.
  - 启动生产服务器。
- `npm run lint`: Lints the code using ESLint.
  - 使用 ESLint 进行代码检查。
- `npm run test`: Runs tests using Vitest.
  - 使用 Vitest 运行测试。
