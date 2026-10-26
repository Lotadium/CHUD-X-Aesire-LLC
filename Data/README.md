# Client Test Data Loader (CHUD-12)

Loads the Product Owner's client test spreadsheet into the Neon Postgres
database.

## How to run

1. Install the packages:
```
   python3 -m pip install openpyxl "psycopg[binary]"
```
2. Put the client's file at `Data/AesireTemplateRecord.xlsx`.
3. Set the database connection string in your terminal (it is a secret, never
   commit it):
```
   export DATABASE_URL="your Neon connection string"
```
4. Run the script from the project folder:
```
   python3 read_data.py
```

## What it does

- Reads every row of the spreadsheet and loads the domain, organization,
  person, email and position records.
- Running it again does not create duplicates. People are matched by email
  address.
- A row that fails validation is not loaded and is not silently skipped. It is
  printed and written to `rejects.csv` with the reason. Required fields are
  first name, last name, organization, domain and a valid email.
- Prints a summary: rows inserted, already loaded, rejected and skipped.

## Notes

- `rejects.csv` contains client contacts. It is git-ignored and must not be
  committed.
- Not loaded yet: middle name, prefix, suffix, department and LinkedIn profile.

## AI use

- Tool: Claude (Sonnet 5.5, Anthropic).
- Used to teach/explain concepts, review code and help complete `read_data.py`.
- All code was run and tested by Rachel Wong against the dev database.