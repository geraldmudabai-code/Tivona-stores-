# Deploy Tivona Stores on Render (FREE – no domain needed)

You will get a live link like:  
`https://tivona-stores-xxxx.onrender.com`

## Step 1 – GitHub (free)

1. Go to https://github.com and create a free account (if you don’t have one).
2. Click **New repository**.
3. Name it `tivona-stores`.
4. Upload **all files** from this folder (or use GitHub Desktop / drag & drop).
5. Do **not** upload `venv`, `node_modules`, or `__pycache__` if possible.

## Step 2 – Render (free)

1. Go to https://render.com and sign up (you can use your GitHub account).
2. Click **New +** → **Web Service**.
3. Connect the `tivona-stores` GitHub repo.
4. Settings:

| Setting | Value |
|--------|--------|
| Name | `tivona-stores` (or any name) |
| Region | Closest to you |
| Runtime | **Python 3** |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `python server.py` |
| Instance type | **Free** |

5. Environment variables (optional but recommended):

| Key | Value |
|-----|--------|
| `TIVONA_SECRET` | any long random text (e.g. `MyShopSecret2026xyz`) |
| `TIVONA_BASE_URL` | leave empty first; after deploy, set to your Render URL |

6. Click **Create Web Service** / **Deploy**.

## Step 3 – Open your live site

When deploy finishes (a few minutes), Render shows a URL like:

`https://tivona-stores.onrender.com`

Open it in your browser. That is your live shop.

**Demo login:**
- Admin: `admin@tivonastores.com` / `admin123`
- Worker: `worker@tivonastores.com` / `worker123`

## Important notes (free plan)

- Free services **sleep after ~15 minutes** of no traffic. The first open after sleep can take 30–60 seconds.
- The SQLite database can **reset** if Render rebuilds the service. For a serious business later, use a paid plan or external database.
- Change the demo passwords after you go live.
- When you can buy a domain, attach it in Render → Settings → Custom Domains.

## After deploy

1. Copy your Render URL.
2. In Render → Environment → set:
   - `TIVONA_BASE_URL` = `https://your-app.onrender.com`
3. Redeploy (or restart) so email verification links use the correct address.

Share the link on WhatsApp, Instagram, and Facebook so customers can find you.
