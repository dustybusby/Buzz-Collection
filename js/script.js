// Firebase configuration
const firebaseConfig = {
    apiKey: "{{FIREBASE_API_KEY}}",
    authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
    projectId: "{{FIREBASE_PROJECT_ID}}",
    storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
    messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
    appId: "{{FIREBASE_APP_ID}}"
};

// Global variables
let app, db;
let cardCollection = [];
let currentView = 'list';
let currentSort = { field: null, direction: 'asc' };
let isEditMode = false;
let editCardId = null;

// Initialize Firebase when the script loads
async function initFirebase() {
    try {
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        console.log('🔥 Firebase initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
    }
}

// Common utility functions
function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.style.display = navLinks.style.display === 'none' ? 'flex' : 'none';
    }
}

// ===========================================
// ADD CARD PAGE FUNCTIONS
// ===========================================

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
        
        const h1 = document.querySelector('h1');
        const btnPrimary = document.querySelector('.btn-primary');
        
        if (h1) h1.textContent = 'Edit Card';
        if (btnPrimary) btnPrimary.textContent = 'Update Card';
        
        populateForm(cardData);
        
        localStorage.removeItem('editCardData');
        localStorage.removeItem('editCardId');
    }
}

function populateForm(card) {
    const elements = {
        category: document.getElementById('category'),
        year: document.getElementById('year'),
        product: document.getElementById('product'),
        cardNumber: document.getElementById('cardNumber'),
        player: document.getElementById('player'),
        team: document.getElementById('team'),
        quantity: document.getElementById('quantity'),
        rookieCard: document.getElementById('rookieCard'),
        description: document.getElementById('description'),
        purchaseCost: document.getElementById('purchaseCost')
    };
    
    Object.keys(elements).forEach(key => {
        if (elements[key] && card[key] !== undefined) {
            elements[key].value = card[key];
        }
    });
    
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
    
    // Handle purchase date
    const purchaseDate = document.getElementById('purchaseDate');
    const unknownDate = document.getElementById('unknownDate');
    if (purchaseDate && unknownDate) {
        if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
            purchaseDate.value = card.purchaseDate;
        } else {
            unknownDate.checked = true;
            purchaseDate.disabled = true;
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

function toggleDateInput() {
    const checkbox = document.getElementById('unknownDate');
    const dateInput = document.getElementById('purchaseDate');
    if (checkbox && dateInput) {
        dateInput.disabled = checkbox.checked;
        if (checkbox.checked) dateInput.value = '';
    }
}

async function addCard(event) {
    event.preventDefault();
    
    if (!db) {
        console.error('Database not initialized');
        return;
    }

    const getElementValue = (id) => {
        const element = document.getElementById(id);
        return element ? element.value : '';
    };
    
    const card = {
        category: getElementValue('category'),
        year: parseInt(getElementValue('year')),
        product: getElementValue('product'),
        cardNumber: getElementValue('cardNumber'),
        player: getElementValue('player'),
        team: getElementValue('team'),
        quantity: parseInt(getElementValue('quantity')) || 1,
        rookieCard: getElementValue('rookieCard'),
        parallel: document.getElementById('parallelSelect')?.value === 'Y' ? getElementValue('parallelText') : 'N',
        numbered: document.getElementById('numberedSelect')?.value === 'Y' ? getElementValue('numberedText') : 'N',
        description: getElementValue('description'),
        purchaseDate: document.getElementById('unknownDate')?.checked ? 'Unknown' : getElementValue('purchaseDate'),
        purchaseCost: parseFloat(getElementValue('purchaseCost')) || 0
    };

    try {
        const { addDoc, updateDoc, doc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        if (isEditMode && editCardId) {
            await updateDoc(doc(db, 'cards', editCardId), card);
            alert('Card updated successfully!');
            
            isEditMode = false;
            editCardId = null;
            
            const h1 = document.querySelector('h1');
            const btnPrimary = document.querySelector('.btn-primary');
            if (h1) h1.textContent = 'Add New Card';
            if (btnPrimary) btnPrimary.textContent = 'Add Card';
            
            window.location.href = 'collection.html';
        } else {
            card.dateAdded = new Date();
            const docRef = await addDoc(collection(db, 'cards'), card);
            console.log('Document written with ID: ', docRef.id);
            alert('Card added successfully!');
        }
        
        if (!isEditMode) {
            event.target.reset();
            const parallelText = document.getElementById('parallelText');
            const numberedText = document.getElementById('numberedText');
            const quantity = document.getElementById('quantity');
            
            if (parallelText) parallelText.style.display = 'none';
            if (numberedText) numberedText.style.display = 'none';
            if (quantity) quantity.value = 1;
        }
    } catch (error) {
        console.error('Error saving card:', error);
        alert('Error saving card: ' + error.message);
    }
}

async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file || !db) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        let successCount = 0;
        let errorCount = 0;
        
        const { addDoc, collection } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            
            const values = lines[i].split(',').map(v => v.trim());
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
                numbered: values[9] || 'N',
                description: values[10] || '',
                purchaseDate: values[11] || 'Unknown',
                purchaseCost: parseFloat(values[12]) || 0,
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

// ===========================================
// COLLECTION PAGE FUNCTIONS
// ===========================================

async function loadCollectionFromFirebase() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }

    try {
        const { getDocs, collection, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const querySnapshot = await getDocs(
            query(collection(db, 'cards'), orderBy('dateAdded', 'desc'))
        );
        
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
        
        updateCategoryFilter();
        
        const loading = document.getElementById('loading');
        const mainContent = document.getElementById('mainContent');
        
        if (loading) loading.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        
        displayCollection();
    } catch (error) {
        console.error('Error loading collection:', error);
        const loading = document.getElementById('loading');
        if (loading) {
            const errorHTML = `<div style="color: #ff6b6b;"><h3>Error loading collection</h3><p>${error.message}</p><button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry</button></div>`;
            loading.innerHTML = errorHTML;
        }
    }
}

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

function switchView(view) {
    currentView = view;
    const listView = document.getElementById('listView');
    const gridView = document.getElementById('gridView');
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');
    
    if (listView && gridView && listBtn && gridBtn) {
        if (view === 'list') {
            listView.style.display = 'block';
            gridView.style.display = 'none';
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        } else {
            listView.style.display = 'none';
            gridView.style.display = 'grid';
            listBtn.classList.remove('active');
            gridBtn.classList.add('active');
        }
        displayCollection();
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
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });
    
    if (currentSort.field) {
        const indicator = document.getElementById('sort-' + currentSort.field);
        if (indicator) {
            indicator.textContent = currentSort.direction === 'asc' ? '▲' : '▼';
        }
    }
}

