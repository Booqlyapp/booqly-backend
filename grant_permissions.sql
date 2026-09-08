-- Grant permissions to mybooqlydbuser
GRANT CREATE ON SCHEMA public TO mybooqlydbuser;
GRANT USAGE ON SCHEMA public TO mybooqlydbuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO mybooqlydbuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO mybooqlydbuser;

-- Grant default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO mybooqlydbuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO mybooqlydbuser;
