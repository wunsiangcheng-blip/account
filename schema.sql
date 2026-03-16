DROP TABLE IF EXISTS accounting_items;
CREATE TABLE accounting_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    datetime TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT
);
