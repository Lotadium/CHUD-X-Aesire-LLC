import csv
import os
import psycopg

url = os.environ["DATABASE_URL"]

with psycopg.connect(url) as conn:
    with open(
        "Data/AesireTemplateRecord.csv",
        newline="",
        encoding="utf-8-sig",
    ) as f:
        for row in csv.DictReader(f):
            email = row["email"].strip().lower()

            if not email:
                print("SKIPPED:", row)
                continue

            missing = [
                name
                for name in ("FirstName", "LastName")
                if not row[name].strip()
            ]

            if missing:
                print(
                    "REJECTED (missing "
                    + ", ".join(missing)
                    + "):",
                    row,
                )
                continue

            email_check = conn.execute(
                "SELECT 1 FROM email WHERE address = %s",
                (email,),
            )

            if email_check.fetchone():
                print("ALREADY LOADED:", email)
            else:
                person_result = conn.execute(
                    """
                    INSERT INTO person (first_name, last_name)
                    VALUES (%s, %s)
                    RETURNING person_id
                    """,
                    (
                        row["FirstName"].strip(),
                        row["LastName"].strip(),
                    ),
                )

                person_id = person_result.fetchone()[0]

                conn.execute(
                    """
                    INSERT INTO email (person_id, address)
                    VALUES (%s, %s)
                    """,
                    (person_id, email),
                )

                print("INSERTED:", email)