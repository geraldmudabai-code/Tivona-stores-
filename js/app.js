// ===== Tivona Stores - Storefront (API products, local cart) =====

let productsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  setupMobileMenu();
  setupFilters();
  setupCart();
  setupSearch();
  await loadProducts();
  await updateAuthUI();
  updateCartCount();
});

async function loadProducts() {
  try {
    const data = await API.getProducts();
    productsCache = data.products || [];
  } catch (err) {
    console.error(err);
    productsCache = [];
  }
  renderCategories();
  renderProducts();
}

function setupMobileMenu() {
  const toggle = document.getElementById('menu-toggle');
  const nav = document.getElementById('main-nav');
  if (!toggle || !nav) return;
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    const icon = toggle.querySelector('i');
    if (icon) {
      icon.classList.toggle('fa-bars');
      icon.classList.toggle('fa-times');
    }
  });
  nav.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      const icon = toggle.querySelector('i');
      if (icon) {
        icon.classList.add('fa-bars');
        icon.classList.remove('fa-times');
      }
    });
  });
}

function renderCategories() {
  const grid = document.getElementById('category-grid');
  if (!grid) return;
  grid.innerHTML = CATEGORIES.map(cat => `
    <div class="category-card" data-category="${cat.id}">
      <i class="fas ${cat.icon}"></i>
      <h3>${cat.name}</h3>
      <p>${productsCache.filter(p => p.category === cat.id).length} products</p>
    </div>
  `).join('');
  grid.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      document.getElementById('category-filter').value = card.dataset.category;
      renderProducts();
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderProducts() {
  const grid = document.getElementById('product-grid');
  const noProducts = document.getElementById('no-products');
  if (!grid) return;

  let products = [...productsCache];
  const categoryFilter = document.getElementById('category-filter')?.value || 'all';
  const sortFilter = document.getElementById('sort-filter')?.value || 'default';
  const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || '';

  if (categoryFilter !== 'all') products = products.filter(p => p.category === categoryFilter);
  if (searchTerm) {
    products = products.filter(p =>
      p.name.toLowerCase().includes(searchTerm) ||
      (p.description || '').toLowerCase().includes(searchTerm) ||
      getCategoryName(p.category).toLowerCase().includes(searchTerm)
    );
  }
  switch (sortFilter) {
    case 'price-low': products.sort((a, b) => a.price - b.price); break;
    case 'price-high': products.sort((a, b) => b.price - a.price); break;
    case 'name': products.sort((a, b) => a.name.localeCompare(b.name)); break;
    case 'stock': products.sort((a, b) => b.stock - a.stock); break;
  }

  if (products.length === 0) {
    grid.innerHTML = '';
    if (noProducts) noProducts.style.display = 'block';
    return;
  }
  if (noProducts) noProducts.style.display = 'none';

  grid.innerHTML = products.map(p => {
    const status = getStockStatus(p.stock);
    const imageContent = p.image
      ? `<img src="${p.image}" alt="${p.name}" onerror="this.parentElement.innerHTML='<i class=\\'fas fa-box placeholder-icon\\'></i>'">`
      : `<i class="fas fa-box placeholder-icon"></i>`;
    return `
      <div class="product-card">
        <div class="product-image">
          ${imageContent}
          <span class="stock-badge ${status.class}">${status.text}</span>
        </div>
        <div class="product-info">
          <div class="product-category">${getCategoryName(p.category)}</div>
          <h3 class="product-name">${p.name}</h3>
          <div class="product-price">${formatPrice(p.price)}</div>
          <div class="product-actions">
            <button class="btn btn-primary btn-sm add-to-cart" data-id="${p.id}" ${p.stock <= 0 ? 'disabled' : ''}>
              <i class="fas fa-cart-plus"></i> ${p.stock <= 0 ? 'Out of Stock' : 'Add to Cart'}
            </button>
          </div>
        </div>
      </div>`;
  }).join('');

  grid.querySelectorAll('.add-to-cart').forEach(btn => {
    btn.addEventListener('click', () => addToCart(parseInt(btn.dataset.id)));
  });
}

function setupFilters() {
  const catFilter = document.getElementById('category-filter');
  const sortFilter = document.getElementById('sort-filter');
  if (catFilter) {
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      catFilter.appendChild(opt);
    });
    catFilter.addEventListener('change', renderProducts);
  }
  if (sortFilter) sortFilter.addEventListener('change', renderProducts);
}

function setupSearch() {
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    let timeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(timeout);
      timeout = setTimeout(renderProducts, 300);
    });
  }
}

function setupCart() {
  document.getElementById('cart-btn')?.addEventListener('click', openCart);
  document.getElementById('close-cart')?.addEventListener('click', closeCartSidebar);
  document.getElementById('overlay')?.addEventListener('click', closeCartSidebar);
  document.getElementById('checkout-btn')?.addEventListener('click', checkout);
}

