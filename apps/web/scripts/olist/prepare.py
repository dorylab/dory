"""Pinned Olist ingestion and an independent CSV oracle. Python stdlib only."""
import argparse
import collections
import csv
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import urllib.request
import zipfile
from decimal import Decimal

SOURCE = 'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce'
DOWNLOAD = 'https://www.kaggle.com/api/v1/datasets/download/olistbr/brazilian-ecommerce?datasetVersionNumber=2'
FILES = {
    'customers': ('olist_customers_dataset.csv', 'customer_id customer_unique_id customer_zip_code_prefix customer_city customer_state', ['customer_id']),
    'orders': ('olist_orders_dataset.csv', 'order_id customer_id order_status order_purchase_timestamp order_approved_at order_delivered_carrier_date order_delivered_customer_date order_estimated_delivery_date', ['order_id']),
    'order_items': ('olist_order_items_dataset.csv', 'order_id order_item_id product_id seller_id shipping_limit_date price freight_value', ['order_id', 'order_item_id']),
    'payments': ('olist_order_payments_dataset.csv', 'order_id payment_sequential payment_type payment_installments payment_value', ['order_id', 'payment_sequential']),
    'reviews': ('olist_order_reviews_dataset.csv', 'review_id order_id review_score review_comment_title review_comment_message review_creation_date review_answer_timestamp', ['review_id']),
    'products': ('olist_products_dataset.csv', 'product_id product_category_name product_name_lenght product_description_lenght product_photos_qty product_weight_g product_length_cm product_height_cm product_width_cm', ['product_id']),
    'sellers': ('olist_sellers_dataset.csv', 'seller_id seller_zip_code_prefix seller_city seller_state', ['seller_id']),
    'geolocation': ('olist_geolocation_dataset.csv', 'geolocation_zip_code_prefix geolocation_lat geolocation_lng geolocation_city geolocation_state', ['geolocation_zip_code_prefix']),
    'category_translation': ('product_category_name_translation.csv', 'product_category_name product_category_name_english', ['product_category_name']),
}
MONEY = {'order_items': ['price', 'freight_value'], 'payments': ['payment_value']}


def cents(value):
    amount = Decimal(value) * 100
    if not amount.is_finite() or amount != amount.to_integral_value():
        raise ValueError('Invalid two-decimal monetary value: ' + value)
    return int(amount)


def rows(directory, table):
    file_name, fields, _ = FILES[table]
    with (directory / file_name).open(encoding='utf-8-sig', newline='') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != fields.split():
            raise ValueError('Unexpected v2 CSV columns: ' + file_name)
        for row in reader:
            if None in row or any(v is None for v in row.values()):
                raise ValueError('Malformed CSV row: ' + file_name)
            yield row


