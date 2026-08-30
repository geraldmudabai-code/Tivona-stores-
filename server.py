#!/usr/bin/env python3
"""
Tivona Stores – Production-style backend
- Passwords hashed with Werkzeug (scrypt)
- Server-side sessions (signed cookies)
- SQLite database
- Role-based access (admin / worker)
- Rate limiting on login
- Email verification required before login (option A)
  - Demo mode: verification link printed to console
  - Optional SMTP: set TIVONA_SMTP_* env vars
"""

import os
import json
import sqlite3
import time
import secrets
import smtplib
import re
import socket
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from functools import wraps
from datetime import timedelta

from flask import (
    Flask, request, session, jsonify, send_from_directory, g
)
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "tivona.db")
STATIC_DIR = BASE_DIR

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
app.secret_key = os.environ.get("TIVONA_SECRET", "tivona-change-me-in-production-use-long-random-string")
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    MAX_CONTENT_LENGTH=3 * 1024 * 1024,
)

# Public base URL for verification links (change in production)
APP_BASE_URL = os.environ.get("TIVONA_BASE_URL", "http://127.0.0.1:5000")

# Optional SMTP (if not set → demo mode: print link to console)
SMTP_HOST = os.environ.get("TIVONA_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("TIVONA_SMTP_PORT", "587"))
SMTP_USER = os.environ.get("TIVONA_SMTP_USER", "")
SMTP_PASS = os.environ.get("TIVONA_SMTP_PASS", "")
SMTP_FROM = os.environ.get("TIVONA_SMTP_FROM", SMTP_USER or "noreply@tivonastores.com")

_login_attempts = {}
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 60


# ---------- Database ----------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    db = sqlite3.connect(DB_PATH)
    db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('admin', 'worker')),
            email_verified INTEGER NOT NULL DEFAULT 0,
            verification_token TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0,
            description TEXT DEFAULT '',
            image TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_email TEXT,
            action TEXT NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # Migrate older DBs that lack verification columns
    cols = {r[1] for r in db.execute("PRAGMA table_info(users)").fetchall()}
    if "email_verified" not in cols:
        db.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
    if "verification_token" not in cols:
        db.execute("ALTER TABLE users ADD COLUMN verification_token TEXT")
    # Existing demo accounts are treated as verified
    db.execute("UPDATE users SET email_verified = 1 WHERE email_verified = 0 AND verification_token IS NULL")
    db.commit()

    cur = db.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        users = [
            ("admin@tivonastores.com", generate_password_hash("admin123"), "Administrator", "admin", 1, None),
            ("worker@tivonastores.com", generate_password_hash("worker123"), "Store Worker", "worker", 1, None),
        ]
        db.executemany(
            "INSERT INTO users (email, password_hash, name, role, email_verified, verification_token) VALUES (?, ?, ?, ?, ?, ?)",
            users,
        )
        products = [
            ("Fresh Organic Apples", "groceries", 4.99, 120, "Crisp organic apples.", ""),
            ("Whole Wheat Bread", "groceries", 3.49, 45, "Freshly baked whole wheat bread.", ""),
            ("Wireless Bluetooth Earbuds", "electronics", 49.99, 35, "Premium sound, long battery.", ""),
            ("Smartphone 128GB", "electronics", 399.99, 12, "Latest model with great camera.", ""),
            ("Cotton T-Shirt", "fashion", 19.99, 80, "100% cotton, multiple colors.", ""),
            ("Denim Jeans", "fashion", 49.99, 28, "Classic fit denim jeans.", ""),
            ("Non-Stick Frying Pan", "home", 29.99, 50, "Easy to clean, durable.", ""),
            ("LED Desk Lamp", "home", 24.99, 8, "Adjustable brightness.", ""),
            ("Moisturizing Face Cream", "beauty", 15.99, 60, "Natural ingredients.", ""),
            ("Yoga Mat", "sports", 22.99, 0, "Extra thick non-slip mat.", ""),
            ("Organic Milk 1L", "groceries", 2.99, 95, "Fresh organic whole milk.", ""),
            ("Wireless Mouse", "electronics", 18.99, 42, "Ergonomic wireless mouse.", ""),
        ]
        db.executemany(
            "INSERT INTO products (name, category, price, stock, description, image) VALUES (?, ?, ?, ?, ?, ?)",
            products,
        )
        db.commit()
        print("Database initialized with demo users and products.")
    db.close()


