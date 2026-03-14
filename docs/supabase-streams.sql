-- Таблица трансляций (стримов)
CREATE TABLE IF NOT EXISTS streams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  url          text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  is_live      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Индекс для сортировки по дате
CREATE INDEX IF NOT EXISTS idx_streams_scheduled_at ON streams (scheduled_at DESC);

-- RLS: разрешить публичное чтение
ALTER TABLE streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY streams_select_all ON streams FOR SELECT USING (true);

-- Полный доступ для service role (через GRANT)
GRANT ALL ON streams TO PUBLIC;
