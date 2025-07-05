// Global variables
let app, db, cardCollection = [];
let currentView = 'list';
let currentSort = { field: null, direction: 'asc' };

// Add page specific variables
let isEditMode = false;
let editCardId = null;

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
           document.getElementById('listView') !== null;
}

function isDashboardPage() {
    return window.location.pathname.includes('index.html') || 
           (window.location.pathname === '/' || window.location.pathname === '') ||
           document.getElementById('totalCards') !== null;
}

function isAddPage() {
    return window.location.pathname.includes('add.html') || 
           document.getElementById('cardForm') !== null;
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
        
        populateForm(cardData);
        
        localStorage.removeItem('editCardData');
        localStorage.removeItem('editCardId');
    }
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
    
    setFieldValue('purchaseCost', card.purchaseCost);
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
        description: getFieldValue('description'),
        purchaseDate: document.getElementById('unknownDate')?.checked ? 'Unknown' : getFieldValue('purchaseDate'),
        purchaseCost: parseFloat(getFieldValue('purchaseCost')) || 0
    };

    try {
        if (isEditMode && editCardId) {
            const { updateDoc, doc } = window.firebaseRefs;
            await updateDoc(doc(db, 'cards', editCardId), card);
            alert('Card updated successfully!');
            
            isEditMode = false;
            editCardId = null;
            
            const titleEl = document.querySelector('h1');
            const submitBtn = document.querySelector('.btn-primary');
            if (titleEl) titleEl.textContent = 'Add New Card';
            if (submitBtn) submitBtn.textContent = 'Add Card';
            
            window.location.href = 'collection.html';
        } else {
            const { addDoc, collection } = window.firebaseRefs;
            card.dateAdded = new Date();
            const docRef = await addDoc(collection(db, 'cards'), card);
            console.log('Document written with ID: ', docRef.id);
            alert('Card added successfully!');
            
            // Reset form
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

// ============================================================================
// DASHBOARD/INVENTORY FUNCTIONS (for index.html)
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
    const totalValue = cardCollection.reduce((sum, card) => sum + (card.purchaseCost || 0), 0);
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
        categoryStats[category].value += card.purchaseCost || 0;
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
    const expensiveCards = [...cardCollection]
        .filter(card => card.purchaseCost > 0)
        .sort((a, b) => b.purchaseCost - a.purchaseCost)
        .slice(0, 6);

    const container = document.getElementById('expensiveCards');
    if (container) {
        if (expensiveCards.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 2rem;">No cards with cost data yet.</p>';
            return;
        }

        container.innerHTML = expensiveCards.map(card => `
            <div class="mini-card">
                <div class="mini-card-header">
                    <div class="mini-card-player">${card.player || 'Unknown Player'}</div>
                    <div class="mini-card-price">$${card.purchaseCost.toFixed(2)}</div>
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

function switchView(view) {
    currentView = view;
    const listView = document.getElementById('listView');
    const gridView = document.getElementById('gridView');
    const listBtn = document.getElementById('listViewBtn');
    const gridBtn = document.getElementById('gridViewBtn');
    
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
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    const yearFilter = document.getElementById('filter-year')?.value.toLowerCase() || '';
    const productFilter = document.getElementById('filter-product')?.value.toLowerCase() || '';
    const playerFilter = document.getElementById('filter-player')?.value.toLowerCase() || '';
    const teamFilter = document.getElementById('filter-team')?.value.toLowerCase() || '';
    const quantityFilter = document.getElementById('filter-quantity')?.value.toLowerCase() || '';
    const rookieCardFilter = document.getElementById('filter-rookieCard')?.value || '';
    const parallelFilter = document.getElementById('filter-parallel')?.value.toLowerCase() || '';
    const numberedFilter = document.getElementById('filter-numbered')?.value.toLowerCase() || '';
    const descriptionFilter = document.getElementById('filter-description')?.value.toLowerCase() || '';
    
    if (categoryFilter) {
        filteredCards = filteredCards.filter(card => card.category && card.category.toString() === categoryFilter);
    }
    if (yearFilter) {
        filteredCards = filteredCards.filter(card => card.year && card.year.toString().toLowerCase().includes(yearFilter));
    }
    if (productFilter) {
        filteredCards = filteredCards.filter(card => card.product && card.product.toString().toLowerCase().includes(productFilter));
    }
    if (playerFilter) {
        filteredCards = filteredCards.filter(card => card.player && card.player.toString().toLowerCase().includes(playerFilter));
    }
    if (teamFilter) {
        filteredCards = filteredCards.filter(card => card.team && card.team.toString().toLowerCase().includes(teamFilter));
    }
    if (quantityFilter) {
        filteredCards = filteredCards.filter(card => card.quantity && card.quantity.toString().toLowerCase().includes(quantityFilter));
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
    if (descriptionFilter) {
        filteredCards = filteredCards.filter(card => card.description && card.description.toString().toLowerCase().includes(descriptionFilter));
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
        document.getElementById('listView').style.display = 'none';
        document.getElementById('gridView').style.display = 'none';
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
        const year = card.year || '';
        const product = card.product || '';
        const player = card.player || '';
        const team = card.team || '';
        const quantity = card.quantity || 1;
        const rookieCheck = card.rookieCard === 'Y' ? '✓' : '';
        const parallel = card.parallel !== 'N' ? (card.parallel || '') : '';
        const numbered = card.numbered !== 'N' ? (card.numbered || '') : '';
        const description = card.description || '';
        const cardId = card.id;
        
        return `<div class="list-item">
            <div>${year}</div>
            <div>${product}</div>
            <div class="list-item-player">${player}</div>
            <div>${team}</div>
            <div style="text-align: center;">${quantity}</div>
            <div>${rookieCheck}</div>
            <div>${parallel}</div>
            <div>${numbered}</div>
            <div class="list-item-details">${description}</div>
            <div class="action-buttons">
                <button class="view-btn" onclick="viewCard('${cardId}')">View</button>
                <button class="edit-btn" onclick="editCard('${cardId}')">Edit</button>
                <button class="delete-btn" onclick="deleteCard('${cardId}')">Delete</button>
            </div>
        </div>`;
    }).join('');
    container.innerHTML = listHTML;
}

function displayGridView(cards) {
    const container = document.getElementById('gridView');
    if (!container) return;
    
    const gridHTML = cards.map(card => {
        const player = card.player || '';
        const team = card.team || '';
        const year = card.year || '';
        const product = card.product || '';
        const category = card.category || '';
        const cardNumber = card.cardNumber || '';
        const rookieText = card.rookieCard === 'Y' ? 'Yes' : 'No';
        const parallelText = card.parallel !== 'N' ? (card.parallel || '') : 'No';
        const numberedText = card.numbered !== 'N' ? (card.numbered || '') : 'No';
        const description = card.description || 'None';
        const purchaseDate = card.purchaseDate === 'Unknown' || !card.purchaseDate ? 'Unknown' : new Date(card.purchaseDate).toLocaleDateString();
        const purchaseCost = card.purchaseCost ? '$' + parseFloat(card.purchaseCost).toFixed(2) : 'Not available';
        const quantity = card.quantity || 1;
        
        return `<div class="card-item">
            <div class="card-header">
                <div class="card-title-section">
                    <div class="card-title">${player}</div>
                    <div class="card-subtitle">${team}</div>
                    <div class="card-product">${year} ${product}</div>
                </div>
                <div class="card-category">${category}</div>
            </div>
            <div class="card-details">
                <strong>Card Number:</strong> ${cardNumber}<br>
                <strong>Rookie Card:</strong> ${rookieText}<br>
                <strong>Parallel:</strong> ${parallelText}<br>
                <strong>Numbered:</strong> ${numberedText}<br>
                <strong>Additional Notes:</strong> ${description}<br>
                <strong>Purchase Date:</strong> ${purchaseDate}<br>
                <strong>Purchase Cost:</strong> ${purchaseCost}<br>
                <strong>Quantity:</strong> ${quantity}
            </div>
        </div>`;
    }).join('');
    container.innerHTML = gridHTML;
}

function clearAllFilters() {
    const filters = [
        'filter-year', 'filter-product', 'filter-player', 'filter-team',
        'filter-quantity', 'filter-rookieCard', 'filter-parallel',
        'filter-numbered', 'filter-description', 'categoryFilter'
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
    
    const player = card.player || '';
    const team = card.team || '';
    const year = card.year || '';
    const product = card.product || '';
    const category = card.category || '';
    const cardNumber = card.cardNumber || '';
    const rookieText = card.rookieCard === 'Y' ? 'Yes' : 'No';
    const parallelText = card.parallel && card.parallel !== 'N' ? card.parallel : 'No';
    const numberedText = card.numbered && card.numbered !== 'N' ? card.numbered : 'No';
    const description = card.description || 'None';
    const purchaseDate = card.purchaseDate === 'Unknown' || !card.purchaseDate ? 'Unknown' : new Date(card.purchaseDate).toLocaleDateString();
    const purchaseCost = card.purchaseCost ? ' + parseFloat(card.purchaseCost).toFixed(2) : 'Not available';
    const quantity = card.quantity || 1;
    
    const modalHTML = `<div style="margin: 0; padding: 0;">
        <div class="card-header">
            <div class="card-title-section">
                <div class="card-title">${player}</div>
                <div class="card-subtitle">${team}</div>
                <div class="card-product">${year} ${product}</div>
            </div>
            <div class="card-category">${category}</div>
        </div>
        <div class="card-details" style="margin-top: 1.5rem; line-height: 2;">
            <div><strong>Card Number:</strong> ${cardNumber}</div>
            <div><strong>Rookie Card:</strong> ${rookieText}</div>
            <div><strong>Parallel:</strong> ${parallelText}</div>
            <div><strong>Numbered:</strong> ${numberedText}</div>
            <div><strong>Additional Notes:</strong> ${description}</div>
            <div><strong>Purchase Date:</strong> ${purchaseDate}</div>
            <div><strong>Purchase Cost:</strong> ${purchaseCost}</div>
            <div><strong>Quantity:</strong> ${quantity}</div>
        </div>
    </div>`;
    
    document.getElementById('modalCardContent').innerHTML = modalHTML;
    document.getElementById('cardModal').style.display = 'block';
}

function closeCardModal() {
    document.getElementById('cardModal').style.display = 'none';
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

// ============================================================================
// SHARED UTILITY FUNCTIONS
// ============================================================================

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.style.display = navLinks.style.display === 'none' ? 'flex' : 'none';
    }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    // Initialize Firebase first
    const success = await initFirebase();
    
    if (success) {
        // Handle add page specific initialization
        if (isAddPage()) {
            initializeYearDropdown();
            checkEditMode();
            
            // Only load collection data if not on add page or if we need it for validation
            // For now, we'll skip loading the full collection on add page for performance
            if (loadingEl) loadingEl.style.display = 'none';
            if (mainContentEl) mainContentEl.style.display = 'block';
        } else {
            // Load collection data for dashboard and collection pages
            if (!loadingEl || !mainContentEl) {
                console.error('Required DOM elements not found!');
                return;
            }
            
            setTimeout(() => {
                loadCollectionFromFirebase();
            }, 1000);
        }
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
});

// Modal click outside to close
window.onclick = function(event) {
    const modal = document.getElementById('cardModal');
    if (event.target === modal) {
        closeCardModal();
    }
}

// ============================================================================
// GLOBAL FUNCTION EXPORTS
// ============================================================================

// Make functions globally available for HTML onclick handlers
window.toggleMobileMenu = toggleMobileMenu;
window.switchView = switchView;
window.filterCollection = filterCollection;
window.exportToCSV = exportToCSV;
window.sortBy = sortBy;
window.clearAllFilters = clearAllFilters;
window.viewCard = viewCard;
window.closeCardModal = closeCardModal;
window.editCard = editCard;
window.deleteCard = deleteCard;

// Add page specific functions
window.toggleParallelInput = toggleParallelInput;
window.toggleNumberedInput = toggleNumberedInput;
window.toggleDateInput = toggleDateInput;
window.addCard = addCard;
window.handleCSVUpload = handleCSVUpload;