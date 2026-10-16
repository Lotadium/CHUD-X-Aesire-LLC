import csv
import os
import psycopg

url = os.environ["DATABASE_URL"]

with psycopg.connect(url) as conn: #opens connection to Neon 
    with open("Data/AesireTemplateRecord.csv", newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            if not row["email"]:
                print("SKIPPED:", row) #print any row that is skipped and dont have emails
            continue
        email = row["email"].strip().lower() # make sure the email addresses are all in lowercases 
        print(email)