function displayCollection() {
    const totalElement = document.getElementById('totalCards');
    const filteredElement = document.getElementById('filteredCount');
    const emptyState = document.getElementById('emptyState');
    
    if (!totalElement || !filteredElement) return;
    
    let filteredCards = [...cardCollection];
    
    // Apply filters
    const filterElements = [
        { id: 'categoryFilter', field: 'category' },
        { id: 'filter-year', field: 'year' },
        { id: 'filter-product', field: 'product' },
        { id: 'filter-player', field: 'player' },
        { id: 'filter-team', field: 'team' },
        { id: 'filter-quantity', field: 'quantity' },
        { id: 'filter-rookieCard', field: 'rookieCard' },
        { id: 'filter-parallel', field: 'parallel' },
        { id: 'filter-numbered', field: 'numbered' },
        { id: 'filter-description', field: 'description' }
    ];
    
    filterElements.forEach(filter => {
        const element = document.getElementById(filter.id);
        if (!element || !element.value) return;
        
        const filterValue = element.value.toLowerCase();
        
        filteredCards = filteredCards.filter(card => {
            const cardValue = card[filter.field];
            if (!cardValue) return false;
            
            if (filter.field === 'categoryFilter' || filter.field === 'rookieCard') {
                return cardValue.toString() === element.value;
            } else if (filter.field === 'parallel') {
                const parallelValue = cardValue === 'N' ? '' : cardValue.toString().toLowerCase();
                return parallelValue.includes(filterValue);
            } else if (filter.field === 'numbered') {
                const numberedValue = cardValue === 'N' ? '' : cardValue.toString().toLowerCase();
                return numberedValue.includes(filterValue);
            } else {
                return cardValue.toString().toLowerCase().includes(filterValue);
            }
        });
    });
    
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
        const listView = document.getElementById('listView');
        const gridView = document.getElementById('gridView');
        if (listView) listView.style.display = 'none';
        if (gridView) gridView.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }
    
    if (emptyState) emptyState.style.display = 'none';
    
    if (currentView === 'list') {
        displayListView(filteredCards);
    } else {
        displayGridView(filteredCards);
    }
}

