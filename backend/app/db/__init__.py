"""Database connection manager for SQLite via aiosqlite."""

import os

import aiosqlite

DEFAULT_DATABASE_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data"
)
DEFAULT_DATABASE_PATH = os.path.join(DEFAULT_DATABASE_DIR, "salvus.db")


def resolve_database_path() -> str:
    """Resolve database filepath from environment variables or standard defaults."""
    env_path = os.getenv("DATABASE_PATH") or os.getenv("DATABASE_URL")
    if env_path:
        # Strip sqlite:/// or sqlite:// prefix if present
        if env_path.startswith("sqlite:///"):
            env_path = env_path.replace("sqlite:///", "", 1)
        elif env_path.startswith("sqlite://"):
            env_path = env_path.replace("sqlite://", "", 1)
        return env_path
    return DEFAULT_DATABASE_PATH


DATABASE_PATH = resolve_database_path()
_db_connection: aiosqlite.Connection | None = None


async def get_database() -> aiosqlite.Connection:
    """Return the active database connection."""
    if _db_connection is None:
        raise RuntimeError("Database not initialized. Call init_database() first.")
    return _db_connection


async def init_database(db_path: str | None = None) -> aiosqlite.Connection:
    """Initialize the SQLite database connection and run migrations."""
    global _db_connection

    path = db_path or resolve_database_path()

    # Ensure the parent data directory exists
    data_dir = os.path.dirname(os.path.abspath(path))
    if data_dir:
        os.makedirs(data_dir, exist_ok=True)

    _db_connection = await aiosqlite.connect(path)
    _db_connection.row_factory = aiosqlite.Row

    # Enable WAL mode for better concurrent read performance
    await _db_connection.execute("PRAGMA journal_mode=WAL")
    await _db_connection.execute("PRAGMA foreign_keys=ON")

    # Run migrations
    from app.db.migrations import run_migrations

    await run_migrations(_db_connection)

    print(f"[DB] SQLite database initialized at: {os.path.abspath(path)}")
    return _db_connection


async def close_database() -> None:
    """Close the database connection."""
    global _db_connection
    if _db_connection:
        await _db_connection.close()
        _db_connection = None
        print("[DB] Database connection closed.")
