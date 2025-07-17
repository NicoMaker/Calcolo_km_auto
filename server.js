const http = require("http")
const fs = require("fs")
const path = require("path")
const url = require("url")
const Database = require("better-sqlite3")

let db

async function initializeDatabase() {
  try {
    console.log(`--- Diagnostica Inizializzazione Database ---`)
    console.log(`Percorso radice del progetto (__dirname): ${__dirname}`)

    const scriptsDir = path.join(__dirname, "scripts")
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true })
      console.log("Cartella 'scripts' creata.")
    }

    const schemaPath = path.join(scriptsDir, "init-db.sql")
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`File init-db.sql non trovato a ${schemaPath}`)
    }

    const dbDir = path.join(__dirname, "db")
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true })
    }

    const dbPath = path.join(dbDir, "database.db")
    db = new Database(dbPath, { verbose: console.log })
    const schema = fs.readFileSync(schemaPath, "utf8")
    db.exec(schema)
    console.log("Database inizializzato con successo.")
  } catch (error) {
    console.error("Errore durante l'inizializzazione del database:", error)
    if (db && db.open) db.close()
    process.exit(1)
  }
}

const server = http.createServer(async (req, res) => {
  if (!db || !db.open) {
    res.writeHead(503, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ message: "Server non pronto: Database non inizializzato." }))
    return
  }

  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname

  if (pathname === "/api/fuel-price" && req.method === "GET") {
    const fuelType = parsedUrl.query.fuelType
    let price = 0
    switch (fuelType?.toLowerCase()) {
      case "benzina":
        price = 1.85
        break
      case "diesel":
        price = 1.7
        break
      case "gpl":
        price = 0.8
        break
      case "metano":
        price = 1.3
        break
      case "elettrico":
        price = 0.25
        break
      default:
        price = 1.5
    }
    res.writeHead(200, { "Content-Type": "application/json" })
    res.end(JSON.stringify({ price }))
    return
  }

  if (pathname === "/api/names" && req.method === "GET") {
    try {
      const stmt = db.prepare("SELECT DISTINCT name FROM weekly_records ORDER BY name ASC;")
      const names = stmt.all().map((row) => row.name)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(names))
    } catch (error) {
      console.error("Errore nel recupero dei nomi unici:", error)
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ message: "Errore nel recupero dei nomi unici." }))
    }
    return
  }

  if (pathname === "/api/records") {
    if (req.method === "GET") {
      try {
        let nameFilters = parsedUrl.query.name
        let sql = `SELECT * FROM weekly_records`
        const params = []

        if (nameFilters) {
          if (!Array.isArray(nameFilters)) nameFilters = [nameFilters]
          if (nameFilters.length > 0) {
            const placeholders = nameFilters.map(() => "?").join(", ")
            sql += ` WHERE name IN (${placeholders})`
            params.push(...nameFilters)
          }
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
            name ASC;
        `

        const stmt = db.prepare(sql)
        const records = stmt.all(...params)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(records))
      } catch (error) {
        console.error("Errore nel recupero dei record:", error)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ message: "Errore nel recupero dei record." }))
      }
      return
    }

    if (req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => (body += chunk.toString()))
      req.on("end", async () => {
        try {
          const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = JSON.parse(body)

          if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
            res.writeHead(400, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ message: "Tutti i campi sono obbligatori." }))
            return
          }

          const PORT = process.env.PORT || 3000
          const fuelPriceRes = await fetch(`http://localhost:${PORT}/api/fuel-price?fuelType=${fuelType}`)
          if (!fuelPriceRes.ok) throw new Error("Errore nel recupero del prezzo carburante.")
          const { price: fuelPricePerLiter } = await fuelPriceRes.json()

          const existingRecord = db
            .prepare("SELECT * FROM weekly_records WHERE name = ? AND week_identifier = ?")
            .get(name, weekIdentifier)

          if (existingRecord) {
            const newTotalKilometers = existingRecord.kilometers + kilometers
            const newLitersConsumed = newTotalKilometers / existingRecord.fuel_efficiency_km_per_liter
            const newCalculatedCost = newLitersConsumed * existingRecord.fuel_price_per_liter

            db.prepare(
              `UPDATE weekly_records SET 
                kilometers = ?, 
                liters_consumed = ?, 
                calculated_cost = ?, 
                updated_at = CURRENT_TIMESTAMP 
              WHERE id = ?`,
            ).run(newTotalKilometers, newLitersConsumed, newCalculatedCost, existingRecord.id)

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ message: "Record aggiornato con successo (KM sommati)!" }))
          } else {
            const litersConsumed = kilometers / fuelEfficiency
            const calculatedCost = litersConsumed * fuelPricePerLiter

            db.prepare(
              `INSERT INTO weekly_records 
                (name, week_identifier, kilometers, fuel_efficiency_km_per_liter, fuel_type, fuel_price_per_liter, liters_consumed, calculated_cost) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ).run(
              name,
              weekIdentifier,
              kilometers,
              fuelEfficiency,
              fuelType,
              fuelPricePerLiter,
              litersConsumed,
              calculatedCost,
            )

            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ message: "Nuovo record salvato con successo!" }))
          }
        } catch (error) {
          console.error("Errore nel salvataggio del record:", error)
          res.writeHead(500, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ message: "Errore durante il salvataggio del record." }))
        }
      })
      return
    }
  }

  if (pathname.startsWith("/api/records/") && req.method === "PUT") {
    const id = pathname.split("/").pop()
    let body = ""
    req.on("data", (chunk) => (body += chunk.toString()))
    req.on("end", async () => {
      try {
        const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = JSON.parse(body)

        if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
          res.writeHead(400, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ message: "Tutti i campi sono obbligatori." }))
          return
        }

        const PORT = process.env.PORT || 3000
        const fuelPriceRes = await fetch(`http://localhost:${PORT}/api/fuel-price?fuelType=${fuelType}`)
        if (!fuelPriceRes.ok) throw new Error("Errore nel recupero del prezzo carburante.")
        const { price: fuelPricePerLiter } = await fuelPriceRes.json()

        const litersConsumed = kilometers / fuelEfficiency
        const calculatedCost = litersConsumed * fuelPricePerLiter

        db.prepare(
          `UPDATE weekly_records SET 
            name = ?, 
            week_identifier = ?, 
            kilometers = ?, 
            fuel_efficiency_km_per_liter = ?, 
            fuel_type = ?, 
            fuel_price_per_liter = ?, 
            liters_consumed = ?, 
            calculated_cost = ?, 
            updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?`,
        ).run(
          name,
          weekIdentifier,
          kilometers,
          fuelEfficiency,
          fuelType,
          fuelPricePerLiter,
          litersConsumed,
          calculatedCost,
          id,
        )

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ message: "Record aggiornato con successo!" }))
      } catch (error) {
        console.error("Errore aggiornamento record:", error)
        res.writeHead(500, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ message: "Errore durante l'aggiornamento del record." }))
      }
    })
    return
  }

  if (pathname.startsWith("/api/records/") && req.method === "DELETE") {
    const id = pathname.split("/").pop()
    try {
      const stmt = db.prepare("DELETE FROM weekly_records WHERE id = ?;")
      stmt.run(id)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ message: "Record eliminato con successo!" }))
    } catch (error) {
      console.error("Errore eliminazione record:", error)
      res.writeHead(500, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ message: "Errore durante l'eliminazione del record." }))
    }
    return
  }

  // Static file serving
  const filePath = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname)
  const extname = String(path.extname(filePath)).toLowerCase()
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
  }

  const contentType = mimeTypes[extname] || "application/octet-stream"

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" })
        res.end("<h1>404 Not Found</h1>", "utf-8")
      } else {
        res.writeHead(500)
        res.end("Errore server interno: " + error.code)
      }
    } else {
      res.writeHead(200, { "Content-Type": contentType })
      res.end(content, "utf-8")
    }
  })
})

const PORT = process.env.PORT || 3000

initializeDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server in esecuzione su http://localhost:${PORT}`)
  })
})