def log_action(email, action, details=""):
    try:
        db = get_db()
        db.execute(
            "INSERT INTO audit_log (user_email, action, details) VALUES (?, ?, ?)",
            (email, action, details),
        )
        db.commit()
    except Exception:
        pass


# ---------- Email helpers ----------

def make_verification_token():
    return secrets.token_urlsafe(32)


def send_verification_email(to_email, token, name=""):
    """Send verification email via SMTP, or print link in demo mode."""
    link = f"{APP_BASE_URL}/verify.html?token={token}"
    subject = "Verify your Tivona Stores account"
    body_text = (
        f"Hi {name or 'there'},\n\n"
        f"Please verify your email for Tivona Stores by opening this link:\n\n"
        f"{link}\n\n"
        f"If you did not create an account, you can ignore this email.\n"
    )
    body_html = f"""
    <p>Hi {name or 'there'},</p>
    <p>Please verify your email for <strong>Tivona Stores</strong>:</p>
    <p><a href="{link}" style="background:#0d9488;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block;">Verify Email</a></p>
    <p>Or copy this link:<br><a href="{link}">{link}</a></p>
    <p>If you did not create an account, you can ignore this email.</p>
    """

    if SMTP_HOST and SMTP_USER and SMTP_PASS:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = to_email
            msg.attach(MIMEText(body_text, "plain"))
            msg.attach(MIMEText(body_html, "html"))
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASS)
                server.sendmail(SMTP_FROM, [to_email], msg.as_string())
            print(f"[email] Verification sent to {to_email}")
            return True, None
        except Exception as e:
            print(f"[email] SMTP failed: {e}")
            # Fall through to demo mode so registration still works
            print("=" * 60)
            print("DEMO MODE – Email verification link (SMTP failed):")
            print(f"  To: {to_email}")
            print(f"  Link: {link}")
            print("=" * 60)
            return False, str(e)

    # Demo mode – no SMTP configured
    print("=" * 60)
    print("DEMO MODE – Email verification link (copy into browser):")
    print(f"  To: {to_email}")
    print(f"  Link: {link}")
    print("=" * 60)
    return True, "demo"


# ---------- Email quality checks (block fake / disposable) ----------

EMAIL_RE = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")

DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.org", "sharklasers.com",
    "grr.la", "guerrillamailblock.com", "pokemail.net", "spam4.me",
    "10minutemail.com", "10minutemail.net", "10minemail.com",
    "tempmail.com", "temp-mail.org", "tempmailo.com", "tempail.com",
    "throwawaymail.com", "trashmail.com", "trashmail.de", "trash-mail.com",
    "yopmail.com", "yopmail.fr", "cool.fr.nf", "jetable.org",
    "getnada.com", "nada.email", "emailondeck.com",
    "fakeinbox.com", "fakemailgenerator.com", "maildrop.cc",
    "dispostable.com", "mailnesia.com", "moakt.com",
    "inboxkitten.com", "burnermail.io", "mailsac.com",
    "tempinbox.com", "getairmail.com", "mytemp.email",
    "mailcatch.com", "discard.email", "discardmail.com",
    "mintemail.com", "spamgourmet.com", "mailnull.com",
    "example.com", "example.org", "example.net", "test.com",
    "test.org", "fake.com",
    "localhost", "local", "invalid",
}

FAKE_LOCAL_PARTS = {
    "test", "testing", "fake", "asdf", "qwerty", "abc", "abcd",
    "user", "username", "noreply", "no-reply", "admin123",
}


