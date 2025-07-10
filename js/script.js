// Global variables
let app, db, cardCollection = [];
let currentView = 'list';
let currentSort = { field: null, direction: 'asc' };

// Add page specific variables
let isEditMode = false;
let editCardId = null;

// Add new variables to track collection page state
let collectionPageState = null;

// Pagination variables
let currentPage = 1;
let recordsPerPage = 50;
let filteredCards = [];

// Initialize Firebase with dynamic imports
async function initFirebase() {
    try {
        const firebaseApp = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const firestore = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const firebaseConfig = {
            apiKey: "{{FIREBASE_API_KEY}}",
            authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
            projectId: "{{FIREBASE_PROJECT_ID}}",
            storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
            messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
            appId: "{{FIREBASE_APP_ID}}"
        };

        app = firebaseApp.initializeApp(firebaseConfig);
        db = firestore.getFirestore(app);
        
        // Store references for later use
        window.firebaseRefs = {
            app,
            db,
            collection: firestore.collection,
            getDocs: firestore.getDocs,
            query: firestore.query,
            orderBy: firestore.orderBy,
            deleteDoc: firestore.deleteDoc,
            doc: firestore.doc,
            addDoc: firestore.addDoc,
            updateDoc: firestore.updateDoc
        };
        
        return true;
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return false;
    }
}

// Shared function to load collection from Firebase
async function loadCollectionFromFirebase() {
    try {
        if (!db) {
            throw new Error('Database reference is null or undefined');
        }
        
        const { collection, getDocs, query, orderBy } = window.firebaseRefs;
        
        const cardsCollection = collection(db, 'cards');
        const cardsQuery = query(cardsCollection, orderBy('dateAdded', 'desc'));
        const querySnapshot = await getDocs(cardsQuery);
        
        cardCollection = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            cardCollection.push({
                id: doc.id,
                ...data,
                dateAdded: data.dateAdded?.toDate?.() || new Date(data.dateAdded),
                quantity: data.quantity || 1
            });
        });
        
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.getElementById('mainContent');
        
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContentEl) mainContentEl.style.display = 'block';
        
        // Call appropriate display function based on current page
        if (isCollectionPage()) {
            updateCategoryFilter();
            displayCollection();
        } else if (isDashboardPage()) {
            displayInventory();
        }
        
    } catch (error) {
        console.error('Error loading collection:', error);
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            const errorHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 2rem;">
                    <h3>Error Loading Collection</h3>
                    <p><strong>Error:</strong> ${error.message}</p>
                    <p><strong>Code:</strong> ${error.code || 'Unknown'}</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
            loadingEl.innerHTML = errorHTML;
        }
    }
}

// Helper functions to determine current page
function isCollectionPage() {
    return window.location.pathname.includes('collection.html') || 
           document.getElementById('listContainer') !== null;
}

function isDashboardPage() {
    return window.location.pathname.includes('index.html') || 
           (window.location.pathname === '/' || window.location.pathname === '') ||
           document.getElementById('totalCards') !== null;
}

function isAddPage() {
    return window.location.pathname.includes('add.html') || 
           document.getElementById('cardForm') !== null ||
           document.querySelector('form[id="cardForm"]') !== null;
}

// Initialize collection page functionality
function initializeCollectionPage() {
    // Remove view toggle event listeners - always use list view
    const listView = document.querySelector('.cards-list');
    if (listView) {
        listView.style.display = 'block';
    }
    
    // Add event listeners for sorting
    document.querySelectorAll('.sortable-header').forEach(header => {
        header.addEventListener('click', function() {
            const sortField = this.getAttribute('data-sort');
            sortBy(sortField);
        });
    });
    
    // Add event listeners for filtering
    document.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('keyup', filterCollection);
        input.addEventListener('change', filterCollection);
    });
    
    // Add event listeners for controls
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        categoryFilter.addEventListener('change', filterCollection);
    }
    
    const clearFiltersBtn = document.querySelector('.clear-filters-btn');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAllFilters);
    }

    const exportBtn = document.querySelector('.export-csv-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToCSV);
    }
    
    // Add modal close functionality
    const modal = document.getElementById('cardModal');
    const closeBtn = document.querySelector('.close');
    
    if (closeBtn) {
        closeBtn.addEventListener('click', closeCardModal);
    }
    
    if (modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeCardModal();
            }
        });
    }
}

// ============================================================================
// ADD PAGE FUNCTIONS (for add.html)
// ============================================================================

function initializeYearDropdown() {
    const yearSelect = document.getElementById('year');
    if (!yearSelect) return;
    
    for (let year = 2025; year >= 1970; year--) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
    }
}

function checkEditMode() {
    const urlParams = new URLSearchParams(window.location.search);
    const editMode = urlParams.get('edit');
    
    if (editMode && localStorage.getItem('editCardData')) {
        isEditMode = true;
        editCardId = localStorage.getItem('editCardId');
        const cardData = JSON.parse(localStorage.getItem('editCardData'));
        
        const titleEl = document.querySelector('h1');
        const submitBtn = document.querySelector('.btn-primary');
        
        if (titleEl) titleEl.textContent = 'Edit Card';
        if (submitBtn) submitBtn.textContent = 'Update Card';
        
        // Add Cancel button for edit mode
        addCancelButton();
        
        populateForm(cardData);
        
        localStorage.removeItem('editCardData');
        localStorage.removeItem('editCardId');
    }
}

// Updated function to add Cancel button in edit mode with proper alignment and correct order
function addCancelButton() {
    const submitBtn = document.querySelector('.btn-primary');
    if (submitBtn && !document.getElementById('cancelBtn')) {
        // Add class to submit button for styling
        submitBtn.classList.add('with-cancel');
        
        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'button-container';
        
        // Create cancel button
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'btn';
        cancelBtn.id = 'cancelBtn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', cancelEdit);
        
        // Replace the submit button with the container
        const parent = submitBtn.parentNode;
        parent.insertBefore(buttonContainer, submitBtn);
        parent.removeChild(submitBtn);
        
        // Add buttons to container in correct order: Update Card first (left), Cancel second (right)
        buttonContainer.appendChild(submitBtn);
        buttonContainer.appendChild(cancelBtn);
    }
}

// New function to handle cancel edit
function cancelEdit() {
    // Reset edit mode
    isEditMode = false;
    editCardId = null;
    
    // Navigate back to collection page
    window.location.href = 'collection.html';
}

