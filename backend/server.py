from dotenv import load_dotenv
load_dotenv()

import os
import uuid
import json
import logging
import secrets
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any

import bcrypt
import jwt
from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, Depends
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr

# ---------------------------------------------------------------
# Setup
# ---------------------------------------------------------------
ROOT_DIR = Path(__file__).parent

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

app = FastAPI(title="Feira da Casa API")
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("feiradacasa")

# ---------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "exp": now_utc() + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)

def serialize(doc: dict) -> dict:
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.lower().startswith("bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Não autenticado")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido")
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(401, "Usuário não encontrado")
    return serialize(user)

def get_group_id(user: dict) -> str:
    """Return the family_group_id if user is in a shared group, else their own id."""
    return user.get("family_group_id") or user["id"]

# ---------------------------------------------------------------
# Models
# ---------------------------------------------------------------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ProductIn(BaseModel):
    name: str  # generic name e.g. "Leite UHT 1L"
    category: str
    emoji: str = "📦"
    unit: str = "un"
    min_qty: int = 1
    current_qty: int = 0

class ProductPatch(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    emoji: Optional[str] = None
    unit: Optional[str] = None
    min_qty: Optional[int] = None
    current_qty: Optional[int] = None

class QtyDelta(BaseModel):
    delta: int

class ShoppingListItemIn(BaseModel):
    product_id: Optional[str] = None
    name: str
    qty: int = 1

class ShoppingListCheck(BaseModel):
    checked: bool

class ReceiptScanIn(BaseModel):
    image_base64: str  # raw base64 (no data: prefix)
    mime_type: str = "image/jpeg"

class ReceiptCommitIn(BaseModel):
    market: Optional[str] = None
    date: Optional[str] = None
    items: List[dict]  # [{name, qty, unit_price, total, brand?}]

class CommunityPriceIn(BaseModel):
    product_name: str
    market: str
    region: str
    price: float

class FamilyJoinIn(BaseModel):
    code: str

# ---------------------------------------------------------------
# Default products seed
# ---------------------------------------------------------------
DEFAULT_PRODUCTS = [
    {"name": "Arroz 1kg", "category": "Mercearia", "emoji": "🍚", "unit": "kg", "min_qty": 2},
    {"name": "Feijão 1kg", "category": "Mercearia", "emoji": "🫘", "unit": "kg", "min_qty": 2},
    {"name": "Leite UHT 1L", "category": "Laticínios", "emoji": "🥛", "unit": "L", "min_qty": 2},
    {"name": "Ovos", "category": "Laticínios", "emoji": "🥚", "unit": "un", "min_qty": 6},
    {"name": "Tomate", "category": "Hortifruti", "emoji": "🍅", "unit": "un", "min_qty": 3},
    {"name": "Alface", "category": "Hortifruti", "emoji": "🥬", "unit": "un", "min_qty": 1},
    {"name": "Óleo de Soja 900ml", "category": "Mercearia", "emoji": "🫙", "unit": "un", "min_qty": 1},
    {"name": "Açúcar 1kg", "category": "Mercearia", "emoji": "🧂", "unit": "kg", "min_qty": 1},
    {"name": "Café 500g", "category": "Mercearia", "emoji": "☕", "unit": "un", "min_qty": 1},
    {"name": "Sabão em Pó", "category": "Limpeza", "emoji": "🧴", "unit": "un", "min_qty": 1},
]

async def seed_default_products(group_id: str):
    existing = await db.products.find_one({"group_id": group_id})
    if existing:
        return
    docs = []
    for p in DEFAULT_PRODUCTS:
        docs.append({
            "id": str(uuid.uuid4()),
            "group_id": group_id,
            **p,
            "current_qty": 0,
            "last_price": None,
            "last_date": None,
            "last_market": None,
            "created_at": now_utc(),
        })
    if docs:
        await db.products.insert_many(docs)

# ---------------------------------------------------------------
# Auth endpoints
# ---------------------------------------------------------------
@api.post("/auth/register")
async def register(payload: RegisterIn, response: Response):
    email = payload.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "E-mail já cadastrado")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": email,
        "name": payload.name.strip() or email.split("@")[0],
        "password_hash": hash_password(payload.password),
        "family_group_id": None,
        "created_at": now_utc(),
    }
    await db.users.insert_one(user_doc)
    await seed_default_products(user_id)
    token = create_access_token(user_id, email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": serialize(user_doc)}

@api.post("/auth/login")
async def login(payload: LoginIn, response: Response):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "E-mail ou senha inválidos")
    token = create_access_token(user["id"], email)
    response.set_cookie("access_token", token, httponly=True, samesite="lax", max_age=604800, path="/")
    return {"token": token, "user": serialize(user)}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

