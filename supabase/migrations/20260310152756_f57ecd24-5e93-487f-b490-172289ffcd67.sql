UPDATE programs SET max_participants = 14 WHERE max_participants = 10;
ALTER TABLE programs ALTER COLUMN max_participants SET DEFAULT 14;