def validate_real_email(email):
    """
    Reject malformed, disposable, and obviously fake addresses.
    Returns (ok: bool, error_message: str|None)
    """
    email = (email or "").strip().lower()
    if not EMAIL_RE.match(email):
        return False, "Please use a valid email address (e.g. name@gmail.com)."

    local, domain = email.split("@", 1)

    if ".." in email or email.startswith(".") or email.endswith("."):
        return False, "Please use a valid email address."

    if domain in DISPOSABLE_DOMAINS or any(domain.endswith("." + d) for d in DISPOSABLE_DOMAINS):
        return False, "Temporary or disposable email addresses are not allowed."

    if local in FAKE_LOCAL_PARTS or local.replace(".", "") in FAKE_LOCAL_PARTS:
        return False, "Please use a real email address, not a placeholder."

    # Domain should look like a real host (has a real TLD)
    parts = domain.split(".")
    if len(parts) < 2 or any(len(p) == 0 for p in parts):
        return False, "Please use a valid email domain."
    tld = parts[-1]
    if tld in {"local", "invalid", "localhost", "test", "example", "internal"}:
        return False, "Please use a public email domain (Gmail, Outlook, company mail, etc.)."

    # DNS check: domain must resolve (A or MX-like host lookup)
    try:
        socket.setdefaulttimeout(3)
        socket.getaddrinfo(domain, None)
    except socket.gaierror:
        return False, "This email domain does not exist. Please use a real email address."
    except OSError:
        # Network issues: don't block registration, but disposable list still applies
        pass

    return True, None


# ---------- Auth helpers ----------

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Authentication required"}), 401
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Authentication required"}), 401
        if session.get("role") != "admin":
            return jsonify({"error": "Admin access required"}), 403
        return f(*args, **kwargs)
    return decorated


def check_rate_limit(email):
    now = time.time()
    attempts = _login_attempts.get(email, [])
    attempts = [t for t in attempts if now - t < LOCKOUT_SECONDS]
    _login_attempts[email] = attempts
    if len(attempts) >= MAX_ATTEMPTS:
        return False, LOCKOUT_SECONDS - int(now - attempts[0])
    return True, 0


def record_failed_login(email):
    _login_attempts.setdefault(email, []).append(time.time())


def clear_login_attempts(email):
    _login_attempts.pop(email, None)


# ---------- API: Auth ----------

@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    allowed, wait = check_rate_limit(email)
    if not allowed:
        return jsonify({
            "error": f"Too many failed attempts. Try again in {wait} seconds."
        }), 429

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

    if not row or not check_password_hash(row["password_hash"], password):
        record_failed_login(email)
        log_action(email, "login_failed")
        return jsonify({"error": "Invalid email or password"}), 401

    # Option A: must verify email before login
    verified = row["email_verified"] if "email_verified" in row.keys() else 1
    if not verified:
        log_action(email, "login_blocked_unverified")
        return jsonify({
            "error": "Please verify your email before logging in. Check your inbox or the server console for the link.",
            "code": "email_not_verified",
        }), 403

    clear_login_attempts(email)
    session.clear()
    session.permanent = True
    session["user_id"] = row["id"]
    session["email"] = row["email"]
    session["name"] = row["name"]
    session["role"] = row["role"]

    log_action(email, "login_success")
    return jsonify({
        "user": {
            "email": row["email"],
            "name": row["name"],
            "role": row["role"],
            "email_verified": True,
        }
    })


