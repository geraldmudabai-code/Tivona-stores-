// ===== Tivona Stores – API client (server-backed) =====

const API = {
  async request(path, options = {}) {
    const opts = {
      credentials: "include", // send session cookie
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    };
    if (opts.body && typeof opts.body === "object") {
      opts.body = JSON.stringify(opts.body);
    }
    const res = await fetch(path, opts);
    let data = null;
    try {
      data = await res.json();
    } catch (_) {
      data = {};
    }
    if (!res.ok) {
      const err = new Error(data.error || res.statusText || "Request failed");
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  login(email, password) {
    return this.request("/api/login", {
      method: "POST",
      body: { email, password },
    });
  },

  register(payload) {
    return this.request("/api/register", {
      method: "POST",
      body: payload,
    });
  },

  logout() {
    return this.request("/api/logout", { method: "POST" });
  },

  me() {
    return this.request("/api/me");
  },

  forgotPassword(email, newPassword) {
    return this.request("/api/forgot-password", {
      method: "POST",
      body: { email, new_password: newPassword },
    });
  },

  verifyEmail(token) {
    return this.request("/api/verify-email", {
      method: "POST",
      body: { token },
    });
  },

  resendVerification(email) {
    return this.request("/api/resend-verification", {
      method: "POST",
      body: { email },
    });
  },

  getProducts() {
    return this.request("/api/products");
  },

  createProduct(product) {
    return this.request("/api/products", {
      method: "POST",
      body: product,
    });
  },

  updateProduct(id, product) {
    return this.request(`/api/products/${id}`, {
      method: "PUT",
      body: product,
    });
  },

  deleteProduct(id) {
    return this.request(`/api/products/${id}`, { method: "DELETE" });
  },

  checkout(items) {
    return this.request("/api/checkout", {
      method: "POST",
      body: { items },
    });
  },
};
