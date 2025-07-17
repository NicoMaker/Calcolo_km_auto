const http = require("http")
const fs = require("fs")
const path = require("path")
const url = require("url")
const Database = require("better-sqlite3")

let db // Variabile per la connessione al database

async function initializeDatabase() {
    try {
        console.log(`--- Diagnostica Inizializzazione Database ---`)
        console.log(`Percorso radice del progetto (__dirname): ${__dirname}`)

        const scriptsDir = path.join(__dirname, "scripts")
        console.log(`Percorso della cartella 'scripts': ${scriptsDir}`)

        // Verifica e crea la cartella 'scripts'
        if (fs.existsSync(scriptsDir)) {
            console.log(`La cartella 'scripts' ESISTE.`)
            try {
                const filesInScripts = fs.readdirSync(scriptsDir)
                console.log(`Contenuto della cartella 'scripts':`)
                if (filesInScripts.length === 0) {
                    console.log(`  (La cartella 'scripts' è vuota)`)
                } else {
                    filesInScripts.forEach((file) => console.log(`  - ${file}`))
                }
            } catch (err) {
                console.error(`Errore durante la lettura della cartella 'scripts': ${err.message}`)
            }
        } else {
            console.log(`La cartella 'scripts' NON ESISTE. Creazione in corso...`)
            fs.mkdirSync(scriptsDir, { recursive: true })
            console.log("Cartella 'scripts' creata.")
        }

        const schemaPath = path.join(scriptsDir, "init-db.sql")
        console.log(`Percorso atteso del file 'init-db.sql': ${schemaPath}`)

        // Verifica se il file 'init-db.sql' esiste nel percorso atteso
        if (!fs.existsSync(schemaPath)) {
            console.error(`ERRORE: Il file 'init-db.sql' NON ESISTE nel percorso atteso.`)
            throw new Error(
                `File init-db.sql non trovato a ${schemaPath}. Assicurati che esista e sia nominato correttamente.`,
            )
        } else {
            console.log(`Il file 'init-db.sql' ESISTE nel percorso atteso.`)
        }
        console.log(`--- Fine Diagnostica Inizializzazione Database ---`)

        // Tenta di creare/aprire il database
        try {
            // Crea la cartella 'db' se non esiste
            if (!fs.existsSync('./db')) {
                fs.mkdirSync('./db');
            }

            // Apre o crea il database dentro la cartella 'db'
            const db = new Database('./db/database.db', { verbose: console.log });
            console.log("File database 'database.db' aperto/creato con successo nella cartella 'db'.");
        } catch (dbError) {
            console.error("ERRORE: Impossibile aprire/creare il file database 'database.sqlite':", dbError)
            throw new Error("Impossibile inizializzare la connessione al database.")
        }

        const schema = fs.readFileSync(schemaPath, "utf8")
        db.exec(schema)
        console.log("Schema del database eseguito. Tabella 'weekly_records' inizializzata o già esistente (SQLite).")
    } catch (error) {
        console.error("Errore critico durante il processo di inizializzazione del database:", error)
        if (db && db.open) {
            db.close()
            console.log("Connessione al database chiusa a causa di un errore di inizializzazione.")
        }
        process.exit(1) // Termina il processo Node.js se il DB non può essere inizializzato
    }
}

