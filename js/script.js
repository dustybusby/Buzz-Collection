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

// UPDATED: Fixed populateForm function to handle dates consistently
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
    
    // FIXED: Handle estimated value date with consistent timezone handling
    const estimatedValueDate = document.getElementById('estimatedValueDate');
    if (estimatedValueDate && card.estimatedValueDate) {
        let dateObj;
        if (card.estimatedValueDate instanceof Date) {
            dateObj = card.estimatedValueDate;
        } else if (typeof card.estimatedValueDate === 'string') {
            // Parse as local date to avoid timezone shifts
            dateObj = new Date(card.estimatedValueDate + 'T00:00:00');
        } else {
            dateObj = new Date(card.estimatedValueDate);
        }
        
        if (!isNaN(dateObj.getTime())) {
            // Format as YYYY-MM-DD for input field
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            estimatedValueDate.value = `${year}-${month}-${day}`;
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
    
    // FIXED: Handle purchase date with consistent timezone handling
    const purchaseDate = document.getElementById('purchaseDate');
    const unknownDate = document.getElementById('unknownDate');
    if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
        let dateObj;
        if (card.purchaseDate instanceof Date) {
            dateObj = card.purchaseDate;
        } else if (typeof card.purchaseDate === 'string') {
            // Parse as local date to avoid timezone shifts
            dateObj = new Date(card.purchaseDate + 'T00:00:00');
        } else {
            dateObj = new Date(card.purchaseDate);
        }
        
        if (!isNaN(dateObj.getTime())) {
            // Format as YYYY-MM-DD for input field
            const year = dateObj.getFullYear();
            const month = String(dateObj.getMonth() + 1).padStart(2, '0');
            const day = String(dateObj.getDate()).padStart(2, '0');
            if (purchaseDate) purchaseDate.value = `${year}-${month}-${day}`;
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
        baseSet: getFieldValue('baseSet') || 'N', // Updated to use direct Y/N value
        player: getFieldValue('player'),
        team: getFieldValue('team'),
        autograph: getFieldValue('autograph') || 'N', // New autograph field
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

// UPDATED: Fixed CSV import to properly handle numbered field (strip quotes on import)
async function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    showImportDialog();
    
    const reader = new FileReader();
    reader.onload = async function(e) {
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
        const { addDoc, collection } = window.firebaseRefs;
        
        updateImportProgress(0, totalDataLines, 0, 0);
        
        let processedCount = 0;
        
        for (const lineData of dataLines) {
            processedCount++;
            
            try {
                // Use proper CSV parsing to handle commas in quoted fields
                const values = parseCSVLine(lineData.content);
                
                if (values.every(val => val === '')) {
                    continue;
                }
                
                // FIXED: Clean numbered field by removing any leading/trailing quotes
                let numberedValue = values[10] || 'N';
                if (numberedValue !== 'N' && numberedValue !== '') {
                    // Remove any leading or trailing single quotes that may have been added for Excel protection
                    if (numberedValue.startsWith("'") && numberedValue.endsWith("'")) {
                        numberedValue = numberedValue.slice(1, -1);
                    } else if (numberedValue.startsWith("'")) {
                        numberedValue = numberedValue.slice(1);
                    }
                    // Store clean value without quotes
                }
                
                // Match exact export column order
                const card = {
                    category: values[0] || '',
                    year: parseInt(values[1]) || 0,
                    product: values[2] || '',
                    cardNumber: values[3] || '',
                    baseSet: values[4] || 'N',
                    player: values[5] || '',
                    team: values[6] || '',
                    autograph: values[7] || 'N',
                    insert: values[8] || 'N',
                    parallel: values[9] || 'N',
                    numbered: numberedValue, // Use cleaned value
                    rookieCard: values[11] || 'N',
                    imageVariation: values[12] || 'N',
                    quantity: parseInt(values[13]) || 1,
                    grade: values[14] || 'Ungraded',
                    purchaseDate: values[15] || 'Unknown',
                    purchaseCost: values[16] ? (values[16].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[16]) || 0) : 0,
                    estimatedValue: values[17] ? (values[17].toLowerCase() === 'unknown' ? 'Unknown' : parseFloat(values[17]) || 0) : 0,
                    estimatedValueDate: values[18] || '',
                    description: values[19] || '',
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
        
        event.target.value = '';
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

    const totalCardsEl = document.getElementById('totalCards');
    const totalValueEl = document.getElementById('totalValue');
    const rookieCardsEl = document.getElementById('rookieCards');
    const numberedCardsEl = document.getElementById('numberedCards');
    const autographCardsEl = document.getElementById('autographCards'); // New element

    if (totalCardsEl) totalCardsEl.textContent = totalCards.toLocaleString();
    if (totalValueEl) totalValueEl.textContent = `$${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (rookieCardsEl) rookieCardsEl.textContent = rookieCards.toLocaleString();
    if (numberedCardsEl) numberedCardsEl.textContent = numberedCards.toLocaleString();
    if (autographCardsEl) autographCardsEl.textContent = autographCards.toLocaleString(); // New stat
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

// Updated function to include Estimated Market Value (EMV) for Top Brands
function displayTopProducts() {
    const productStats = {};
    cardCollection.forEach(card => {
        const productKey = `${card.year || 'Unknown'} ${card.product || 'Unknown'}`;
        const category = card.category || 'Unknown';
        const fullKey = `${productKey} ${category}`;
        
        if (!productStats[fullKey]) {
            productStats[fullKey] = { count: 0, emv: 0 };
        }
        
        productStats[fullKey].count++;
        
        // Add EMV (Estimated Market Value)
        const value = card.estimatedValue;
        if (value !== 'Unknown' && value) {
            productStats[fullKey].emv += parseFloat(value);
        }
    });

    const topProducts = Object.entries(productStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 12);

    const container = document.getElementById('productList');
    if (container) {
        container.innerHTML = topProducts.map(([product, stats]) => `
            <div class="product-item">
                <div class="product-info">
                    <div class="product-name">${product}</div>
                    <div class="product-emv">EMV: $${stats.emv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div class="product-count">${stats.count}</div>
            </div>
        `).join('');
    }
}

// Updated function to show top 20 cards with new layout structure and autograph info
function displayExpensiveCards() {
    // Use estimatedValue instead of purchaseCost for expensive cards and increase to 20
    const expensiveCards = [...cardCollection]
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
            
            if (card.parallel && card.parallel !== 'N') {
                specialInfo.push(card.parallel);
            }
            
if (card.numbered && card.numbered !== 'N') {
                specialInfo.push(card.numbered);
            }
            
            // Only show the special info line if there's at least one item
            const specialInfoLine = specialInfo.length > 0 ? 
                `<div class="mini-card-special-info">${specialInfo.join(' | ')}</div>` : '';
            
            return `
                <div class="mini-card clickable-card" data-card-id="${card.id}" style="cursor: pointer;">
                    <div class="mini-card-header">
                        <div class="mini-card-player">${card.player || 'Unknown Player'}</div>
                        <div class="mini-card-price-green">$${parseFloat(card.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
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
    const totalElement = document.getElementById('totalCards');
    const filteredElement = document.getElementById('filteredCount');
    const emptyState = document.getElementById('emptyState');
    const emptyStateMessage = document.getElementById('emptyStateMessage');
    const emptyStateButton = document.getElementById('emptyStateButton');
    
    if (!totalElement || !filteredElement) return;
    
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
    if (!yearFilter && !productFilter && !cardNumberFilter && !playerFilter && !teamFilter && !parallelFilter && !numberedFilter && !insertFilter && !autographFilter) {
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

// UPDATED: Fixed displayListView to strip quotes from numbered field display
function displayListView(cards) {
    const container = document.getElementById('listContainer');
    if (!container) return;
    
    const listHTML = cards.map(card => {
        const year = card.year || '';
        const product = card.product || '';
        const cardNumber = card.cardNumber || '';
        const baseSet = card.baseSet === 'Y' ? '✓' : '';
        const player = card.player || '';
        const team = card.team || '';
        const rookieCheck = card.rookieCard === 'Y' ? '✓' : '';
        const autographCheck = card.autograph === 'Y' ? '✓' : '';
        const parallel = card.parallel !== 'N' ? (card.parallel || '') : '';
        
        // FIXED: Strip leading and trailing single quotes from numbered field for display
        let numbered = '';
        if (card.numbered !== 'N') {
            numbered = card.numbered || '';
            // Remove leading and trailing single quotes if they exist
            if (numbered.startsWith("'") && numbered.endsWith("'")) {
                numbered = numbered.slice(1, -1);
            } else if (numbered.startsWith("'")) {
                numbered = numbered.slice(1);
            }
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
    
    // Remove any existing listeners first, then add new ones to prevent double-click issue
    container.removeEventListener('click', handleActionButtonClick);
    container.addEventListener('click', handleActionButtonClick);
}

// Fixed: Single event handler for action buttons to prevent double-click issue
function handleActionButtonClick(event) {
    const target = event.target;
    
    // Prevent multiple rapid clicks
    if (target.disabled) return;
    
    if (target.classList.contains('view-btn')) {
        event.preventDefault();
        event.stopPropagation();
        const cardId = target.getAttribute('data-card-id');
        viewCard(cardId);
    } else if (target.classList.contains('edit-btn')) {
        event.preventDefault();
        event.stopPropagation();
        const cardId = target.getAttribute('data-card-id');
        editCard(cardId);
    } else if (target.classList.contains('delete-btn')) {
        event.preventDefault();
        event.stopPropagation();
        const cardId = target.getAttribute('data-card-id');
        deleteCard(cardId);
    }
}

// Updated clearAllFilters function - added autograph filter and reset pagination
function clearAllFilters() {
    const filters = [
        'filter-year', 'filter-product', 'filter-cardNumber', 'filter-baseSet', 'filter-player', 
        'filter-team', 'filter-rookieCard', 'filter-autograph', 'filter-parallel',
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

// UPDATED: Also update viewCard to strip quotes from numbered field display
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
    const autographText = card.autograph === 'Y' ? 'Autograph: Yes' : 'Autograph: No';
    const baseSetText = card.baseSet === 'Y' ? 'Base Set: Yes' : 'Base Set: No';
    const parallelText = card.parallel && card.parallel !== 'N' ? `Parallel: ${card.parallel}` : 'Parallel: No';
    
    // FIXED: Strip quotes from numbered field for display
    let numberedText = 'Numbered: No';
    if (card.numbered && card.numbered !== 'N') {
        let numberedValue = card.numbered;
        // Remove leading and trailing single quotes if they exist
        if (numberedValue.startsWith("'") && numberedValue.endsWith("'")) {
            numberedValue = numberedValue.slice(1, -1);
        } else if (numberedValue.startsWith("'")) {
            numberedValue = numberedValue.slice(1);
        }
        numberedText = `Numbered: ${numberedValue}`;
    }
    
    const insertText = card.insert && card.insert !== 'N' ? `Insert: ${card.insert}` : 'Insert: No';
    const imageVariationText = card.imageVariation && card.imageVariation !== 'N' ? `Image Variation: ${card.imageVariation}` : 'Image Variation: No';
    const description = card.description || 'None';
    const quantity = card.quantity || 1;
    
    // Improved date handling to avoid timezone issues
    let purchaseDate = 'Unknown';
    if (card.purchaseDate && card.purchaseDate !== 'Unknown') {
        let dateObj;
        if (card.purchaseDate instanceof Date) {
            dateObj = card.purchaseDate;
        } else if (typeof card.purchaseDate === 'string') {
            dateObj = new Date(card.purchaseDate + 'T00:00:00');
        } else {
            dateObj = new Date(card.purchaseDate);
        }
        
        if (!isNaN(dateObj.getTime())) {
            purchaseDate = dateObj.toLocaleDateString('en-US');
        }
    }
    
    const purchaseCost = card.purchaseCost === 'Unknown' || !card.purchaseCost ? 'Unknown' : '$' + parseFloat(card.purchaseCost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const estimatedValue = card.estimatedValue === 'Unknown' || !card.estimatedValue ? 'Unknown' : '$' + parseFloat(card.estimatedValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    // Improved estimated value date handling to avoid timezone issues
    let estimatedValueDate = 'Not specified';
    if (card.estimatedValueDate) {
        let dateObj;
        if (card.estimatedValueDate instanceof Date) {
            dateObj = card.estimatedValueDate;
        } else if (typeof card.estimatedValueDate === 'string') {
            dateObj = new Date(card.estimatedValueDate + 'T00:00:00');
        } else {
            dateObj = new Date(card.estimatedValueDate);
        }
        
        if (!isNaN(dateObj.getTime())) {
            estimatedValueDate = dateObj.toLocaleDateString('en-US');
        }
    }
    
    // Format estimated value text
    let estimatedValueText = '';
    if (estimatedValue !== 'Unknown' && estimatedValueDate !== 'Not specified') {
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
}

// Updated edit function with password protection
async function editCard(cardId) {
    // Check password first
    const hasPermission = await checkEditPermission();
    if (!hasPermission) return;
    
    const card = cardCollection.find(c => c.id === cardId);
    if (!card) return;
    
    localStorage.setItem('editCardId', cardId);
    localStorage.setItem('editCardData', JSON.stringify(card));
    window.location.href = 'add.html?edit=true';
}

// Fixed: Custom delete modal instead of browser popup
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
    
    // Create custom delete confirmation modal
    showDeleteConfirmModal(card, year, product, player, team, cardNumber, cardId);
}

// UPDATED: Simplified delete modal to only two prompts instead of three
// New function to show combined delete confirmation modal (combines first two dialogs)
function showDeleteConfirmModal(card, year, product, player, team, cardNumber, cardId) {
    // Create combined delete confirmation modal
    const deleteModal = document.createElement('div');
    deleteModal.className = 'modal';
    deleteModal.id = 'deleteConfirmModal';
    deleteModal.innerHTML = `
        <div class="modal-content password-modal-content">
            <h3>Permanent Delete Warning</h3>
            <p><strong>This action cannot be undone!</strong></p>
            <p>Are you sure you want to permanently delete this card from your collection?</p>
            <div class="card-info-preview">
                <div><strong>${year} ${product}</strong></div>
                <div>${player} - ${team}</div>
                <div>Card #${cardNumber}</div>
            </div>
            <div class="password-buttons">
                <button class="btn" id="permanentDeleteBtn" style="background: #e74c3c; border-color: #c0392b;">Permanently Delete</button>
                <button class="btn btn-primary" id="cancelDeleteBtn">Cancel</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(deleteModal);
    deleteModal.style.display = 'flex';
    
    const permanentBtn = document.getElementById('permanentDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    
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

// New function to show delete success confirmation
function showDeleteSuccessModal() {
    const successModal = document.createElement('div');
    successModal.className = 'modal';
    successModal.id = 'deleteSuccessModal';
    successModal.innerHTML = `
        <div class="modal-content password-modal-content">
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
    
    // Auto-close after 3 seconds
    setTimeout(() => {
        if (document.getElementById('deleteSuccessModal')) {
            successModal.remove();
        }
    }, 3000);
    
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
    const headers = ['Category', 'Year', 'Brand', 'Card #', 'Base Set', 'Player', 'Team', 'Autograph', 'Insert', 'Parallel', 'Numbered', 'Rookie Card', 'Image Variation', 'Quantity', 'Grade', 'Purchase Date', 'Purchase Price', 'Estimated Market Value', 'Estimated Market Value On', "Add'l Notes"];
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

// Simple working initialization
document.addEventListener('DOMContentLoaded', async function() {
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    // Check password for add page
    if (sessionStorage.getItem('adminVerified') === 'true') {
        isPasswordVerified = true;
    }
    
    if (isAddPage()) {
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
        return;
    }
    
    const success = await initFirebase();
    
    if (success) {
        if (isCollectionPage()) {
            initializeCollectionPage();
        }
        
        loadCollectionFromFirebase();
    } else {
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
});

// Make changePage function globally accessible
window.changePage = changePage;
// End of script.js file