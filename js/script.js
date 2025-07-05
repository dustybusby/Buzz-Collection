// Global variables
let app, db, cardCollection = [];

// Initialize Firebase with dynamic imports
async function initFirebase() {
    try {
        console.log('🔥 Starting Firebase initialization...');
        
        // Test if we can load Firebase modules
        console.log('📦 Loading Firebase App module...');
        const firebaseApp = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
        console.log('✅ Firebase App module loaded:', firebaseApp);
        
        console.log('📦 Loading Firestore module...');
        const firestore = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js');
        console.log('✅ Firestore module loaded:', firestore);
        
        const firebaseConfig = {
            apiKey: "{{FIREBASE_API_KEY}}",
            authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
            projectId: "{{FIREBASE_PROJECT_ID}}",
            storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
            messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
            appId: "{{FIREBASE_APP_ID}}"
        };

        console.log('🔧 Initializing Firebase app with config...');
        app = firebaseApp.initializeApp(firebaseConfig);
        console.log('✅ Firebase app initialized:', app);
        
        console.log('🗄️ Getting Firestore instance...');
        db = firestore.getFirestore(app);
        console.log('✅ Firestore instance created:', db);
        
        // Store references for later use
        window.firebaseRefs = {
            app,
            db,
            collection: firestore.collection,
            getDocs: firestore.getDocs,
            query: firestore.query,
            orderBy: firestore.orderBy
        };
        
        console.log('🔥 Firebase initialization complete!');
        return true;
    } catch (error) {
        console.error('❌ Firebase initialization error:', error);
        console.error('❌ Error stack:', error.stack);
        return false;
    }
}

async function loadCollectionFromFirebase() {
    try {
        console.log('📖 Starting to load collection from Firebase...');
        console.log('🔥 App reference:', app);
        console.log('🗄️ DB reference:', db);
        console.log('🔗 Window Firebase refs:', window.firebaseRefs);
        
        if (!db) {
            throw new Error('Database reference is null or undefined');
        }
        
        const { collection, getDocs, query, orderBy } = window.firebaseRefs;
        
        console.log('📝 Creating Firestore query...');
        const cardsCollection = collection(db, 'cards');
        console.log('📝 Collection reference:', cardsCollection);
        
        const cardsQuery = query(cardsCollection, orderBy('dateAdded', 'desc'));
        console.log('📝 Query created:', cardsQuery);
        
        console.log('🚀 Executing query...');
        const querySnapshot = await getDocs(cardsQuery);
        console.log('✅ Query executed successfully. Size:', querySnapshot.size);
        
        cardCollection = [];
        let docCount = 0;
        
        querySnapshot.forEach((doc) => {
            docCount++;
            const data = doc.data();
            console.log(`📄 Document ${docCount}:`, { id: doc.id, data });
            
            cardCollection.push({
                id: doc.id,
                ...data,
                dateAdded: data.dateAdded?.toDate?.() || new Date(data.dateAdded)
            });
        });
        
        console.log('📊 Total cards loaded:', cardCollection.length);
        console.log('📋 Full card collection:', cardCollection);
        
        // Hide loading and show content
        const loadingEl = document.getElementById('loading');
        const mainContentEl = document.getElementById('mainContent');
        
        if (loadingEl) {
            loadingEl.style.display = 'none';
            console.log('✅ Loading element hidden');
        }
        
        if (mainContentEl) {
            mainContentEl.style.display = 'block';
            console.log('✅ Main content element shown');
        }
        
        displayInventory();
        
    } catch (error) {
        console.error('❌ Error loading collection:', error);
        console.error('❌ Error name:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error code:', error.code);
        console.error('❌ Error stack:', error.stack);
        
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 2rem;">
                    <h3>Error Loading Collection</h3>
                    <p><strong>Error:</strong> ${error.message}</p>
                    <p><strong>Code:</strong> ${error.code || 'Unknown'}</p>
                    <details style="margin-top: 1rem; text-align: left;">
                        <summary>Technical Details</summary>
                        <pre style="background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; font-size: 0.8rem;">${error.stack}</pre>
                    </details>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
}

function displayInventory() {
    console.log('🎯 Starting to display inventory...');
    console.log('🎯 Cards available:', cardCollection.length);
    
    if (cardCollection.length === 0) {
        console.log('⚠️ No cards found - showing empty state');
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
    
    console.log('📊 Updating summary stats...');
    updateSummaryStats();
    
    console.log('📋 Displaying category breakdown...');
    displayCategoryBreakdown();
    
    console.log('📅 Displaying year distribution...');
    displayYearDistribution();
    
    console.log('🏆 Displaying top products...');
    displayTopProducts();
    
    console.log('🏈 Displaying team distribution...');
    displayTeamDistribution();
    
    console.log('💰 Displaying expensive cards...');
    displayExpensiveCards();
    
    console.log('✅ Inventory display complete!');
}

function updateSummaryStats() {
    const totalCards = cardCollection.length;
    const totalValue = cardCollection.reduce((sum, card) => sum + (card.purchaseCost || 0), 0);
    const rookieCards = cardCollection.filter(card => card.rookieCard === 'Y').length;
    const numberedCards = cardCollection.filter(card => card.numbered !== 'N').length;

    console.log('📈 Stats calculated:', { totalCards, totalValue, rookieCards, numberedCards });

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

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    if (navLinks) {
        navLinks.style.display = navLinks.style.display === 'none' ? 'flex' : 'none';
    }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 DOM loaded, initializing Inventory Overview...');
    console.log('🌐 Window object:', window);
    console.log('📄 Document object:', document);
    
    // Test if basic elements exist
    const loadingEl = document.getElementById('loading');
    const mainContentEl = document.getElementById('mainContent');
    
    console.log('🔍 Loading element:', loadingEl);
    console.log('🔍 Main content element:', mainContentEl);
    
    if (!loadingEl || !mainContentEl) {
        console.error('❌ Required DOM elements not found!');
        return;
    }
    
    // Initialize Firebase
    console.log('🔥 Starting Firebase initialization...');
    const success = await initFirebase();
    
    if (success) {
        console.log('✅ Firebase initialized successfully');
        console.log('🔧 Firebase app:', app);
        console.log('🗄️ Firestore db:', db);
        
        // Give Firebase a moment to fully initialize, then load data
        console.log('⏳ Waiting 1 second before loading data...');
        setTimeout(() => {
            console.log('🚀 Loading collection data...');
            loadCollectionFromFirebase();
        }, 1000);
    } else {
        console.error('❌ Firebase initialization failed');
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: #ff6b6b; text-align: center; padding: 2rem;">
                    <h3>Failed to Initialize Firebase</h3>
                    <p>Could not load Firebase modules. Check console for details.</p>
                    <button onclick="location.reload()" style="margin-top: 1rem; padding: 0.5rem 1rem; background: #4a7bc8; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Retry
                    </button>
                </div>
            `;
        }
    }
});

// Make toggleMobileMenu globally available
window.toggleMobileMenu = toggleMobileMenu;

// Add a global test function for debugging
window.testFirebase = async function() {
    console.log('🧪 Testing Firebase connection...');
    console.log('App:', app);
    console.log('DB:', db);
    console.log('Firebase refs:', window.firebaseRefs);
    
    if (window.firebaseRefs && window.firebaseRefs.db) {
        try {
            const { collection, getDocs } = window.firebaseRefs;
            const testQuery = await getDocs(collection(window.firebaseRefs.db, 'cards'));
            console.log('✅ Test query successful, size:', testQuery.size);
        } catch (error) {
            console.error('❌ Test query failed:', error);
        }
    }
};