function openCart() {
  renderCartItems();
  document.getElementById('cart-sidebar')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('show');
}

function closeCartSidebar() {
  document.getElementById('cart-sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
}

function addToCart(productId) {
  const product = productsCache.find(p => p.id === productId);
  if (!product || product.stock <= 0) return;
  let cart = getCart();
  const existing = cart.find(item => item.id === productId);
  if (existing) {
    if (existing.quantity >= product.stock) {
      alert('Not enough stock available!');
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, quantity: 1, image: product.image });
  }
  saveCart(cart);
  updateCartCount();
  showToastNotification(`${product.name} added to cart!`);
}

function updateCartCount() {
  const count = getCart().reduce((sum, item) => sum + item.quantity, 0);
  const badge = document.getElementById('cart-count');
  if (badge) badge.textContent = count;
}

function renderCartItems() {
  const container = document.getElementById('cart-items');
  const totalEl = document.getElementById('cart-total');
  if (!container) return;
  const cart = getCart();
  if (cart.length === 0) {
    container.innerHTML = `<div class="empty-cart"><i class="fas fa-shopping-cart"></i><p>Your cart is empty</p></div>`;
    if (totalEl) totalEl.textContent = '$0.00';
    return;
  }
  let total = 0;
  container.innerHTML = cart.map(item => {
    total += item.price * item.quantity;
    return `
      <div class="cart-item">
        <div class="cart-item-img">
          ${item.image ? `<img src="${item.image}" alt="${item.name}">` : '<i class="fas fa-box"></i>'}
        </div>
        <div class="cart-item-info">
          <h4>${item.name}</h4>
          <p>${formatPrice(item.price)}</p>
          <div class="cart-item-qty">
            <button class="qty-minus" data-id="${item.id}">-</button>
            <span>${item.quantity}</span>
            <button class="qty-plus" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-id="${item.id}"><i class="fas fa-trash"></i></button>
      </div>`;
  }).join('');
  if (totalEl) totalEl.textContent = formatPrice(total);
  container.querySelectorAll('.qty-minus').forEach(btn => {
    btn.addEventListener('click', () => updateCartQty(parseInt(btn.dataset.id), -1));
  });
  container.querySelectorAll('.qty-plus').forEach(btn => {
    btn.addEventListener('click', () => updateCartQty(parseInt(btn.dataset.id), 1));
  });
  container.querySelectorAll('.cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => removeFromCart(parseInt(btn.dataset.id)));
  });
}

function updateCartQty(productId, change) {
  let cart = getCart();
  const item = cart.find(i => i.id === productId);
  if (!item) return;
  const product = productsCache.find(p => p.id === productId);
  item.quantity += change;
  if (item.quantity <= 0) cart = cart.filter(i => i.id !== productId);
  else if (product && item.quantity > product.stock) {
    item.quantity = product.stock;
    alert('Maximum available stock reached!');
  }
  saveCart(cart);
  updateCartCount();
  renderCartItems();
}

function removeFromCart(productId) {
  saveCart(getCart().filter(i => i.id !== productId));
  updateCartCount();
  renderCartItems();
}

async function checkout() {
  const cart = getCart();
  if (cart.length === 0) {
    alert('Your cart is empty!');
    return;
  }
  try {
    await API.checkout(cart.map(i => ({ id: i.id, quantity: i.quantity })));
    saveCart([]);
    updateCartCount();
    closeCartSidebar();
    await loadProducts();
    alert('Thank you for your order! Stock has been updated.\n\n(Demo checkout – no real payment)');
  } catch (err) {
    alert(err.message || 'Checkout failed');
  }
}

async function updateAuthUI() {
  try {
    const data = await API.me();
    const user = data.user;
    setCurrentUser(user);
    const loginLink = document.getElementById('login-link');
    const adminLinks = document.querySelectorAll('.admin-only');
    if (user) {
      if (loginLink) {
        loginLink.textContent = 'Logout';
        loginLink.href = '#';
        loginLink.onclick = async (e) => {
          e.preventDefault();
          try { await API.logout(); } catch (_) {}
          location.reload();
        };
      }
      adminLinks.forEach(el => {
        if (user.role === 'admin' || user.role === 'worker') el.style.display = 'inline';
      });
    }
  } catch (_) {}
}

function showToastNotification(msg) {
  const existing = document.querySelector('.temp-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'temp-toast';
  toast.textContent = msg;
  toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:#0d9488;color:white;padding:12px 24px;border-radius:8px;font-size:0.95rem;z-index:3000;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fadeInOut 2.5s forwards;`;
  document.body.appendChild(toast);
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `@keyframes fadeInOut{0%{opacity:0;transform:translateX(-50%) translateY(20px)}15%{opacity:1;transform:translateX(-50%) translateY(0)}85%{opacity:1}100%{opacity:0;transform:translateX(-50%) translateY(-10px)}}`;
    document.head.appendChild(style);
  }
  setTimeout(() => toast.remove(), 2600);
}
