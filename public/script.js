document.addEventListener("DOMContentLoaded", () => {
    const recordForm = document.getElementById("recordForm")
    const recordsTableBody = document.getElementById("recordsTableBody")
    const totalKilometersSpan = document.getElementById("totalKilometers")
    const totalLitersConsumedSpan = document.getElementById("totalLitersConsumed")
    const totalCostSpan = document.getElementById("totalCost")
    const noRecordsMessage = document.getElementById("noRecordsMessage")
    const messageArea = document.getElementById("messageArea")

    // Elementi del Modal
    const editModal = document.getElementById("editModal")
    const closeButton = document.querySelector(".close-button")
    const editRecordForm = document.getElementById("editRecordForm")
    const editIdInput = document.getElementById("editId")
    const editNameInput = document.getElementById("editName")
    const editWeekIdentifierInput = document.getElementById("editWeekIdentifier")
    const editKilometersInput = document.getElementById("editKilometers")
    const editFuelEfficiencyInput = document.getElementById("editFuelEfficiency")
    const editFuelTypeSelect = document.getElementById("editFuelType")
    const updateButton = document.getElementById("updateButton")

    // Funzione per mostrare messaggi di notifica
    function showMessage(type, message) {
        const messageDiv = document.createElement("div")
        messageDiv.className = `message ${type}`
        messageDiv.textContent = message
        messageArea.appendChild(messageDiv)

        // Mostra il messaggio con un'animazione
        setTimeout(() => {
            messageDiv.classList.add("show")
        }, 10) // Piccolo ritardo per attivare la transizione CSS

        // Nascondi il messaggio dopo 3 secondi
        setTimeout(() => {
            messageDiv.classList.remove("show")
            messageDiv.addEventListener("transitionend", () => messageDiv.remove())
        }, 3000)
    }

    // Funzione per recuperare i record dal server
    async function fetchRecords() {
        try {
            const response = await fetch("/api/records")
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }
            const records = await response.json()
            renderRecords(records)
            updateTotals(records)
        } catch (error) {
            console.error("Errore nel recupero dei record:", error)
            showMessage("error", "Errore nel recupero dei record.")
        }
    }

    // Funzione per renderizzare i record nella tabella
    function renderRecords(records) {
        recordsTableBody.innerHTML = "" // Pulisci le righe esistenti
        if (records.length === 0) {
            noRecordsMessage.style.display = "block"
            return
        } else {
            noRecordsMessage.style.display = "none"
        }

        records.forEach((record) => {
            const row = recordsTableBody.insertRow()
            row.innerHTML = `
              <td>${record.name}</td>
              <td>${record.week_identifier}</td>
              <td>${record.kilometers.toFixed(2)}</td>
              <td>${record.fuel_type}</td>
              <td>${record.fuel_price_per_liter.toFixed(2)} €</td>
              <td>${record.liters_consumed.toFixed(2)} L</td>
              <td>${record.calculated_cost.toFixed(2)} €</td>
              <td class="actions">
                  <button class="edit-btn" data-id="${record.id}">Modifica</button>
                  <button class="delete-btn" data-id="${record.id}">Elimina</button>
              </td>
          `
        })

        // Aggiungi event listener per i bottoni di modifica ed eliminazione
        recordsTableBody.querySelectorAll(".edit-btn").forEach((button) => {
            button.addEventListener("click", (e) => handleEdit(e.target.dataset.id, records))
        })
        recordsTableBody.querySelectorAll(".delete-btn").forEach((button) => {
            button.addEventListener("click", (e) => handleDelete(e.target.dataset.id))
        })
    }

    // Funzione per aggiornare i totali
    function updateTotals(records) {
        const totalKilometers = records.reduce((sum, record) => sum + record.kilometers, 0)
        const totalLitersConsumed = records.reduce((sum, record) => sum + record.liters_consumed, 0)
        const totalCost = records.reduce((sum, record) => sum + record.calculated_cost, 0)

        totalKilometersSpan.textContent = totalKilometers.toFixed(2)
        totalLitersConsumedSpan.textContent = totalLitersConsumed.toFixed(2)
        totalCostSpan.textContent = totalCost.toFixed(2)
    }

    // Gestione invio form principale (Aggiungi Record)
    recordForm.addEventListener("submit", async (event) => {
        event.preventDefault()
        const submitButton = event.submitter // Il bottone che ha scatenato l'evento
        submitButton.disabled = true
        submitButton.textContent = "Salvataggio..."

        const formData = {
            name: document.getElementById("name").value,
            weekIdentifier: document.getElementById("weekIdentifier").value,
            kilometers: Number.parseFloat(document.getElementById("kilometers").value),
            fuelEfficiency: Number.parseFloat(document.getElementById("fuelEfficiency").value),
            fuelType: document.getElementById("fuelType").value,
        }

        if (
            !formData.name ||
            !formData.weekIdentifier ||
            isNaN(formData.kilometers) ||
            isNaN(formData.fuelEfficiency) ||
            !formData.fuelType
        ) {
            showMessage("error", "Per favore, compila tutti i campi correttamente.")
            submitButton.disabled = false
            submitButton.textContent = "Aggiungi Record"
            return
        }

        try {
            const response = await fetch("/api/records", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            })

            const result = await response.json()
            if (response.ok) {
                showMessage("success", result.message)
                recordForm.reset() // Resetta solo la form principale
                fetchRecords() // Ricarica e renderizza i record
            } else {
                showMessage("error", "Errore: " + result.message)
            }
        } catch (error) {
            console.error("Errore durante l'invio del form:", error)
            showMessage("error", "Errore durante il salvataggio del record.")
        } finally {
            submitButton.disabled = false
            submitButton.textContent = "Aggiungi Record"
        }
    })

    // Gestione apertura Modal di Modifica
    function handleEdit(id, records) {
        const recordToEdit = records.find((r) => r.id === Number(id))
        if (recordToEdit) {
            editIdInput.value = recordToEdit.id
            editNameInput.value = recordToEdit.name
            editWeekIdentifierInput.value = recordToEdit.week_identifier
            editKilometersInput.value = recordToEdit.kilometers
            editFuelEfficiencyInput.value = recordToEdit.fuel_efficiency_km_per_liter
            editFuelTypeSelect.value = recordToEdit.fuel_type

            editModal.style.display = "flex" // Mostra il modal
        }
    }

    // Gestione chiusura Modal
    closeButton.addEventListener("click", () => {
        editModal.style.display = "none"
    })

    window.addEventListener("click", (event) => {
        if (event.target === editModal) {
            editModal.style.display = "none"
        }
    })

    // Gestione invio form del Modal (Aggiorna Record)
    editRecordForm.addEventListener("submit", async (event) => {
        event.preventDefault()
        updateButton.disabled = true
        updateButton.textContent = "Aggiornamento..."

        const id = editIdInput.value
        const formData = {
            name: editNameInput.value,
            weekIdentifier: editWeekIdentifierInput.value,
            kilometers: Number.parseFloat(editKilometersInput.value),
            fuelEfficiency: Number.parseFloat(editFuelEfficiencyInput.value),
            fuelType: editFuelTypeSelect.value,
        }

        if (
            !formData.name ||
            !formData.weekIdentifier ||
            isNaN(formData.kilometers) ||
            isNaN(formData.fuelEfficiency) ||
            !formData.fuelType
        ) {
            showMessage("error", "Per favore, compila tutti i campi correttamente nel modal.")
            updateButton.disabled = false
            updateButton.textContent = "Aggiorna Record"
            return
        }

        try {
            const response = await fetch(`/api/records/${id}`, {
                method: "PUT", // Usiamo PUT per l'aggiornamento specifico
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(formData),
            })

            const result = await response.json()
            if (response.ok) {
                showMessage("success", result.message)
                editModal.style.display = "none" // Chiudi il modal
                fetchRecords() // Ricarica e renderizza i record
            } else {
                showMessage("error", "Errore: " + result.message)
            }
        } catch (error) {
            console.error("Errore durante l'aggiornamento del record:", error)
            showMessage("error", "Errore durante l'aggiornamento del record.")
        } finally {
            updateButton.disabled = false
            updateButton.textContent = "Aggiorna Record"
        }
    })

    // Gestione eliminazione record
    async function handleDelete(id) {
        if (confirm("Sei sicuro di voler eliminare questo record?")) {
            try {
                const response = await fetch(`/api/records/${id}`, {
                    method: "DELETE",
                })
                const result = await response.json()
                if (response.ok) {
                    showMessage("success", result.message)
                    fetchRecords() // Ricarica e renderizza i record
                } else {
                    showMessage("error", "Errore: " + result.message)
                }
            } catch (error) {
                console.error("Errore durante l'eliminazione del record:", error)
                showMessage("error", "Errore durante l'eliminazione del record.")
            }
        }
    }

    // Recupero iniziale dei record al caricamento della pagina
    fetchRecords()
})
