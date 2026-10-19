import csv
import os
import openpyxl
import psycopg

# AI note: written with help from Claude (Anthropic). See README, "AI use".

url = os.environ["DATABASE_URL"]


def clean(value):
    """Turn an empty cell into None (stored as empty in the database)."""
    return value.strip() or None


def read_rows(path):
    """Read the spreadsheet and give back (row number, row as a dictionary)."""
    sheet = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    rows = sheet.iter_rows(values_only=True)
    headers = next(rows)  # first row = column names
    for line_number, values in enumerate(rows, start=2):
        row = {h: ("" if v is None else str(v)) for h, v in zip(headers, values) if h}
        if not any(value.strip() for value in row.values()):
            continue  # completely empty row, nothing to report
        yield line_number, row


def load_row(conn, row, email):
    """Insert one spreadsheet row into domain, organization, person, email and position."""
    # 1. domain: find it, or create it
    conn.execute(
        "INSERT INTO domain (name) VALUES (%s) ON CONFLICT (lower(btrim(name))) DO NOTHING",
        (row["Domain"].strip(),),
    )
    domain_id = conn.execute(
        "SELECT domain_id FROM domain WHERE lower(btrim(name)) = lower(btrim(%s))",
        (row["Domain"],),
    ).fetchone()[0]

    # 2. organization: find it, or create it
    found = conn.execute(
        "SELECT organization_id FROM organization WHERE lower(btrim(name)) = lower(btrim(%s))",
        (row["org"],),
    ).fetchone()
    if found:
        organization_id = found[0]
    else:
        organization_id = conn.execute(
            """
            INSERT INTO organization (domain_id, name, website_url)
            VALUES (%s, %s, %s)
            RETURNING organization_id
            """,
            (domain_id, row["org"].strip(), clean(row["URL"])),
        ).fetchone()[0]

    # 3. person
    person_id = conn.execute(
        "INSERT INTO person (first_name, last_name) VALUES (%s, %s) RETURNING person_id",
        (row["FirstName"].strip(), row["LastName"].strip()),
    ).fetchone()[0]

    # 4. email
    email_domain = email.split("@")[1]
    email_tld = email_domain.split(".")[-1]
    conn.execute(
        "INSERT INTO email (person_id, address, email_domain, email_tld) VALUES (%s, %s, %s, %s)",
        (person_id, email, email_domain, email_tld),
    )

    # 5. position: links the person to the organization
    conn.execute(
        """
        INSERT INTO position (person_id, organization_id, title, additional_title,
                              phone, phone_ext, mobile_phone, fax)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            person_id,
            organization_id,
            clean(row["Title"]),
            clean(row["Additional Title"]),
            clean(row["Phone"]),
            clean(row["Phone Ext"]),
            clean(row["Mobile Phone"]),
            clean(row["Fax"]),
        ),
    )


counts = {"inserted": 0, "already loaded": 0, "rejected": 0, "skipped": 0}
problems = []  # every skipped or rejected row, saved to rejects.csv at the end


def log_problem(kind, line_number, row, reason):
    print(f"Row {line_number}: {kind} - {reason}")
    counts[kind.lower()] += 1
    problems.append({"row": line_number, "result": kind, "reason": reason, **row})


with psycopg.connect(url) as conn:
    for line_number, row in read_rows("Data/AesireTemplateRecord.xlsx"):
        email = row["email"].strip().lower()

        if not email:
            log_problem("SKIPPED", line_number, row, "no email")
            continue

        required = ("FirstName", "LastName", "org", "Domain")
        missing = [name for name in required if not row[name].strip()]
        if missing:
            log_problem("REJECTED", line_number, row, "missing " + ", ".join(missing))
            continue

        if email.count("@") != 1 or "." not in email.split("@")[1]:
            log_problem("REJECTED", line_number, row, f"invalid email '{email}'")
            continue

        if conn.execute("SELECT 1 FROM email WHERE address = %s", (email,)).fetchone():
            print(f"Row {line_number}: ALREADY LOADED - {email}")
            counts["already loaded"] += 1
            continue

        try:
            with conn.transaction():  # if anything inside fails, only this row is undone
                load_row(conn, row, email)
        except psycopg.Error as error:
            log_problem("REJECTED", line_number, row, "database error: " + str(error).splitlines()[0])
            continue

        print(f"Row {line_number}: INSERTED - {email}")
        counts["inserted"] += 1

# write every skipped/rejected row to a file
if problems:
    columns = ["row", "result", "reason"] + [
        key for key in problems[0] if key not in ("row", "result", "reason")
    ]
    with open("rejects.csv", "w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=columns)
        writer.writeheader()
        writer.writerows(problems)

print()
print("Summary:", ", ".join(f"{n} {label}" for label, n in counts.items()))
if problems:
    print("Skipped and rejected rows are listed in rejects.csv")