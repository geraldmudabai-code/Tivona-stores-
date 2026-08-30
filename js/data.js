// ===== Tivona Stores - Shared helpers (cart still local; products via API) =====

const CATEGORIES = [
  { id: 'groceries', name: 'Groceries', icon: 'fa-shopping-basket' },
  { id: 'electronics', name: 'Electronics', icon: 'fa-laptop' },
  { id: 'fashion', name: 'Fashion', icon: 'fa-tshirt' },
  { id: 'home', name: 'Home & Kitchen', icon: 'fa-home' },
  { id: 'beauty', name: 'Beauty & Health', icon: 'fa-spa' },
  { id: 'sports', name: 'Sports & Outdoors', icon: 'fa-futbol' }
];

function getCart() {
  return JSON.parse(localStorage.getItem('tivona_cart') || '[]');
}

function saveCart(cart) {
  localStorage.setItem('tivona_cart', JSON.stringify(cart));
}

function getCategoryName(id) {
  const cat = CATEGORIES.find(c => c.id === id);
  return cat ? cat.name : id;
}

function getStockStatus(stock) {
  if (stock <= 0) return { class: 'out-of-stock', text: 'Out of Stock' };
  if (stock < 10) return { class: 'low-stock', text: 'Low Stock' };
  return { class: 'in-stock', text: 'In Stock' };
}

function formatPrice(price) {
  return '$' + Number(price).toFixed(2);
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

let _currentUser = null;

function getCurrentUser() {
  return _currentUser;
}

function setCurrentUser(user) {
  _currentUser = user;
}
