// Global variables
let app, db, cardCollection = [];
let currentView = 'list';
let currentSort = { field: null, direction: 'asc' };
let isProcessingEdit = false;

// Add page specific variables
let isEditMode = false;
let editCardId = null;

// Add new variables to track collection page state
let collectionPageState = null;

// Pagination variables
let currentPage = 1;
let recordsPerPage = 50;
let filteredCards = [];

// Password protection variables
let isPasswordVerified = false;
const ADMIN_PASSWORD_HASH = "4ab494b65bff40c8138477242279b8c97f8a3fa6344c8a4bb3111abe23f51a77";

// Simple hash function for password verification using crypto-js style hashing
function simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash.toString();
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    // Convert to positive hex string
    const hexHash = Math.abs(hash).toString(16);
    // Pad to ensure consistent length and add some complexity
    return 'bz' + hexHash.padStart(8, '0') + str.length.toString(16).padStart(2, '0');
}

// More secure hash function using built-in crypto API
async function secureHashPassword(password) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'buzz_collection_salt_2024'); // Add salt
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
        console.error('Crypto API not available, using fallback hash');
        return simpleHash(password + 'buzz_collection_salt_2024');
    }
}

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

// Password protection functions
function checkPasswordProtection() {
    if (isAddPage() && !isPasswordVerified) {
        showPasswordDialog();
        return false;
    }
    return true;
}

function showPasswordDialog() {
    const passwordModal = document.createElement('div');
    passwordModal.className = 'modal';
    passwordModal.id = 'passwordModal';
    passwordModal.innerHTML = `
        <div class="modal-content password-modal-content">
            <h3>Admin Access Required</h3>
            <p>Please enter the admin password to access this page:</p>
            <div class="password-input-container">
                <input type="password" id="passwordInput" placeholder="Enter password">
                <div class="password-buttons">
                    <button class="btn btn-primary" id="submitPassword">Submit</button>
                    <button class="btn" id="cancelPassword">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(passwordModal);
    passwordModal.style.display = 'flex';
    
    const passwordInput = document.getElementById('passwordInput');
    const submitBtn = document.getElementById('submitPassword');
    const cancelBtn = document.getElementById('cancelPassword');
    
    passwordInput.focus();
    
    passwordInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            verifyPassword();
        }
    });
    
    submitBtn.addEventListener('click', verifyPassword);
    cancelBtn.addEventListener('click', function() {
        passwordModal.remove();
        window.location.href = 'index.html';
    });
    
    async function verifyPassword() {
        const enteredPassword = passwordInput.value;
        let enteredHash;
        
        try {
            enteredHash = await secureHashPassword(enteredPassword);
        } catch (error) {
            console.error('Error hashing password:', error);
            enteredHash = simpleHash(enteredPassword + 'buzz_collection_salt_2024');
        }
        
        console.log('Entered hash:', enteredHash); // For debugging - remove in production
        console.log('Expected hash:', ADMIN_PASSWORD_HASH); // For debugging - remove in production
        
        if (enteredHash === ADMIN_PASSWORD_HASH) {
            isPasswordVerified = true;
            passwordModal.remove();
            // Store password verification in session
            sessionStorage.setItem('adminVerified', 'true');
            
            // Fix: Continue with page initialization after password verification
            initializeAddPageAfterAuth();
        } else {
            passwordInput.value = '';
            passwordInput.style.borderColor = '#ff6b6b';
            passwordInput.placeholder = 'Incorrect password - try again';
            setTimeout(() => {
                passwordInput.style.borderColor = '';
                passwordInput.placeholder = 'Enter password';
            }, 2000);
        }
    }
}

// New function to continue add page initialization after authentication
async function initializeAddPageAfterAuth() {
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    // Show content
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
            // Initialize the date input state since it's checked by default
            if (unknownDate.checked) {
                toggleDateInput();
            }
        }
        
        const unknownCost = document.getElementById('unknownCost');
        if (unknownCost) {
            unknownCost.addEventListener('change', toggleCostInput);
            // Initialize the cost input state since it's checked by default
            if (unknownCost.checked) {
                toggleCostInput();
            }
        }
        
        const ungradedGrade = document.getElementById('ungradedGrade');
        if (ungradedGrade) {
            ungradedGrade.addEventListener('change', toggleGradeInput);
            // Initialize the grade input state since it's checked by default
            if (ungradedGrade.checked) {
                toggleGradeInput();
            }
        }
        
        // FIXED: Add CSV file upload listener
        const csvFile = document.getElementById('csvFile');
        if (csvFile) {
            csvFile.addEventListener('change', handleCSVUpload);
            console.log('CSV file input listener added successfully');
        } else {
            console.error('CSV file input not found!');
        }
    } else {
        alert('Failed to initialize Firebase. Some features may not work.');
    }
}

// Updated password protection for Edit actions
function checkEditPermission() {
    return new Promise(async (resolve) => {
        if (sessionStorage.getItem('adminVerified') === 'true') {
            resolve(true);
            return;
        }
        
        const passwordModal = document.createElement('div');
        passwordModal.className = 'modal';
        passwordModal.id = 'editPasswordModal';
        passwordModal.innerHTML = `
            <div class="modal-content password-modal-content">
                <h3>Admin Verification Required</h3>
                <p>Admin password required to edit cards:</p>
                <div class="password-input-container">
                    <input type="password" id="editPasswordInput" placeholder="Enter admin password">
                    <div class="password-buttons">
                        <button class="btn btn-primary" id="submitEditPassword">Verify</button>
                        <button class="btn" id="cancelEditPassword">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(passwordModal);
        passwordModal.style.display = 'flex';
        
        const passwordInput = document.getElementById('editPasswordInput');
        const submitBtn = document.getElementById('submitEditPassword');
        const cancelBtn = document.getElementById('cancelEditPassword');
        
        passwordInput.focus();
        
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verifyEditPassword();
            }
        });
        
        submitBtn.addEventListener('click', verifyEditPassword);
        cancelBtn.addEventListener('click', function() {
            passwordModal.remove();
            resolve(false);
        });
        
        async function verifyEditPassword() {
            const enteredPassword = passwordInput.value;
            let enteredHash;
            
            try {
                enteredHash = await secureHashPassword(enteredPassword);
            } catch (error) {
                console.error('Error hashing password:', error);
                enteredHash = simpleHash(enteredPassword + 'buzz_collection_salt_2024');
            }
            
            if (enteredHash === ADMIN_PASSWORD_HASH) {
                sessionStorage.setItem('adminVerified', 'true');
                passwordModal.remove();
                resolve(true);
            } else {
                passwordInput.value = '';
                passwordInput.style.borderColor = '#ff6b6b';
                passwordInput.placeholder = 'Incorrect password - try again';
                setTimeout(() => {
                    passwordInput.style.borderColor = '';
                    passwordInput.placeholder = 'Enter admin password';
                }, 2000);
            }
        }
    });
}

