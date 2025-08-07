# Novel AI Website

This is a Next.js project for generating novels using AI.

## Features

- Create novels with a title, summary, and category.
- Generate a main outline for the novel.
- Generate detailed chapter-by-chapter outlines.
- Generate chapter content based on the outlines.
- World-building elements (roles, scenes, clues) are automatically extracted and saved.
- Vector store integration for contextual memory.

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Logging

This project uses `pino` for logging. Logs are written to `logs/app.log`.

To view logs in real-time, run the following command in your terminal:

```bash
tail -f logs/app.log | npx pino-pretty
```

This will display the logs in a human-readable format.
