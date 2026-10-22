import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row


TABLES = ("scholarships", "eligibility_rules", "portal_configs")

EXISTS_SQL = """
    SELECT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS c
        JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = %s
          AND c.relname = %s
          AND c.relkind IN ('r', 'p')
    ) AS table_exists
"""

COLUMNS_SQL = """
    SELECT
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
        NOT a.attnotnull AS nullable,
        pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS default_expression,
        a.attidentity AS identity_kind,
        a.attgenerated AS generated_kind
    FROM pg_catalog.pg_attribute AS a
    JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef AS d
        ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = %s
      AND c.relname = %s
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
"""

CONSTRAINTS_SQL = """
    SELECT
        con.conname AS name,
        CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'u' THEN 'UNIQUE'
        END AS type,
        pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
    FROM pg_catalog.pg_constraint AS con
    JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE n.nspname = %s
      AND c.relname = %s
      AND con.contype IN ('p', 'f', 'u')
    ORDER BY con.contype, con.conname
"""

INDEXES_SQL = """
    SELECT indexname, indexdef
    FROM pg_catalog.pg_indexes
    WHERE schemaname = %s AND tablename = %s
    ORDER BY indexname
"""


def main():
    load_dotenv(Path(__file__).with_name(".env"))
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL is missing from the environment or backend .env.")
        return

    try:
        with psycopg.connect(database_url, row_factory=dict_row) as conn:
            with conn.transaction():
                conn.execute("SET TRANSACTION READ ONLY")

                for table in TABLES:
                    params = ("public", table)
                    exists = conn.execute(EXISTS_SQL, params).fetchone()["table_exists"]
                    print(f"\npublic.{table}: {'exists' if exists else 'does not exist'}")
                    if not exists:
                        continue

                    for label, query in (
                        ("Columns", COLUMNS_SQL),
                        ("Primary keys, foreign keys, and unique constraints", CONSTRAINTS_SQL),
                        ("Indexes", INDEXES_SQL),
                    ):
                        rows = conn.execute(query, params).fetchall()
                        print(f"{label}:")
                        for row in rows:
                            print(f"  {dict(row)}")
    except Exception:
        # Avoid printing database exceptions, which could contain connection details.
        print("Schema inspection failed. Check database connectivity and permissions.")


if __name__ == "__main__":
    main()