import csv
import os
import psycopg

url = os.environ["DATABASE_URL"]

def clean(value):
    return value.strip() or None # for blank values 

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

            required = ("FirstName", "LastName", "org", "Domain")
            missing = [name for name in required if not row[name].strip()]
            if missing:
                print("REJECTED (missing " + ", ".join(missing) + "):", row)
                continue


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
                continue 
            
            conn.execute(
                "INSERT INTO domain (name) VALUES (%s) ON CONFLICT (lower(btrim(name))) DO NOTHING",
                (row["Domain"].strip(),),
            )
            domain_id = conn.execute(
                "SELECT domain_id FROM domain WHERE lower(btrim(name)) = lower(btrim(%s))",
                (row["Domain"],),
            ).fetchone()[0]

            # organization
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

            # person
            person_id = conn.execute(
                "INSERT INTO person (first_name, last_name) VALUES (%s, %s) RETURNING person_id",
                (row["FirstName"].strip(), row["LastName"].strip()),
            ).fetchone()[0]

            # email
            email_domain = email.split("@")[1]
            email_tld = email_domain.split(".")[-1]
            conn.execute(
                "INSERT INTO email (person_id, address, email_domain, email_tld) VALUES (%s, %s, %s, %s)",
                (person_id, email, email_domain, email_tld),
            )

            # position: links the person to the organization
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

            print("INSERTED:", email)