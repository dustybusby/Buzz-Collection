// Global variables
let app, db, cardCollection = [];
let currentView = 'list';
let currentSort = { field: null, direction: 'asc' };

// Add page specific variables
let isEditMode = false;
let editCardId = null;

// Add new variables to track collection page state
let collectionPageState = null;

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
    if (select && text) {text.style.display = select.value === 'Y' ? 'block' : 'none';
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
        const parallelText = document.getElementById('parallelText');
        const numberedText = document.getElementById('numberedText');
        const insertText = document.getElementById('insertText');
        const imageVariationText = document.getElementById('imageVariationText');
        const quantity = document.getElementById('quantity');
        
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

async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        const { addDoc, collection } = window.firebaseRefs;
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
            const card = {
                category: values[0] || '',
                year: parseInt(values[1]) || 0,
                product: values[2] || '',
                cardNumber: values[3] || '',
                player: values[4] || '',
                team: values[5] || '',
                quantity: parseInt(values[6]) || 1,
                rookieCard: values[7] || 'N',
                parallel: values[8] || 'N',
                numbered: values[9] ? values[9].replace(/^'/, '') : 'N', // Remove leading apostrophe if present
                insert: values[10] || 'N', // New insert field
                grade: values[11] || 'Ungraded',
                estimatedValue: values[12] ? (values[12].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[12]) || 0) : 0,
                estimatedValueDate: values[13] || '',
                imageVariation: values[14] || 'N',
                purchaseDate: values[15] || 'Unknown',
                purchaseCost: values[16] ? (values[16].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[16]) || 0) : 0,
                description: values[17] || '',
                dateAdded: new Date()
            };
            
            try {
                await addDoc(collection(db, 'cards'), card);
                successCount++;
            } catch (error) {
                console.error('Error adding card:', error);
                errorCount++;
            }
        }
        
        alert(`Import complete! ${successCount} cards added successfully.${errorCount > 0 ? ` ${errorCount} errors.` : ''}`);
        event.target.value = '';
    };
    reader.readAsText(file);
}

// ============================================================================
// DASHBOARD/INVENTORY FUNCTIONS (for index.html) - FIXED TO USE ESTIMATED VALUE
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
                <div class="category-value">$${stats.value.toFixed(2)}</div>
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

