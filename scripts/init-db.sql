CREATE TABLE IF NOT EXISTS weekly_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    week_identifier TEXT NOT NULL,
    kilometers REAL NOT NULL,
    fuel_efficiency_km_per_liter REAL NOT NULL,
    fuel_type TEXT NOT NULL,
    fuel_price_per_liter REAL NOT NULL,
    calculated_cost REAL NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(name, week_identifier)
);