function populateForm(card) {
    const setFieldValue = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.value = value || '';
    };
    
    setFieldValue('category', card.category);
    setFieldValue('year', card.year);
    setFieldValue('product', card.product);
    setFieldValue('cardNumber', card.cardNumber);
    setFieldValue('player', card.player);
    setFieldValue('team', card.team);
    setFieldValue('quantity', card.quantity || 1);
    setFieldValue('rookieCard', card.rookieCard || 'N');
    
    // Handle grade field
    const gradeInput = document.getElementById('grade');
    const ungradedGrade = document.getElementById('ungradedGrade');
    if (card.grade && card.grade !== 'Ungraded') {
        if (gradeInput) gradeInput.value = card.grade;
    } else {
        if (ungradedGrade) ungradedGrade.checked = true;
        if (gradeInput) gradeInput.disabled = true;
    }
    
    // Handle base set field
    if (card.baseSet && card.baseSet !== 'N') {
        const baseSetSelect = document.getElementById('baseSetSelect');
        const baseSetText = document.getElementById('baseSetText');
        if (baseSetSelect && baseSetText) {
            baseSetSelect.value = 'Y';
            baseSetText.style.display = 'block';
            baseSetText.value = card.baseSet;
        }
    }
    
    // Handle parallel field
    if (card.parallel && card.parallel !== 'N') {
        const parallelSelect = document.getElementById('parallelSelect');
        const parallelText = document.getElementById('parallelText');
        if (parallelSelect && parallelText) {
            parallelSelect.value = 'Y';
            parallelText.style.display = 'block';
            parallelText.value = card.parallel;
        }
    }
    
    // Handle numbered field
    if (card.numbered && card.numbered !== 'N') {
        const numberedSelect = document.getElementById('numberedSelect');
        const numberedText = document.getElementById('numberedText');
        if (numberedSelect && numberedText) {
            numberedSelect.value = 'Y';
            numberedText.style.display = 'block';
            numberedText.value = card.numbered;
        }
    }

    // Handle insert field
    if (card.insert && card.insert !== 'N') {
        const insertSelect = document.getElementById('insertSelect');
        const insertText = document.getElementById('insertText');
        if (insertSelect && insertText) {
            insertSelect.value = 'Y';
            insertText.style.display = 'block';
            insertText.value = card.insert;
        }
    }

    // Handle estimated value field
    const estimatedValue = document.getElementById('estimatedValue');
    const unknownEstimatedValue = document.getElementById('unknownEstimatedValue');
    if (card.estimatedValue && card.estimatedValue !== 'Unknown') {
        if (estimatedValue) estimatedValue.value = card.estimatedValue;
    } else {
        if (unknownEstimatedValue) unknownEstimatedValue.checked = true;
        if (estimatedValue) estimatedValue.disabled = true;
    }
    
    setFieldValue('estimatedValueDate', card.estimatedValueDate);
    
    // Handle image variation field
    if (card.imageVariation && card.imageVariation !== 'N') {
        const imageVariationSelect = document.getElementById('imageVariationSelect');
        const imageVariationText = document.getElementById('imageVariationText');
        if (imageVariationSelect && imageVariationText) {
            imageVariationSelect.value = 'Y';
            imageVariationText.style.display = 'block';
            imageVariationText.value = card.imageVariation;
        }
    }

    setFieldValue('description', card.description);
    
    // Handle purchase date
    const purchaseDate = document.getElementById('purchaseDate');
    const unknownDate = document.getElementById('unknownDate');
    if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
        if (purchaseDate) purchaseDate.value = card.purchaseDate;
    } else {
        if (unknownDate) unknownDate.checked = true;
        if (purchaseDate) purchaseDate.disabled = true;
    }
    
    // Handle purchase cost
    const purchaseCost = document.getElementById('purchaseCost');
    const unknownCost = document.getElementById('unknownCost');
    if (card.purchaseCost && card.purchaseCost !== 'Unknown') {
        if (purchaseCost) purchaseCost.value = card.purchaseCost;
    } else {
        if (unknownCost) unknownCost.checked = true;
        if (purchaseCost) purchaseCost.disabled = true;
    }
}

function toggleBaseSetInput() {
    const select = document.getElementById('baseSetSelect');
    const text = document.getElementById('baseSetText');
    if (select && text) {
        text.style.display = select.value === 'Y' ? 'block' : 'none';
        if (select.value === 'Y') {
            text.value = 'Base Set';
        } else {
            text.value = '';
        }
    }
}

function toggleParallelInput() {
    const select = document.getElementById('parallelSelect');
    const text = document.getElementById('parallelText');
    if (select && text) {
        text.style.display = select.value === 'Y' ? 'block' : 'none';
        if (select.value === 'N') text.value = '';
    }
}

function toggleNumberedInput() {
    const select = document.getElementById('numberedSelect');
    const text = document.getElementById('numberedText');
    if (select && text) {
        text.style.display = select.value === 'Y' ? 'block' : 'none';
        if (select.value === 'N') text.value = '';
    }
}

function toggleInsertInput() {
    const select = document.getElementById('insertSelect');
    const text = document.getElementById('insertText');
    if (select && text) {
        text.style.display = select.value === 'Y' ? 'block' : 'none';
        if (select.value === 'N') text.value = '';
    }
}

function toggleEstimatedValueInput() {
    const checkbox = document.getElementById('unknownEstimatedValue');
    const valueInput = document.getElementById('estimatedValue');
    const dateInput = document.getElementById('estimatedValueDate');
    
    if (checkbox && valueInput) {
        valueInput.disabled = checkbox.checked;
        if (checkbox.checked) valueInput.value = '';
    }
    
    // Gray out the date field when Unknown is checked
    if (checkbox && dateInput) {
        dateInput.disabled = checkbox.checked;
        dateInput.style.opacity = checkbox.checked ? '0.5' : '1';
        if (checkbox.checked) dateInput.value = '';
    }
}

function toggleImageVariationInput() {
    const select = document.getElementById('imageVariationSelect');
    const text = document.getElementById('imageVariationText');
    if (select && text) {
        text.style.display = select.value === 'Y' ? 'block' : 'none';
        if (select.value === 'N') text.value = '';
    }
}

function toggleDateInput() {
    const checkbox = document.getElementById('unknownDate');
    const dateInput = document.getElementById('purchaseDate');
    if (checkbox && dateInput) {
        dateInput.disabled = checkbox.checked;
        if (checkbox.checked) dateInput.value = '';
    }
}

function toggleCostInput() {
    const checkbox = document.getElementById('unknownCost');
    const costInput = document.getElementById('purchaseCost');
    if (checkbox && costInput) {
        costInput.disabled = checkbox.checked;
        if (checkbox.checked) costInput.value = '';
    }
}

function toggleGradeInput() {
    const checkbox = document.getElementById('ungradedGrade');
    const gradeInput = document.getElementById('grade');
    if (checkbox && gradeInput) {
        gradeInput.disabled = checkbox.checked;
        if (checkbox.checked) gradeInput.value = '';
    }
}