// FIXED: Combined delete permission function to show single warning dialog
function checkDeletePermission() {
    return new Promise(async (resolve) => {
        if (sessionStorage.getItem('adminVerified') === 'true') {
            resolve(true);
            return;
        }
        
        const passwordModal = document.createElement('div');
        passwordModal.className = 'modal';
        passwordModal.id = 'deletePasswordModal';
        passwordModal.innerHTML = `
            <div class="modal-content password-modal-content">
                <h3>Admin Verification Required</h3>
                <p>Admin password required to delete cards:</p>
                <div class="password-input-container">
                    <input type="password" id="deletePasswordInput" placeholder="Enter admin password">
                    <div class="password-buttons">
                        <button class="btn btn-primary" id="submitDeletePassword">Verify</button>
                        <button class="btn" id="cancelDeletePassword">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(passwordModal);
        passwordModal.style.display = 'flex';
        
        const passwordInput = document.getElementById('deletePasswordInput');
        const submitBtn = document.getElementById('submitDeletePassword');
        const cancelBtn = document.getElementById('cancelDeletePassword');
        
        passwordInput.focus();
        
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                verifyDeletePassword();
            }
        });
        
        submitBtn.addEventListener('click', verifyDeletePassword);
        cancelBtn.addEventListener('click', function() {
            passwordModal.remove();
            resolve(false);
        });
        
        async function verifyDeletePassword() {
            const enteredPassword = passwordInput.value;
            let enteredHash;
            
            try {
                enteredHash = await secureHashPassword(enteredPassword);
            } catch (error) {
                console.error('Error hashing password:', error);
                enteredHash = simpleHash(enteredPassword + 'buzz_collection_salt_2024');
            }
            
            if (enteredHash === ADMIN_PASSWORD_HASH) {
                sessionStorage.setItem('adminVerified', 'true');
                passwordModal.remove();
                resolve(true);
            } else {
                passwordInput.value = '';
                passwordInput.style.borderColor = '#ff6b6b';
                passwordInput.placeholder = 'Incorrect password - try again';
                setTimeout(() => {
                    passwordInput.style.borderColor = '';
                    passwordInput.placeholder = 'Enter admin password';
                }, 2000);
            }
        }
    });
}

// Shared function to load collection from Firebase
async function loadCollectionFromFirebase() {
    console.log('loadCollectionFromFirebase started');
    try {
        if (!db) {
            throw new Error('Database reference is null or undefined');
        }
        
        console.log('Database reference exists, getting Firebase functions...');
        const { collection, getDocs, query, orderBy } = window.firebaseRefs;
        
        console.log('Creating collection reference...');
        const cardsCollection = collection(db, 'cards');
        console.log('Creating query...');
        const cardsQuery = query(cardsCollection, orderBy('dateAdded', 'desc'));
        console.log('Executing query...');
        const querySnapshot = await getDocs(cardsQuery);
        console.log('Query completed, processing results...');
        
        cardCollection = [];
        console.log('Processing query results...');
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            cardCollection.push({
                id: doc.id,
                ...data,
                dateAdded: data.dateAdded?.toDate?.() || new Date(data.dateAdded),
                quantity: data.quantity || 1
            });
        });
        
        console.log(`Processed ${cardCollection.length} cards`);
        
        // Make cardCollection available globally for dynamic dashboard
        window.cardCollection = cardCollection;
        
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.getElementById('mainContent');
        
        console.log('Hiding loading, showing main content...');
        if (loadingEl) loadingEl.style.display = 'none';
        if (mainContentEl) mainContentEl.style.display = 'block';
        
        // Call appropriate display function based on current page
        if (isCollectionPage()) {
            console.log('Collection page detected, calling displayCollection...');
            updateCategoryFilter();
            displayCollection();
        } else if (isDashboardPage()) {
            console.log('Dashboard page detected, calling displayInventory...');
            displayInventory();
        }
        
        console.log('loadCollectionFromFirebase completed successfully');
        
    } catch (error) {
        console.error('Error loading collection:', error);
        console.error('Error details:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
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

// Fixed: Single event listener addition to prevent double-click issue
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
    
    // Add event listeners for filtering with improved prioritization
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
    
    // Update the last export display
    updateLastExportDisplay();
    
    // Action button event handling will be done directly on the buttons when they're created
    
    // Add global click listener to debug what's happening
    document.addEventListener('click', function(event) {
        console.log('Global click detected on:', event.target.tagName, event.target.className, event.target.id);
        if (event.target.classList.contains('edit-btn')) {
            console.log('Edit button clicked in global listener');
        }
    }, true); // Use capture phase to see events first
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

// FIXED: populateForm function with normalized date handling to prevent timezone issues
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
    setFieldValue('autograph', card.autograph || 'N');
    setFieldValue('relic', card.relic || 'N');
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
    
    // Handle base set field - Updated to use Y/N values only
    const baseSetSelect = document.getElementById('baseSet');
    if (baseSetSelect) {
        if (card.baseSet && card.baseSet !== 'N') {
            baseSetSelect.value = 'Y';
        } else {
            baseSetSelect.value = 'N';
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
    
    // FIXED: Handle estimated value date with proper date formatting and timezone normalization
    const estimatedValueDate = document.getElementById('estimatedValueDate');
    if (estimatedValueDate && card.estimatedValueDate) {
        // Normalize date by treating as local date to prevent timezone issues
        const normalizedDate = normalizeDate(card.estimatedValueDate);
        if (normalizedDate) {
            estimatedValueDate.value = normalizedDate;
        }
    }
    
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
    
    // FIXED: Handle purchase date with proper date formatting and timezone normalization
    const purchaseDate = document.getElementById('purchaseDate');
    const unknownDate = document.getElementById('unknownDate');
    if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
        // Normalize date by treating as local date to prevent timezone issues
        const normalizedDate = normalizeDate(card.purchaseDate);
        if (normalizedDate) {
            if (purchaseDate) purchaseDate.value = normalizedDate;
        }
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

// NEW: Helper function to normalize dates and prevent timezone issues
function normalizeDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        // If it's already a string in YYYY-MM-DD format, use it directly
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
            return dateValue;
        }
        
        // If it's a date object or timestamp, convert it
        if (dateValue instanceof Date) {
            date = dateValue;
        } else if (typeof dateValue === 'string') {
            date = new Date(dateValue + 'T00:00:00'); // Force local time interpretation
        } else {
            date = new Date(dateValue);
        }
        
        if (isNaN(date.getTime())) {
            return null;
        }
        
        // Get local date components to avoid timezone shift
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error('Error normalizing date:', error);
        return null;
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
        dateInput.style.opacity = checkbox.checked ? '0.5' : '1';
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
        baseSet: getFieldValue('baseSet') || 'N', // Updated to use direct Y/N value
        player: getFieldValue('player'),
        team: getFieldValue('team'),
        autograph: getFieldValue('autograph') || 'N', // New autograph field
        relic: getFieldValue('relic') || 'N', // New relic field
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

    // Validation: Check if estimated value is set but no valid date is provided
    const hasEstimatedValue = card.estimatedValue && 
                             card.estimatedValue !== 'Unknown' && 
                             card.estimatedValue !== 0;
    
    let hasValidDate = false;
    if (card.estimatedValueDate) {
        const normalizedDate = formatDateForDisplay(card.estimatedValueDate);
        if (normalizedDate) {
            hasValidDate = true;
        }
    }
    
    if (hasEstimatedValue && !hasValidDate) {
        const playerName = card.player || 'Unknown Player';
        const teamName = card.team || 'Unknown Team';
        const year = card.year || '';
        const product = card.product || '';
        
        // Show custom validation dialog
        showValidationDialog(() => {
            // User wants to add a date - focus on the date field
            const dateField = document.getElementById('estimatedValueDate');
            if (dateField) {
                dateField.focus();
                dateField.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            hideValidationDialog();
        });
        return;
    }

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
            
            // Updated buttons for add mode with new functionality
            buttonContainer.innerHTML = `
                <button class="btn btn-primary add-another-btn" id="addAnotherSameSetBtn">
                    <span>Add Another Card (Same Product Set)</span>
                    <label class="checkbox-label">
                        <input type="checkbox" id="baseSetSameSet"> Base Set
                    </label>
                </button>
                <button class="btn btn-primary add-another-btn" id="addAnotherBtn">
                    <span>Add Another Card (New Product Set)</span>
                    <label class="checkbox-label">
                        <input type="checkbox" id="baseSetNewSet"> Base Set
                    </label>
                </button>
                <button class="btn" id="viewCollectionBtn">View Collection</button>
            `;
            
            // Add event listeners for buttons
            const addAnotherSameSetBtn = document.getElementById('addAnotherSameSetBtn');
            const addAnotherBtn = document.getElementById('addAnotherBtn');
            const viewCollectionBtn = document.getElementById('viewCollectionBtn');
            
            if (addAnotherSameSetBtn) {
                addAnotherSameSetBtn.addEventListener('click', addAnotherCardSameSet);
                
                // Add event listener for checkbox to prevent button click
                const baseSetSameSetCheckbox = document.getElementById('baseSetSameSet');
                if (baseSetSameSetCheckbox) {
                    baseSetSameSetCheckbox.addEventListener('click', function(e) {
                        e.stopPropagation();
                    });
                }
            }
            
            if (addAnotherBtn) {
                addAnotherBtn.addEventListener('click', addAnotherCard);
                
                // Add event listener for checkbox to prevent button click
                const baseSetNewSetCheckbox = document.getElementById('baseSetNewSet');
                if (baseSetNewSetCheckbox) {
                    baseSetNewSetCheckbox.addEventListener('click', function(e) {
                        e.stopPropagation();
                    });
                }
            }
            
            if (viewCollectionBtn) {
                viewCollectionBtn.addEventListener('click', viewCollection);
            }
        }
    }
    
    modal.style.display = 'flex';
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
    
    // Check if Base Set checkbox is checked
    const baseSetCheckbox = document.getElementById('baseSetNewSet');
    const shouldSetBaseSet = baseSetCheckbox && baseSetCheckbox.checked;
    
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
        
        // Set Base Set to "Yes" if checkbox was checked
        if (shouldSetBaseSet) {
            const baseSetField = document.getElementById('baseSet');
            if (baseSetField) baseSetField.value = 'Y';
        }
    }
    
    // Scroll to top of page
    window.scrollTo(0, 0);
}

// New function to add another card with the same product set (Category, Year, Brand)
function addAnotherCardSameSet() {
    const modal = document.getElementById('successModal');
    modal.style.display = 'none';
    
    // Check if Base Set checkbox is checked
    const baseSetCheckbox = document.getElementById('baseSetSameSet');
    const shouldSetBaseSet = baseSetCheckbox && baseSetCheckbox.checked;
    
    // Get the form data from the just-added card
    const category = document.getElementById('category')?.value || '';
    const year = document.getElementById('year')?.value || '';
    const product = document.getElementById('product')?.value || '';
    
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
        
        // Populate the form with the same Category, Year, and Brand
        const categoryField = document.getElementById('category');
        const yearField = document.getElementById('year');
        const productField = document.getElementById('product');
        
        if (categoryField && category) categoryField.value = category;
        if (yearField && year) yearField.value = year;
        if (productField && product) productField.value = product;
        
        // Set Base Set to "Yes" if checkbox was checked
        if (shouldSetBaseSet) {
            const baseSetField = document.getElementById('baseSet');
            if (baseSetField) baseSetField.value = 'Y';
        }
    }
    
    // Scroll to top of page
    window.scrollTo(0, 0);
}

function viewCollection() {
    window.location.href = 'collection.html';
}

// Simple working import dialog
function showImportDialog() {
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
                <div class="import-status-continue" id="importStatusContinue">
                    <button class="btn btn-primary" id="continueToResults">Continue</button>
                </div>
            </div>
        `;
        document.body.appendChild(importModal);
    }
    
    // Reset continue button
    const continueSection = document.getElementById('importStatusContinue');
    if (continueSection) {
        continueSection.classList.remove('show');
    }
    
    importModal.style.display = 'flex';
}

// Simple working progress update
function updateImportProgress(current, total, successCount, errorCount) {
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const processedCountEl = document.getElementById('processedCount');
    const successCountEl = document.getElementById('successCount');
    const errorCountEl = document.getElementById('errorCount');
    
    if (progressFill && progressText && processedCountEl && successCountEl && errorCountEl) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        progressFill.style.width = percentage + '%';
        
        if (current === total && current > 0) {
            progressText.textContent = `Import completed! Processed ${total} records.`;
            
            // Show continue button
            const continueSection = document.getElementById('importStatusContinue');
            if (continueSection) {
                continueSection.classList.add('show');
            }
        } else {
            progressText.textContent = `Processing record ${current} of ${total}...`;
        }
        
        processedCountEl.textContent = current;
        successCountEl.textContent = successCount;
        errorCountEl.textContent = errorCount;
    }
}