def digest(file):
    h = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def oracle(directory, as_of):
    """No SQL or imported database is used to compute these expected results."""
    orders = {r['order_id']: r for r in rows(directory, 'orders')}
    customers = {r['customer_id']: r for r in rows(directory, 'customers')}
    products = {r['product_id']: r for r in rows(directory, 'products')}
    translations = {r['product_category_name']: r['product_category_name_english'] for r in rows(directory, 'category_translation')}
    items = collections.defaultdict(int)
    categories = collections.defaultdict(int)
    for item in rows(directory, 'order_items'):
        order = orders.get(item['order_id'])
        if not order or order['order_status'] != 'delivered':
            continue
        amount = cents(item['price'])
        items[item['order_id']] += amount
        if '2018-08-01' <= order['order_purchase_timestamp'] < '2018-09-01':
            category = products.get(item['product_id'], {}).get('product_category_name', '')
            categories[translations.get(category, category) or 'unknown'] += amount
    monthly = collections.defaultdict(lambda: [0, 0])
    customer_orders = collections.Counter()
    customer_state = {}
    eligible = late = 0
    for order in sorted(orders.values(), key=lambda r: (r['order_purchase_timestamp'], r['order_id'])):
        if order['order_status'] != 'delivered':
            continue
        timestamp = order['order_purchase_timestamp']
        if '2018-01-01' <= timestamp < '2018-09-01':
            month = timestamp[:7]
            monthly[month][0] += items[order['order_id']]
            monthly[month][1] += 1
        customer = customers.get(order['customer_id'])
        if customer and customer['customer_unique_id']:
            unique = customer['customer_unique_id']
            customer_orders[unique] += 1
            # Attribute each customer to their first delivered order's state.
            customer_state.setdefault(unique, customer['customer_state'] or 'unknown')
        delivered = order['order_delivered_customer_date']
        estimated = order['order_estimated_delivery_date']
        if '2018-08-01' <= timestamp < '2018-09-01' and delivered and estimated:
            try:
                delivery_date = dt.datetime.fromisoformat(delivered).date()
                estimated_date = dt.datetime.fromisoformat(estimated).date()
            except ValueError:
                continue
            eligible += 1
            late += int(delivery_date > estimated_date)
    state_counts = collections.defaultdict(lambda: [0, 0])
    for unique, count in customer_orders.items():
        state_counts[customer_state[unique]][0] += 1
        state_counts[customer_state[unique]][1] += int(count >= 2)
    payment_totals = collections.defaultdict(int)
    for payment in rows(directory, 'payments'):
        if orders.get(payment['order_id'], {}).get('order_status') == 'delivered':
            payment_totals[payment['payment_type']] += cents(payment['payment_value'])
    total_payments = sum(payment_totals.values())
    start = str(as_of - dt.timedelta(days=6))
    end = str(as_of + dt.timedelta(days=1))
    return {
        'monthly': [{'month': m, 'merchandise_cents': a, 'order_count': n, 'aov_cents': a / n if n else None} for m, (a, n) in sorted(monthly.items())],
        'categories': [{'category': c, 'merchandise_cents': a} for c, a in sorted(categories.items(), key=lambda pair: (-pair[1], pair[0]))[:10]],
        'repeat': [{'state': s, 'purchasing_customers': n, 'repeat_customers': r, 'repeat_rate': r / n} for s, (n, r) in sorted(state_counts.items())],
        'delivery': [{'eligible_orders': eligible, 'late_orders': late, 'late_rate': late / eligible if eligible else None}],
        'payments': [{'payment_type': p, 'payment_cents': a, 'payment_share': a / total_payments if total_payments else None} for p, a in sorted(payment_totals.items())],
        'recent': [{'order_count': sum(start <= o['order_purchase_timestamp'] < end for o in orders.values()), 'latest_order': max((o['order_purchase_timestamp'] for o in orders.values()), default=None)}],
    }


