import csv

with open("Data/AesireTemplateRecord.csv", newline="", encoding="utf-8-sig") as f:
    for row in csv.DictReader(f):
        print(row)