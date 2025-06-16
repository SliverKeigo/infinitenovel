-- 创建小说表
CREATE TABLE IF NOT EXISTS novels (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建章节表
CREATE TABLE IF NOT EXISTS chapters (
    id SERIAL PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE,
    chapter_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    summary TEXT,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    word_count INTEGER DEFAULT 0,
    UNIQUE(novel_id, chapter_number)
);

-- 创建角色表
CREATE TABLE IF NOT EXISTS characters (
    id INTEGER PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    core_setting TEXT,
    personality TEXT,
    background_story TEXT,
    appearance TEXT,
    background TEXT,
    first_appeared_in_chapter INTEGER,
    is_protagonist BOOLEAN DEFAULT false,
    status VARCHAR(255),
    relationships TEXT,
    avatar VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(novel_id, name)
);

-- 创建剧情线索表
CREATE TABLE IF NOT EXISTS plot_clues (
    id SERIAL PRIMARY KEY,
    novel_id INTEGER REFERENCES novels(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建向量索引表
CREATE TABLE IF NOT EXISTS novel_vector_indices (
    novel_id INTEGER PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
    index_dump BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
); 