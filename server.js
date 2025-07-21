const express = require("express")
const fs = require("fs")
const path = require("path")
const Database = require("better-sqlite3")
const app = express()

const PORT = process.env.PORT || 3000
let db

app.use(express.json())
app.use(express.static(path.join(__dirname, "public")))

async function initializeDatabase() {
  try {
    const scriptsDir = path.join(__dirname, "scripts")
    if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true })

    const schemaPath = path.join(scriptsDir, "init-db.sql")
    if (!fs.existsSync(schemaPath)) throw new Error(`File init-db.sql non trovato a ${schemaPath}`)

    const dbDir = path.join(__dirname, "db")
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

    const dbPath = path.join(dbDir, "database.db")
    db = new Database(dbPath)
    const schema = fs.readFileSync(schemaPath, "utf8")
    db.exec(schema)
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

    // Leggi i prezzi attuali
    const pricesPath = path.join(__dirname, "public", "fuel-prices.json")
    let prices = {}
    try {
      prices = JSON.parse(fs.readFileSync(pricesPath, "utf8"))
    } catch (e) {
      return res.status(500).json({ message: "Errore lettura prezzi carburante." })
    }

    // Ricalcola liters_consumed e calculated_cost con i prezzi attuali
    const updatedRecords = records.map(r => {
      const price = prices[r.fuel_type?.toLowerCase()] ?? 1.5
      const liters = r.kilometers / r.fuel_efficiency_km_per_liter
      const cost = liters * price
      return {
        ...r,
        liters_consumed: liters,
        calculated_cost: cost,
        fuel_price_per_liter: price
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

  const fuelRes = await fetch(`http://localhost:${PORT}/api/fuel-price?fuelType=${fuelType}`)
  if (!fuelRes.ok) return res.status(500).json({ message: "Errore nel prezzo carburante." })

  const { price: fuelPricePerLiter } = await fuelRes.json()
  const existing = db.prepare("SELECT * FROM weekly_records WHERE name = ? AND week_identifier = ?").get(name, weekIdentifier)

  if (existing) {
    const newKm = existing.kilometers + kilometers
    const newLiters = newKm / existing.fuel_efficiency_km_per_liter
    const newCost = newLiters * existing.fuel_price_per_liter
    db.prepare(`
      UPDATE weekly_records SET 
        kilometers = ?, liters_consumed = ?, calculated_cost = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newKm, newLiters, newCost, existing.id)
    return res.json({ message: "Record aggiornato con successo (KM sommati)!" })
  }

  const liters = kilometers / fuelEfficiency
  const cost = liters * fuelPricePerLiter

  db.prepare(`
    INSERT INTO weekly_records 
      (name, week_identifier, kilometers, fuel_efficiency_km_per_liter, fuel_type, fuel_price_per_liter, liters_consumed, calculated_cost) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, weekIdentifier, kilometers, fuelEfficiency, fuelType, fuelPricePerLiter, liters, cost)

  res.json({ message: "Nuovo record salvato con successo!" })
})

app.put("/api/records/:id", async (req, res) => {
  const id = req.params.id
  const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = req.body
  if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
    return res.status(400).json({ message: "Tutti i campi sono obbligatori." })
  }

  const fuelRes = await fetch(`http://localhost:${PORT}/api/fuel-price?fuelType=${fuelType}`)
  if (!fuelRes.ok) return res.status(500).json({ message: "Errore nel prezzo carburante." })

  const { price: fuelPricePerLiter } = await fuelRes.json()
  const liters = kilometers / fuelEfficiency
  const cost = liters * fuelPricePerLiter

  db.prepare(`
    UPDATE weekly_records SET 
      name = ?, week_identifier = ?, kilometers = ?, fuel_efficiency_km_per_liter = ?, 
      fuel_type = ?, fuel_price_per_liter = ?, liters_consumed = ?, calculated_cost = ?, 
      updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
  `).run(name, weekIdentifier, kilometers, fuelEfficiency, fuelType, fuelPricePerLiter, liters, cost, id)

  res.json({ message: "Record aggiornato con successo!" })
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
    res.status(500).json({ message: "Errore nell'eliminazione dei record." })
  }
})
// Avvio
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server in esecuzione su http://localhost:${PORT}`)
  })
})
