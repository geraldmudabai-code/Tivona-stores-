// ===== Tivona Stores - Admin Dashboard (API + role restrictions) =====

let currentUser = null;
let productsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const data = await API.me();
    if (!data.user) {
      window.location.href = 'login.html';
      return;
    }
    currentUser = data.user;
    setCurrentUser(data.user);
  } catch (_) {
    window.location.href = 'login.html';
    return;
  }

  const userInfo = document.getElementById('user-info');
  if (userInfo) {
    userInfo.textContent = `${currentUser.name} · ${currentUser.email} (${currentUser.role})`;
  }

  const badge = document.querySelector('.admin-badge');
  if (badge) {
    if (currentUser.role === 'worker') {
      badge.textContent = 'Worker';
      badge.style.background = '#f59e0b';
    } else {
      badge.textContent = 'Admin';
    }
  }

  applyRoleRestrictions();

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try { await API.logout(); } catch (_) {}
    setCurrentUser(null);
    window.location.href = 'login.html';
  });

  document.getElementById('nav-products')?.addEventListener('click', (e) => {
    e.preventDefault();
    showSection('products');
  });
  document.getElementById('nav-add')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAddForm();
  });
  document.getElementById('show-add-form')?.addEventListener('click', showAddForm);
  document.getElementById('cancel-form')?.addEventListener('click', () => showSection('products'));
  document.getElementById('product-form')?.addEventListener('submit', handleProductSubmit);
  setupImageUpload();

  document.getElementById('admin-search')?.addEventListener('input', renderAdminProducts);
  const adminCatFilter = document.getElementById('admin-category-filter');
  if (adminCatFilter) {
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      adminCatFilter.appendChild(opt);
    });
    adminCatFilter.addEventListener('change', renderAdminProducts);
  }

  const productCat = document.getElementById('product-category');
  if (productCat) {
    CATEGORIES.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      productCat.appendChild(opt);
    });
  }

  await loadProducts();
});

function isAdmin() {
  return currentUser && currentUser.role === 'admin';
}

function applyRoleRestrictions() {
  const statsGrid = document.getElementById('stats-grid');
  if (currentUser?.role === 'worker' && statsGrid && !document.getElementById('role-notice')) {
    const notice = document.createElement('div');
    notice.id = 'role-notice';
    notice.className = 'role-notice';
    notice.innerHTML = `
      <i class="fas fa-info-circle"></i>
      <span>You are logged in as a <strong>Worker</strong>. You can add and edit products (including stock), but you cannot delete products. Only Admins can delete.</span>
    `;
    statsGrid.parentNode.insertBefore(notice, statsGrid);
  }
}

async function loadProducts() {
  try {
    const data = await API.getProducts();
    productsCache = data.products || [];
    updateStats();
    renderAdminProducts();
  } catch (err) {
    showToast(err.message || 'Failed to load products', 'error');
  }
}

function showSection(section) {
  document.getElementById('products-section').style.display = section === 'products' ? 'block' : 'none';
  document.getElementById('form-section').style.display = section === 'form' ? 'block' : 'none';
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  if (section === 'products') document.getElementById('nav-products')?.classList.add('active');
}

function setupImageUpload() {
  document.getElementById('product-image-file')?.addEventListener('change', handleImageFileSelect);
  document.getElementById('product-image')?.addEventListener('input', () => {
    const url = document.getElementById('product-image').value.trim();
    if (url) {
      document.getElementById('product-image-data').value = '';
      showImagePreview(url);
    } else if (!document.getElementById('product-image-data').value) {
      resetImagePreview();
    }
  });
  document.getElementById('clear-image')?.addEventListener('click', clearProductImage);
}

function handleImageFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file.', 'error');
    e.target.value = '';
    return;
  }
  if (file.size > 1.5 * 1024 * 1024) {
    showToast('Image too large. Use under 1.5 MB.', 'error');
    e.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('product-image-data').value = ev.target.result;
    document.getElementById('product-image').value = '';
    showImagePreview(ev.target.result);
  };
  reader.readAsDataURL(file);
}

function showImagePreview(src) {
  const preview = document.getElementById('image-preview');
  const clearBtn = document.getElementById('clear-image');
  if (!preview) return;
  preview.innerHTML = `<img src="${src}" alt="Preview">`;
  preview.classList.add('has-image');
  if (clearBtn) clearBtn.style.display = 'inline-flex';
}

function resetImagePreview() {
  const preview = document.getElementById('image-preview');
  const clearBtn = document.getElementById('clear-image');
  if (preview) {
    preview.innerHTML = `<i class="fas fa-image"></i><span>No image selected</span>`;
    preview.classList.remove('has-image');
  }
  if (clearBtn) clearBtn.style.display = 'none';
}

function clearProductImage() {
  document.getElementById('product-image-data').value = '';
  document.getElementById('product-image').value = '';
  const fileInput = document.getElementById('product-image-file');
  if (fileInput) fileInput.value = '';
  resetImagePreview();
}

