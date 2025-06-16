-- 创建小说向量索引表
CREATE TABLE IF NOT EXISTS novel_vector_indices (
    novel_id INTEGER PRIMARY KEY REFERENCES novels(id) ON DELETE CASCADE,
    index_dump BYTEA NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_novel_vector_indices_updated_at
    BEFORE UPDATE ON novel_vector_indices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 