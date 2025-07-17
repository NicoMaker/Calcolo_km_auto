console.log("JS caricato!")

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded event fired.") // LOG 2: Verifica che il DOM sia pronto

  const recordsTableBody = document.getElementById("recordsTableBody")
  const totalKilometersSpan = document.getElementById("totalKilometers")
  const totalLitersConsumedSpan = document.getElementById("totalLitersConsumed")
  const totalCostSpan = document.getElementById("totalCost")
  const noRecordsMessage = document.getElementById("noRecordsMessage")
  const messageArea = document.getElementById("messageArea")

  // Elementi del Modal di Aggiunta
  const addModal = document.getElementById("addModal")
  const openAddModalButton = document.getElementById("openAddModalButton")
  const addRecordForm = document.getElementById("addRecordForm")
  const addSubmitButton = document.getElementById("addSubmitButton")
  const addNameInput = document.getElementById("addName")
  const addWeekIdentifierInput = document.getElementById("addWeekIdentifier")
  const addKilometersInput = document.getElementById("addKilometers")
  const addFuelEfficiencyInput = document.getElementById("addFuelEfficiency")
  const addFuelTypeSelect = document.getElementById("addFuelType")

  // Elementi del Modal di Modifica
  const editModal = document.getElementById("editModal")
  const editRecordForm = document.getElementById("editRecordForm")
  const updateButton = document.getElementById("updateButton")
  const editIdInput = document.getElementById("editId")
  const editNameInput = document.getElementById("editName")
  const editWeekIdentifierInput = document.getElementById("editWeekIdentifier")
  const editKilometersInput = document.getElementById("editKilometers")
  const editFuelEfficiencyInput = document.getElementById("editFuelEfficiency")
  const editFuelTypeSelect = document.getElementById("editFuelType")

  // Elementi del Modal di Conferma Eliminazione
  const deleteConfirmModal = document.getElementById("deleteConfirmModal")
  const confirmDeleteButton = document.getElementById("confirmDeleteButton")
  const cancelDeleteButton = document.getElementById("cancelDeleteButton")
  let recordToDeleteId = null // Variabile per memorizzare l'ID da eliminare

  // Elementi del Modal di Conferma Eliminazione Multipla
  const deleteAllConfirmModal = document.getElementById("deleteAllConfirmModal")
  const deleteAllConfirmText = document.getElementById("deleteAllConfirmText")
  const confirmDeleteAllButton = document.getElementById("confirmDeleteAllButton")
  const cancelDeleteAllButton = document.getElementById("cancelDeleteAllButton")

  // Bottone elimina tutti/filtrati
  const deleteAllButton = document.getElementById("deleteAllButton")
  let deleteAllMode = "filtered" // "filtered" o "all"
  deleteAllButton.addEventListener("click", () => {
    if (currentNameFilter.length === 0) {
      deleteAllConfirmText.textContent = "Sei sicuro di voler eliminare TUTTI i record? Questa azione non può essere annullata.";
      deleteAllMode = "all"
    } else {
      deleteAllConfirmText.textContent = "Sei sicuro di voler eliminare tutti i record filtrati? Questa azione non può essere annullata.";
      deleteAllMode = "filtered"
    }
    toggleModal(deleteAllConfirmModal, true)
  })

  confirmDeleteAllButton.addEventListener("click", async () => {
    confirmDeleteAllButton.disabled = true
    confirmDeleteAllButton.textContent = "Eliminazione..."
    try {
      let url = "/api/records"
      if (deleteAllMode === "filtered") {
        const queryParams = currentNameFilter.map((name) => `name=${encodeURIComponent(name)}`).join("&")
        url += `?${queryParams}`
      }
      const response = await fetch(url, { method: "DELETE" })
      const result = await response.json()
      if (response.ok) {
        showMessage("success", result.message)
        fetchRecords(currentNameFilter)
        populateNameFilter()
      } else {
        showMessage("error", "Errore: " + result.message)
      }
    } catch (error) {
      showMessage("error", "Errore durante l'eliminazione dei record.")
    } finally {
      toggleModal(deleteAllConfirmModal, false)
      confirmDeleteAllButton.disabled = false
      confirmDeleteAllButton.textContent = "Elimina"
    }
  })

  cancelDeleteAllButton.addEventListener("click", () => {
    toggleModal(deleteAllConfirmModal, false)
  })

  // Elementi del Filtro Personalizzato
  const filterDropdownButton = document.getElementById("filterDropdownButton")
  const filterDropdownContent = document.getElementById("filterDropdownContent")
  const selectAllVehiclesCheckbox = document.getElementById("selectAllVehicles")
  const vehicleOptionsContainer = document.getElementById("vehicleOptionsContainer")
  const applyFilterButton = document.getElementById("applyFilterButton")
  const clearFilterButton = document.getElementById("clearFilterButton")
  let currentNameFilter = [] // Variabile per memorizzare il filtro attivo (ora un array)

  // Force all modals to be hidden on load to prevent any stuck state
  addModal.style.display = "none"
  editModal.style.display = "none"
  deleteConfirmModal.style.display = "none"
  addModal.classList.remove("active")
  editModal.classList.remove("active")
  deleteConfirmModal.classList.remove("active")
  console.log("All modals forced to hidden state on DOMContentLoaded.") // NEW LOG

  // Funzione per mostrare/nascondere i modali
  function toggleModal(modalElement, show) {
    console.log(`Toggling modal: ${modalElement.id}, show: ${show}`) // LOG 3: Traccia l'apertura/chiusura dei modali
    if (show) {
      modalElement.style.display = "flex" // Rendi visibile per il layout
      // Piccolo ritardo per permettere a display:flex di applicarsi prima della transizione di opacità
      setTimeout(() => {
        modalElement.classList.add("active") // Aggiungi la classe active per la transizione di opacità/trasformazione
      }, 10)
    } else {
      modalElement.classList.remove("active") // Avvia la transizione di opacità/trasformazione
      // Per il debug, imposta immediatamente display a none.
      // Se questo risolve il problema, l'errore era nella gestione di transitionend o opacity.
      modalElement.style.display = "none"
    }
  }

  // Funzione per mostrare messaggi di notifica
  function showMessage(type, message) {
    console.log(`Showing message: ${type} - ${message}`) // LOG 4: Traccia i messaggi
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

  // Funzione per recuperare i record dal server con filtro
  async function fetchRecords(nameFilters = currentNameFilter) {
    console.log(`Fetching records with filters: "${nameFilters.join(", ")}"`) // LOG 5: Traccia il recupero dati
    currentNameFilter = nameFilters // Aggiorna il filtro corrente

    let url = "/api/records"
    if (nameFilters && nameFilters.length > 0) {
      const queryParams = nameFilters.map((name) => `name=${encodeURIComponent(name)}`).join("&")
      url += `?${queryParams}`
    }

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const records = await response.json()
      renderRecords(records)
      updateTotals(records) // Aggiorna i totali con i record filtrati
      console.log("Records fetched and rendered successfully.") // LOG 6: Conferma recupero
    } catch (error) {
      console.error("Errore nel recupero dei record:", error)
      showMessage("error", "Errore nel recupero dei record.")
    }
  }

  // Funzione per popolare il filtro a tendina con i nomi delle auto
  async function populateNameFilter() {
    try {
      const response = await fetch("/api/names") // API per i nomi unici
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const names = await response.json()

      vehicleOptionsContainer.innerHTML = "" // Pulisci le opzioni esistenti

      names.forEach((name) => {
        const label = document.createElement("label")
        label.className = "checkbox-item"
        const checkbox = document.createElement("input")
        checkbox.type = "checkbox"
        checkbox.value = name
        checkbox.id = `filter-${name.replace(/\s/g, "-")}` // ID unico per la checkbox

        // Pre-seleziona se il nome è nel filtro corrente
        if (currentNameFilter.includes(name)) {
          checkbox.checked = true
        }

        checkbox.addEventListener("change", updateSelectAllCheckbox)

        label.appendChild(checkbox)
        label.appendChild(document.createTextNode(name))
        vehicleOptionsContainer.appendChild(label)
      })

      updateSelectAllCheckbox() // Aggiorna lo stato di "Seleziona tutti" dopo aver popolato
    } catch (error) {
      console.error("Errore nel recupero dei nomi per il filtro:", error)
      showMessage("error", "Errore nel caricamento dei filtri nome.")
    }
  }

  // Funzione per aggiornare lo stato della checkbox "Seleziona tutti"
  function updateSelectAllCheckbox() {
    const allCheckboxes = Array.from(vehicleOptionsContainer.querySelectorAll('input[type="checkbox"]'))
    const allChecked = allCheckboxes.every((cb) => cb.checked)
    selectAllVehiclesCheckbox.checked = allChecked
  }

  // Funzione per renderizzare i record nella tabella
  function renderRecords(records) {
    recordsTableBody.innerHTML = "" // Pulisci le righe esistenti
    if (records.length === 0) {
      noRecordsMessage.style.display = "block"
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
      button.addEventListener("click", (e) => {
        console.log("Edit button clicked for ID:", e.target.dataset.id) // LOG 7: Traccia clic modifica
        handleEdit(e.target.dataset.id, records)
      })
    })
    recordsTableBody.querySelectorAll(".delete-btn").forEach((button) => {
      button.addEventListener("click", (e) => {
        console.log("Delete button clicked for ID:", e.target.dataset.id) // LOG 8: Traccia clic elimina
        openDeleteConfirmModal(e.target.dataset.id)
      })
    })
  }

  // Funzione per aggiornare i totali (ora basata sui record passati, che saranno già filtrati)
  function updateTotals(records) {
    const totalKilometers = records.reduce((sum, record) => sum + record.kilometers, 0)
    const totalLitersConsumed = records.reduce((sum, record) => sum + record.liters_consumed, 0)
    const totalCost = records.reduce((sum, record) => sum + record.calculated_cost, 0)

    totalKilometersSpan.textContent = totalKilometers.toFixed(2)
    totalLitersConsumedSpan.textContent = totalLitersConsumed.toFixed(2)
    totalCostSpan.textContent = totalCost.toFixed(2)
  }

  // --- Gestione Modal di Aggiunta ---
  openAddModalButton.addEventListener("click", () => {
    console.log("Open Add Modal button clicked.") // LOG 9: Traccia clic "Aggiungi Nuovo Record"
    addRecordForm.reset() // Resetta la form quando si apre il modale
    toggleModal(addModal, true)
  })

  addRecordForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    console.log("Add Record Form submitted.") // LOG 10: Traccia submit form aggiunta
    addSubmitButton.disabled = true
    addSubmitButton.textContent = "Salvataggio..."

    const formData = {
      name: addNameInput.value,
      weekIdentifier: addWeekIdentifierInput.value,
      kilometers: Number.parseFloat(addKilometersInput.value),
      fuelEfficiency: Number.parseFloat(addFuelEfficiencyInput.value),
      fuelType: addFuelTypeSelect.value,
    }

    if (
      !formData.name ||
      !formData.weekIdentifier ||
      isNaN(formData.kilometers) ||
      isNaN(formData.fuelEfficiency) ||
      !formData.fuelType
    ) {
      showMessage("error", "Per favore, compila tutti i campi correttamente nel modale di aggiunta.")
      addSubmitButton.disabled = false
      addSubmitButton.textContent = "Aggiungi Record"
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
        toggleModal(addModal, false) // Chiudi il modale
        fetchRecords(currentNameFilter) // Ricarica e renderizza i record con il filtro corrente
        populateNameFilter() // Aggiorna il filtro nomi
      } else {
        showMessage("error", "Errore: " + result.message)
      }
    } catch (error) {
      console.error("Errore durante l'invio del form di aggiunta:", error)
      showMessage("error", "Errore durante il salvataggio del record.")
    } finally {
      addSubmitButton.disabled = false
      addSubmitButton.textContent = "Aggiungi Record"
    }
  })

  // --- Gestione Modal di Modifica ---
  function handleEdit(id, records) {
    const recordToEdit = records.find((r) => r.id === Number(id))
    if (recordToEdit) {
      editIdInput.value = recordToEdit.id
      editNameInput.value = recordToEdit.name
      editWeekIdentifierInput.value = recordToEdit.week_identifier
      editKilometersInput.value = recordToEdit.kilometers
      editFuelEfficiencyInput.value = recordToEdit.fuel_efficiency_km_per_liter
      editFuelTypeSelect.value = recordToEdit.fuel_type
      toggleModal(editModal, true) // Mostra il modale di modifica
    }
  }

  editRecordForm.addEventListener("submit", async (event) => {
    event.preventDefault()
    console.log("Edit Record Form submitted.") // LOG 11: Traccia submit form modifica
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
      showMessage("error", "Per favor, compila tutti i campi correttamente nel modal di modifica.")
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
        toggleModal(editModal, false) // Chiudi il modale
        fetchRecords(currentNameFilter) // Ricarica e renderizza i record con il filtro corrente
        populateNameFilter() // Aggiorna il filtro nomi
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

  // --- Gestione Modal di Conferma Eliminazione ---
  function openDeleteConfirmModal(id) {
    console.log("Opening delete confirmation modal for ID:", id) // LOG 12: Traccia apertura conferma eliminazione
    recordToDeleteId = id
    toggleModal(deleteConfirmModal, true)
  }

  confirmDeleteButton.addEventListener("click", async () => {
    console.log("Confirm Delete button clicked.") // LOG 13: Traccia clic conferma eliminazione
    if (recordToDeleteId) {
      confirmDeleteButton.disabled = true
      confirmDeleteButton.textContent = "Eliminazione..."

      try {
        const response = await fetch(`/api/records/${recordToDeleteId}`, {
          method: "DELETE",
        })
        const result = await response.json()
        if (response.ok) {
          showMessage("success", result.message)
          fetchRecords(currentNameFilter) // Ricarica e renderizza i record con il filtro corrente
          populateNameFilter() // Aggiorna il filtro nomi
        } else {
          showMessage("error", "Errore: " + result.message)
        }
      } catch (error) {
        console.error("Errore durante l'eliminazione del record:", error)
        showMessage("error", "Errore durante l'eliminazione del record.")
      } finally {
        toggleModal(deleteConfirmModal, false) // Chiudi il modale
        recordToDeleteId = null
        confirmDeleteButton.disabled = false
        confirmDeleteButton.textContent = "Elimina"
      }
    }
  })

  cancelDeleteButton.addEventListener("click", () => {
    console.log("Cancel Delete button clicked.") // LOG 14: Traccia clic annulla eliminazione
    toggleModal(deleteConfirmModal, false)
    recordToDeleteId = null
  })

  // --- Gestione Chiusura Modali (generica) ---
  document.querySelectorAll(".close-button").forEach((button) => {
    button.addEventListener("click", (event) => {
      console.log("Close button clicked.") // LOG 15: Traccia clic chiusura modale
      const modalToCloseId = event.target.dataset.modalId // Usiamo data-modal-id
      const modalToClose = document.getElementById(modalToCloseId)
      if (modalToClose) {
        toggleModal(modalToClose, false)
      }
    })
  })

  window.addEventListener("click", (event) => {
    console.log("Window click event. Target ID:", event.target.id, "Target Classes:", event.target.className) // Updated LOG
    if (event.target === addModal) {
      console.log("Clicked outside addModal.")
      toggleModal(addModal, false)
    }
    if (event.target === editModal) {
      console.log("Clicked outside editModal.")
      toggleModal(editModal, false)
    }
    if (event.target === deleteConfirmModal) {
      console.log("Clicked outside deleteConfirmModal.")
      toggleModal(deleteConfirmModal, false)
    }
    // Chiudi il dropdown del filtro se si clicca fuori
    if (!filterDropdownContent.contains(event.target) && event.target !== filterDropdownButton) {
      filterDropdownContent.classList.remove("show")
      filterDropdownButton.classList.remove("active")
    }
  })

  // --- Gestione Filtri Personalizzati ---
  filterDropdownButton.addEventListener("click", () => {
    filterDropdownContent.classList.toggle("show")
    filterDropdownButton.classList.toggle("active")
  })

  selectAllVehiclesCheckbox.addEventListener("change", (event) => {
    const isChecked = event.target.checked
    const allCheckboxes = vehicleOptionsContainer.querySelectorAll('input[type="checkbox"]')
    allCheckboxes.forEach((cb) => {
      cb.checked = isChecked
    })
  })

  applyFilterButton.addEventListener("click", () => {
    const selectedNames = Array.from(vehicleOptionsContainer.querySelectorAll('input[type="checkbox"]:checked')).map(
      (cb) => cb.value,
    )
    fetchRecords(selectedNames)
    filterDropdownContent.classList.remove("show") // Chiudi il dropdown dopo l'applicazione
    filterDropdownButton.classList.remove("active")
  })

  clearFilterButton.addEventListener("click", () => {
    selectAllVehiclesCheckbox.checked = false
    const allCheckboxes = vehicleOptionsContainer.querySelectorAll('input[type="checkbox"]')
    allCheckboxes.forEach((cb) => {
      cb.checked = false // Deseleziona tutte le opzioni
    })
    fetchRecords([]) // Richiama i record senza filtro
    filterDropdownContent.classList.remove("show") // Chiudi il dropdown dopo la pulizia
    filterDropdownButton.classList.remove("active")
  })

  // Recupero iniziale dei record e popolamento filtro al caricamento della pagina
  fetchRecords()
  populateNameFilter()
})