async function addCard(event) {
    event.preventDefault();
    
    const getFieldValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    
    const card = {
        category: getFieldValue('category'),
        year: parseInt(getFieldValue('year')) || 0,
        product: getFieldValue('product'),
        cardNumber: getFieldValue('cardNumber'),
        baseSet: document.getElementById('baseSetSelect')?.value === 'Y' ? getFieldValue('baseSetText') : 'N',
        player: getFieldValue('player'),
        team: getFieldValue('team'),
        quantity: parseInt(getFieldValue('quantity')) || 1,
        rookieCard: getFieldValue('rookieCard'),
        parallel: document.getElementById('parallelSelect')?.value === 'Y' ? getFieldValue('parallelText') : 'N',
        numbered: document.getElementById('numberedSelect')?.value === 'Y' ? getFieldValue('numberedText') : 'N',
        insert: document.getElementById('insertSelect')?.value === 'Y' ? getFieldValue('insertText') : 'N',
        grade: document.getElementById('ungradedGrade')?.checked ? 'Ungraded' : (getFieldValue('grade') || 'Ungraded'),
        estimatedValue: document.getElementById('unknownEstimatedValue')?.checked ? 'Unknown' : (parseFloat(getFieldValue('estimatedValue')) || 0),
        estimatedValueDate: getFieldValue('estimatedValueDate'),
        imageVariation: document.getElementById('imageVariationSelect')?.value === 'Y' ? getFieldValue('imageVariationText') : 'N',
        description: getFieldValue('description'),
        purchaseDate: document.getElementById('unknownDate')?.checked ? 'Unknown' : getFieldValue('purchaseDate'),
        purchaseCost: document.getElementById('unknownCost')?.checked ? 'Unknown' : (parseFloat(getFieldValue('purchaseCost')) || 0)
    };

    try {
        if (isEditMode && editCardId) {
            const { updateDoc, doc } = window.firebaseRefs;
            await updateDoc(doc(db, 'cards', editCardId), card);
            showSuccessModal('Card updated successfully!', true);
            
            isEditMode = false;
            editCardId = null;
            
            const titleEl = document.querySelector('h1');
            const submitBtn = document.querySelector('.btn-primary');
            if (titleEl) titleEl.textContent = 'Add New Card';
            if (submitBtn) submitBtn.textContent = 'Add Card';
        } else {
            const { addDoc, collection } = window.firebaseRefs;
            card.dateAdded = new Date();
            const docRef = await addDoc(collection(db, 'cards'), card);
            console.log('Document written with ID: ', docRef.id);
            showSuccessModal('Card added successfully!', false);
        }
    } catch (error) {
        console.error('Error saving card:', error);
        alert('Error saving card: ' + error.message);
    }
}

// Updated Success modal functions - Fixed to show text properly
function showSuccessModal(message, isEdit) {
    const modal = document.getElementById('successModal');
    if (!modal) return;
    
    // More robust element selection
    let modalContent = modal.querySelector('.modal-content');
    let messageEl = modal.querySelector('.modal-content h3');
    let descriptionEl = modal.querySelector('.modal-content p');
    let buttonContainer = modal.querySelector('.modal-content > div:last-child');
    
    // If elements don't exist, create them
    if (!modalContent) {
        modalContent = document.createElement('div');
        modalContent.className = 'modal-content';
        modal.appendChild(modalContent);
    }
    
    if (!messageEl) {
        messageEl = document.createElement('h3');
        modalContent.appendChild(messageEl);
    }
    
    if (!descriptionEl) {
        descriptionEl = document.createElement('p');
        modalContent.appendChild(descriptionEl);
    }
    
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        modalContent.appendChild(buttonContainer);
    }
    
    if (messageEl && buttonContainer && modalContent) {
        if (isEdit) {
            // Add edit mode class for styling
            modalContent.classList.add('edit-mode');
            
            // Set the message text
            messageEl.textContent = 'Card Updated Successfully!';
            messageEl.style.display = 'block';
            
            // Hide description paragraph for edit mode
            if (descriptionEl) {
                descriptionEl.textContent = '';
                descriptionEl.style.display = 'none';
            }
            
            // Replace buttons with just Continue button for edit mode
            buttonContainer.innerHTML = `
                <button class="btn btn-primary" id="continueBtn">Continue</button>
            `;
            
            // Add event listener for Continue button
            const continueBtn = document.getElementById('continueBtn');
            if (continueBtn) {
                continueBtn.addEventListener('click', returnToCollection);
            }
        } else {
            // Remove edit mode class if it exists
            modalContent.classList.remove('edit-mode');
            
            // Set the message text
            messageEl.textContent = 'Card Added Successfully!';
            messageEl.style.display = 'block';
            
            // Show description paragraph for add mode
            if (descriptionEl) {
                descriptionEl.textContent = 'This card has been added to your collection. What would you like to do next?';
                descriptionEl.style.display = 'block';
            }
            
            // Keep original buttons for add mode
            buttonContainer.innerHTML = `
                <button class="btn btn-primary" id="addAnotherBtn">Add Another Card</button>
                <button class="btn" id="viewCollectionBtn">View Collection</button>
            `;
            
            // Add event listeners for original buttons
            const addAnotherBtn = document.getElementById('addAnotherBtn');
            const viewCollectionBtn = document.getElementById('viewCollectionBtn');
            
            if (addAnotherBtn) {
                addAnotherBtn.addEventListener('click', addAnotherCard);
            }
            
            if (viewCollectionBtn) {
                viewCollectionBtn.addEventListener('click', viewCollection);
            }
        }
    }
    
    modal.style.display = 'block';
}

// New function to return to collection page
function returnToCollection() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'none';
    
    // Navigate back to collection page
    window.location.href = 'collection.html';
}

function addAnotherCard() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'none';
    
    // Reset form
    const form = document.getElementById('cardForm');
    if (form) {
        form.reset();
        
        // Reset conditional fields
        const baseSetText = document.getElementById('baseSetText');
        const parallelText = document.getElementById('parallelText');
        const numberedText = document.getElementById('numberedText');
        const insertText = document.getElementById('insertText');
        const imageVariationText = document.getElementById('imageVariationText');
        const quantity = document.getElementById('quantity');
        
        if (baseSetText) baseSetText.style.display = 'none';
        if (parallelText) parallelText.style.display = 'none';
        if (numberedText) numberedText.style.display = 'none';
        if (insertText) insertText.style.display = 'none';
        if (imageVariationText) imageVariationText.style.display = 'none';
        if (quantity) quantity.value = 1;
        
        // Reset disabled states and opacity
        const estimatedValue = document.getElementById('estimatedValue');
        const estimatedValueDate = document.getElementById('estimatedValueDate');
        const purchaseDate = document.getElementById('purchaseDate');
        const purchaseCost = document.getElementById('purchaseCost');
        const gradeInput = document.getElementById('grade');
        
        if (estimatedValue) estimatedValue.disabled = false;
        if (estimatedValueDate) {
            estimatedValueDate.disabled = false;
            estimatedValueDate.style.opacity = '1';
        }
        if (purchaseDate) purchaseDate.disabled = false;
        if (purchaseCost) purchaseCost.disabled = false;
        if (gradeInput) gradeInput.disabled = false;
    }
}

function viewCollection() {
    window.location.href = 'collection.html';
}

