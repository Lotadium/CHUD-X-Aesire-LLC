import os
import psycopg

url = os.environ["DATABASE_URL"]

with psycopg.connect(url) as conn: #opens connection to Neon 
       with conn.cursor() as cur:
           cur.execute("SELECT count(*) FROM person")
           print("rows in person:", cur.fetchone()[0])