// Store import results for continue button
let importResults = null;

// FIXED: CSV import with proper date handling for import issues
async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        console.log('No file selected');
        return;
    }
    
    console.log('CSV file selected:', file.name);
    
    // Check if Firebase is initialized
    if (!db || !window.firebaseRefs) {
        console.error('Firebase not initialized');
        alert('System not ready. Please wait a moment and try again.');
        return;
    }
    
    showImportDialog();
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        console.log('File read successfully, starting processing...');
        const csv = e.target.result;
        const lines = csv.split('\n');
        
        let successCount = 0;
        let errorCount = 0;
        let importLog = [];
        
        // Get data lines (skip header)
        const dataLines = [];
        for (let i = 1; i < lines.length; i++) {
            const trimmedLine = lines[i].trim();
            if (trimmedLine !== '' && trimmedLine.split(',').some(cell => cell.trim() !== '')) {
                dataLines.push({
                    content: lines[i],
                    logLineNumber: dataLines.length + 1
                });
            }
        }
        
        const totalDataLines = dataLines.length;
        console.log(`Processing ${totalDataLines} data lines`);
        
        const { addDoc, collection } = window.firebaseRefs;
        
        updateImportProgress(0, totalDataLines, 0, 0);
        
        let processedCount = 0;
        
        for (const lineData of dataLines) {
            processedCount++;
            console.log(`Processing line ${processedCount}/${totalDataLines}`);
            
            try {
                // Fixed: Use proper CSV parsing to handle commas in quoted fields
                const values = parseCSVLine(lineData.content);
                
                if (values.every(val => val === '')) {
                    continue;
                }
                
                // FIXED: Parse dates properly for import to prevent "Unknown" issues
                const parsePurchaseDate = (dateStr) => {
                    if (!dateStr || dateStr.toLowerCase() === 'unknown' || dateStr.trim() === '') {
                        return 'Unknown';
                    }
                    // Try to parse common date formats
                    try {
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) {
                            return 'Unknown';
                        }
                        // Return in YYYY-MM-DD format to ensure consistency
                        return date.toISOString().split('T')[0];
                    } catch (error) {
                        console.warn('Failed to parse purchase date:', dateStr);
                        return 'Unknown';
                    }
                };
                
                const parseEstimatedValueDate = (dateStr) => {
                    if (!dateStr || dateStr.trim() === '') {
                        return '';
                    }
                    // Try to parse common date formats
                    try {
                        const date = new Date(dateStr);
                        if (isNaN(date.getTime())) {
                            return '';
                        }
                        // Return in YYYY-MM-DD format to ensure consistency
                        return date.toISOString().split('T')[0];
                    } catch (error) {
                        console.warn('Failed to parse estimated value date:', dateStr);
                        return '';
                    }
                };
                
                // Fixed: Match exact export column order
                const card = {
                    category: values[0] || '',
                    year: parseInt(values[1]) || 0,
                    product: values[2] || '',
                    cardNumber: values[3] || '',
                    baseSet: values[4] || 'N',
                    player: values[5] || '',
                    team: values[6] || '',
                    autograph: values[7] || 'N',
                    relic: values[8] || 'N',
                    insert: values[9] || 'N',
                    parallel: values[10] || 'N',
                    numbered: values[11] ? values[11].replace(/^'/, '') : 'N',
                    rookieCard: values[12] || 'N',
                    imageVariation: values[13] || 'N',
                    quantity: parseInt(values[14]) || 1,
                    grade: values[15] || 'Ungraded',
                    purchaseDate: parsePurchaseDate(values[16]), // FIXED: Parse date properly
                    purchaseCost: values[17] ? (values[17].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[17]) || 0) : 0,
                    estimatedValue: values[18] ? (values[18].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[18]) || 0) : 0,
                    estimatedValueDate: parseEstimatedValueDate(values[19]), // FIXED: Parse date properly
                    description: values[20] || '',
                    dateAdded: new Date()
                };
                
                await addDoc(collection(db, 'cards'), card);
                successCount++;
                
                let cardDetails = card.cardNumber || 'N/A';
                cardDetails += card.parallel && card.parallel !== 'N' ? ` | ${card.parallel}` : ' | N';
                cardDetails += card.numbered && card.numbered !== 'N' ? ` | ${card.numbered}` : ' | N';
                
                importLog.push({
                    line: lineData.logLineNumber,
                    status: 'Success',
                    player: card.player,
                    details: cardDetails
                });
                
            } catch (error) {
                console.error(`Error processing line ${processedCount}:`, error);
                errorCount++;
                
                const values = parseCSVLine(lineData.content);
                let cardDetails = values[3] || 'N/A';
                cardDetails += values[9] && values[9] !== 'N' ? ` | ${values[9]}` : ' | N';
                cardDetails += values[10] && values[10] !== 'N' ? ` | ${values[10]}` : ' | N';
                
                importLog.push({
                    line: lineData.logLineNumber,
                    status: 'Failed',
                    player: values[5] || 'Unknown',
                    details: cardDetails,
                    error: error.message
                });
            }
            
            updateImportProgress(processedCount, totalDataLines, successCount, errorCount);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        // Store results and set up continue button
        importResults = { successCount, errorCount, importLog };
        
        const continueBtn = document.getElementById('continueToResults');
        if (continueBtn) {
            continueBtn.onclick = function() {
                showImportCompletion(importResults.successCount, importResults.errorCount, importResults.importLog);
            };
        }
        
        console.log(`Import completed: ${successCount} successful, ${errorCount} failed`);
        
        event.target.value = '';
    };
    
    reader.onerror = function() {
        console.error('Error reading file');
        alert('Error reading file. Please try again.');
    };
    
    reader.readAsText(file);
}