// Updated CSV import function with corrected progress tracking - fixed to exclude header row
async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Show import dialog
    showImportDialog();
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        let successCount = 0;
        let errorCount = 0;
        // Calculate total data lines (excluding header row)
        let totalDataLines = lines.length - 1;
        // Remove empty lines from count
        let actualDataLines = 0;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() !== '') actualDataLines++;
        }
        totalDataLines = actualDataLines;
        
        let importLog = [];
        
        const { addDoc, collection } = window.firebaseRefs;
        
        // Update progress with correct total count (excluding header)
        updateImportProgress(0, totalDataLines, 0, 0);
        
        let processedCount = 0;
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const dataLineNumber = i; // Keep original line number for reference
            processedCount++; // Increment only for actual data rows
            
            try {
                const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
                // Updated CSV mapping for new column order
                const card = {
                    category: values[0] || '',
                    year: parseInt(values[1]) || 0,
                    product: values[2] || '',
                    cardNumber: values[3] || '',
                    baseSet: values[4] || 'N',
                    player: values[5] || '',
                    team: values[6] || '',
                    insert: values[7] || 'N',
                    parallel: values[8] || 'N',
                    numbered: values[9] ? values[9].replace(/^'/, '') : 'N',
                    rookieCard: values[10] || 'N',
                    imageVariation: values[11] || 'N',
                    quantity: parseInt(values[12]) || 1,
                    grade: values[13] || 'Ungraded',
                    purchaseDate: values[14] || 'Unknown',
                    purchaseCost: values[15] ? (values[15].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[15]) || 0) : 0,
                    estimatedValue: values[16] ? (values[16].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[16]) || 0) : 0,
                    estimatedValueDate: values[17] || '',
                    description: values[18] || '',
                    dateAdded: new Date()
                };
                
                await addDoc(collection(db, 'cards'), card);
                successCount++;
                
                // Format card details for the log
                let cardDetails = card.cardNumber || 'N/A';
                if (card.parallel && card.parallel !== 'N') {
                    cardDetails += ` | ${card.parallel}`;
                } else {
                    cardDetails += ' | N';
                }
                if (card.numbered && card.numbered !== 'N') {
                    cardDetails += ` | ${card.numbered}`;
                } else {
                    cardDetails += ' | N';
                }
                
                importLog.push({
                    line: dataLineNumber,
                    status: 'Success',
                    player: card.player,
                    details: cardDetails
                });
                
            } catch (error) {
                console.error('Error adding card on line', dataLineNumber, ':', error);
                errorCount++;
                
                // Format error card details
                let cardDetails = values[3] || 'N/A';
                if (values[8] && values[8] !== 'N') {
                    cardDetails += ` | ${values[8]}`;
                } else {
                    cardDetails += ' | N';
                }
                if (values[9] && values[9] !== 'N') {
                    cardDetails += ` | ${values[9]}`;
                } else {
                    cardDetails += ' | N';
                }
                
                importLog.push({
                    line: dataLineNumber,
                    status: 'Failed',
                    player: values[5] || 'Unknown',
                    details: cardDetails,
                    error: error.message,
                    rawData: lines[i]
                });
            }
            
            // Update progress (use processedCount for correct progress display)
            updateImportProgress(processedCount, totalDataLines, successCount, errorCount);
            
            // Small delay to allow UI updates
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Show completion
        showImportCompletion(successCount, errorCount, importLog);
        
        // Reset file input
        event.target.value = '';
    };
    reader.readAsText(file);
}

