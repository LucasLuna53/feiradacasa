import os, uuid, base64, pytest, requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") if os.environ.get("EXPO_PUBLIC_BACKEND_URL") else "https://smart-shopping-95.preview.emergentagent.com"

@pytest.fixture(scope="module")
def user():
    s = requests.Session()
    email = f"test_{uuid.uuid4().hex[:8]}@teste.com"
    r = s.post(f"{BASE}/api/auth/register", json={"email": email, "password": "Pass1234!", "name": "Test"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, tok, email

# ---- Auth ----
def test_login_admin():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "admin@feiradacasa.com", "password": "admin123"})
    assert r.status_code == 200 and "token" in r.json()

def test_me(user):
    s, tok, email = user
    r = s.get(f"{BASE}/api/auth/me")
    assert r.status_code == 200 and r.json()["email"] == email

def test_login_bad():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": "nope@x.com", "password": "x"})
    assert r.status_code == 401

# ---- Products ----
def test_seeded_products(user):
    s, *_ = user
    r = s.get(f"{BASE}/api/products")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 10, f"expected 10 seeded, got {len(items)}"

def test_product_crud(user):
    s, *_ = user
    r = s.post(f"{BASE}/api/products", json={"name": "TEST_Prod", "category": "Outros", "min_qty": 1})
    assert r.status_code == 200
    pid = r.json()["id"]
    r = s.patch(f"{BASE}/api/products/{pid}", json={"min_qty": 5})
    assert r.status_code == 200 and r.json()["min_qty"] == 5
    r = s.post(f"{BASE}/api/products/{pid}/qty", json={"delta": 3})
    assert r.status_code == 200 and r.json()["current_qty"] == 3
    r = s.post(f"{BASE}/api/products/{pid}/qty", json={"delta": -10})
    assert r.json()["current_qty"] == 0
    r = s.delete(f"{BASE}/api/products/{pid}")
    assert r.status_code == 200

# ---- Shopping list ----
def test_shopping_list(user):
    s, *_ = user
    r = s.get(f"{BASE}/api/shopping-list")
    assert r.status_code == 200
    data = r.json()
    assert "auto" in data and "manual" in data
    assert len(data["auto"]) >= 1  # low stock items present
    r = s.post(f"{BASE}/api/shopping-list", json={"name": "TEST_extra", "qty": 2})
    assert r.status_code == 200
    iid = r.json()["id"]
    r = s.patch(f"{BASE}/api/shopping-list/{iid}", json={"checked": True})
    assert r.status_code == 200
    r = s.post(f"{BASE}/api/shopping-list/clear-checked")
    assert r.status_code == 200

# ---- Recipes (LLM) ----
def test_recipes_suggest(user):
    s, *_ = user
    # Bump qty of first product
    r = s.get(f"{BASE}/api/products")
    pid = r.json()[0]["id"]
    s.post(f"{BASE}/api/products/{pid}/qty", json={"delta": 3})
    r = s.post(f"{BASE}/api/recipes/suggest", timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "recipes" in data
    assert isinstance(data["recipes"], list)

# ---- Receipt scan (LLM) ----
def test_receipt_scan(user):
    s, *_ = user
    # Minimal valid JPEG via PIL
    from PIL import Image
    import io
    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 255, 255)).save(buf, format="JPEG")
    img = base64.b64encode(buf.getvalue()).decode()
    r = s.post(f"{BASE}/api/receipts/scan", json={"image_base64": img}, timeout=120)
    assert r.status_code in (200, 502), r.text  # accept LLM failure on bad image
    if r.status_code == 200:
        d = r.json()
        assert "items" in d

def test_receipt_commit(user):
    s, *_ = user
    payload = {"market": "TEST_Mercado", "date": "2026-01-15", "items": [
        {"name": "Arroz 1kg", "qty": 2, "unit_price": 6.5, "total": 13.0, "brand": "X"}
    ]}
    r = s.post(f"{BASE}/api/receipts/commit", json=payload)
    assert r.status_code == 200 and r.json().get("ok")

# ---- Community ----
def test_community_post_get(user):
    s, *_ = user
    r = s.post(f"{BASE}/api/community/prices", json={
        "product_name": "TEST_Leite", "market": "M1", "region": "SP", "price": 5.5
    })
    assert r.status_code == 200
    r = requests.get(f"{BASE}/api/community/prices")
    assert r.status_code == 200
    assert "summaries" in r.json() and "feed" in r.json()

# ---- Family ----
def test_family_invite_join(user):
    s_owner, *_ = user
    r = s_owner.post(f"{BASE}/api/family/invite")
    assert r.status_code == 200
    code = r.json()["code"]
    # Second user joins
    s2 = requests.Session()
    email2 = f"test_{uuid.uuid4().hex[:8]}@teste.com"
    r = s2.post(f"{BASE}/api/auth/register", json={"email": email2, "password": "P1!", "name": "X"})
    s2.headers.update({"Authorization": f"Bearer {r.json()['token']}"})
    r = s2.post(f"{BASE}/api/family/join", json={"code": code})
    assert r.status_code == 200
    r = s_owner.get(f"{BASE}/api/family/members")
    assert r.status_code == 200
    assert len(r.json()["members"]) >= 2