# ---------------------------------------------------------------
# Products
# ---------------------------------------------------------------
@api.get("/products")
async def list_products(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    items = await db.products.find({"group_id": gid}, {"_id": 0, "password_hash": 0}).to_list(1000)
    for it in items:
        for k, v in list(it.items()):
            if isinstance(v, datetime):
                it[k] = v.isoformat()
    return items

@api.post("/products")
async def create_product(p: ProductIn, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    doc = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        **p.model_dump(),
        "last_price": None,
        "last_date": None,
        "last_market": None,
        "created_at": now_utc(),
    }
    await db.products.insert_one(doc)
    return serialize(doc)

@api.patch("/products/{pid}")
async def patch_product(pid: str, body: ProductPatch, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    upd = {k: v for k, v in body.model_dump().items() if v is not None}
    if not upd:
        raise HTTPException(400, "Nada para atualizar")
    res = await db.products.update_one({"id": pid, "group_id": gid}, {"$set": upd})
    if not res.matched_count:
        raise HTTPException(404, "Produto não encontrado")
    doc = await db.products.find_one({"id": pid}, {"_id": 0})
    return serialize(doc)

@api.post("/products/{pid}/qty")
async def change_qty(pid: str, body: QtyDelta, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    doc = await db.products.find_one({"id": pid, "group_id": gid})
    if not doc:
        raise HTTPException(404, "Produto não encontrado")
    new_qty = max(0, int(doc.get("current_qty", 0)) + body.delta)
    await db.products.update_one({"id": pid}, {"$set": {"current_qty": new_qty}})
    doc["current_qty"] = new_qty
    return serialize(doc)

@api.delete("/products/{pid}")
async def delete_product(pid: str, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    res = await db.products.delete_one({"id": pid, "group_id": gid})
    if not res.deleted_count:
        raise HTTPException(404, "Produto não encontrado")
    return {"ok": True}

# ---------------------------------------------------------------
# Shopping list (auto from low stock + manual extras)
# ---------------------------------------------------------------
@api.get("/shopping-list")
async def get_shopping_list(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    products = await db.products.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    auto = []
    for p in products:
        if int(p.get("current_qty", 0)) < int(p.get("min_qty", 1)):
            auto.append({
                "source": "auto",
                "product_id": p["id"],
                "name": p["name"],
                "emoji": p.get("emoji", "📦"),
                "category": p.get("category", "Outros"),
                "qty": int(p.get("min_qty", 1)) - int(p.get("current_qty", 0)),
                "unit": p.get("unit", "un"),
                "last_price": p.get("last_price"),
                "last_date": p.get("last_date").isoformat() if isinstance(p.get("last_date"), datetime) else p.get("last_date"),
                "last_market": p.get("last_market"),
                "checked": False,
            })
    manual = await db.shopping_list.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    for m in manual:
        for k, v in list(m.items()):
            if isinstance(v, datetime):
                m[k] = v.isoformat()
        m["source"] = "manual"
    return {"auto": auto, "manual": manual}

@api.post("/shopping-list")
async def add_shopping_item(body: ShoppingListItemIn, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    doc = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "product_id": body.product_id,
        "name": body.name,
        "qty": body.qty,
        "checked": False,
        "created_at": now_utc(),
    }
    await db.shopping_list.insert_one(doc)
    return serialize(doc)

@api.patch("/shopping-list/{iid}")
async def check_item(iid: str, body: ShoppingListCheck, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    res = await db.shopping_list.update_one({"id": iid, "group_id": gid}, {"$set": {"checked": body.checked}})
    if not res.matched_count:
        raise HTTPException(404, "Item não encontrado")
    return {"ok": True}

@api.delete("/shopping-list/{iid}")
async def delete_item(iid: str, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    await db.shopping_list.delete_one({"id": iid, "group_id": gid})
    return {"ok": True}

@api.post("/shopping-list/clear-checked")
async def clear_checked(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    await db.shopping_list.delete_many({"group_id": gid, "checked": True})
    return {"ok": True}

# ---------------------------------------------------------------
# Price history
# ---------------------------------------------------------------
@api.get("/products/{pid}/prices")
async def product_prices(pid: str, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    items = await db.price_history.find({"group_id": gid, "product_id": pid}, {"_id": 0}).sort("date", -1).to_list(500)
    for it in items:
        for k, v in list(it.items()):
            if isinstance(v, datetime):
                it[k] = v.isoformat()
    prices = [float(i["price"]) for i in items if i.get("price")]
    stats = {}
    if prices:
        stats = {
            "last": prices[0],
            "min": min(prices),
            "max": max(prices),
            "avg": round(sum(prices) / len(prices), 2),
            "count": len(prices),
        }
    return {"history": items, "stats": stats}

# ---------------------------------------------------------------
# Receipt scan via GPT-4o vision
# ---------------------------------------------------------------
RECEIPT_PROMPT = (
    "Você é um assistente que extrai informações de cupons fiscais brasileiros. "
    "Analise a imagem do cupom/comprovante e retorne APENAS um JSON válido (sem markdown, sem ```), "
    "no formato: {\"market\": string|null, \"date\": \"YYYY-MM-DD\"|null, \"total\": number|null, "
    "\"items\": [{\"name\": string, \"qty\": number, \"unit_price\": number, \"total\": number, \"brand\": string|null}]}. "
    "Use nomes genéricos no campo name (ex: 'Leite UHT 1L'), e a marca no campo brand. "
    "Se não conseguir identificar um campo use null. Não invente dados."
)

@api.post("/receipts/scan")
async def scan_receipt(body: ReceiptScanIn, user: dict = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(500, "EMERGENT_LLM_KEY não configurada")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception as e:
        raise HTTPException(500, f"Biblioteca LLM indisponível: {e}")

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"receipt-{user['id']}-{uuid.uuid4()}",
        system_message="Você extrai dados estruturados de cupons fiscais.",
    ).with_model("openai", "gpt-4o")

    # If PDF, convert first page to JPEG
    image_b64 = body.image_base64
    if (body.mime_type or "").lower() == "application/pdf":
        try:
            import base64 as _b64, io as _io
            import pypdfium2 as pdfium
            raw = _b64.b64decode(body.image_base64)
            pdf = pdfium.PdfDocument(_io.BytesIO(raw))
            if len(pdf) == 0:
                raise HTTPException(400, "PDF sem páginas")
            page = pdf[0]
            pil = page.render(scale=2.0).to_pil()
            buf = _io.BytesIO()
            pil.save(buf, format="JPEG", quality=85)
            image_b64 = _b64.b64encode(buf.getvalue()).decode()
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Falha ao ler PDF: {e}")

    msg = UserMessage(
        text=RECEIPT_PROMPT,
        file_contents=[ImageContent(image_base64=image_b64)],
    )
    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(502, f"Falha ao processar imagem: {e}")

    text = str(raw).strip()
    # Strip code fences if present
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    try:
        data = json.loads(text)
    except Exception:
        # Best-effort: find first { ... }
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            try:
                data = json.loads(text[s:e+1])
            except Exception:
                raise HTTPException(502, "Não foi possível interpretar a resposta da IA")
        else:
            raise HTTPException(502, "Resposta da IA não é JSON")
    return data

@api.post("/receipts/commit")
async def commit_receipt(body: ReceiptCommitIn, user: dict = Depends(get_current_user)):
    """User-confirmed items: update product last_price/qty, store price_history, create receipt record."""
    gid = get_group_id(user)
    receipt_id = str(uuid.uuid4())
    receipt_date = None
    if body.date:
        try:
            receipt_date = datetime.fromisoformat(body.date)
        except Exception:
            receipt_date = now_utc()
    else:
        receipt_date = now_utc()

    products = await db.products.find({"group_id": gid}, {"_id": 0}).to_list(2000)
    name_map = {p["name"].lower(): p for p in products}

    for it in body.items:
        name = (it.get("name") or "").strip()
        if not name:
            continue
        qty = int(it.get("qty") or 1)
        unit_price = float(it.get("unit_price") or 0)
        brand = (it.get("brand") or "").strip() or None
        prod = name_map.get(name.lower())
        if not prod:
            # create generic product
            prod = {
                "id": str(uuid.uuid4()),
                "group_id": gid,
                "name": name,
                "category": "Outros",
                "emoji": "📦",
                "unit": "un",
                "min_qty": 1,
                "current_qty": qty,
                "last_price": unit_price,
                "last_date": receipt_date,
                "last_market": body.market,
                "created_at": now_utc(),
            }
            await db.products.insert_one(prod)
            name_map[name.lower()] = prod
        else:
            await db.products.update_one(
                {"id": prod["id"]},
                {"$set": {
                    "last_price": unit_price,
                    "last_date": receipt_date,
                    "last_market": body.market,
                    "current_qty": int(prod.get("current_qty", 0)) + qty,
                }},
            )
        await db.price_history.insert_one({
            "id": str(uuid.uuid4()),
            "group_id": gid,
            "product_id": prod["id"],
            "product_name": prod["name"],
            "brand": brand,
            "market": body.market,
            "price": unit_price,
            "qty": qty,
            "date": receipt_date,
            "receipt_id": receipt_id,
        })
        # Anonymous community contribution
        if body.market and unit_price > 0:
            await db.community_prices.insert_one({
                "id": str(uuid.uuid4()),
                "product_name": prod["name"],
                "brand": brand,
                "market": body.market,
                "region": "Brasil",
                "price": unit_price,
                "date": receipt_date,
            })

    await db.receipts.insert_one({
        "id": receipt_id,
        "group_id": gid,
        "user_id": user["id"],
        "market": body.market,
        "date": receipt_date,
        "items_count": len(body.items),
        "created_at": now_utc(),
    })
    return {"ok": True, "receipt_id": receipt_id}

# ---------------------------------------------------------------
# Recipes via GPT-4o
# ---------------------------------------------------------------
@api.post("/recipes/suggest")
async def suggest_recipes(user: dict = Depends(get_current_user)):
    ANTHROPIC_KEY = os.environ.get("GROQ_API_KEY", "")
    if not ANTHROPIC_KEY:
        raise HTTPException(500, "ANTHROPIC_API_KEY nao configurada")

    gid = get_group_id(user)
    products = await db.products.find({"group_id": gid, "current_qty": {"$gt": 0}}, {"_id": 0}).to_list(500)
    pantry = [{"name": p["name"], "qty": p.get("current_qty", 0), "unit": p.get("unit", "un")} for p in products]
    if not pantry:
        return {"recipes": []}
    import hashlib
    pantry_hash = hashlib.md5(str(sorted([p["name"]+str(p["qty"]) for p in pantry])).encode()).hexdigest()
    cached = await db.recipe_cache.find_one({"group_id": gid, "pantry_hash": pantry_hash})
    if cached:
        return {"recipes": cached["recipes"]}

    prompt = (
        "Você é um chef brasileiro. Dada a lista de ingredientes disponíveis na despensa, "
        "sugira de 3 a 5 receitas práticas e tradicionais. Retorne APENAS JSON válido sem markdown, "
        "no formato: {\"recipes\": [{\"name\": string, \"description\": string (1 frase), "
        "\"time_minutes\": number, \"servings\": number, "
        "\"ingredients_used\": [string], \"ingredients_missing\": [string], "
        "\"steps\": [string]}]}. "
        f"Despensa: {json.dumps(pantry, ensure_ascii=False)}"
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post("https://api.groq.com/openai/v1/chat/completions", headers={"Authorization": f"Bearer {ANTHROPIC_KEY}", "content-type": "application/json"}, json={"model": "llama-3.1-8b-instant", "max_tokens": 1024, "messages": [{"role": "user", "content": prompt}]}, timeout=30)
            raw = resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.exception("LLM error")
        raise HTTPException(502, f"Falha ao gerar receitas: {e}")

    text = str(raw).strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    try:
        data = json.loads(text)
    except Exception:
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            data = json.loads(text[s:e+1])
        else:
            raise HTTPException(502, "Resposta da IA inválida")
    return data

# ---------------------------------------------------------------
# Community prices
# ---------------------------------------------------------------
@api.get("/community/prices")
async def community_prices(q: Optional[str] = None, region: Optional[str] = None):
    query: dict = {}
    if q:
        query["product_name"] = {"$regex": q, "$options": "i"}
    if region:
        query["region"] = region
    items = await db.community_prices.find(query, {"_id": 0}).sort("date", -1).limit(200).to_list(200)
    # Aggregate by product
    by_product: dict = {}
    for it in items:
        key = it["product_name"].lower()
        agg = by_product.setdefault(key, {
            "product_name": it["product_name"],
            "prices": [],
            "markets": set(),
        })
        agg["prices"].append(float(it["price"]))
        agg["markets"].add(it.get("market") or "")
        if isinstance(it.get("date"), datetime):
            it["date"] = it["date"].isoformat()
    summaries = []
    for key, agg in by_product.items():
        prices = agg["prices"]
        summaries.append({
            "product_name": agg["product_name"],
            "min": min(prices),
            "avg": round(sum(prices) / len(prices), 2),
            "max": max(prices),
            "count": len(prices),
            "markets": [m for m in agg["markets"] if m][:5],
        })
    summaries.sort(key=lambda x: x["count"], reverse=True)
    # Recent feed (anonymized — no user info stored)
    feed = []
    for it in items[:50]:
        feed.append({
            "product_name": it["product_name"],
            "market": it.get("market"),
            "region": it.get("region"),
            "price": it["price"],
            "date": it.get("date"),
        })
    return {"summaries": summaries[:50], "feed": feed}

@api.post("/community/prices")
async def post_community_price(body: CommunityPriceIn, user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "product_name": body.product_name,
        "market": body.market,
        "region": body.region,
        "price": body.price,
        "date": now_utc(),
    }
    await db.community_prices.insert_one(doc)
    return {"ok": True}

# ---------------------------------------------------------------
# Family sharing (invite code)
# ---------------------------------------------------------------
@api.post("/family/invite")
async def family_invite(user: dict = Depends(get_current_user)):
    gid = user.get("family_group_id") or user["id"]
    code = secrets.token_urlsafe(5).upper().replace("_", "A").replace("-", "B")[:6]
    await db.family_invites.insert_one({
        "code": code,
        "group_id": gid,
        "owner_id": user["id"],
        "created_at": now_utc(),
    })
    if not user.get("family_group_id"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"family_group_id": gid}})
    return {"code": code, "group_id": gid}

@api.post("/family/join")
async def family_join(body: FamilyJoinIn, user: dict = Depends(get_current_user)):
    inv = await db.family_invites.find_one({"code": body.code.upper()})
    if not inv:
        raise HTTPException(404, "Código inválido")
    new_gid = inv["group_id"]
    old_gid = get_group_id(user)
    await db.users.update_one({"id": user["id"]}, {"$set": {"family_group_id": new_gid}})
    # Migrate the user's own products into the new group (optional simple merge)
    if old_gid != new_gid:
        await db.products.update_many({"group_id": old_gid}, {"$set": {"group_id": new_gid}})
        await db.shopping_list.update_many({"group_id": old_gid}, {"$set": {"group_id": new_gid}})
    return {"ok": True, "group_id": new_gid}

@api.get("/family/members")
async def family_members(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    members = await db.users.find({"$or": [{"id": gid}, {"family_group_id": gid}]}, {"_id": 0, "password_hash": 0}).to_list(50)
    for m in members:
        for k, v in list(m.items()):
            if isinstance(v, datetime):
                m[k] = v.isoformat()
    return {"group_id": gid, "members": members}


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

@api.post("/auth/change-password")
async def change_password(body: ChangePasswordIn, user: dict = Depends(get_current_user)):
    u = await db.users.find_one({"id": user["id"]})
    if not u or not verify_password(body.current_password, u["password_hash"]):
        raise HTTPException(400, "Senha atual incorreta")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api.get("/reports/summary")
async def reports_summary(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    total_products = await db.products.count_documents({"group_id": gid})
    total_purchases = await db.price_history.count_documents({"group_id": gid})
    pipeline = [{"$match": {"group_id": gid}}, {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$price", "$qty"]}}}}]
    result = await db.price_history.aggregate(pipeline).to_list(1)
    total_spent = result[0]["total"] if result else 0
    market_pipeline = [{"$match": {"group_id": gid}}, {"$group": {"_id": "$market", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 1}]
    top_market_result = await db.price_history.aggregate(market_pipeline).to_list(1)
    top_market = top_market_result[0]["_id"] if top_market_result else None
    product_pipeline = [{"$match": {"group_id": gid}}, {"$group": {"_id": "$product_name", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 1}]
    top_product_result = await db.price_history.aggregate(product_pipeline).to_list(1)
    top_product = top_product_result[0]["_id"] if top_product_result else None
    return {"total_products": total_products, "total_purchases": total_purchases, "total_spent": round(total_spent, 2), "top_market": top_market, "top_product": top_product}

class ForgotPasswordIn(BaseModel):
    email: str

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotPasswordIn):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        return {"ok": True, "message": "Se o e-mail existir, voce recebera as instrucoes"}
    token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({"token": token, "user_id": user["id"], "email": email, "created_at": now_utc(), "used": False})
    rk = os.environ.get("RESEND_API_KEY","")
    if rk:
        try:
            import resend; resend.api_key=rk.strip().replace(chr(10),"").replace(chr(13),"").strip(); resend.Emails.send({"from":"Feira da Casa <onboarding@resend.dev>","to":email,"subject":"Recuperacao de senha","html":f"<p>Seu codigo: <b>{token[:8].upper()}</b></p>"})
        except Exception as e:
            logger.error(f"Email: {e}")
    return {"ok": True, "message": "Se o e-mail existir, voce recebera as instrucoes"}

@api.post("/auth/reset-password")
async def reset_password(token: str, new_password: str):
    rec = await db.password_resets.find_one({"token": token, "used": False})
    if not rec:
        raise HTTPException(400, "Token invalido ou expirado")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(new_password)}})
    await db.password_resets.update_one({"token": token}, {"$set": {"used": True}})
    return {"ok": True}

@api.post("/family/leave")
async def family_leave(user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$set": {"family_group_id": None}})
    await seed_default_products(user["id"])
    return {"ok": True}
# ---------------------------------------------------------------
# Health
# ---------------------------------------------------------------
@api.get("/health")
async def health():
    return {"status": "ok", "time": now_utc().isoformat()}

# ---------------------------------------------------------------
# Startup
# ---------------------------------------------------------------
@app.on_event("startup")
async def on_start():
    await db.users.create_index("email", unique=True)
    await db.products.create_index("group_id")
    await db.shopping_list.create_index("group_id")
    await db.price_history.create_index([("group_id", 1), ("product_id", 1)])
    await db.community_prices.create_index("product_name")
    await db.family_invites.create_index("code", unique=True)
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@feiradacasa.com")
    admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        uid = str(uuid.uuid4())
        await db.users.insert_one({
            "id": uid,
            "email": admin_email,
            "name": "Admin",
            "password_hash": hash_password(admin_pw),
            "family_group_id": None,
            "created_at": now_utc(),
        })
        await seed_default_products(uid)

@app.on_event("shutdown")
async def on_shutdown():
    client.close()

app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