// Show import dialog - smaller for status tracking
function showImportDialog() {
    // Create import status modal if it doesn't exist
    let importModal = document.getElementById('importModal');
    if (!importModal) {
        importModal = document.createElement('div');
        importModal.id = 'importModal';
        importModal.className = 'modal';
        importModal.innerHTML = `
            <div class="modal-content import-status-modal-content">
                <h3>Import Status</h3>
                <div class="import-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progressFill"></div>
                    </div>
                    <div class="progress-text" id="progressText">Preparing import...</div>
                </div>
                <div class="import-stats" id="importStats">
                    <div class="stat-item">
                        <span class="stat-label">Processed:</span>
                        <span class="stat-value" id="processedCount">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Successful:</span>
                        <span class="stat-value success" id="successCount">0</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Failed:</span>
                        <span class="stat-value error" id="errorCount">0</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(importModal);
    }
    
    importModal.style.display = 'block';
}

// Update import progress
function updateImportProgress(current, total, successCount, errorCount) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const processedCountEl = document.getElementById('processedCount');
    const successCountEl = document.getElementById('successCount');
    const errorCountEl = document.getElementById('errorCount');
    
    if (progressFill && progressText && processedCountEl && successCountEl && errorCountEl) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        progressFill.style.width = percentage + '%';
        progressText.textContent = `Processing record ${current} of ${total}...`;
        processedCountEl.textContent = current;
        successCountEl.textContent = successCount;
        errorCountEl.textContent = errorCount;
    }
}

// Show import completion with updated headers and formatting - separate larger dialog with disabled outside click
function showImportCompletion(successCount, errorCount, importLog) {
    // Hide the status modal first
    const statusModal = document.getElementById('importModal');
    if (statusModal) {
        statusModal.style.display = 'none';
    }
    
    // Create or get completion modal
    let completionModal = document.getElementById('completionModal');
    if (!completionModal) {
        completionModal = document.createElement('div');
        completionModal.id = 'completionModal';
        completionModal.className = 'modal';
        document.body.appendChild(completionModal);
    }
    
    completionModal.innerHTML = `
        <div class="modal-content import-completion-modal-content">
            <h3>Import Completed!</h3>
            <div class="completion-stats">
                <div class="completion-stat success">
                    <div class="stat-number">${successCount}</div>
                    <div class="stat-label">Records Imported Successfully</div>
                </div>
                <div class="completion-stat error">
                    <div class="stat-number">${errorCount}</div>
                    <div class="stat-label">Records Not Imported Successfully</div>
                </div>
            </div>
            <div class="import-log">
                <h4>Import Log</h4>
                <div class="log-header">
                    <span class="log-header-line">Line</span>
                    <span class="log-header-status">Status</span>
                    <span class="log-header-player">Player</span>
                    <span class="log-header-details">Card Details (Card # | Parallel | Numbered)</span>
                </div>
                <div class="log-container" id="logContainer">
                    ${importLog.map(entry => `
                        <div class="log-entry ${entry.status.toLowerCase()}">
                            <span class="log-line">${entry.line}:</span>
                            <span class="log-status">${entry.status}</span>
                            <span class="log-player">${entry.player}</span>
                            <span class="log-details">${entry.details}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="import-actions">
                <button class="btn" id="downloadLogBtn">Download Log File</button>
                <button class="btn btn-primary" id="closeCompletionBtn">Close</button>
            </div>
        </div>
    `;
    
    // Add event listeners
    const downloadLogBtn = document.getElementById('downloadLogBtn');
    const closeCompletionBtn = document.getElementById('closeCompletionBtn');
    
    if (downloadLogBtn) {
        downloadLogBtn.addEventListener('click', () => downloadImportLog(importLog));
    }
    
    if (closeCompletionBtn) {
        closeCompletionBtn.addEventListener('click', () => {
            completionModal.style.display = 'none';
            // Reload collection if we're on collection page
            if (isCollectionPage()) {
                loadCollectionFromFirebase();
            }
        });
    }
    
    // Remove outside click listener to prevent closing
    completionModal.onclick = function(event) {
        // Do nothing - prevents closing when clicking outside
        event.stopPropagation();
    };
    
    completionModal.style.display = 'block';
}

// Download import log with updated header
function downloadImportLog(importLog) {
    const csvContent = [
        'Line,Status,Player,"Card Details (Card # | Parallel | Numbered)"',
        ...importLog.map(entry => 
            `${entry.line},"${entry.status}","${entry.player}","${entry.details}"`
        )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_log_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================================
// DASHBOARD/INVENTORY FUNCTIONS (for index.html) - UPDATED WITH CATEGORY FIELD
// ============================================================================

function displayInventory() {
    if (cardCollection.length === 0) {
        const mainContentEl = document.getElementById('mainContent');
        if (mainContentEl) {
            mainContentEl.innerHTML = `
                <div style="text-align: center; padding: 4rem 2rem;">
                    <h2>No Cards Found</h2>
                    <p style="color: #b0b0b0; margin: 1rem 0;">Your collection appears to be empty.</p>
                    <a href="add.html" class="btn btn-primary" style="display: inline-block; margin-top: 1rem; text-decoration: none; padding: 0.75rem 1.5rem; background: #4a7bc8; color: white; border-radius: 4px;">Add Your First Card</a>
                </div>
            `;
        }
        return;
    }
    
    updateSummaryStats();
    displayCategoryBreakdown();
    displayYearDistribution();
    displayTopProducts();
    displayTeamDistribution();
    displayExpensiveCards();
}

function updateSummaryStats() {
    const totalCards = cardCollection.length;
    // FIXED: Use estimatedValue instead of purchaseCost for total value
    const totalValue = cardCollection.reduce((sum, card) => {
        const value = card.estimatedValue;
        if (value === 'Unknown' || !value) return sum;
        return sum + parseFloat(value);
    }, 0);
    const rookieCards = cardCollection.filter(card => card.rookieCard === 'Y').length;
    const numberedCards = cardCollection.filter(card => card.numbered !== 'N').length;

    const totalCardsEl = document.getElementById('totalCards');
    const totalValueEl = document.getElementById('totalValue');
    const rookieCardsEl = document.getElementById('rookieCards');
    const numberedCardsEl = document.getElementById('numberedCards');

    if (totalCardsEl) totalCardsEl.textContent = totalCards.toLocaleString();
    if (totalValueEl) totalValueEl.textContent = `$${totalValue.toFixed(2)}`;
    if (rookieCardsEl) rookieCardsEl.textContent = rookieCards.toLocaleString();
    if (numberedCardsEl) numberedCardsEl.textContent = numberedCards.toLocaleString();
}

function displayCategoryBreakdown() {
    const categoryStats = {};
    cardCollection.forEach(card => {
        const category = card.category || 'Unknown';
        if (!categoryStats[category]) {
            categoryStats[category] = { count: 0, value: 0 };
        }
        categoryStats[category].count++;
        // FIXED: Use estimatedValue instead of purchaseCost
        const value = card.estimatedValue;
        if (value !== 'Unknown' && value) {
            categoryStats[category].value += parseFloat(value);
        }
    });

    const container = document.getElementById('categoryStats');
    if (container) {
        container.innerHTML = Object.entries(categoryStats).map(([category, stats]) => `
            <div class="category-item">
                <div class="category-name">${category}</div>
                <div class="category-count">${stats.count}</div>
                <div class="category-value">${stats.value.toFixed(2)}</div>
            </div>
        `).join('');
    }
}

function displayYearDistribution() {
    const yearStats = {};
    cardCollection.forEach(card => {
        const year = card.year || 'Unknown';
        yearStats[year] = (yearStats[year] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(yearStats), 1);
    const container = document.getElementById('yearChart');
    
    if (container) {
        const sortedYears = Object.entries(yearStats).sort((a, b) => {
            const yearA = parseInt(a[0]) || 0;
            const yearB = parseInt(b[0]) || 0;
            return yearA - yearB;
        });
        
        container.innerHTML = sortedYears.map(([year, count]) => {
            const height = Math.max((count / maxCount) * 150, 30);
            return `
                <div class="year-bar" title="${year}: ${count} cards">
                    <div class="year-bar-fill" style="height: ${height}px;">
                        ${count}
                    </div>
                    <div class="year-label">${year}</div>
                </div>
            `;
        }).join('');
    }
}

// Updated function to remove hyphen between product name and category
function displayTopProducts() {
    const productStats = {};
    cardCollection.forEach(card => {
        const productKey = `${card.year || 'Unknown'} ${card.product || 'Unknown'}`;
        const category = card.category || 'Unknown';
        const fullKey = `${productKey} ${category}`;
        productStats[fullKey] = (productStats[fullKey] || 0) + 1;
    });

    const topProducts = Object.entries(productStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12);

    const container = document.getElementById('productList');
    if (container) {
        container.innerHTML = topProducts.map(([product, count]) => `
            <div class="product-item">
                <div class="product-name">${product}</div>
                <div class="product-count">${count}</div>
            </div>
        `).join('');
    }
}

function displayTeamDistribution() {
    const teamStats = {};
    cardCollection.forEach(card => {
        const team = card.team || 'Unknown';
        teamStats[team] = (teamStats[team] || 0) + 1;
    });

    const sortedTeams = Object.entries(teamStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    const container = document.getElementById('teamGrid');
    if (container) {
        container.innerHTML = sortedTeams.map(([team, count]) => `
            <div class="team-item">
                <div class="team-name">${team}</div>
                <div class="team-count">${count}</div>
            </div>
        `).join('');
    }
}

// Updated function to show top 8 cards and remove hyphen between product name and category
function displayExpensiveCards() {
    // FIXED: Use estimatedValue instead of purchaseCost for expensive cards
    const expensiveCards = [...cardCollection]
        .filter(card => card.estimatedValue !== 'Unknown' && card.estimatedValue > 0)
        .sort((a, b) => parseFloat(b.estimatedValue) - parseFloat(a.estimatedValue))
        .slice(0, 8); // Changed from 6 to 8

    const container = document.getElementById('expensiveCards');
    if (container) {
        if (expensiveCards.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 2rem;">No cards with estimated value data yet.</p>';
            return;
        }

        container.innerHTML = expensiveCards.map(card => `
            <div class="mini-card">
                <div class="mini-card-header">
                    <div class="mini-card-player">${card.player || 'Unknown Player'}</div>
                    <div class="mini-card-price">&#36;${parseFloat(card.estimatedValue).toFixed(2)}</div>
                </div>
                <div class="mini-card-details">
                    ${card.year || 'Unknown'} ${card.product || 'Unknown'} ${card.category || 'Unknown'} #${card.cardNumber || 'N/A'}<br>
                    ${card.team || 'Unknown'}${card.rookieCard === 'Y' ? ' | RC' : ''}
                </div>
            </div>
        `).join('');
    }
}

// ============================================================================
// COLLECTION VIEW FUNCTIONS (for collection.html) - UPDATED WITH PAGINATION
// ============================================================================

function updateCategoryFilter() {
    const categoryFilter = document.getElementById('categoryFilter');
    if (!categoryFilter) return;
    
    const currentValue = categoryFilter.value;
    const categories = [...new Set(cardCollection.map(card => card.category).filter(cat => cat))];
    
    categoryFilter.innerHTML = '<option value="">All</option>';
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
    
    if (currentValue && categories.includes(currentValue)) {
        categoryFilter.value = currentValue;
    }
}

function sortBy(field) {
    if (currentSort.field === field) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    updateSortIndicators();
    currentPage = 1; // Reset to first page when sorting
    displayCollection();
}

function updateSortIndicators() {
    document.querySelectorAll('.sort-indicator').forEach(
        indicator => {
        indicator.textContent = '';
    });
    
    if (currentSort.field) {
        const indicator = document.getElementById('sort-' + currentSort.field);
        if (indicator) {
            indicator.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
        }
    }
}

// Updated display collection function with pagination
function displayCollection() {
    const totalElement = document.getElementById('totalCards');
    const filteredElement = document.getElementById('filteredCount');
    const emptyState = document.getElementById('emptyState');
    const emptyStateMessage = document.getElementById('emptyStateMessage');
    const emptyStateButton = document.getElementById('emptyStateButton');
    
    if (!totalElement || !filteredElement) return;
    
    filteredCards = [...cardCollection];
    
    // Apply filters
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    const yearFilter = document.getElementById('filter-year')?.value.toLowerCase() || '';
    const productFilter = document.getElementById('filter-product')?.value.toLowerCase() || '';
    const cardNumberFilter = document.getElementById('filter-cardNumber')?.value.toLowerCase() || '';
    const baseSetFilter = document.getElementById('filter-baseSet')?.value.toLowerCase() || '';
    const playerFilter = document.getElementById('filter-player')?.value.toLowerCase() || '';
    const teamFilter = document.getElementById('filter-team')?.value.toLowerCase() || '';
    const rookieCardFilter = document.getElementById('filter-rookieCard')?.value || '';
    const parallelFilter = document.getElementById('filter-parallel')?.value.toLowerCase() || '';
    const numberedFilter = document.getElementById('filter-numbered')?.value.toLowerCase() || '';
    const insertFilter = document.getElementById('filter-insert')?.value.toLowerCase() || '';
    
    if (categoryFilter) {
        filteredCards = filteredCards.filter(card => card.category && card.category.toString() === categoryFilter);
    }
    if (yearFilter) {
        filteredCards = filteredCards.filter(card => card.year && card.year.toString().toLowerCase().includes(yearFilter));
    }
    if (productFilter) {
        filteredCards = filteredCards.filter(card => card.product && card.product.toString().toLowerCase().includes(productFilter));
    }
    if (cardNumberFilter) {
        filteredCards = filteredCards.filter(card => card.cardNumber && card.cardNumber.toString().toLowerCase().includes(cardNumberFilter));
    }
    if (baseSetFilter) {
        filteredCards = filteredCards.filter(card => {
            const baseSetValue = card.baseSet === 'N' ? '' : (card.baseSet || '').toString().toLowerCase();
            return baseSetValue.includes(baseSetFilter);
        });
    }
    if (playerFilter) {
        filteredCards = filteredCards.filter(card => card.player && card.player.toString().toLowerCase().includes(playerFilter));
    }
    if (teamFilter) {
        filteredCards = filteredCards.filter(card => card.team && card.team.toString().toLowerCase().includes(teamFilter));
    }
    if (rookieCardFilter) {
        filteredCards = filteredCards.filter(card => card.rookieCard === rookieCardFilter);
    }
    if (parallelFilter) {
        filteredCards = filteredCards.filter(card => {
            const parallelValue = card.parallel === 'N' ? '' : (card.parallel || '').toString().toLowerCase();
            return parallelValue.includes(parallelFilter);
        });
    }
    if (numberedFilter) {
        filteredCards = filteredCards.filter(card => {
            const numberedValue = card.numbered === 'N' ? '' : (card.numbered || '').toString().toLowerCase();
            return numberedValue.includes(numberedFilter);
        });
    }
    if (insertFilter) {
        filteredCards = filteredCards.filter(card => {
            const insertValue = card.insert === 'N' ? '' : (card.insert || '').toString().toLowerCase();
            return insertValue.includes(insertFilter);
        });
    }

    // Apply sorting
    if (currentSort.field) {
        filteredCards.sort((a, b) => {
            let aVal = a[currentSort.field];
            let bVal = b[currentSort.field];
            
            if (currentSort.field === 'year') {
                aVal = parseInt(aVal) || 0;
                bVal = parseInt(bVal) || 0;
            } else if (typeof aVal === 'string' && typeof bVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (aVal < bVal) return currentSort.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    totalElement.textContent = cardCollection.length + ' total cards';
    filteredElement.textContent = filteredCards.length + ' filtered';
    
    if (filteredCards.length === 0) {
        // Hide only the list container, keep the header with filters visible
        const listContainer = document.getElementById('listContainer');
        if (listContainer) {
            listContainer.style.display = 'none';
        }
        
        // Hide pagination controls
        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }
        
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.classList.add('collection-empty-state');
            
            // Check if this is an empty collection or filtered result
            const hasActiveFilters = categoryFilter || yearFilter || productFilter || cardNumberFilter || 
                                   baseSetFilter || playerFilter || teamFilter || rookieCardFilter || 
                                   parallelFilter || numberedFilter || insertFilter;
            
            if (cardCollection.length === 0) {
                // Truly empty collection - hide the entire cards-list including headers
                document.querySelector('.cards-list').style.display = 'none';
                if (emptyStateMessage) emptyStateMessage.textContent = 'Your collection is empty.';
                if (emptyStateButton) emptyStateButton.textContent = 'Add Your First Card';
            } else if (hasActiveFilters) {
                // Filtered result with no matches - keep cards-list visible to show headers/filters
                document.querySelector('.cards-list').style.display = 'block';
                if (emptyStateMessage) emptyStateMessage.textContent = 'No records meet the current filter criteria.';
                if (emptyStateButton) {
                    emptyStateButton.textContent = 'Clear Filters';
                    emptyStateButton.onclick = clearAllFilters;
                    emptyStateButton.href = '#';
                }
            }
        }
        return;
    }
    
    if (emptyState) {
        emptyState.style.display = 'none';
        emptyState.classList.remove('collection-empty-state');
    }
    
    // Always show the cards-list container to display headers and filters
    document.querySelector('.cards-list').style.display = 'block';
    
    // Show the list container for actual results
    const listContainer = document.getElementById('listContainer');
    if (listContainer) {
        listContainer.style.display = 'block';
    }
    
    // Display paginated results
    displayPaginatedList();
}

// New function to handle pagination
function displayPaginatedList() {
    const totalPages = Math.ceil(filteredCards.length / recordsPerPage);
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const pageCards = filteredCards.slice(startIndex, endIndex);
    
    // Update pagination controls
    updatePaginationControls(totalPages);
    
    // Display the current page of cards
    displayListView(pageCards);
}

// New function to create/update pagination controls
function updatePaginationControls(totalPages) {
    let paginationControls = document.getElementById('paginationControls');
    
    // Create pagination controls if they don't exist
    if (!paginationControls) {
        paginationControls = document.createElement('div');
        paginationControls.id = 'paginationControls';
        paginationControls.className = 'pagination-controls';
        
        // Insert after the cards list
        const cardsList = document.querySelector('.cards-list');
        if (cardsList) {
            cardsList.parentNode.insertBefore(paginationControls, cardsList.nextSibling);
        }
    }
    
    if (totalPages <= 1) {
        paginationControls.style.display = 'none';
        return;
    }
    
    paginationControls.style.display = 'flex';
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" 
                onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>
            ← Previous
        </button>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="changePage(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === currentPage ? 'active' : ''}" 
                    onclick="changePage(${i})">
                ${i}
            </button>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span class="pagination-ellipsis">...</span>`;
        }
        paginationHTML += `<button class="pagination-btn" onclick="changePage(${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    paginationHTML += `
        <button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>
            Next →
        </button>
    `;
    
    // Page info
    const startRecord = ((currentPage - 1) * recordsPerPage) + 1;
    const endRecord = Math.min(currentPage * recordsPerPage, filteredCards.length);
    
    paginationHTML += `
        <div class="pagination-info">
            Showing ${startRecord}-${endRecord} of ${filteredCards.length} records
        </div>
    `;
    
    paginationControls.innerHTML = paginationHTML;
}

// New function to change page
function changePage(newPage) {
    const totalPages = Math.ceil(filteredCards.length / recordsPerPage);
    
    if (newPage < 1 || newPage > totalPages) return;
    
    currentPage = newPage;
    displayPaginatedList();
    
    // Scroll to top of list
    const cardsList = document.querySelector('.cards-list');
    if (cardsList) {
        cardsList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Updated displayListView function with Base Set column and removed quantity column
function displayListView(cards) {
    const container = document.getElementById('listContainer');
    if (!container) return;
    
    const listHTML = cards.map(card => {
        const year = card.year || '';
        const product = card.product || '';
        const cardNumber = card.cardNumber || '';
        const baseSet = card.baseSet !== 'N' ? (card.baseSet || '') : '';
        const player = card.player || '';
        const team = card.team || '';
        const rookieCheck = card.rookieCard === 'Y' ? '✓' : '';
        const parallel = card.parallel !== 'N' ? (card.parallel || '') : '';
        const numbered = card.numbered !== 'N' ? (card.numbered || '') : '';
        const insert = card.insert !== 'N' ? (card.insert || '') : '';
        const cardId = card.id;
        
        return `<div class="list-item">
            <div>${year}</div>
            <div>${product}</div>
            <div>${cardNumber}</div>
            <div>${baseSet}</div>
            <div class="list-item-player">${player}</div>
            <div>${team}</div>
            <div style="text-align: center;">${rookieCheck}</div>
            <div>${parallel}</div>
            <div>${numbered}</div>
            <div>${insert}</div>
            <div class="action-buttons">
                <button class="view-btn" data-card-id="${cardId}">View</button>
                <button class="edit-btn" data-card-id="${cardId}">Edit</button>
                <button class="delete-btn" data-card-id="${cardId}">Del</button>
            </div>
        </div>`;
    }).join('');
    
    container.innerHTML = listHTML;
    
// Add event listeners to action buttons
    container.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cardId = this.getAttribute('data-card-id');
            viewCard(cardId);
        });
    });
    
    container.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cardId = this.getAttribute('data-card-id');
            editCard(cardId);
        });
    });
    
    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const cardId = this.getAttribute('data-card-id');
            deleteCard(cardId);
        });
    });
}

// Updated clearAllFilters function - added base set filter and reset pagination
function clearAllFilters() {
    const filters = [
        'filter-year', 'filter-product', 'filter-cardNumber', 'filter-baseSet', 'filter-player', 
        'filter-team', 'filter-rookieCard', 'filter-parallel',
        'filter-numbered', 'filter-insert', 'categoryFilter'
    ];
    
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) element.value = '';
    });
    
    currentPage = 1; // Reset to first page
    filterCollection();
}

function filterCollection() {
    currentPage = 1; // Reset to first page when filtering
    displayCollection();
}

function viewCard(cardId) {
    const card = cardCollection.find(c => c.id === cardId);
    if (!card) return;
    
    const player = card.player || 'Unknown Player';
    const team = card.team || 'Unknown Team';
    const year = card.year || '';
    const product = card.product || '';
    const category = card.category || 'Unknown';
    const cardNumber = card.cardNumber || 'N/A';
    const rookieText = card.rookieCard === 'Y' ? 'Rookie Card: Yes' : 'Rookie Card: No';
    const baseSetText = card.baseSet && card.baseSet !== 'N' ? `Base Set: ${card.baseSet}` : 'Base Set: No';
    const parallelText = card.parallel && card.parallel !== 'N' ? `Parallel: ${card.parallel}` : 'Parallel: No';
    const numberedText = card.numbered && card.numbered !== 'N' ? `Numbered: ${card.numbered}` : 'Numbered: No';
    const insertText = card.insert && card.insert !== 'N' ? `Insert: ${card.insert}` : 'Insert: No';
    const imageVariationText = card.imageVariation && card.imageVariation !== 'N' ? `Image Variation: ${card.imageVariation}` : 'Image Variation: No';
    const description = card.description || 'None';
    const quantity = card.quantity || 1;
    
    // Monetary data formatting - FIXED STRING CONCATENATION
    const purchaseDate = card.purchaseDate === 'Unknown' || !card.purchaseDate ? 'Unknown' : new Date(card.purchaseDate).toLocaleDateString('en-US');
    const purchaseCost = card.purchaseCost === 'Unknown' || !card.purchaseCost ? 'Unknown' : '$' + parseFloat(card.purchaseCost).toFixed(2);
    const estimatedValue = card.estimatedValue === 'Unknown' || !card.estimatedValue ? 'Unknown' : '$' + parseFloat(card.estimatedValue).toFixed(2);
    
    // Format estimated value date to MM/DD/YYYY
    let estimatedValueDate = 'Not specified';
    if (card.estimatedValueDate) {
        try {
            const date = new Date(card.estimatedValueDate);
            estimatedValueDate = date.toLocaleDateString('en-US');
        } catch (e) {
            estimatedValueDate = 'Not specified';
        }
    }
    
    // Format estimated value text
    let estimatedValueText = '';
    if (estimatedValue !== 'Unknown' && estimatedValueDate !== 'Not specified') {
        estimatedValueText = `Estimated value as of ${estimatedValueDate} is ${estimatedValue}`;
    } else if (estimatedValue !== 'Unknown') {
        estimatedValueText = `Estimated value: ${estimatedValue}`;
    } else {
        estimatedValueText = 'Estimated value: Unknown';
    }
    
    const modalHTML = `
        <div class="card-header">
            <div class="card-title-section">
                <div class="card-title">${player}</div>
                <div class="card-subtitle">${team}</div>
                <div class="card-product">Card #${cardNumber} | ${year} ${product}</div>
            </div>
            <div class="card-category">${category}</div>
        </div>
        
        <div class="card-body">
            <div class="card-details">
                <div class="card-detail-line">${baseSetText}</div>
                <div class="card-detail-line">${insertText}</div>
                <div class="card-detail-line">${parallelText}</div>
                <div class="card-detail-line">${numberedText}</div>
                <div class="card-detail-line">${rookieText}</div>
                <div class="card-detail-line">${imageVariationText}</div>
                <div class="card-detail-line">Quantity: ${quantity}</div>
                <div class="card-detail-line">Add'l Notes: ${description}</div>
            </div>
            
            <div class="card-monetary">
                <div class="monetary-field">Grade: ${card.grade || 'Ungraded'}</div>
                <div class="monetary-field">Purchase Date: ${purchaseDate}</div>
                <div class="monetary-field">Purchase Price: ${purchaseCost}</div>
                <div class="monetary-field estimated-value">${estimatedValueText}</div>
            </div>
        </div>
    `;
    
    document.getElementById('modalCardContent').innerHTML = modalHTML;
    document.getElementById('cardModal').style.display = 'block';
}

function closeCardModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function editCard(cardId) {
    const card = cardCollection.find(c => c.id === cardId);
    if (!card) return;
    
    localStorage.setItem('editCardId', cardId);
    localStorage.setItem('editCardData', JSON.stringify(card));
    window.location.href = 'add.html?edit=true';
}

async function deleteCard(cardId) {
    const card = cardCollection.find(c => c.id === cardId);
    if (!card) return;
    
    const year = card.year || '';
    const product = card.product || '';
    const player = card.player || '';
    const team = card.team || '';
    const cardNumber = card.cardNumber || '';
    
    const confirmDelete = confirm(`Are you sure you want to delete this card?\n\n${year} ${product}\n${player} - ${team}\nCard #${cardNumber}`);
    if (!confirmDelete) return;
    
    const finalConfirm = confirm('This action cannot be undone!\n\nClick OK to permanently delete this card from your collection.');
    if (!finalConfirm) return;
    
    try {
        const { deleteDoc, doc } = window.firebaseRefs;
        await deleteDoc(doc(db, 'cards', cardId));
        cardCollection = cardCollection.filter(c => c.id !== cardId);
        displayCollection();
        alert('Card deleted successfully!');
    } catch (error) {
        console.error('Error deleting card:', error);
        alert('Error deleting card: ' + error.message);
    }
}

function exportToCSV() {
    if (cardCollection.length === 0) {
        alert('No cards to export!');
        return;
    }
    
    // Updated headers for new column order
    const headers = ['Category', 'Year', 'Brand', 'Card #', 'Base Set', 'Player', 'Team', 'Insert', 'Parallel', 'Numbered', 'Rookie Card', 'Image Variation', 'Quantity', 'Grade', 'Purchase Date', 'Purchase Price', 'Estimated Value', 'Estimated Value As Of', "Add'l Notes"];
    const csvRows = [headers.join(',')];
    
    cardCollection.forEach(card => {
        // Format numbered field to prevent date conversion - prefix with apostrophe for Excel
        let numberedValue = card.numbered || 'N';
        if (numberedValue !== 'N' && numberedValue !== '') {
            numberedValue = "'" + numberedValue;
        }
        
        const row = [
            card.category || '',
            card.year || '',
            card.product || '',
            card.cardNumber || '',
            card.baseSet || 'N',
            card.player || '',
            card.team || '',
            card.insert || 'N',
            card.parallel || 'N',
            numberedValue,
            card.rookieCard || 'N',
            card.imageVariation || 'N',
            card.quantity || 1,
            card.grade || 'Ungraded',
            card.purchaseDate || 'Unknown',
            card.purchaseCost || '',
            card.estimatedValue || '',
            card.estimatedValueDate || '',
            '"' + (card.description || '') + '"'
        ];
        csvRows.push(row.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'buzz_collection_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// ============================================================================
// SHARED UTILITY FUNCTIONS
// ============================================================================

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        const isHidden = navLinks.style.display === 'none';
        navLinks.style.display = isHidden ? 'flex' : 'none';
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM loaded, current pathname:', window.location.pathname);
    
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    console.log('Loading element:', loadingEl);
    console.log('Main content element:', mainContentEl);
    console.log('Is add page?', isAddPage());
    
    // For add page, show content immediately and then initialize Firebase
    if (isAddPage()) {
        console.log('Detected add page');
        
        // Show content first
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContentEl) mainContentEl.style.display = 'block';
        
        // Initialize Firebase and then set up the form
        const success = await initFirebase();
        console.log('Firebase init success:', success);
        
        if (success) {
            initializeYearDropdown();
            checkEditMode();
            
            // Add form event listener
            const cardForm = document.getElementById('cardForm');
            if (cardForm) {
                cardForm.addEventListener('submit', addCard);
            }
            
            // Add toggle event listeners
            const baseSetSelect = document.getElementById('baseSetSelect');
            if (baseSetSelect) {
                baseSetSelect.addEventListener('change', toggleBaseSetInput);
            }
            
            const parallelSelect = document.getElementById('parallelSelect');
            if (parallelSelect) {
                parallelSelect.addEventListener('change', toggleParallelInput);
            }
            
            const numberedSelect = document.getElementById('numberedSelect');
            if (numberedSelect) {
                numberedSelect.addEventListener('change', toggleNumberedInput);
            }
            
            const insertSelect = document.getElementById('insertSelect');
            if (insertSelect) {
                insertSelect.addEventListener('change', toggleInsertInput);
            }
            
            const unknownEstimatedValue = document.getElementById('unknownEstimatedValue');
            if (unknownEstimatedValue) {
                unknownEstimatedValue.addEventListener('change', toggleEstimatedValueInput);
            }
            
            const imageVariationSelect = document.getElementById('imageVariationSelect');
            if (imageVariationSelect) {
                imageVariationSelect.addEventListener('change', toggleImageVariationInput);
            }
            
            const unknownDate = document.getElementById('unknownDate');
            if (unknownDate) {
                unknownDate.addEventListener('change', toggleDateInput);
            }
            
            const unknownCost = document.getElementById('unknownCost');
            if (unknownCost) {
                unknownCost.addEventListener('change', toggleCostInput);
            }
            
            const ungradedGrade = document.getElementById('ungradedGrade');
            if (ungradedGrade) {
                ungradedGrade.addEventListener('change', toggleGradeInput);
            }
            
            const csvFile = document.getElementById('csvFile');
            if (csvFile) {
                csvFile.addEventListener('change', handleCSVUpload);
            }
            
            // Note: Success modal button listeners are now added dynamically in showSuccessModal
        } else {
            alert('Failed to initialize Firebase. Some features may not work.');
        }
        return;
    }
    
    // For other pages, initialize Firebase first then load data
    console.log('Other page detected, initializing normally');
    
    if (!loadingEl || !mainContentEl) {
        console.error('Required DOM elements not found!');
        return;
    }
    
    const success = await initFirebase();
    
    if (success) {
        // Check if this is the collection page
        if (isCollectionPage()) {
            initializeCollectionPage();
        }
        
        setTimeout(() => {
            loadCollectionFromFirebase();
        }, 1000);
    } else {
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 2rem;">
                    <h3>Failed to Initialize Firebase</h3>
                    <p>Could not load Firebase modules.</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
    
    // Add menu toggle listener for all pages
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMobileMenu);
    }
});

// Modal click outside to close - Updated to prevent import completion modal from closing
window.addEventListener('click', function(event) {
    const modal = document.getElementById('cardModal');
    if (event.target === modal) {
        closeCardModal();
    }
    
    // Close import status modal when clicking outside
    const importModal = document.getElementById('importModal');
    if (event.target === importModal) {
        importModal.style.display = 'none';
    }
    
    // DO NOT close import completion modal when clicking outside - removed this functionality
    // const completionModal = document.getElementById('completionModal');
    // if (event.target === completionModal) {
    //     completionModal.style.display = 'none';
    // }
});

// Make changePage function globally accessible
window.changePage = changePage;

// ============================================================================
// GLOBAL FUNCTION EXPORTS - REMOVED (no longer needed with event listeners)
// ============================================================================
// All functions are now properly attached via event listeners
// No more inline onclick handlers needed