const server = http.createServer(async (req, res) => {
    // Se il database non è stato inizializzato, non procedere con le richieste API
    if (!db || !db.open) {
        res.writeHead(503, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ message: "Server non pronto: Database non inizializzato." }))
        return
    }

    const parsedUrl = url.parse(req.url, true)
    const pathname = parsedUrl.pathname

    // API per i prezzi del carburante (mock)
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

    // API per i record settimanali (GET e POST)
    if (pathname === "/api/records") {
        if (req.method === "GET") {
            try {
                const stmt = db.prepare("SELECT * FROM weekly_records ORDER BY week_identifier DESC, name ASC;")
                const records = stmt.all()
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
            req.on("data", (chunk) => {
                body += chunk.toString()
            })
            req.on("end", async () => {
                try {
                    const { name, weekIdentifier, kilometers, fuelEfficiency, fuelType } = JSON.parse(body)

                    if (!name || !weekIdentifier || isNaN(kilometers) || isNaN(fuelEfficiency) || !fuelType) {
                        res.writeHead(400, { "Content-Type": "application/json" })
                        res.end(JSON.stringify({ message: "Tutti i campi sono obbligatori." }))
                        return
                    }

                    // Fetch fuel price from internal API (simulated)
                    const PORT = process.env.PORT || 3000
                    const fuelPriceRes = await fetch(`http://localhost:${PORT}/api/fuel-price?fuelType=${fuelType}`)
                    if (!fuelPriceRes.ok) {
                        throw new Error("Impossibile recuperare il prezzo del carburante dall'API interna")
                    }
                    const { price: fuelPricePerLiter } = await fuelPriceRes.json()

                    // Controlla se esiste già un record per questa settimana e veicolo
                    const existingRecord = db
                        .prepare("SELECT * FROM weekly_records WHERE name = ? AND week_identifier = ?;")
                        .get(name, weekIdentifier)

                    if (existingRecord) {
                        // Se il record esiste, somma i nuovi KM e ricalcola tutto
                        const newTotalKilometers = existingRecord.kilometers + kilometers
                        const newLitersConsumed = newTotalKilometers / existingRecord.fuel_efficiency_km_per_liter
                        const newCalculatedCost = newLitersConsumed * existingRecord.fuel_price_per_liter

                        db.prepare(
                            `UPDATE weekly_records SET 
                           kilometers = ?, 
                           liters_consumed = ?, 
                           calculated_cost = ?, 
                           updated_at = CURRENT_TIMESTAMP 
                       WHERE id = ?;`,
                        ).run(newTotalKilometers, newLitersConsumed, newCalculatedCost, existingRecord.id)
                        res.writeHead(200, { "Content-Type": "application/json" })
                        res.end(JSON.stringify({ message: "Record aggiornato con successo (KM sommati)!" }))
                    } else {
                        // Altrimenti, inserisci un nuovo record
                        const litersConsumed = kilometers / fuelEfficiency
                        const calculatedCost = litersConsumed * fuelPricePerLiter

                        db.prepare(
                            `INSERT INTO weekly_records (name, week_identifier, kilometers, fuel_efficiency_km_per_liter, fuel_type, fuel_price_per_liter, liters_consumed, calculated_cost)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
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
                    console.error("Errore durante l'aggiunta/aggiornamento del record:", error)
                    res.writeHead(500, { "Content-Type": "application/json" })
                    res.end(JSON.stringify({ message: "Errore durante il salvataggio del record." }))
                }
            })
            return
        }
    }

    // API per l'aggiornamento di un record specifico (PUT)
    if (pathname.startsWith("/api/records/") && req.method === "PUT") {
        const id = pathname.split("/").pop()
        let body = ""
        req.on("data", (chunk) => {
            body += chunk.toString()
        })
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
                if (!fuelPriceRes.ok) {
                    throw new Error("Impossibile recuperare il prezzo del carburante dall'API interna")
                }
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
                   WHERE id = ?;`,
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
                console.error("Errore durante l'aggiornamento del record:", error)
                res.writeHead(500, { "Content-Type": "application/json" })
                res.end(JSON.stringify({ message: "Errore durante l'aggiornamento del record." }))
            }
        })
        return
    }

    // API per l'eliminazione di un record specifico (DELETE)
    if (pathname.startsWith("/api/records/") && req.method === "DELETE") {
        const id = pathname.split("/").pop()
        try {
            const stmt = db.prepare("DELETE FROM weekly_records WHERE id = ?;")
            stmt.run(id)
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ message: "Record eliminato con successo!" }))
        } catch (error) {
            console.error("Errore durante l'eliminazione del record:", error)
            res.writeHead(500, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ message: "Errore durante l'eliminazione del record." }))
        }
        return
    }

    // Servire file statici
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
                res.end("Spiacente, verifica con l'amministratore del sito per l'errore: " + error.code + " ..\n")
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
        console.log(`Server in esecuzione sulla porta ${PORT}`)
        console.log(`Accedi all'app su http://localhost:${PORT}`)
    })
})
