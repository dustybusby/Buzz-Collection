        import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
        import { getFirestore, collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

        const firebaseConfig = {
            apiKey: "{{FIREBASE_API_KEY}}",
            authDomain: "{{FIREBASE_AUTH_DOMAIN}}",
            projectId: "{{FIREBASE_PROJECT_ID}}",
            storageBucket: "{{FIREBASE_STORAGE_BUCKET}}",
            messagingSenderId: "{{FIREBASE_MESSAGING_SENDER_ID}}",
            appId: "{{FIREBASE_APP_ID}}"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        console.log('🔥 Firebase initialized successfully');

        let cardCollection = [];

        async function loadCollectionFromFirebase() {
            try {
                console.log('📖 Loading collection from Firebase...');
                console.log('🔥 Firebase config check:', firebaseConfig);
                console.log('🔥 Database object:', db);
                
                const querySnapshot = await getDocs(
                    query(
                        collection(db, 'cards'),
                        orderBy('dateAdded', 'desc')
                    )
                );
                
                cardCollection = [];
                querySnapshot.forEach((doc) => {
                    const data = doc.data();
                    console.log('📄 Document data:', data);
                    cardCollection.push({
                        id: doc.id,
                        ...data,
                        dateAdded: data.dateAdded?.toDate?.() || new Date(data.dateAdded)
                    });
                });
                
                console.log('📊 Total cards loaded:', cardCollection.length);
                console.log('📋 Card collection:', cardCollection);
                
                document.getElementById('loading').style.display = 'none';
                document.getElementById('mainContent').style.display = 'block';
                
                displayInventory();
            } catch (error) {
                console.error('❌ Error loading collection:', error);
                console.error('Error details:', {
                    code: error.code,
                    message: error.message,
                    stack: error.stack
                });
                
                document.getElementById('loading').innerHTML = `
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

        function displayInventory() {
            console.log('🎯 Starting to display inventory with', cardCollection.length, 'cards');
            
            if (cardCollection.length === 0) {
                console.log('⚠️ No cards found - showing empty state');
                document.getElementById('mainContent').innerHTML = `
                    <div style="text-align: center; padding: 4rem 2rem;">
                        <h2>No Cards Found</h2>
                        <p style="color: #b0b0b0; margin: 1rem 0;">Your collection appears to be empty.</p>
                        <a href="add.html" class="btn btn-primary" style="display: inline-block; margin-top: 1rem; text-decoration: none;">Add Your First Card</a>
                    </div>
                `;
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

            console.log('Stats:', { totalCards, totalValue, rookieCards, numberedCards });

            document.getElementById('totalCards').textContent = totalCards.toLocaleString();
            document.getElementById('totalValue').textContent = `$${totalValue.toFixed(2)}`;
            document.getElementById('rookieCards').textContent = rookieCards.toLocaleString();
            document.getElementById('numberedCards').textContent = numberedCards.toLocaleString();
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
            container.innerHTML = Object.entries(categoryStats).map(([category, stats]) => `
                <div class="category-item">
                    <div class="category-name">${category}</div>
                    <div class="category-count">${stats.count}</div>
                    <div class="category-value">${stats.value.toFixed(2)}</div>
                </div>
            `).join('');
        }

        function displayYearDistribution() {
            const yearStats = {};
            cardCollection.forEach(card => {
                const year = card.year;
                yearStats[year] = (yearStats[year] || 0) + 1;
            });

            const maxCount = Math.max(...Object.values(yearStats), 1);
            const container = document.getElementById('yearChart');
            
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
            container.innerHTML = topProducts.map(([product, count]) => `
                <div class="product-item">
                    <div class="product-name">${product}</div>
                    <div class="product-count">${count}</div>
                </div>
            `).join('');
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
            container.innerHTML = sortedTeams.map(([team, count]) => `
                <div class="team-item">
                    <div class="team-name">${team}</div>
                    <div class="team-count">${count}</div>
                </div>
            `).join('');
        }

        function displayExpensiveCards() {
            const expensiveCards = [...cardCollection]
                .filter(card => card.purchaseCost > 0)
                .sort((a, b) => b.purchaseCost - a.purchaseCost)
                .slice(0, 6);

            const container = document.getElementById('expensiveCards');
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

        function toggleMobileMenu() {
            const navLinks = document.querySelector('.nav-links');
            navLinks.style.display = navLinks.style.display === 'none' ? 'flex' : 'none';
        }

        document.addEventListener('DOMContentLoaded', function() {
            console.log('🚀 Initializing Inventory Overview...');
            console.log('🔧 Firebase app:', app);
            console.log('🗄️ Firestore db:', db);
            
            setTimeout(() => {
                loadCollectionFromFirebase();
            }, 1000);
        });

        window.toggleMobileMenu = toggleMobileMenu;