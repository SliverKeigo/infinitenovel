create table novels
(
    id                       serial
        primary key,
    name                     varchar(255) not null,
    genre                    varchar(255) not null,
    style                    varchar(255) not null,
    word_count               bigint                   default 0,
    chapter_count            integer                  default 0,
    character_count          integer                  default 0,
    total_chapter_goal       integer      not null,
    expansion_count          integer                  default 0,
    plot_outline             text,
    plot_clue_count          integer                  default 0,
    description              text,
    special_requirements     text,
    style_guide              text,
    character_behavior_rules text,
    created_at               timestamp with time zone default CURRENT_TIMESTAMP,
    updated_at               timestamp with time zone default CURRENT_TIMESTAMP,
    initial_chapter_goal     integer
);

comment on column novels.total_chapter_goal is '总章节目标';

comment on column novels.special_requirements is '小说的特殊要求或核心设定';

comment on column novels.created_at is '记录创建时间';

comment on column novels.updated_at is '记录最后更新时间';

comment on column novels.initial_chapter_goal is '初始章节目标';

alter table novels
    owner to keigo;

create table chapters
(
    id             serial
        primary key,
    novel_id       integer      not null
        references novels
            on delete cascade,
    chapter_number integer      not null,
    title          varchar(255) not null,
    content        text,
    summary        text,
    is_published   boolean                  default false,
    created_at     timestamp with time zone default CURRENT_TIMESTAMP,
    constraint uq_novel_chapter
        unique (novel_id, chapter_number)
);

comment on column chapters.created_at is '记录创建时间';

alter table chapters
    owner to keigo;

create table characters
(
    id                        serial
        primary key,
    novel_id                  integer                                not null
        references novels
            on delete cascade,
    name                      varchar(255)                           not null,
    core_setting              text,
    personality               text,
    background_story          text,
    created_at                timestamp with time zone default now() not null,
    updated_at                timestamp with time zone,
    appearance                text,
    description               text,
    background                text,
    first_appeared_in_chapter integer,
    is_protagonist            boolean                  default false,
    status                    varchar(255)             default 'active'::character varying,
    relationships             text,
    avatar                    varchar(255)
);

comment on column characters.created_at is '记录创建时间';

comment on column characters.updated_at is '记录最后更新时间';

alter table characters
    owner to keigo;

create table plot_clues
(
    id          serial
        primary key,
    novel_id    integer                                not null
        references novels
            on delete cascade,
    title       varchar(255)                           not null,
    description text,
    created_at  timestamp with time zone default now() not null,
    updated_at  timestamp with time zone
);

comment on column plot_clues.created_at is '记录创建时间';

comment on column plot_clues.updated_at is '记录最后更新时间';

alter table plot_clues
    owner to keigo;

create table novel_vector_indexes
(
    novel_id   integer not null
        primary key
        references novels
            on delete cascade,
    index_dump bytea   not null
);

alter table novel_vector_indexes
    owner to keigo;

create table generation_settings
(
    id                   integer                                not null
        primary key,
    max_tokens           integer,
    segments_per_chapter integer,
    temperature          real,
    top_p                real,
    frequency_penalty    real,
    presence_penalty     real,
    character_creativity real,
    created_at           timestamp with time zone default now() not null,
    updated_at           timestamp with time zone
);

comment on column generation_settings.created_at is '记录创建时间';

comment on column generation_settings.updated_at is '记录最后更新时间';

alter table generation_settings
    owner to keigo;

create table ai_configs
(
    id           serial
        primary key,
    name         varchar(255)                           not null,
    api_key      text                                   not null,
    api_base_url text,
    model        varchar(255)                           not null,
    vision_model varchar(255),
    created_at   timestamp with time zone default now() not null,
    updated_at   timestamp with time zone
);

comment on table ai_configs is '存储AI提供商的配置信息';

comment on column ai_configs.id is '唯一标识符';

comment on column ai_configs.name is '配置名称，方便用户识别';

comment on column ai_configs.api_key is 'API密钥';

comment on column ai_configs.api_base_url is 'API的基础URL，用于代理或自定义端点';

comment on column ai_configs.model is '主要的文本生成模型';

comment on column ai_configs.vision_model is '支持视觉的模型';

comment on column ai_configs.created_at is '记录创建时间';

comment on column ai_configs.updated_at is '记录最后更新时间';

alter table ai_configs
    owner to keigo;

create function update_updated_at_column() returns trigger
    language plpgsql
as
$$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

alter function update_updated_at_column() owner to keigo;

create trigger update_novels_updated_at
    before update
    on novels
    for each row
execute procedure update_updated_at_column();