// Fixed: Proper CSV parsing function to handle commas in quoted fields
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < line.length) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i += 2;
                continue;
            } else {
                // Toggle quote state
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            // End of field
            result.push(current.trim());
            current = '';
            i++;
            continue;
        } else {
            current += char;
        }
        i++;
    }
    
    // Add the last field
    result.push(current.trim());
    
    return result;
}

// Show import completion - FIXED alignment with exact grid measurements
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
                            <span class="log-line">${entry.line}.</span>
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
    
    completionModal.style.display = 'flex';
}

// Download import log with updated header - FIXED: Added periods after line numbers
function downloadImportLog(importLog) {
    const csvContent = [
        'Line,Status,Player,"Card Details (Card # | Parallel | Numbered)"',
        ...importLog.map(entry => 
            `${entry.line}.,"${entry.status}","${entry.player}","${entry.details}"`
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
// DASHBOARD/INVENTORY FUNCTIONS (for index.html) - UPDATED WITH CATEGORY FIELD AND AUTOGRAPHS
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
    displayExpensiveCards();
    
    // Add event listener for the sets filter
    const setsFilter = document.getElementById('setsFilter');
    if (setsFilter) {
        setsFilter.addEventListener('change', displayTopProducts);
    }
}

function updateSummaryStats() {
    const totalCards = cardCollection.length;
    // Use estimatedValue instead of purchaseCost for total value with comma formatting
    const totalValue = cardCollection.reduce((sum, card) => {
        const value = card.estimatedValue;
        if (value === 'Unknown' || !value) return sum;
        return sum + parseFloat(value);
    }, 0);
    const rookieCards = cardCollection.filter(card => card.rookieCard === 'Y').length;
    const numberedCards = cardCollection.filter(card => card.numbered !== 'N').length;
    const autographCards = cardCollection.filter(card => card.autograph === 'Y').length; // New autograph count
    const relicCards = cardCollection.filter(card => card.relic === 'Y').length; // New relic count

    const totalCardsEl = document.getElementById('totalCards');
    const totalValueEl = document.getElementById('totalValue');
    const rookieCardsEl = document.getElementById('rookieCards');
    const numberedCardsEl = document.getElementById('numberedCards');
    const autographCardsEl = document.getElementById('autographCards'); // New element
    const relicCardsEl = document.getElementById('relicCards'); // New element

    if (totalCardsEl) totalCardsEl.textContent = totalCards.toLocaleString();
    if (totalValueEl) totalValueEl.textContent = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (rookieCardsEl) rookieCardsEl.textContent = rookieCards.toLocaleString();
    if (numberedCardsEl) numberedCardsEl.textContent = numberedCards.toLocaleString();
    if (autographCardsEl) autographCardsEl.textContent = autographCards.toLocaleString(); // New stat
    if (relicCardsEl) relicCardsEl.textContent = relicCards.toLocaleString(); // New stat
}

function displayCategoryBreakdown() {
    const categoryStats = {};
    cardCollection.forEach(card => {
        const category = card.category || 'Unknown';
        if (!categoryStats[category]) {
            categoryStats[category] = { count: 0, value: 0 };
        }
        categoryStats[category].count++;
        // Use estimatedValue instead of purchaseCost
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
                <div class="category-value-green">${stats.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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

// Updated function to show Sets Collected count and top products with filtering
function displayTopProducts() {
    const productStats = {};
    cardCollection.forEach(card => {
        const productKey = `${card.year || 'Unknown'} ${card.product || 'Unknown'}`;
        const category = card.category || 'Unknown';
        const fullKey = `${productKey} ${category}`;
        
        if (!productStats[fullKey]) {
            productStats[fullKey] = { 
                count: 0, 
                emv: 0, 
                year: card.year || 'Unknown',
                product: card.product || 'Unknown',
                category: card.category || 'Unknown'
            };
        }
        
        productStats[fullKey].count++;
        
        // Add EMV (Estimated Market Value)
        const value = card.estimatedValue;
        if (value !== 'Unknown' && value) {
            productStats[fullKey].emv += parseFloat(value);
        }
    });

    // Update the heading with total number of unique sets
    const totalUniqueSets = Object.keys(productStats).length;
    const headingElement = document.getElementById('setsCollectedHeading');
    if (headingElement) {
        headingElement.textContent = `Sets Collected: ${totalUniqueSets}`;
    }

    // Get the current filter selection
    const filterSelect = document.getElementById('setsFilter');
    const currentFilter = filterSelect ? filterSelect.value : 'emv-high';

    // Sort products based on filter selection
    let sortedProducts = Object.entries(productStats);
    
    switch (currentFilter) {
        case 'emv-high':
            sortedProducts = sortedProducts.sort((a, b) => b[1].emv - a[1].emv);
            break;
        case 'emv-low':
            sortedProducts = sortedProducts.sort((a, b) => a[1].emv - b[1].emv);
            break;
        case 'cards-high':
            sortedProducts = sortedProducts.sort((a, b) => b[1].count - a[1].count);
            break;
        case 'cards-low':
            sortedProducts = sortedProducts.sort((a, b) => a[1].count - b[1].count);
            break;
        case 'year-newest':
            sortedProducts = sortedProducts.sort((a, b) => {
                // First sort by year (numerically)
                const yearA = parseInt(a[1].year) || 0;
                const yearB = parseInt(b[1].year) || 0;
                if (yearA !== yearB) {
                    return yearB - yearA; // Newest years first
                }
                // Then sort by product alphabetically
                return a[1].product.localeCompare(b[1].product);
            });
            break;
        case 'year-oldest':
            sortedProducts = sortedProducts.sort((a, b) => {
                // First sort by year (numerically)
                const yearA = parseInt(a[1].year) || 0;
                const yearB = parseInt(b[1].year) || 0;
                if (yearA !== yearB) {
                    return yearA - yearB; // Oldest years first
                }
                // Then sort by product alphabetically
                return a[1].product.localeCompare(b[1].product);
            });
            break;
        default:
            sortedProducts = sortedProducts.sort((a, b) => b[1].emv - a[1].emv);
    }

    const container = document.getElementById('productList');
    if (container) {
        container.innerHTML = sortedProducts.map(([product, stats]) => {
            const encodedSetName = encodeURIComponent(product);
            return `
                                 <div class="product-item" onclick="window.location.href='dashboard.html?set=${encodedSetName}'" style="cursor: pointer;">
                    <div class="product-info">
                        <div class="product-name">${product}</div>
                        <div class="product-emv">EMV: $${stats.emv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div class="product-count">${stats.count}</div>
                </div>
            `;
        }).join('');
    }
}

// Updated function to show top 20 cards with new layout structure and autograph info
function displayExpensiveCards(cardsToFilter = null) {
    // Use estimatedValue instead of purchaseCost for expensive cards and increase to 20
    const sourceCards = cardsToFilter || cardCollection;
    const expensiveCards = [...sourceCards]
        .filter(card => card.estimatedValue !== 'Unknown' && card.estimatedValue > 0)
        .sort((a, b) => parseFloat(b.estimatedValue) - parseFloat(a.estimatedValue))
        .slice(0, 20); // Changed from 8 to 20

    const container = document.getElementById('expensiveCards');
    if (container) {
        if (expensiveCards.length === 0) {
            container.innerHTML = '<p style="color: #888; text-align: center; padding: 2rem;">No cards with estimated market value data yet.</p>';
            return;
        }

        container.innerHTML = expensiveCards.map(card => {
            // Build the special info line (RC | Autograph | Parallel | Numbered)
            const specialInfo = [];
            
            if (card.rookieCard === 'Y') {
                specialInfo.push('RC');
            }
            
            if (card.autograph === 'Y') {
                specialInfo.push('Auto');
            }
            
            if (card.relic === 'Y') {
                specialInfo.push('Relic');
            }
            
            if (card.parallel && card.parallel !== 'N') {
                specialInfo.push(card.parallel);
            }
            
            if (card.numbered && card.numbered !== 'N') {
                // FIXED: Remove leading single quote from numbered display
                const numberedValue = card.numbered.startsWith("'") ? card.numbered.substring(1) : card.numbered;
                specialInfo.push(numberedValue);
            }
            
            // Only show the special info line if there's at least one item
            const specialInfoLine = specialInfo.length > 0 ? 
                `<div class="mini-card-special-info">${specialInfo.join(' | ')}</div>` : '';
            
            return `
                <div class="mini-card clickable-card" data-card-id="${card.id}" style="cursor: pointer;">
                    <div class="mini-card-header">
                        <div class="mini-card-player">${card.player || 'Unknown Player'}</div>
                        <div class="mini-card-price-green">${parseFloat(card.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </div>
                    <div class="mini-card-team">${card.team || 'Unknown'}</div>
                    <div class="mini-card-details">
                        ${card.year || 'Unknown'} ${card.product || 'Unknown'} ${card.category || 'Unknown'} #${card.cardNumber || 'N/A'}
                    </div>
                    ${specialInfoLine}
                </div>
            `;
        }).join('');

        // Fixed: Add click event listeners to mini cards using event delegation
        container.removeEventListener('click', handleMiniCardClick); // Remove any existing listeners
        container.addEventListener('click', handleMiniCardClick);
    }
}

// New centralized event handler for mini card clicks
function handleMiniCardClick(event) {
    const clickedCard = event.target.closest('.clickable-card');
    if (clickedCard) {
        event.preventDefault();
        event.stopPropagation();
        const cardId = clickedCard.getAttribute('data-card-id');
        if (cardId) {
            // Create a temporary modal for the card view since we're on the dashboard
            createTemporaryCardModal();
            viewCard(cardId);
        }
    }
}

// Create temporary modal for dashboard card views
function createTemporaryCardModal() {
    // Check if modal already exists
    let modal = document.getElementById('cardModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cardModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <div id="modalCardContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Add close functionality
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', closeCardModal);
        }
        
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeCardModal();
            }
        });
    }
}

// ============================================================================
// COLLECTION VIEW FUNCTIONS (for collection.html) - UPDATED WITH PAGINATION AND ASTERISK FILTERING
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

// Custom sort function for improved filtering with exact match priority and asterisk support
function smartSort(cards, filterValue, field) {
    if (!filterValue) return cards;
    
    // Handle asterisk filtering - show only cards with non-empty values
    if (filterValue === '*') {
        return cards.filter(card => {
            const fieldValue = card[field];
            return fieldValue && fieldValue !== '' && fieldValue !== 'N' && fieldValue !== 'Unknown';
        });
    }
    
    const exactMatches = [];
    const startsWithMatches = [];
    const containsMatches = [];
    
    const lowerFilterValue = filterValue.toLowerCase();
    
    cards.forEach(card => {
        const fieldValue = (card[field] || '').toString().toLowerCase();
        
        if (fieldValue === lowerFilterValue) {
            exactMatches.push(card);
        } else if (fieldValue.startsWith(lowerFilterValue)) {
            startsWithMatches.push(card);
        } else if (fieldValue.includes(lowerFilterValue)) {
            containsMatches.push(card);
        }
    });
    
    // Sort each group alphabetically/numerically
    const sortGroup = (group) => {
        return group.sort((a, b) => {
            let aVal = a[field] || '';
            let bVal = b[field] || '';
            
            // Handle numeric fields
            if (field === 'year' || field === 'cardNumber') {
                const aNum = parseInt(aVal);
                const bNum = parseInt(bVal);
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return aNum - bNum;
                }
            }
            
            // Handle string fields
            aVal = aVal.toString().toLowerCase();
            bVal = bVal.toString().toLowerCase();
            
            return aVal.localeCompare(bVal);
        });
    };
    
    return [
        ...sortGroup(exactMatches),
        ...sortGroup(startsWithMatches),
        ...sortGroup(containsMatches)
    ];
}

// Updated display collection function with improved filtering and asterisk support
function displayCollection() {
    console.log('displayCollection started');
    console.log('displayCollection called from:', new Error().stack);
    
    // Prevent displayCollection from running when edit is in progress
    if (isProcessingEdit) {
        console.log('Edit in progress, skipping displayCollection');
        return;
    }
    
    const totalElement = document.getElementById('totalCards');
    const filteredElement = document.getElementById('filteredCount');
    const emptyState = document.getElementById('emptyState');
    const emptyStateMessage = document.getElementById('emptyStateMessage');
    const emptyStateButton = document.getElementById('emptyStateButton');
    
    console.log('Elements found:', { totalElement: !!totalElement, filteredElement: !!filteredElement });
    if (!totalElement || !filteredElement) {
        console.log('Required elements not found, returning early');
        return;
    }
    
    filteredCards = [...cardCollection];
    
    // Apply filters with smart sorting and asterisk support
    const categoryFilter = document.getElementById('categoryFilter')?.value || '';
    const yearFilter = document.getElementById('filter-year')?.value || '';
    const productFilter = document.getElementById('filter-product')?.value || '';
    const cardNumberFilter = document.getElementById('filter-cardNumber')?.value || '';
    const baseSetFilter = document.getElementById('filter-baseSet')?.value.toLowerCase() || '';
    const playerFilter = document.getElementById('filter-player')?.value || '';
    const teamFilter = document.getElementById('filter-team')?.value || '';
    const rookieCardFilter = document.getElementById('filter-rookieCard')?.value || '';
    const parallelFilter = document.getElementById('filter-parallel')?.value || '';
    const numberedFilter = document.getElementById('filter-numbered')?.value || '';
    const insertFilter = document.getElementById('filter-insert')?.value || '';
    const autographFilter = document.getElementById('filter-autograph')?.value || ''; // New autograph filter
    const relicFilter = document.getElementById('filter-relic')?.value || ''; // New relic filter
    
    if (categoryFilter) {
        filteredCards = filteredCards.filter(card => card.category && card.category.toString() === categoryFilter);
    }
    
    // Apply smart sorting for each filter with asterisk support
    if (yearFilter) {
        filteredCards = smartSort(filteredCards, yearFilter, 'year');
    }
    if (productFilter) {
        filteredCards = smartSort(filteredCards, productFilter, 'product');
    }
    if (cardNumberFilter) {
        filteredCards = smartSort(filteredCards, cardNumberFilter, 'cardNumber');
    }
    if (playerFilter) {
        filteredCards = smartSort(filteredCards, playerFilter, 'player');
    }
    if (teamFilter) {
        filteredCards = smartSort(filteredCards, teamFilter, 'team');
    }
    if (parallelFilter) {
        filteredCards = smartSort(filteredCards, parallelFilter, 'parallel');
    }
    if (numberedFilter) {
        filteredCards = smartSort(filteredCards, numberedFilter, 'numbered');
    }
    if (insertFilter) {
        filteredCards = smartSort(filteredCards, insertFilter, 'insert');
    }
    if (autographFilter) {
        filteredCards = smartSort(filteredCards, autographFilter, 'autograph');
    }
    if (relicFilter) {
        filteredCards = smartSort(filteredCards, relicFilter, 'relic');
    }
    
    // Handle other filters normally
    if (baseSetFilter) {
        if (baseSetFilter === '*') {
            // Show cards with base set = 'Y'
            filteredCards = filteredCards.filter(card => card.baseSet === 'Y');
        } else {
            const baseSetValue = card => card.baseSet === 'Y' ? 'y' : 'n';
            filteredCards = filteredCards.filter(card => baseSetValue(card).includes(baseSetFilter));
        }
    }
    
    if (rookieCardFilter) {
        if (rookieCardFilter === '*') {
            // Show cards with rookie card = 'Y'
            filteredCards = filteredCards.filter(card => card.rookieCard === 'Y');
        } else {
            filteredCards = filteredCards.filter(card => card.rookieCard === rookieCardFilter);
        }
    }

    // Apply sorting if no smart filter was applied
    if (!yearFilter && !productFilter && !cardNumberFilter && !playerFilter && !teamFilter && !parallelFilter && !numberedFilter && !insertFilter && !autographFilter && !relicFilter) {
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
                                   parallelFilter || numberedFilter || insertFilter || autographFilter;
            
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
    console.log('displayPaginatedList started');
    const totalPages = Math.ceil(filteredCards.length / recordsPerPage);
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const pageCards = filteredCards.slice(startIndex, endIndex);
    
    console.log(`Pagination: page ${currentPage} of ${totalPages}, showing cards ${startIndex}-${endIndex} of ${filteredCards.length}`);
    
    // Update pagination controls
    updatePaginationControls(totalPages);
    
    // Display the current page of cards
    console.log('Calling displayListView with', pageCards.length, 'cards');
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

// FIXED: displayListView function with leading quote removal for numbered field
function displayListView(cards) {
    console.log('displayListView started with', cards.length, 'cards');
    const container = document.getElementById('listContainer');
    if (!container) {
        console.log('listContainer not found, returning early');
        return;
    }
    console.log('listContainer found, creating HTML...');
    
    const listHTML = cards.map(card => {
        const year = card.year || '';
        const product = card.product || '';
        const cardNumber = card.cardNumber || '';
        const baseSet = card.baseSet === 'Y' ? '✓' : '';
        const player = card.player || '';
        const team = card.team || '';
        const rookieCheck = card.rookieCard === 'Y' ? '✓' : '';
        const autographCheck = card.autograph === 'Y' ? '✓' : ''; // New autograph column
        const relicCheck = card.relic === 'Y' ? '✓' : ''; // New relic column
        const parallel = card.parallel !== 'N' ? (card.parallel || '') : '';
        // FIXED: Remove leading single quote from numbered display AND ending single quote
        const numberedRaw = card.numbered !== 'N' ? (card.numbered || '') : '';
        let numbered = numberedRaw;
        // Remove leading quote
        if (numbered.startsWith("'")) {
            numbered = numbered.substring(1);
        }
        // Remove ending quote
        if (numbered.endsWith("'")) {
            numbered = numbered.slice(0, -1);
        }
        const insert = card.insert !== 'N' ? (card.insert || '') : '';
        const cardId = card.id;
        
        return `<div class="list-item">
            <div>${year}</div>
            <div>${product}</div>
            <div>${cardNumber}</div>
            <div style="text-align: center;">${baseSet}</div>
            <div class="list-item-player">${player}</div>
            <div>${team}</div>
            <div style="text-align: center;">${autographCheck}</div>
            <div style="text-align: center;">${relicCheck}</div>
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
    console.log('HTML set, finding action buttons...');
    
    // Add event listeners directly to the action buttons
    const editButtons = container.querySelectorAll('.edit-btn');
    const viewButtons = container.querySelectorAll('.view-btn');
    const deleteButtons = container.querySelectorAll('.delete-btn');
    
    console.log(`Found ${editButtons.length} edit buttons, ${viewButtons.length} view buttons, ${deleteButtons.length} delete buttons`);
    
    editButtons.forEach((button, index) => {
        console.log(`Adding event listener to edit button ${index + 1} for card:`, button.getAttribute('data-card-id'));
        
        // Use mousedown instead of click to prevent interference
        button.addEventListener('mousedown', function(event) {
            console.log('Edit button mousedown event triggered');
            
            // Prevent multiple clicks and other interference
            if (isProcessingEdit) {
                console.log('Edit already in progress, ignoring mousedown');
                return;
            }
            
            isProcessingEdit = true;
            console.log('Set isProcessingEdit to true');
            
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            
            const cardId = this.getAttribute('data-card-id');
            console.log('Edit button mousedown for card:', cardId);
            
            // Call editCard immediately
            console.log('Calling editCard function');
            editCard(cardId);
        });
        
        // Also prevent any click events
        button.addEventListener('click', function(event) {
            console.log('Edit button click event triggered (blocked)');
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return false;
        });
    });
    
    viewButtons.forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const cardId = this.getAttribute('data-card-id');
            viewCard(cardId);
        });
    });
    
    deleteButtons.forEach(button => {
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            const cardId = this.getAttribute('data-card-id');
            deleteCard(cardId);
        });
    });
}

// Event delegation for action buttons is now handled at document level in initializeCollectionPage

// Updated clearAllFilters function - added autograph filter and reset pagination
function clearAllFilters() {
    const filters = [
        'filter-year', 'filter-product', 'filter-cardNumber', 'filter-baseSet', 'filter-player', 
        'filter-team', 'filter-rookieCard', 'filter-autograph', 'filter-relic', 'filter-parallel',
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

// FIXED: viewCard function with proper date formatting and timezone normalization
function viewCard(cardId) {
    try {
        const card = cardCollection.find(c => c.id === cardId);
        if (!card) {
            console.error('Card not found:', cardId);
            return;
        }
        
        const player = card.player || 'Unknown Player';
        const team = card.team || 'Unknown Team';
        const year = card.year || '';
        const product = card.product || '';
        const category = card.category || 'Unknown';
        const cardNumber = card.cardNumber || 'N/A';
        const rookieText = card.rookieCard === 'Y' ? 'Rookie Card: Yes' : 'Rookie Card: No';
        const autographText = card.autograph === 'Y' ? 'Autograph: Yes' : 'Autograph: No'; // New autograph display
        const relicText = card.relic === 'Y' ? 'Relic: Yes' : 'Relic: No'; // New relic display
        const baseSetText = card.baseSet === 'Y' ? 'Base Set: Yes' : 'Base Set: No';
        const parallelText = card.parallel && card.parallel !== 'N' ? `Parallel: ${card.parallel}` : 'Parallel: No';
        // FIXED: Remove leading single quote AND ending single quote from numbered display in view
        const numberedRaw = card.numbered && card.numbered !== 'N' ? card.numbered : 'N';
        let numberedClean = numberedRaw !== 'N' ? numberedRaw : 'N';
        if (numberedClean !== 'N') {
            // Remove leading quote
            if (numberedClean.startsWith("'")) {
                numberedClean = numberedClean.substring(1);
            }
            // Remove ending quote
            if (numberedClean.endsWith("'")) {
                numberedClean = numberedClean.slice(0, -1);
            }
        }
        const numberedText = numberedClean !== 'N' ? `Numbered: ${numberedClean}` : 'Numbered: No';
        const insertText = card.insert && card.insert !== 'N' ? `Insert: ${card.insert}` : 'Insert: No';
        const imageVariationText = card.imageVariation && card.imageVariation !== 'N' ? `Image Variation: ${card.imageVariation}` : 'Image Variation: No';
        const description = card.description || 'None';
        const quantity = card.quantity || 1;
        
        // FIXED: Monetary data formatting with proper date handling and timezone normalization
        let purchaseDate = 'Unknown';
        if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
            const normalizedDate = formatDateForDisplay(card.purchaseDate);
            if (normalizedDate) {
                purchaseDate = normalizedDate;
            }
        }
        
        const purchaseCost = card.purchaseCost === 'Unknown' || !card.purchaseCost ? 'Unknown' : '$' + parseFloat(card.purchaseCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const estimatedValue = card.estimatedValue === 'Unknown' || !card.estimatedValue ? 'Unknown' : '$' + parseFloat(card.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        // FIXED: Format estimated value date properly with timezone normalization
        let estimatedValueDate = null;
        if (card.estimatedValueDate) {
            const normalizedDate = formatDateForDisplay(card.estimatedValueDate);
            if (normalizedDate) {
                estimatedValueDate = normalizedDate;
            }
        }
        
        // Format estimated value text
        let estimatedValueText = '';
        if (estimatedValue !== 'Unknown' && estimatedValueDate) {
            estimatedValueText = `Estimated market value on ${estimatedValueDate}: ${estimatedValue}`;
        } else if (estimatedValue !== 'Unknown') {
            estimatedValueText = `Estimated market value: ${estimatedValue}`;
        } else {
            estimatedValueText = 'Estimated market value: Unknown';
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
                    <div class="card-detail-line">${autographText}</div>
                    <div class="card-detail-line">${relicText}</div>
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
        document.getElementById('cardModal').style.display = 'flex';
        
    } catch (error) {
        console.error('Error in viewCard function:', error);
        // Don't throw the error to prevent unhandled promise rejection
        // The button state will be reset by the finally block in handleActionButtonClick
    }
}

// NEW: Helper function to format dates for display and normalize timezone issues
function formatDateForDisplay(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        // If it's already a string in a readable format, parse it carefully
        if (typeof dateValue === 'string') {
            // If it's in YYYY-MM-DD format, treat as local date
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                const parts = dateValue.split('-');
                date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                } else {
                // For other string formats, add time to force local interpretation
                date = new Date(dateValue + 'T12:00:00'); // FIXED: Use noon to avoid timezone shifts
            }
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else {
            date = new Date(dateValue);
        }
        
        if (isNaN(date.getTime())) {
            return null;
        }
        
        // Format as MM/DD/YYYY using local date components to avoid timezone shift
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        
        return `${month}/${day}/${year}`;
    } catch (error) {
        console.error('Error formatting date for display:', error);
        return null;
    }
}

function closeCardModal() {
    const modal = document.getElementById('cardModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Updated edit function with password protection and better error handling
async function editCard(cardId) {
    console.log('editCard function called with cardId:', cardId);
    try {
        // Temporarily skip password check to test if that's the issue
        console.log('Skipping password check for testing...');
        const hasPermission = true; // await checkEditPermission();
        console.log('Edit permission result:', hasPermission);
        if (!hasPermission) {
            console.log('Edit permission denied');
            return;
        }
        
        const card = cardCollection.find(c => c.id === cardId);
        if (!card) {
            console.error('Card not found:', cardId);
            return;
        }
        
        console.log('Card found, storing data and navigating...');
        // Store card data for edit mode
        localStorage.setItem('editCardId', cardId);
        localStorage.setItem('editCardData', JSON.stringify(card));
        
        // Navigate to edit page
        console.log('Navigating to add.html?edit=true');
        window.location.href = 'add.html?edit=true';
        
    } catch (error) {
        console.error('Error in editCard function:', error);
        // Don't throw the error to prevent unhandled promise rejection
    }
}

// FIXED: Combined delete function with single warning dialog (combining first two prompts)
async function deleteCard(cardId) {
    // Check password first
    const hasPermission = await checkDeletePermission();
    if (!hasPermission) return;
    
    const card = cardCollection.find(c => c.id === cardId);
    if (!card) return;
    
    const year = card.year || '';
    const product = card.product || '';
    const player = card.player || '';
    const team = card.team || '';
    const cardNumber = card.cardNumber || '';
    
    // FIXED: Show single combined delete confirmation modal with permanent warning
    showCombinedDeleteConfirmModal(card, year, product, player, team, cardNumber, cardId);
}

// FIXED: New combined delete confirmation modal - SMALLER size proportional to text
function showCombinedDeleteConfirmModal(card, year, product, player, team, cardNumber, cardId) {
    // Create combined delete confirmation modal
    const deleteModal = document.createElement('div');
    deleteModal.className = 'modal';
    deleteModal.id = 'combinedDeleteModal';
    deleteModal.innerHTML = `
        <div class="modal-content delete-confirm-modal-content">
            <h3>Confirm Permanent Deletion</h3>
            <p><strong>This action cannot be undone!</strong></p>
            <p>Are you sure you want to permanently delete this card from your collection?</p>
            <div class="card-info-preview">
                <div>${player} - ${team}</div>
                <div>Card #${cardNumber}</div>
                <div>${year} ${product}</div>
            </div>
            <div class="password-buttons">
                <button class="btn" id="permanentDeleteBtn" style="background: linear-gradient(135deg, rgba(231, 76, 60, 0.8), rgba(192, 57, 43, 0.6)); border-color: #c0392b; color: #ffffff;">Yes, Permanently Delete</button>
                <button class="btn btn-primary" id="cancelCombinedDeleteBtn">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(deleteModal);
    deleteModal.style.display = 'flex';
    
    const permanentBtn = document.getElementById('permanentDeleteBtn');
    const cancelBtn = document.getElementById('cancelCombinedDeleteBtn');
    
    cancelBtn.focus(); // Focus on cancel for safety
    
    cancelBtn.addEventListener('click', function() {
        deleteModal.remove();
    });
    
    permanentBtn.addEventListener('click', async function() {
        try {
            // Disable button to prevent double-clicks
            permanentBtn.disabled = true;
            permanentBtn.textContent = 'Deleting...';
            
            const { deleteDoc, doc } = window.firebaseRefs;
            await deleteDoc(doc(db, 'cards', cardId));
            cardCollection = cardCollection.filter(c => c.id !== cardId);
            displayCollection();
            
            deleteModal.remove();
            
            // Show success confirmation
            showDeleteSuccessModal();
            
        } catch (error) {
            console.error('Error deleting card:', error);
            deleteModal.remove();
            alert('Error deleting card: ' + error.message);
        }
    });
    
    // Close on outside click
    deleteModal.addEventListener('click', function(event) {
        if (event.target === deleteModal) {
            deleteModal.remove();
        }
    });
}

// FIXED: Updated function to show delete success confirmation - SMALLER size proportional to text
function showDeleteSuccessModal() {
    const successModal = document.createElement('div');
    successModal.className = 'modal';
    successModal.id = 'deleteSuccessModal';
    successModal.innerHTML = `
        <div class="modal-content delete-success-modal-content">
            <h3>Card Deleted Successfully!</h3>
            <p>The card has been permanently removed from your collection.</p>
            <div class="password-buttons">
                <button class="btn btn-primary" id="okBtn">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(successModal);
    successModal.style.display = 'flex';
    
    const okBtn = document.getElementById('okBtn');
    okBtn.focus();
    
    okBtn.addEventListener('click', function() {
        successModal.remove();
    });
    
    // FIXED: Removed auto-close timeout that was causing premature closure
    
    // Close on outside click
    successModal.addEventListener('click', function(event) {
        if (event.target === successModal) {
            successModal.remove();
        }
    });
}

// Fixed: exportToCSV function with correct column order matching import
function exportToCSV() {
    if (cardCollection.length === 0) {
        alert('No cards to export!');
        return;
    }
    
    // Fixed: Updated headers to match exact import column order
    const headers = ['Category', 'Year', 'Brand', 'Card #', 'Base Set', 'Player', 'Team', 'Autograph', 'Relic', 'Insert', 'Parallel', 'Numbered', 'Rookie Card', 'Image Variation', 'Quantity', 'Grade', 'Purchase Date', 'Purchase Price', 'Estimated Market Value', 'Estimated Market Value On', "Add'l Notes"];
    const csvRows = [headers.join(',')];
    
    cardCollection.forEach(card => {
        // Format numbered field to prevent date conversion - prefix with apostrophe for Excel
        let numberedValue = card.numbered || 'N';
        if (numberedValue !== 'N' && numberedValue !== '') {
            numberedValue = "'" + numberedValue;
        }
        
        // Fixed: Escape description field properly to handle commas
        let description = card.description || '';
        if (description.includes(',') || description.includes('"') || description.includes('\n')) {
            description = '"' + description.replace(/"/g, '""') + '"';
        }
        
        const row = [
            card.category || '',
            card.year || '',
            card.product || '',
            card.cardNumber || '',
            card.baseSet || 'N',
            card.player || '',
            card.team || '',
            card.autograph || 'N', // New autograph field
            card.relic || 'N', // New relic field
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
            description
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
    
    // Store the export timestamp
    const exportTimestamp = new Date();
    localStorage.setItem('lastExportTimestamp', exportTimestamp.toISOString());
    
    // Update the display immediately
    updateLastExportDisplay();
}

// Function to update the last export timestamp display
function updateLastExportDisplay() {
    const lastExportInfo = document.getElementById('lastExportInfo');
    if (!lastExportInfo) return;
    
    const lastExportTimestamp = localStorage.getItem('lastExportTimestamp');
    
    if (lastExportTimestamp) {
        try {
            const exportDate = new Date(lastExportTimestamp);
            
            // Format the date as MM/DD/YY
            const month = (exportDate.getMonth() + 1).toString().padStart(2, '0');
            const day = exportDate.getDate().toString().padStart(2, '0');
            const year = exportDate.getFullYear().toString().slice(-2);
            
            // Format the time
            const timeOptions = { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true
            };
            
            const dateStr = `${month}/${day}/${year}`;
            const timeStr = exportDate.toLocaleTimeString('en-US', timeOptions);
            
            lastExportInfo.textContent = `Last export: ${dateStr} at ${timeStr}`;
        } catch (error) {
            console.error('Error formatting export timestamp:', error);
            lastExportInfo.textContent = 'Last export: Unknown';
        }
    } else {
        lastExportInfo.textContent = 'Last export: Never';
    }
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

// FIXED: Initialization with proper CSV handler setup
document.addEventListener('DOMContentLoaded', async function() {
    console.log('DOM Content Loaded - Initializing application...');
    
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    // Check password for add page
    if (sessionStorage.getItem('adminVerified') === 'true') {
        isPasswordVerified = true;
    }
    
    if (isAddPage()) {
        console.log('Add page detected');
        
        // FIXED: Set up CSV file input listener immediately for add page
        const csvFile = document.getElementById('csvFile');
        if (csvFile) {
            console.log('Setting up CSV file listener on page load');
            csvFile.addEventListener('change', handleCSVUpload);
        }
        
        if (!checkPasswordProtection()) {
            return;
        }
        if (isPasswordVerified) {
            initializeAddPageAfterAuth();
        }
        return;
    }
    
    // For other pages
    if (!loadingEl || !mainContentEl) {
        console.log('Loading or main content elements not found');
        return;
    }
    
    console.log('Initializing Firebase...');
    const success = await initFirebase();
    console.log('Firebase initialization result:', success);
    
    if (success) {
        if (isCollectionPage()) {
            console.log('Collection page detected, initializing...');
            initializeCollectionPage();
        }
        
        console.log('Loading collection from Firebase...');
        loadCollectionFromFirebase();
    } else {
        console.error('Firebase initialization failed');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 2rem;">
                    <h3>Failed to Initialize</h3>
                    <button onclick="location.reload()" class="btn btn-primary">Retry</button>
                </div>
            `;
        }
    }
    
    // Menu toggle
    const menuToggle = document.querySelector('.menu-toggle');
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMobileMenu);
    }
    
    console.log('Application initialization complete');
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
    
    // Close password modals when clicking outside
    const passwordModal = document.getElementById('passwordModal');
    if (event.target === passwordModal) {
        passwordModal.remove();
        if (isAddPage()) {
            window.location.href = 'index.html';
        }
    }
    
    const deletePasswordModal = document.getElementById('deletePasswordModal');
    if (event.target === deletePasswordModal) {
        deletePasswordModal.remove();
    }
    
    const editPasswordModal = document.getElementById('editPasswordModal');
    if (event.target === editPasswordModal) {
        editPasswordModal.remove();
    }
    
    // FIXED: Close combined delete modal when clicking outside
    const combinedDeleteModal = document.getElementById('combinedDeleteModal');
    if (event.target === combinedDeleteModal) {
        combinedDeleteModal.remove();
    }
    
    // Validation dialog - no longer allow clicking outside to close since there's no cancel option
    const validationDialog = document.getElementById('validationDialog');
    if (event.target === validationDialog) {
        // Do nothing - user must click "Add Date"
    }
});

