# Tivona Stores – Live E-Commerce

Flask shop with admin, stock, email verification, and role security.

## Run on your computer

```bash
pip install -r requirements.txt
python server.py
```

Open: http://127.0.0.1:5000

## Deploy free on Render (no domain needed)

See **RENDER_DEPLOY.md** for full steps.

Short version:
1. Put this folder on GitHub
2. Create a free Web Service on https://render.com
3. Build: `pip install -r requirements.txt`
4. Start: `python server.py`
5. Get a live link like `https://tivona-stores.onrender.com`

## Demo accounts

| Role   | Email                    | Password  |
|--------|--------------------------|-----------|
| Admin  | admin@tivonastores.com   | admin123  |
| Worker | worker@tivonastores.com  | worker123 |

## Security features

- Hashed passwords
- Server sessions
- Email verification before login
- Blocks disposable/fake emails
- Admin vs Worker roles
- Login rate limiting