function displayListView(cards) {
    const container = document.getElementById('listContainer');
    if (!container) return;
    
    const listHTML = cards.map(card => {
        return `<div class="list-item">
            <div>${card.year || ''}</div>
            <div>${card.product || ''}</div>
            <div class="list-item-player">${card.player || ''}</div>
            <div>${card.team || ''}</div>
            <div style="text-align: center;">${card.quantity || 1}</div>
            <div>${card.rookieCard === 'Y' ? '✓' : ''}</div>
            <div>${card.parallel !== 'N' ? (card.parallel || '') : ''}</div>
            <div>${card.numbered !== 'N' ? (card.numbered || '') : ''}</div>
            <div class="list-item-details">${card.description || ''}</div>
            <div class="action-buttons">
                <button class="view-btn" onclick="viewCard('${card.id}')">View</button>
                <button class="edit-btn" onclick="editCard('${card.id}')">Edit</button>
                <button class="delete-btn" onclick="deleteCard('${card.id}')">Delete</button>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = listHTML;
}

function displayGridView(cards) {
    const container = document.getElementById('gridView');
    if (!container) return;
    
    const gridHTML = cards.map(card => {
        const purchaseDate = card.purchaseDate === 'Unknown' || !card.purchaseDate ? 'Unknown' : new Date(card.purchaseDate).toLocaleDateString();
        const purchaseCost = card.purchaseCost ? ' + parseFloat(card.purchaseCost).toFixed(2) : 'Not available';
        
        return `<div class="card-item">
            <div class="card-header">
                <div class="card-title-section">
                    <div class="card-title">${card.player || ''}</div>
                    <div class="card-subtitle">${card.team || ''}</div>
                    <div class="card-product">${card.year || ''} ${card.product || ''}</div>
                </div>
                <div class="card-category">${card.category || ''}</div>
            </div>
            <div class="card-details">
                <strong>Card Number:</strong> ${card.cardNumber || ''}<br>
                <strong>Rookie Card:</strong> ${card.rookieCard === 'Y' ? 'Yes' : 'No'}<br>
                <strong>Parallel:</strong> ${card.parallel !== 'N' ? (card.parallel || '') : 'No'}<br>
                <strong>Numbered:</strong> ${card.numbered !== 'N' ? (card.numbered || '') : 'No'}<br>
                <strong>Additional Notes:</strong> ${card.description || 'None'}<br>
                <strong>Purchase Date:</strong> ${purchaseDate}<br>
                <strong>Purchase Cost:</strong> ${purchaseCost}<br>
                <strong>Quantity:</strong> ${card.quantity || 1}
            </div>
        </div>`;
    }).join('');
    container.innerHTML = gridHTML;
}

function clearAllFilters() {
    const filterIds = [
        'filter-year', 'filter-product', 'filter-player', 'filter-team',
        'filter-quantity', 'filter-rookieCard', 'filter-parallel', 
        'filter-numbered', 'filter-description', 'categoryFilter'
    ];
    
    filterIds.forEach(id => {
        const element = document.getElementById(id);
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
    
    const purchaseDate = card.purchaseDate === 'Unknown' || !card.purchaseDate ? 'Unknown' : new Date(card.purchaseDate).toLocaleDateString();
    const purchaseCost = card.purchaseCost ? ' + parseFloat(card.purchaseCost).toFixed(2) : 'Not available';
    
    const modalHTML = `<div style="margin: 0; padding: 0;">
        <div class="card-header">
            <div class="card-title-section">
                <div class="card-title">${card.player || ''}</div>
                <div class="card-subtitle">${card.team || ''}</div>
                <div class="card-product">${card.year || ''} ${card.product || ''}</div>
            </div>
            <div class="card-category">${card.category || ''}</div>
        </div>
        <div class="card-details" style="margin-top: 1.5rem; line-height: 2;">
            <div><strong>Card Number:</strong> ${card.cardNumber || ''}</div>
            <div><strong>Rookie Card:</strong> ${card.rookieCard === 'Y' ? 'Yes' : 'No'}</div>
            <div><strong>Parallel:</strong> ${card.parallel && card.parallel !== 'N' ? card.parallel : 'No'}</div>
            <div><strong>Numbered:</strong> ${card.numbered && card.numbered !== 'N' ? card.numbered : 'No'}</div>
            <div><strong>Additional Notes:</strong> ${card.description || 'None'}</div>
            <div><strong>Purchase Date:</strong> ${purchaseDate}</div>
            <div><strong>Purchase Cost:</strong> ${purchaseCost}</div>
            <div><strong>Quantity:</strong> ${card.quantity || 1}</div>
        </div>
    </div>`;
    
    const modalContent = document.getElementById('modalCardContent');
    const modal = document.getElementById('cardModal');
    
    if (modalContent && modal) {
        modalContent.innerHTML = modalHTML;
        modal.style.display = 'block';
    }
}

function closeCardModal() {
    const modal = document.getElementById('cardModal');
    if (modal) modal.style.display = 'none';
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
    if (!card || !db) return;
    
    const confirmDelete = confirm(`Are you sure you want to delete this card?\n\n${card.year || ''} ${card.product || ''}\n${card.player || ''} - ${card.team || ''}\nCard #${card.cardNumber || ''}`);
    if (!confirmDelete) return;
    
    const finalConfirm = confirm('This action cannot be undone!\n\nClick OK to permanently delete this card from your collection.');
    if (!finalConfirm) return;
    
    try {
        const { deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
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
    
    const headers = ['Category', 'Year', 'Product', 'Card Number', 'Player', 'Team', 'Quantity', 'Rookie Card', 'Parallel', 'Numbered', 'Additional Description', 'Purchase Date', 'Purchase Cost'];
    const csvRows = [headers.join(',')];
    
    cardCollection.forEach(card => {
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
            card.numbered || 'N',
            '"' + (card.description || '') + '"',
            card.purchaseDate || 'Unknown',
            card.purchaseCost || ''
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

// ===========================================
// DASHBOARD PAGE FUNCTIONS
// ===========================================

async function loadCollectionForDashboard() {
    if (!db) {
        console.error('Database not initialized');
        return;
    }

    try {
        console.log('📖 Loading collection from Firebase...');
        
        const { getDocs, collection, query, orderBy } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        
        const querySnapshot = await getDocs(
            query(
                collection(db, 'cards'),
                orderBy('dateAdded', 'desc')
            )
        );
        
        cardCollection = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            cardCollection.push({
                id: doc.id,
                ...data,
                dateAdded: data.dateAdded?.toDate?.() || new Date(data.dateAdded)
            });
        });
        
        console.log('📊 Total cards loaded:', cardCollection.length);
        
        const loading = document.getElementById('loading');
        const mainContent = document.getElementById('mainContent');
        
        if (loading) loading.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';
        
        displayInventory();
    } catch (error) {
        console.error('❌ Error loading collection:', error);
        
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <div style="color: #ff6b6b;">
                    <h3>Error loading collection</h3>
                    <p>${error.message}</p>
                    <p style="font-size: 0.9rem; margin-top: 1rem;">Check console for details</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

function displayInventory() {
    console.log('🎯 Starting to display inventory with', cardCollection.length, 'cards');
    
    if (cardCollection.length === 0) {
        console.log('⚠️ No cards found - showing empty state');
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.innerHTML = `
                <div style="text-align: center; padding: 4rem 2rem;">
                    <h2>No Cards Found</h2>
                    <p style="color: #b0b0b0; margin: 1rem 0;">Your collection appears to be empty.</p>
                    <a href="add.html" class="btn btn-primary" style="display: inline-block; margin-top: 1rem; text-decoration: none;">Add Your First Card</a>
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
    console.log('📈 Updating summary stats...');
    const totalCards = cardCollection.length;
    const totalValue = cardCollection.reduce((sum, card) => sum + (card.purchaseCost || 0), 0);
    const rookieCards = cardCollection.filter(card => card.rookieCard === 'Y').length;
    const numberedCards = cardCollection.filter(card => card.numbered !== 'N').length;

    const elements = {
        totalCards: document.getElementById('totalCards'),
        totalValue: document.getElementById('totalValue'),
        rookieCards: document.getElementById('rookieCards'),
        numberedCards: document.getElementById('numberedCards')
    };

    if (elements.totalCards) elements.totalCards.textContent = totalCards.toLocaleString();
    if (elements.totalValue) elements.totalValue.textContent = `${totalValue.toFixed(2)}`;
    if (elements.rookieCards) elements.rookieCards.textContent = rookieCards.toLocaleString();
    if (elements.numberedCards) elements.numberedCards.textContent = numberedCards.toLocaleString();
}

function displayCategoryBreakdown() {
    const categoryStats = {};
    cardCollection.forEach(card => {
        if (!categoryStats[card.category]) {
            categoryStats[card.category] = { count: 0, value: 0 };
        }
        categoryStats[card.category].count++;
        categoryStats[card.category].value += card.purchaseCost || 0;
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
        const year = card.year;
        yearStats[year] = (yearStats[year] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(yearStats), 1);
    const container = document.getElementById('yearChart');
    
    if (container) {
        const sortedYears = Object.entries(yearStats).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
        
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
        const productKey = `${card.year} ${card.product}`;
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
        const team = card.team;
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
    const expensiveCards = [...cardCollection]
        .filter(card => card.purchaseCost > 0)
        .sort((a, b) => b.purchaseCost - a.purchaseCost)
        .slice(0, 6);

    const container = document.getElementById('expensiveCards');
    if (!container) return;
    
    if (expensiveCards.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 2rem;">No cards with cost data yet.</p>';
        return;
    }

    container.innerHTML = expensiveCards.map(card => `
        <div class="mini-card">
            <div class="mini-card-header">
                <div class="mini-card-player">${card.player}</div>
                <div class="mini-card-price">${card.purchaseCost.toFixed(2)}</div>
            </div>
            <div class="mini-card-details">
                ${card.year} ${card.product} #${card.cardNumber}<br>
                ${card.team} | ${card.category}
                ${card.rookieCard === 'Y' ? ' | RC' : ''}
            </div>
        </div>
    `).join('');
}

// ===========================================
// INITIALIZATION
// ===========================================

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Firebase first
    await initFirebase();
    
    // Determine which page we're on
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    console.log('🚀 Initializing page:', currentPage);
    
    // Page-specific initialization
    if (currentPage === 'add.html' || document.getElementById('cardForm')) {
        // Add card page
        initializeYearDropdown();
        checkEditMode();
        
    } else if (currentPage === 'collection.html' || document.getElementById('listView')) {
        // Collection page
        loadCollectionFromFirebase();
        
    } else if (currentPage === 'index.html' || document.getElementById('totalCards')) {
        // Dashboard page
        setTimeout(() => {
            loadCollectionForDashboard();
        }, 1000);
    }
    
    // Modal click handler
    const cardModal = document.getElementById('cardModal');
    if (cardModal) {
        cardModal.addEventListener('click', function(event) {
            if (event.target === cardModal) {
                closeCardModal();
            }
        });
    }
});

// Export functions to global scope for HTML onclick handlers
window.toggleMobileMenu = toggleMobileMenu;
window.toggleParallelInput = toggleParallelInput;
window.toggleNumberedInput = toggleNumberedInput;
window.toggleDateInput = toggleDateInput;
window.addCard = addCard;
window.handleCSVUpload = handleCSVUpload;
window.switchView = switchView;
window.filterCollection = filterCollection;
window.exportToCSV = exportToCSV;
window.sortBy = sortBy;
window.clearAllFilters = clearAllFilters;
window.viewCard = viewCard;
window.closeCardModal = closeCardModal;
window.editCard = editCard;
window.deleteCard = deleteCard;