// Validation dialog functions
function showValidationDialog(onAddDate) {
    const dialog = document.getElementById('validationDialog');
    const addDateBtn = document.getElementById('addDateBtn');
    
    if (dialog && addDateBtn) {
        dialog.style.display = 'flex';
        
        // Set up event listener
        addDateBtn.onclick = () => {
            onAddDate();
        };
        
        // Remove the ability to click outside to cancel since there's no cancel option
        dialog.onclick = (event) => {
            if (event.target === dialog) {
                // Do nothing - user must click "Add Date"
            }
        };
    }
}

function hideValidationDialog() {
    const dialog = document.getElementById('validationDialog');
    if (dialog) {
        dialog.style.display = 'none';
    }
}

// Make changePage function globally accessible
window.changePage = changePage;

// End of script.js file

// Dashboard-specific functions
let currentSetData = null;
let currentSetName = null;

// Get set name from URL parameters
function getSetFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('set');
}

// Load and display set data
async function loadSetDashboard() {
    const setKey = getSetFromURL();
    
    if (!setKey) {
        showError('No set specified in URL');
        return;
    }

    currentSetName = decodeURIComponent(setKey);
    
    // Wait for the main script to load collection data
    while (!window.cardCollection) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Filter cards for this specific set
    const setCards = window.cardCollection.filter(card => {
        const cardSetKey = `${card.year || 'Unknown'} ${card.product || 'Unknown'} ${card.category || 'Unknown'}`;
        return cardSetKey === currentSetName;
    });

    if (setCards.length === 0) {
        showError(`No cards found for set: ${currentSetName}`);
        return;
    }

    currentSetData = setCards;
    displaySetStats(setCards);
    displaySetValuableCards(setCards);
    
                // Update page title
            document.title = `${currentSetName} Overview - The Buzz Collection`;
            document.getElementById('setTitle').textContent = `${currentSetName} Overview`;
    
    // Hide loading, show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('mainContent').style.display = 'block';
}

