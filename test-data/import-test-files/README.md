# Dory Multi-Format Import Test Files

## Expected to succeed

| File | Source format | Expected result |
|---|---|---|
| `customers.csv` | CSV | 5 rows and 9 columns |
| `customers.tsv` | TSV | 5 rows and 9 columns |
| `customers.parquet` | Parquet | 5 rows and 9 columns; `amount` produces a `DECIMAL_STRINGIFIED` warning |
| `customers.ndjson` | NDJSON | 5 rows and 9 columns |
| `customers.jsonl` | JSONL | 5 rows and 9 columns |
| `customers.arrow` | Arrow IPC File | 5 rows and 9 columns; `amount` produces a `DECIMAL_STRINGIFIED` warning |
| `customers.ipc` | Arrow IPC File | 5 rows and 9 columns; `amount` produces a `DECIMAL_STRINGIFIED` warning |
| `customers.feather` | Feather v2 | 5 rows and 9 columns; `amount` produces a `DECIMAL_STRINGIFIED` warning |

The valid files cover Unicode, embedded newlines, empty strings and NULL values, leading zeros, booleans, negative floating-point values, dates, UTC timestamps, decimals, and the `9223372036854775807` int64 upper bound.

In CSV and TSV, `amount` is a string. In Parquet, Arrow, IPC, and Feather, `amount` is `Decimal(24,4)` and should be converted to a string without losing precision. Date and timestamp values in NDJSON and JSONL intentionally remain strings.

## Expected to fail

| File | Expected error code |
|---|---|
| `invalid-nested.ndjson` | `IMPORT_NDJSON_NESTED_VALUE` |
| `invalid-top-level-array.jsonl` | `IMPORT_NDJSON_INVALID` |
| `invalid-arrow-stream.arrow` | `IMPORT_SOURCE_FORMAT_MISMATCH` |
| `invalid-signature.parquet` | `IMPORT_SOURCE_FORMAT_MISMATCH` |
