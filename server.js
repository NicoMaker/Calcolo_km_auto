const express = require("express")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
const app = express()

const PORT = process.env.PORT || 3000
const PUBLIC_DIR = path.join(__dirname, "public")
let db

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

async function initializeDatabase() {
  try {
    const dbDir = path.join(__dirname, "db")
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

    const dbPath = path.join(dbDir, "database.db")
    db = new Database(dbPath)

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS weekly_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        week_identifier TEXT NOT NULL,
        kilometers REAL NOT NULL,
        fuel_efficiency_km_per_liter REAL NOT NULL,
        fuel_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, week_identifier)
      );
    `
    db.exec(createTableQuery)

    console.log("✅ Database inizializzato correttamente.")
  } catch (error) {
    console.error("❌ Errore database:", error)
    process.exit(1)
  }
}

// === API ===

app.get("/api/fuel-price", (req, res) => {
  const fuelType = req.query.fuelType?.toLowerCase()
  const pricesPath = path.join(__dirname, "public", "fuel-prices.json")
  let prices = {}
  try {
    prices = JSON.parse(fs.readFileSync(pricesPath, "utf8"))
  } catch (e) {
    return res.status(500).json({ message: "Errore lettura prezzi carburante." })
  }
  let price = prices[fuelType]
  if (typeof price !== "number") price = 1.5
  res.json({ price })
})

app.get("/api/names", (req, res) => {
  try {
    const stmt = db.prepare("SELECT DISTINCT name FROM weekly_records ORDER BY name ASC")
    const names = stmt.all().map(row => row.name)
    res.json(names)
  } catch (error) {
    res.status(500).json({ message: "Errore nel recupero dei nomi unici." })
  }
})

app.get("/api/records", (req, res) => {
  try {
    let names = req.query.name
    let sql = `SELECT * FROM weekly_records`
    const params = []

    if (names) {
      if (!Array.isArray(names)) names = [names]
      const placeholders = names.map(() => "?").join(", ")
      sql += ` WHERE name IN (${placeholders})`
      params.push(...names)
    }

    sql += `
      ORDER BY 
        CAST(SUBSTR(week_identifier, 1, 4) AS INTEGER) ASC,
        CAST(
          CASE 
            WHEN LENGTH(SUBSTR(week_identifier, INSTR(week_identifier, 'W') + 1)) = 1 
            THEN '0' || SUBSTR(week_identifier, INSTR(week_identifier, 'W') + 1)
            ELSE SUBSTR(week_identifier, INSTR(week_identifier, 'W') + 1)
          END 
        AS INTEGER) ASC,
        name ASC
    `

    const records = db.prepare(sql).all(...params)

    const pricesPath = path.join(__dirname, "public", "fuel-prices.json")
    let prices = {}
    try {
      prices = JSON.parse(fs.readFileSync(pricesPath, "utf8"))
    } catch (e) {
      return res.status(500).json({ message: "Errore lettura prezzi carburante." })
    }

    const updatedRecords = records.map(r => {
      const price = prices[r.fuel_type?.toLowerCase()] ?? 1.5
      const liters = r.kilometers / r.fuel_efficiency_km_per_liter
      const cost = liters * price
      return {
        ...r,
        fuel_price_per_liter: price,
        liters_consumed: liters,
        calculated_cost: cost
      }
    })

    res.json(updatedRecords)
  } catch (error) {
    res.status(500).json({ message: "Errore nel recupero dei record." })
  }
})

app.post("/api/records", async (req, res) => {
  const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = req.body
  if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
    return res.status(400).json({ message: "Tutti i campi sono obbligatori." })
  }

  const fuelTypeCapitalized = fuelType.charAt(0).toUpperCase() + fuelType.slice(1).toLowerCase()

  const existing = db.prepare("SELECT * FROM weekly_records WHERE name = ? AND week_identifier = ?").get(name, weekIdentifier)

  if (existing) {
    const newKm = existing.kilometers + kilometers
    db.prepare(`
      UPDATE weekly_records SET 
        kilometers = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newKm, existing.id)
    return res.json({ message: "Record aggiornato con successo (KM sommati)!" })
  }

  db.prepare(`
    INSERT INTO weekly_records 
      (name, week_identifier, kilometers, fuel_efficiency_km_per_liter, fuel_type) 
    VALUES (?, ?, ?, ?, ?)
  `).run(name, weekIdentifier, kilometers, fuelEfficiency, fuelTypeCapitalized)

  res.json({ message: "Nuovo record salvato con successo!" })
})

app.put("/api/records/:id", async (req, res) => {
  const id = req.params.id;
  const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = req.body;

  if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
    return res.status(400).json({ message: "Tutti i campi sono obbligatori." });
  }

  const fuelTypeCapitalized = fuelType.charAt(0).toUpperCase() + fuelType.slice(1).toLowerCase();

  const existingRecord = db.prepare("SELECT * FROM weekly_records WHERE id = ?").get(id);
  if (!existingRecord) {
    return res.status(404).json({ message: "Record da modificare non trovato." });
  }

  const targetRecord = db.prepare(`
    SELECT * FROM weekly_records WHERE name = ? AND week_identifier = ? AND id != ?
  `).get(name, weekIdentifier, id);

  if (targetRecord) {
    // Somma i km al record target ed elimina quello originale
    const newKm = targetRecord.kilometers + kilometers;
    db.prepare(`
      UPDATE weekly_records SET 
        kilometers = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newKm, targetRecord.id);

    // Elimina il record originale
    db.prepare("DELETE FROM weekly_records WHERE id = ?").run(id);

    return res.json({ message: "Record unificato con record esistente: KM sommati e record originale rimosso." });
  }

  // Se nessun record duplicato esiste, aggiorna normalmente
  db.prepare(`
    UPDATE weekly_records SET 
      name = ?, week_identifier = ?, kilometers = ?, fuel_efficiency_km_per_liter = ?, 
      fuel_type = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(name, weekIdentifier, kilometers, fuelEfficiency, fuelTypeCapitalized, id);

  res.json({ message: "Record aggiornato con successo!" });
});


app.delete("/api/records/:id", (req, res) => {
  const id = req.params.id
  try {
    const stmt = db.prepare("DELETE FROM weekly_records WHERE id = ?")
    const result = stmt.run(id)

    if (result.changes === 0) {
      return res.status(404).json({ message: "Record non trovato." })
    }

    res.json({ message: "Record eliminato con successo!" })
  } catch (error) {
    console.error("Errore eliminazione:", error)
    res.status(500).json({ message: "Errore durante l'eliminazione del record." })
  }
})

app.delete("/api/records", (req, res) => {
  try {
    let names = req.query.name
    let sql = `DELETE FROM weekly_records`
    const params = []

    if (names) {
      if (!Array.isArray(names)) names = [names]
      const placeholders = names.map(() => "?").join(", ")
      sql += ` WHERE name IN (${placeholders})`
      params.push(...names)
    }

    const stmt = db.prepare(sql)
    const info = stmt.run(...params)

    res.json({ message: `Eliminati ${info.changes} record.` })
  } catch (error) {
    console.error("Errore nell'eliminazione dei record:", error)
    res.status(500).json({ message: "Errore durante l'eliminazione dei record." })
  }
})

// Avvio server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server in esecuzione su http://localhost:${PORT}`)
  })
})
