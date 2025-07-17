document.addEventListener("DOMContentLoaded", () => {
    const recordForm = document.getElementById("recordForm")
    const recordsTableBody = document.getElementById("recordsTableBody")
    const totalKilometersSpan = document.getElementById("totalKilometers")
    const totalCostSpan = document.getElementById("totalCost")
    const submitButton = document.getElementById("submitButton")
    const noRecordsMessage = document.getElementById("noRecordsMessage")

    let editingRecordId = null

    async function fetchRecords() {
        try {
            const response = await fetch("/api/records")
            const records = await response.json()
            renderRecords(records)
            updateTotals(records)
        } catch (error) {
            console.error("Error fetching records:", error)
            alert("Errore nel recupero dei record.")
        }
    }

    function renderRecords(records) {
        recordsTableBody.innerHTML = ""
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
                <td>${record.calculated_cost.toFixed(2)} €</td>
                <td class="actions">
                    <button class="edit-btn" data-id="${record.id}">Modifica</button>
                    <button class="delete-btn" data-id="${record.id}">Elimina</button>
                </td>
            `
        })

        recordsTableBody.querySelectorAll(".edit-btn").forEach((button) => {
            button.addEventListener("click", (e) => handleEdit(e.target.dataset.id, records))
        })
        recordsTableBody.querySelectorAll(".delete-btn").forEach((button) => {
            button.addEventListener("click", (e) => handleDelete(e.target.dataset.id))
        })
    }

    function updateTotals(records) {
        const totalKilometers = records.reduce((sum, record) => sum + record.kilometers, 0)
        const totalCost = records.reduce((sum, record) => sum + record.calculated_cost, 0)
        totalKilometersSpan.textContent = totalKilometers.toFixed(2)
        totalCostSpan.textContent = totalCost.toFixed(2)
    }

    async function handleSubmit(event) {
        event.preventDefault()
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
            alert("Per favor, compila tutti i campi correttamente.")
            submitButton.disabled = false
            submitButton.textContent = editingRecordId ? "Aggiorna Record" : "Aggiungi Record"
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
                alert(result.message)
                recordForm.reset()
                editingRecordId = null
                submitButton.textContent = "Aggiungi Record"
                fetchRecords()
            } else {
                alert("Errore: " + result.message)
            }
        } catch (error) {
            console.error("Error submitting form:", error)
            alert("Errore durante il salvataggio del record.")
        } finally {
            submitButton.disabled = false
        }
    }

    function handleEdit(id, records) {
        const recordToEdit = records.find((r) => r.id === Number(id))
        if (recordToEdit) {
            document.getElementById("name").value = recordToEdit.name
            document.getElementById("weekIdentifier").value = recordToEdit.week_identifier
            document.getElementById("kilometers").value = recordToEdit.kilometers
            document.getElementById("fuelEfficiency").value = recordToEdit.fuel_efficiency_km_per_liter
            document.getElementById("fuelType").value = recordToEdit.fuel_type
            editingRecordId = id
            submitButton.textContent = "Aggiorna Record"
        }
    }

    async function handleDelete(id) {
        if (confirm("Sei sicuro di voler eliminare questo record?")) {
            try {
                const response = await fetch(`/api/records/${id}`, {
                    method: "DELETE",
                })
                const result = await response.json()
                if (response.ok) {
                    alert(result.message)
                    fetchRecords()
                } else {
                    alert("Errore: " + result.message)
                }
            } catch (error) {
                console.error("Error deleting record:", error)
                alert("Errore durante l'eliminazione del record.")
            }
        }
    }

    recordForm.addEventListener("submit", handleSubmit)

    fetchRecords()
})