@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role = (data.get("role") or "worker").strip().lower()

    if role not in ("admin", "worker"):
        role = "worker"

    if len(name) < 2:
        return jsonify({"error": "Name must be at least 2 characters"}), 400
    ok_email, email_err = validate_real_email(email)
    if not ok_email:
        return jsonify({"error": email_err}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if password.isalpha() and password.islower():
        return jsonify({"error": "Password is too weak. Add numbers or uppercase letters."}), 400

    db = get_db()
    existing = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return jsonify({"error": "This email is already registered"}), 409

    token = make_verification_token()
    pw_hash = generate_password_hash(password)
    db.execute(
        """INSERT INTO users (email, password_hash, name, role, email_verified, verification_token)
           VALUES (?, ?, ?, ?, 0, ?)""",
        (email, pw_hash, name, role, token),
    )
    db.commit()
    log_action(email, "register", f"role={role}")

    ok, mode = send_verification_email(email, token, name)
    msg = (
        "Account created. Please verify your email before logging in. "
        "Check your inbox for the link."
    )
    if mode == "demo":
        msg = (
            "Account created. Please verify your email before logging in. "
            "In demo mode the verification link is printed in the server console."
        )

    return jsonify({
        "message": msg,
        "requires_verification": True,
        "demo_mode": mode == "demo",
    }), 201


@app.route("/api/verify-email", methods=["POST", "GET"])
def api_verify_email():
    if request.method == "GET":
        token = (request.args.get("token") or "").strip()
    else:
        data = request.get_json(silent=True) or {}
        token = (data.get("token") or "").strip()

    if not token:
        return jsonify({"error": "Verification token is required"}), 400

    db = get_db()
    row = db.execute(
        "SELECT id, email, email_verified FROM users WHERE verification_token = ?",
        (token,),
    ).fetchone()

    if not row:
        return jsonify({"error": "Invalid or expired verification link"}), 400

    if row["email_verified"]:
        return jsonify({"message": "Email already verified. You can log in.", "already": True})

    db.execute(
        "UPDATE users SET email_verified = 1, verification_token = NULL WHERE id = ?",
        (row["id"],),
    )
    db.commit()
    log_action(row["email"], "email_verified")
    return jsonify({"message": "Email verified successfully! You can now log in."})


@app.route("/api/resend-verification", methods=["POST"])
def api_resend_verification():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    if not email:
        return jsonify({"error": "Email is required"}), 400

    db = get_db()
    row = db.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        # Don't reveal whether email exists
        return jsonify({"message": "If that email is registered and unverified, a new link was sent."})

    if row["email_verified"]:
        return jsonify({"message": "This email is already verified. You can log in."})

    token = make_verification_token()
    db.execute(
        "UPDATE users SET verification_token = ? WHERE id = ?",
        (token, row["id"]),
    )
    db.commit()
    send_verification_email(email, token, row["name"])
    log_action(email, "resend_verification")
    return jsonify({
        "message": "If that email is registered and unverified, a new link was sent. (Demo: check server console.)",
        "demo_mode": not (SMTP_HOST and SMTP_USER and SMTP_PASS),
    })


@app.route("/api/logout", methods=["POST"])
def api_logout():
    email = session.get("email")
    session.clear()
    if email:
        log_action(email, "logout")
    return jsonify({"message": "Logged out"})


@app.route("/api/me", methods=["GET"])
def api_me():
    if not session.get("user_id"):
        return jsonify({"user": None})
    return jsonify({
        "user": {
            "email": session.get("email"),
            "name": session.get("name"),
            "role": session.get("role"),
        }
    })


@app.route("/api/forgot-password", methods=["POST"])
def api_forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    new_password = data.get("new_password") or ""

    if not email or len(new_password) < 6:
        return jsonify({"error": "Valid email and new password (min 6 chars) required"}), 400
    if new_password.isalpha() and new_password.islower():
        return jsonify({"error": "Password is too weak. Add numbers or uppercase letters."}), 400

    db = get_db()
    row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not row:
        return jsonify({"error": "No account found with this email"}), 404

    pw_hash = generate_password_hash(new_password)
    db.execute("UPDATE users SET password_hash = ? WHERE email = ?", (pw_hash, email))
    db.commit()
    log_action(email, "password_reset")
    return jsonify({"message": "Password reset successfully"})


# ---------- API: Products ----------

@app.route("/api/products", methods=["GET"])
def api_products_list():
    db = get_db()
    rows = db.execute(
        "SELECT id, name, category, price, stock, description, image FROM products ORDER BY id"
    ).fetchall()
    return jsonify({"products": [dict(r) for r in rows]})


@app.route("/api/products", methods=["POST"])
@login_required
def api_products_create():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    category = (data.get("category") or "").strip()
    try:
        price = float(data.get("price", 0))
        stock = int(data.get("stock", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid price or stock"}), 400

    description = (data.get("description") or "").strip()
    image = data.get("image") or ""

    if not name or not category:
        return jsonify({"error": "Name and category are required"}), 400
    if price < 0 or stock < 0:
        return jsonify({"error": "Price and stock must be non-negative"}), 400
    if isinstance(image, str) and len(image) > 2_000_000:
        return jsonify({"error": "Image too large. Use a smaller file or a URL."}), 400

    db = get_db()
    cur = db.execute(
        """INSERT INTO products (name, category, price, stock, description, image)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (name, category, price, stock, description, image),
    )
    db.commit()
    product_id = cur.lastrowid
    log_action(session.get("email"), "product_create", f"id={product_id} name={name}")
    row = db.execute(
        "SELECT id, name, category, price, stock, description, image FROM products WHERE id = ?",
        (product_id,),
    ).fetchone()
    return jsonify({"product": dict(row)}), 201


@app.route("/api/products/<int:product_id>", methods=["PUT"])
@login_required
def api_products_update(product_id):
    data = request.get_json(silent=True) or {}
    db = get_db()
    existing = db.execute("SELECT id FROM products WHERE id = ?", (product_id,)).fetchone()
    if not existing:
        return jsonify({"error": "Product not found"}), 404

    name = (data.get("name") or "").strip()
    category = (data.get("category") or "").strip()
    try:
        price = float(data.get("price", 0))
        stock = int(data.get("stock", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid price or stock"}), 400

    description = (data.get("description") or "").strip()
    image = data.get("image") or ""

    if not name or not category:
        return jsonify({"error": "Name and category are required"}), 400
    if isinstance(image, str) and len(image) > 2_000_000:
        return jsonify({"error": "Image too large"}), 400

    db.execute(
        """UPDATE products SET name=?, category=?, price=?, stock=?, description=?, image=?,
           updated_at=CURRENT_TIMESTAMP WHERE id=?""",
        (name, category, price, stock, description, image, product_id),
    )
    db.commit()
    log_action(session.get("email"), "product_update", f"id={product_id}")
    row = db.execute(
        "SELECT id, name, category, price, stock, description, image FROM products WHERE id = ?",
        (product_id,),
    ).fetchone()
    return jsonify({"product": dict(row)})


@app.route("/api/products/<int:product_id>", methods=["DELETE"])
@admin_required
def api_products_delete(product_id):
    db = get_db()
    existing = db.execute("SELECT id, name FROM products WHERE id = ?", (product_id,)).fetchone()
    if not existing:
        return jsonify({"error": "Product not found"}), 404

    db.execute("DELETE FROM products WHERE id = ?", (product_id,))
    db.commit()
    log_action(session.get("email"), "product_delete", f"id={product_id} name={existing['name']}")
    return jsonify({"message": "Product deleted"})


@app.route("/api/checkout", methods=["POST"])
def api_checkout():
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    db = get_db()
    for item in items:
        pid = item.get("id")
        qty = int(item.get("quantity", 0))
        if not pid or qty <= 0:
            continue
        row = db.execute("SELECT stock FROM products WHERE id = ?", (pid,)).fetchone()
        if not row:
            continue
        new_stock = max(0, row["stock"] - qty)
        db.execute(
            "UPDATE products SET stock = ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?",
            (new_stock, pid),
        )
    db.commit()
    log_action(session.get("email") or "guest", "checkout", json.dumps(items)[:500])
    return jsonify({"message": "Order placed"})


# ---------- Serve frontend ----------

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    blocked = ("server.py", "tivona.db", "package.json")
    if path in blocked or path.startswith("node_modules") or path.startswith("__pycache__"):
        return jsonify({"error": "Not found"}), 404
    full = os.path.join(STATIC_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(STATIC_DIR, path)
    return send_from_directory(STATIC_DIR, "index.html")


# Initialize DB when the app starts (including under Render)
with app.app_context():
    init_db()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    print("=" * 50)
    print("Tivona Stores server starting")
    print(f"  Port: {port}")
    print(f"  URL:  {APP_BASE_URL}")
    print("  Admin: admin@tivonastores.com / admin123  (pre-verified)")
    print("  Worker: worker@tivonastores.com / worker123  (pre-verified)")
    print("  New registrations require email verification before login.")
    if SMTP_HOST and SMTP_USER:
        print(f"  SMTP: {SMTP_HOST} (real email enabled)")
    else:
        print("  SMTP: not configured → DEMO mode (links printed in this console)")
    print("=" * 50)
    app.run(host="0.0.0.0", port=port, debug=debug)