def prepare(directory, output, as_of, downloaded=False):
    output.mkdir(parents=True, exist_ok=True)
    destination = output / 'olist.sqlite'
    staged = output / 'olist.sqlite.partial'
    staged.unlink(missing_ok=True)
    db = sqlite3.connect(staged)
    report = {}
    try:
        for table, (file_name, fields, keys) in FILES.items():
            columns = fields.split()
            extras = MONEY.get(table, [])
            db.execute(f'CREATE TABLE "{table}" (source_row INTEGER PRIMARY KEY, ' + ','.join(f'"{c}" TEXT' for c in columns) + ''.join(f',"{c}_cents" INTEGER' for c in extras) + ')')
            insert = f'INSERT INTO "{table}" VALUES (' + ','.join('?' for _ in range(1 + len(columns) + len(extras))) + ')'
            count = 0
            nulls = collections.Counter()
            batch = []
            for count, row in enumerate(rows(directory, table), 1):
                nulls.update(k for k, v in row.items() if v == '')
                batch.append([count] + [row[c] or None for c in columns] + [cents(row[c]) if row[c] else None for c in extras])
                if len(batch) >= 5000:
                    db.executemany(insert, batch)
                    batch.clear()
            if batch:
                db.executemany(insert, batch)
            if not count:
                raise ValueError('Empty CSV: ' + file_name)
            key_sql = ','.join(f'"{key}"' for key in keys)
            duplicate_keys = db.execute(f'SELECT COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM "{table}" GROUP BY {key_sql} HAVING COUNT(*)>1)').fetchone()[0]
            duplicate_rows = db.execute(f'SELECT COALESCE(SUM(n-1),0) FROM (SELECT COUNT(*) n FROM "{table}" GROUP BY ' + ','.join(f'"{c}"' for c in columns) + ' HAVING COUNT(*)>1)').fetchone()[0]
            db.execute(f'CREATE INDEX "idx_{table}_key" ON "{table}" ({key_sql})')
            report[table] = {'file': file_name, 'sha256': digest(directory / file_name), 'rows': count, 'emptyValues': dict(nulls), 'duplicateKeys': duplicate_keys, 'duplicateRows': duplicate_rows}
            db.commit()
        db.execute('CREATE INDEX idx_orders_purchase ON orders(order_purchase_timestamp)')
        db.execute('CREATE INDEX idx_items_product ON order_items(product_id)')
        links = [('orders','customer_id','customers','customer_id'), ('order_items','order_id','orders','order_id'), ('order_items','product_id','products','product_id'), ('order_items','seller_id','sellers','seller_id'), ('payments','order_id','orders','order_id'), ('reviews','order_id','orders','order_id')]
        coverage = {}
        for child, key, parent, target in links:
            missing = db.execute(f'SELECT COUNT(*) FROM {child} c WHERE NOT EXISTS (SELECT 1 FROM {parent} p WHERE p.{target}=c.{key})').fetchone()[0]
            coverage[f'{child}.{key}->{parent}.{target}'] = {'missingRows': missing, 'totalRows': report[child]['rows']}
        dates = db.execute('SELECT MIN(order_purchase_timestamp), MAX(order_purchase_timestamp), SUM(CASE WHEN datetime(order_purchase_timestamp) IS NULL THEN 1 ELSE 0 END) FROM orders').fetchone()
        # Ambiguous order/dimension keys cannot be used for trustworthy benchmarks.
        invalid_keys = [t for t in ['orders','customers','products','sellers','order_items','payments','category_translation'] if report[t]['duplicateKeys'] or any(report[t]['emptyValues'].get(k) for k in FILES[t][2])]
        manifest = {'source': SOURCE, 'datasetVersionNumber': 2, 'license': 'CC BY-NC-SA 4.0', 'provenance': 'official-versioned-download' if downloaded else 'user-supplied-v2-columns; version identity not independently verified', 'asOf': str(as_of), 'sqlitePath': str(destination.resolve()), 'files': report, 'relationships': coverage, 'timeRange': {'min': dates[0], 'max': dates[1], 'invalidDates': dates[2]}, 'benchmarkEligible': not invalid_keys and not dates[2], 'invalidKeys': invalid_keys}
        if not manifest['benchmarkEligible']:
            (output / 'prepare-failure.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
            raise ValueError('Ambiguous primary keys or invalid order dates; see prepare-failure.json')
        expected = oracle(directory, as_of)
        expected_path = output / 'expected.json.partial'
        expected_path.write_text(json.dumps(expected, indent=2, ensure_ascii=False) + '\n')
        manifest['expectedSha256'] = digest(expected_path)
        db.commit()
    finally:
        db.close()
    os.replace(staged, destination)
    manifest['sqliteSha256'] = digest(destination)
    os.replace(expected_path, output / 'expected.json')
    (output / 'data-manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n')
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', type=Path)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--as-of', type=dt.date.fromisoformat, required=True)
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    if bool(args.input_dir) == args.download:
        parser.error('Choose exactly one of --input-dir or --download')
    directory = args.input_dir
    if args.download:
        directory = args.output_dir / 'raw'
        directory.mkdir(parents=True, exist_ok=True)
        archive = args.output_dir / 'olist-v2.zip'
        with urllib.request.urlopen(DOWNLOAD, timeout=120) as response, archive.open('wb') as target:
            if 'zip' not in response.headers.get('Content-Type', ''):
                raise ValueError('Official download did not return a ZIP; supply --input-dir instead')
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
        with zipfile.ZipFile(archive) as zipped:
            for name, _, _ in FILES.values():
                # Explicit basenames prevent traversal and exclude unrelated files.
                with zipped.open(name) as source, (directory / name).open('wb') as target:
                    while chunk := source.read(1024 * 1024):
                        target.write(chunk)
    manifest = prepare(directory, args.output_dir, args.as_of, args.download)
    if args.download:
        manifest['archiveSha256'] = digest(archive)
        (args.output_dir / 'data-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'ok': True, 'outputDir': str(args.output_dir.resolve()), 'orders': manifest['files']['orders']['rows'], 'timeRange': manifest['timeRange']}))


if __name__ == '__main__':
    main()