function getProductImageValue() {
  const data = document.getElementById('product-image-data')?.value?.trim();
  if (data) return data;
  return document.getElementById('product-image')?.value?.trim() || '';
}

function showAddForm() {
  document.getElementById('form-title').textContent = 'Add New Product';
  document.getElementById('product-form').reset();
  document.getElementById('product-id').value = '';
  document.getElementById('product-image-data').value = '';
  clearProductImage();
  document.getElementById('submit-product').innerHTML = '<i class="fas fa-save"></i> Save Product';
  showSection('form');
}

function showEditForm(productId) {
  const product = productsCache.find(p => p.id === productId);
  if (!product) return;
  document.getElementById('form-title').textContent = 'Edit Product';
  document.getElementById('product-id').value = product.id;
  document.getElementById('product-name').value = product.name;
  document.getElementById('product-category').value = product.category;
  document.getElementById('product-price').value = product.price;
  document.getElementById('product-stock').value = product.stock;
  document.getElementById('product-description').value = product.description || '';
  document.getElementById('product-image-data').value = '';
  document.getElementById('product-image').value = '';
  const fileInput = document.getElementById('product-image-file');
  if (fileInput) fileInput.value = '';
  const img = product.image || '';
  if (img.startsWith('data:image')) {
    document.getElementById('product-image-data').value = img;
    showImagePreview(img);
  } else if (img) {
    document.getElementById('product-image').value = img;
    showImagePreview(img);
  } else {
    resetImagePreview();
  }
  document.getElementById('submit-product').innerHTML = '<i class="fas fa-save"></i> Update Product';
  showSection('form');
}

async function handleProductSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('product-id').value;
  const payload = {
    name: document.getElementById('product-name').value.trim(),
    category: document.getElementById('product-category').value,
    price: parseFloat(document.getElementById('product-price').value),
    stock: parseInt(document.getElementById('product-stock').value),
    description: document.getElementById('product-description').value.trim(),
    image: getProductImageValue(),
  };
  if (!payload.name || !payload.category || isNaN(payload.price) || isNaN(payload.stock)) {
    showToast('Please fill all required fields correctly.', 'error');
    return;
  }
  try {
    if (id) {
      await API.updateProduct(parseInt(id), payload);
      showToast('Product updated successfully!');
    } else {
      await API.createProduct(payload);
      showToast('Product added successfully!');
    }
    await loadProducts();
    showSection('products');
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  }
}

async function deleteProduct(productId) {
  if (!isAdmin()) {
    showToast('Only Admins can delete products.', 'error');
    return;
  }
  if (!confirm('Are you sure you want to delete this product?')) return;
  try {
    await API.deleteProduct(productId);
    showToast('Product deleted.');
    await loadProducts();
  } catch (err) {
    showToast(err.message || 'Delete failed', 'error');
  }
}

function updateStats() {
  const products = productsCache;
  document.getElementById('stat-products').textContent = products.length;
  document.getElementById('stat-instock').textContent = products.filter(p => p.stock > 0).length;
  document.getElementById('stat-lowstock').textContent = products.filter(p => p.stock > 0 && p.stock < 10).length;
  document.getElementById('stat-outofstock').textContent = products.filter(p => p.stock <= 0).length;
}

function renderAdminProducts() {
  const tbody = document.getElementById('products-tbody');
  if (!tbody) return;
  let products = [...productsCache];
  const search = document.getElementById('admin-search')?.value.toLowerCase() || '';
  const catFilter = document.getElementById('admin-category-filter')?.value || 'all';
  if (catFilter !== 'all') products = products.filter(p => p.category === catFilter);
  if (search) {
    products = products.filter(p =>
      p.name.toLowerCase().includes(search) ||
      getCategoryName(p.category).toLowerCase().includes(search)
    );
  }
  if (products.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:#64748b;">No products found.</td></tr>`;
    return;
  }
  const canDelete = isAdmin();
  tbody.innerHTML = products.map(p => {
    const status = getStockStatus(p.stock);
    const imgHtml = p.image
      ? `<img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'">`
      : `<div style="width:48px;height:48px;background:#f1f5f9;border-radius:8px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-box" style="color:#cbd5e1"></i></div>`;
    const deleteBtn = canDelete
      ? `<button class="btn-delete" title="Delete" onclick="deleteProduct(${p.id})"><i class="fas fa-trash"></i></button>`
      : `<button class="btn-delete disabled" title="Only Admins can delete" disabled><i class="fas fa-trash"></i></button>`;
    return `<tr>
      <td>${imgHtml}</td>
      <td><strong>${p.name}</strong></td>
      <td>${getCategoryName(p.category)}</td>
      <td>${formatPrice(p.price)}</td>
      <td><strong>${p.stock}</strong></td>
      <td><span class="stock-status ${status.class}">${status.text}</span></td>
      <td><div class="action-btns">
        <button class="btn-edit" title="Edit" onclick="showEditForm(${p.id})"><i class="fas fa-edit"></i></button>
        ${deleteBtn}
      </div></td>
    </tr>`;
  }).join('');
}