function displayTopProducts() {
    const productStats = {};
    cardCollection.forEach(card => {
        const productKey = `${card.year || 'Unknown'} ${card.product || 'Unknown'}`;
        productStats[productKey] = (productStats[productKey] || 0) + 1;
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

function displayExpensiveCards() {
    // FIXED: Use estimatedValue instead of purchaseCost for expensive cards
    const expensiveCards = [...cardCollection]
        .filter(card => card.estimatedValue !== 'Unknown' && card.estimatedValue > 0)
        .sort((a, b) => parseFloat(b.estimatedValue) - parseFloat(a.estimatedValue))
        .slice(0, 6);

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
                    ${card.year || 'Unknown'} ${card.product || 'Unknown'} #${card.cardNumber || 'N/A'}<br>
                    ${card.team || 'Unknown'} | ${card.category || 'Unknown'}
                    ${card.rookieCard === 'Y' ? ' | RC' : ''}
                </div>
            </div>
        `).join('');
    }
}

// ============================================================================
// COLLECTION VIEW FUNCTIONS (for collection.html)
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

// Updated display collection function with new column order
function displayCollection() {
    const totalElement = document.getElementById('totalCards');
    const filteredElement = document.getElementById('filteredCount');
    const emptyState = document.getElementById('emptyState');
    
    if (!totalElement || !filteredElement) return;
    
    let filteredCards = [...cardCollection];
    
    // Apply filters in new order
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    const yearFilter = document.getElementById('filter-year')?.value.toLowerCase() || '';
    const productFilter = document.getElementById('filter-product')?.value.toLowerCase() || '';
    const cardNumberFilter = document.getElementById('filter-cardNumber')?.value.toLowerCase() || '';
    const playerFilter = document.getElementById('filter-player')?.value.toLowerCase() || '';
    const teamFilter = document.getElementById('filter-team')?.value.toLowerCase() || '';
    const rookieCardFilter = document.getElementById('filter-rookieCard')?.value || '';
    const parallelFilter = document.getElementById('filter-parallel')?.value.toLowerCase() || '';
    const numberedFilter = document.getElementById('filter-numbered')?.value.toLowerCase() || '';
    const insertFilter = document.getElementById('filter-insert')?.value.toLowerCase() || '';
    const quantityFilter = document.getElementById('filter-quantity')?.value.toLowerCase() || '';
    
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
    if (quantityFilter) {
        filteredCards = filteredCards.filter(card => card.quantity && card.quantity.toString().toLowerCase().includes(quantityFilter));
    }
// Apply sorting
    if (currentSort.field) {
        filteredCards.sort((a, b) => {
            let aVal = a[currentSort.field];
            let bVal = b[currentSort.field];
            
            if (currentSort.field === 'year' || currentSort.field === 'quantity') {
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
        document.querySelector('.cards-list').style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'block';
            emptyState.classList.add('collection-empty-state');
        }
        return;
    }
    
    if (emptyState) {
        emptyState.style.display = 'none';
        emptyState.classList.remove('collection-empty-state');
    }
    
    document.querySelector('.cards-list').style.display = 'block';
    displayListView(filteredCards);
}

// Updated displayListView function with new column order
function displayListView(cards) {
    const container = document.getElementById('listContainer');
    if (!container) return;
    
    const listHTML = cards.map(card => {
        const year = card.year || '';
        const product = card.product || '';
        const cardNumber = card.cardNumber || '';
        const player = card.player || '';
        const team = card.team || '';
        const rookieCheck = card.rookieCard === 'Y' ? '✓' : '';
        const parallel = card.parallel !== 'N' ? (card.parallel || '') : '';
        const numbered = card.numbered !== 'N' ? (card.numbered || '') : '';
        const insert = card.insert !== 'N' ? (card.insert || '') : '';
        const quantity = card.quantity || 1;
        const cardId = card.id;
        
        return `<div class="list-item">
            <div>${year}</div>
            <div>${product}</div>
            <div>${cardNumber}</div>
            <div class="list-item-player">${player}</div>
            <div>${team}</div>
            <div style="text-align: center;">${rookieCheck}</div>
            <div>${parallel}</div>
            <div>${numbered}</div>
            <div>${insert}</div>
            <div style="text-align: center;">${quantity}</div>
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

// Updated clearAllFilters function with new filter order
function clearAllFilters() {
    const filters = [
        'filter-year', 'filter-product', 'filter-cardNumber', 'filter-player', 
        'filter-team', 'filter-rookieCard', 'filter-parallel',
        'filter-numbered', 'filter-insert', 'filter-quantity', 'categoryFilter'
    ];
    
    filters.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) element.value = '';
    });
    
    filterCollection();
}

function filterCollection() {
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
                <div class="card-detail-line">${numberedText}</div>
                <div class="card-detail-line">${parallelText}</div>
                <div class="card-detail-line">${insertText}</div>
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
    
    const headers = ['Category', 'Year', 'Brand', 'Card Number', 'Player', 'Team', 'Quantity', 'Rookie Card', 'Parallel', 'Numbered', 'Insert', 'Grade', 'Estimated Value', 'Estimated Value As Of', 'Image Variation', 'Purchase Date', 'Purchase Price', "Add'l Notes"];
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
            card.player || '',
            card.team || '',
            card.quantity || 1,
            card.rookieCard || 'N',
            card.parallel || 'N',
            numberedValue,
            card.insert || 'N', // New insert field
            card.grade || 'Ungraded', // Use actual grade from database
            card.estimatedValue || '',
            card.estimatedValueDate || '',
            card.imageVariation || 'N',
            card.purchaseDate || 'Unknown',
            card.purchaseCost || '',
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

// Modal click outside to close
window.addEventListener('click', function(event) {
    const modal = document.getElementById('cardModal');
    if (event.target === modal) {
        closeCardModal();
    }
});

// ============================================================================
// GLOBAL FUNCTION EXPORTS - REMOVED (no longer needed with event listeners)
// ============================================================================
// All functions are now properly attached via event listeners
// No more inline onclick handlers needed