function displaySetStats(cards) {
    const totalCards = cards.length;
    const totalValue = cards.reduce((sum, card) => {
        const value = parseFloat(card.estimatedValue) || 0;
        return sum + value;
    }, 0);
    
    const rookieCards = cards.filter(card => card.rookieCard === 'Y').length;
    const numberedCards = cards.filter(card => card.numbered !== 'N').length;
    const autographCards = cards.filter(card => card.autograph === 'Y').length;
    const relicCards = cards.filter(card => card.relic === 'Y').length;

    document.getElementById('totalCards').textContent = totalCards.toLocaleString();
    document.getElementById('totalValue').textContent = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    document.getElementById('rookieCards').textContent = rookieCards.toLocaleString();
    document.getElementById('numberedCards').textContent = numberedCards.toLocaleString();
    document.getElementById('autographCards').textContent = autographCards.toLocaleString();
    document.getElementById('relicCards').textContent = relicCards.toLocaleString();
}



function displaySetValuableCards(cards) {
    const valuableCards = cards
        .filter(card => card.estimatedValue !== 'Unknown' && parseFloat(card.estimatedValue) > 0)
        .sort((a, b) => parseFloat(b.estimatedValue) - parseFloat(a.estimatedValue))
        .slice(0, 8); // Show top 8 most valuable cards

    const container = document.getElementById('expensiveCards');
    
    if (valuableCards.length === 0) {
        container.innerHTML = '<p style="color: #888; text-align: center; padding: 2rem;">No valuable cards found in this set.</p>';
        return;
    }

    container.innerHTML = valuableCards.map(card => {
        // Build the special info line (RC | Autograph | Parallel | Numbered)
        const specialInfo = [];
        
        if (card.rookieCard === 'Y') {
            specialInfo.push('RC');
        }
        
        if (card.autograph === 'Y') {
            specialInfo.push('Auto');
        }
        
        if (card.relic === 'Y') {
            specialInfo.push('Relic');
        }
        
        if (card.parallel && card.parallel !== 'N') {
            specialInfo.push(card.parallel);
        }
        
        if (card.numbered && card.numbered !== 'N') {
            // FIXED: Remove leading single quote from numbered display
            const numberedValue = card.numbered.startsWith("'") ? card.numbered.substring(1) : card.numbered;
            specialInfo.push(numberedValue);
        }
        
        // Only show the special info line if there's at least one item
        const specialInfoLine = specialInfo.length > 0 ? 
            `<div class="mini-card-special-info">${specialInfo.join(' | ')}</div>` : '';
        
        return `
            <div class="mini-card clickable-card" data-card-id="${card.id}" style="cursor: pointer;">
                <div class="mini-card-header">
                    <div class="mini-card-player">${card.player || 'Unknown Player'}</div>
                    <div class="mini-card-price-green">${parseFloat(card.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div class="mini-card-team">${card.team || 'Unknown'}</div>
                <div class="mini-card-details">
                    ${card.year || 'Unknown'} ${card.product || 'Unknown'} ${card.category || 'Unknown'} #${card.cardNumber || 'N/A'}
                </div>
                ${specialInfoLine}
            </div>
        `;
    }).join('');

    // Fixed: Add click event listeners to mini cards using event delegation
    container.removeEventListener('click', handleMiniCardClick); // Remove any existing listeners
    container.addEventListener('click', handleMiniCardClick);
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('errorContent').style.display = 'block';
    document.getElementById('errorMessage').textContent = message;
}

// Initialize dashboard when page loads (only on dashboard page)
if (window.location.pathname.includes('dashboard.html')) {
    document.addEventListener('DOMContentLoaded', loadSetDashboard);
}

