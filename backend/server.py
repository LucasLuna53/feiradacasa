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
    groq_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not groq_key:
        raise HTTPException(500, "Scan indisponível: configure GROQ_API_KEY")

    # If PDF, convert first page to JPEG (vision needs image)
    image_b64 = body.image_base64
    mime = (body.mime_type or "image/jpeg").lower()
    if mime == "application/pdf":
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
            mime = "image/jpeg"
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Falha ao ler PDF: {e}")

    # Groq vision (llama-4-scout supports images)
    import httpx
    model = os.environ.get("GROQ_VISION_MODEL", "meta-llama/llama-4-scout-17b-16e-instruct")
    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": RECEIPT_PROMPT},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                ],
            }
        ],
        "temperature": 0.1,
        "max_tokens": 2048,
    }
    try:
        async with httpx.AsyncClient(timeout=90) as cx:
            r = await cx.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if r.status_code >= 400:
            logger.error("Groq vision %s: %s", r.status_code, r.text[:300])
            raise HTTPException(502, "Scan indisponível: configure GROQ_API_KEY")
        text = (r.json().get("choices") or [{}])[0].get("message", {}).get("content", "")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Groq vision error")
        raise HTTPException(502, "Scan indisponível: configure GROQ_API_KEY")

    text = (text or "").strip()
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
# Recipes via Groq (primary) with Emergent LLM fallback
# ---------------------------------------------------------------
def _parse_recipe_json(text: str) -> dict:
    text = (text or "").strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip().rstrip("`").strip()
    try:
        return json.loads(text)
    except Exception:
        s, e = text.find("{"), text.rfind("}")
        if s >= 0 and e > s:
            return json.loads(text[s:e+1])
        raise HTTPException(502, "Resposta da IA inválida")

async def _gen_recipes_groq(prompt: str) -> dict:
    import httpx
    key = os.environ.get("GROQ_API_KEY", "")
    if not key:
        raise HTTPException(500, "GROQ_API_KEY não configurada")
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
    async with httpx.AsyncClient(timeout=60) as cx:
        r = await cx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": "Você sugere receitas brasileiras práticas. Responda APENAS com JSON válido."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.7,
            },
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Groq erro {r.status_code}: {r.text[:200]}")
        return _parse_recipe_json(r.json()["choices"][0]["message"]["content"])

async def _gen_recipes_emergent(prompt: str, user_id: str) -> dict:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"recipes-{user_id}-{uuid.uuid4()}",
        system_message="Você sugere receitas brasileiras práticas em JSON.",
    ).with_model("openai", "gpt-4o")
    raw = await chat.send_message(UserMessage(text=prompt))
    return _parse_recipe_json(str(raw))

@api.post("/recipes/suggest")
async def suggest_recipes(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    products = await db.products.find(
        {"group_id": gid, "current_qty": {"$gt": 0}},
        {"_id": 0, "name": 1, "current_qty": 1, "unit": 1},
    ).to_list(500)
    pantry = [{"name": p["name"], "qty": p.get("current_qty", 0), "unit": p.get("unit", "un")} for p in products]
    if not pantry:
        return {"recipes": []}

    import hashlib
    pantry_hash = hashlib.md5(
        str(sorted([p["name"] + str(p["qty"]) for p in pantry])).encode()
    ).hexdigest()
    cached = await db.recipe_cache.find_one({"group_id": gid, "pantry_hash": pantry_hash})
    if cached and "recipes" in cached:
        return {"recipes": cached["recipes"]}

    prompt = (
        "Você é um chef brasileiro. Dada a lista de ingredientes disponíveis na despensa, "
        "sugira de 3 a 5 receitas práticas e tradicionais. Retorne APENAS JSON válido sem markdown, "
        "no formato: {\"recipes\": [{\"name\": string, \"description\": string (1 frase), "
        "\"time_minutes\": number, \"servings\": number, "
        "\"ingredients_used\": [string], \"ingredients_missing\": [string], "
        "\"steps\": [string]}]}. "
        f"Despensa: {json.dumps(pantry, ensure_ascii=False)}"
    )

    last_err: Optional[str] = None
    # Try Groq first (cheap, fast)
    if os.environ.get("GROQ_API_KEY"):
        try:
            data = await _gen_recipes_groq(prompt)
            await db.recipe_cache.update_one(
                {"group_id": gid, "pantry_hash": pantry_hash},
                {"$set": {"recipes": data.get("recipes", []), "created_at": now_utc()}},
                upsert=True,
            )
            return data
        except HTTPException as e:
            last_err = f"groq HTTP {e.status_code}: {e.detail}"
            logger.warning("Groq failed: %s", last_err)
        except Exception as e:
            last_err = f"groq: {e}"
            logger.warning("Groq error: %s", e)

    # Fallback to Emergent LLM
    if EMERGENT_LLM_KEY:
        try:
            from emergentintegrations.llm.chat import LlmChat  # noqa: F401
            data = await _gen_recipes_emergent(prompt, user["id"])
            await db.recipe_cache.update_one(
                {"group_id": gid, "pantry_hash": pantry_hash},
                {"$set": {"recipes": data.get("recipes", []), "created_at": now_utc()}},
                upsert=True,
            )
            return data
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(502, f"Falha ao gerar receitas. {last_err or ''} emergent: {e}")

    raise HTTPException(500, f"Nenhum provedor de IA configurado. {last_err or 'Defina GROQ_API_KEY ou EMERGENT_LLM_KEY.'}")

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
        # internal-only field for moderation; never returned in any feed/summary
        "_user_id": user["id"],
    }
    await db.community_prices.insert_one(doc)
    return {"ok": True}

# ---------------------------------------------------------------
# Best market for current shopping list
# ---------------------------------------------------------------
@api.get("/shopping-list/best-market")
async def best_market(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    # Items to buy: auto (low stock) + manual
    products = await db.products.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    auto_names = [p["name"] for p in products if int(p.get("current_qty", 0)) < int(p.get("min_qty", 1))]
    manual = await db.shopping_list.find({"group_id": gid}, {"_id": 0, "name": 1}).to_list(500)
    list_names = list({*auto_names, *[m["name"] for m in manual if m.get("name")]})
    if not list_names:
        return {"markets": [], "items_in_list": 0, "items_with_price": 0, "items_without_price": 0, "list_names": []}
    # Look at recent community prices for these products (last 60 days)
    cutoff = now_utc() - timedelta(days=60)
    cur = db.community_prices.find(
        {"product_name": {"$in": list_names}, "date": {"$gte": cutoff}},
        {"_id": 0, "_user_id": 0},
    ).sort("date", -1)
    rows = await cur.to_list(5000)
    # latest price per (market, product) pair
    latest_by_pair: dict = {}
    for r in rows:
        key = (r.get("market") or "", r["product_name"])
        if key not in latest_by_pair:
            latest_by_pair[key] = float(r["price"])
    # group by market
    market_map: dict = {}
    for (mkt, pname), price in latest_by_pair.items():
        if not mkt:
            continue
        agg = market_map.setdefault(mkt, {"market": mkt, "items": {}, "total": 0.0})
        agg["items"][pname] = price
        agg["total"] = round(sum(agg["items"].values()), 2)
    markets = sorted(
        ({"market": v["market"], "total": v["total"], "items_covered": len(v["items"]), "items": v["items"]}
         for v in market_map.values()),
        key=lambda x: (-(x["items_covered"]), x["total"]),
    )
    items_with_price = len({p for (_m, p) in latest_by_pair.keys()})
    return {
        "markets": markets[:20],
        "items_in_list": len(list_names),
        "items_with_price": items_with_price,
        "items_without_price": max(0, len(list_names) - items_with_price),
        "list_names": list_names,
    }

# ---------------------------------------------------------------
# Timeline of community prices for a product
# ---------------------------------------------------------------
@api.get("/community/timeline")
async def community_timeline(product_name: str, region: Optional[str] = None, days: int = 180):
    cutoff = now_utc() - timedelta(days=max(7, min(days, 730)))
    q: dict = {"product_name": {"$regex": f"^{product_name}$", "$options": "i"}, "date": {"$gte": cutoff}}
    if region:
        q["region"] = region
    rows = await db.community_prices.find(q, {"_id": 0, "_user_id": 0}).sort("date", 1).to_list(2000)
    timeline = []
    for r in rows:
        d = r.get("date")
        timeline.append({
            "date": d.isoformat() if isinstance(d, datetime) else d,
            "price": float(r["price"]),
            "market": r.get("market"),
            "region": r.get("region"),
        })
    return {"product_name": product_name, "timeline": timeline, "count": len(timeline)}

# ---------------------------------------------------------------
# Low-stock deals: items below min_qty AND with a recent community
# price that is below the historical average for the user's region
# ---------------------------------------------------------------
@api.get("/products/low-stock-deals")
async def low_stock_deals(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    user_doc = await db.users.find_one({"id": user["id"]}, {"_id": 0, "region": 1})
    region = (user_doc or {}).get("region")
    products = await db.products.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    low = [p for p in products if int(p.get("current_qty", 0)) < int(p.get("min_qty", 1))]
    if not low:
        return {"deals": []}
    cutoff = now_utc() - timedelta(days=30)
    deals = []
    for p in low:
        name = p["name"]
        # historical avg (any region, 6 months)
        hist_cutoff = now_utc() - timedelta(days=180)
        hist_rows = await db.community_prices.find(
            {"product_name": {"$regex": f"^{name}$", "$options": "i"}, "date": {"$gte": hist_cutoff}},
            {"_id": 0, "price": 1},
        ).to_list(2000)
        if not hist_rows:
            continue
        hist_prices = [float(r["price"]) for r in hist_rows]
        avg = sum(hist_prices) / len(hist_prices)
        # recent prices in user's region (or anywhere if no region)
        recent_q: dict = {
            "product_name": {"$regex": f"^{name}$", "$options": "i"},
            "date": {"$gte": cutoff},
        }
        if region:
            recent_q["region"] = region
        recent = await db.community_prices.find(recent_q, {"_id": 0, "_user_id": 0}).sort("date", -1).to_list(50)
        if not recent:
            continue
        best = min(recent, key=lambda r: float(r["price"]))
        best_price = float(best["price"])
        if best_price < avg:
            deals.append({
                "product_id": p["id"],
                "product_name": name,
                "emoji": p.get("emoji", "📦"),
                "current_qty": p.get("current_qty", 0),
                "min_qty": p.get("min_qty", 1),
                "best_price": round(best_price, 2),
                "avg_price": round(avg, 2),
                "savings_pct": round(100 * (avg - best_price) / avg, 0),
                "market": best.get("market"),
                "region": best.get("region"),
            })
    deals.sort(key=lambda d: -d["savings_pct"])
    return {"deals": deals}

# ---------------------------------------------------------------
# Shopping list templates
# ---------------------------------------------------------------
class ListTemplateIn(BaseModel):
    name: str
    items: List[dict]  # [{name, qty}]

@api.get("/list-templates")
async def list_templates(user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    tpls = await db.list_templates.find({"group_id": gid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    for t in tpls:
        for k, v in list(t.items()):
            if isinstance(v, datetime):
                t[k] = v.isoformat()
    return tpls

@api.post("/list-templates")
async def create_template(body: ListTemplateIn, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    doc = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "name": body.name.strip(),
        "items": [{"name": (i.get("name") or "").strip(), "qty": int(i.get("qty") or 1)} for i in body.items if i.get("name")],
        "created_at": now_utc(),
    }
    await db.list_templates.insert_one(doc)
    return serialize(doc)

@api.post("/list-templates/save-current")
async def save_current_as_template(body: dict, user: dict = Depends(get_current_user)):
    """Snapshot current shopping list (auto + manual) into a named template."""
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Nome do modelo é obrigatório")
    gid = get_group_id(user)
    products = await db.products.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    items = []
    for p in products:
        if int(p.get("current_qty", 0)) < int(p.get("min_qty", 1)):
            qty = int(p.get("min_qty", 1)) - int(p.get("current_qty", 0))
            items.append({"name": p["name"], "qty": qty})
    manual = await db.shopping_list.find({"group_id": gid}, {"_id": 0}).to_list(1000)
    for m in manual:
        items.append({"name": m.get("name", ""), "qty": int(m.get("qty", 1))})
    items = [i for i in items if i["name"]]
    if not items:
        raise HTTPException(400, "Lista de compras está vazia")
    doc = {
        "id": str(uuid.uuid4()),
        "group_id": gid,
        "name": name,
        "items": items,
        "created_at": now_utc(),
    }
    await db.list_templates.insert_one(doc)
    return serialize(doc)

@api.post("/list-templates/{tid}/apply")
async def apply_template(tid: str, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    tpl = await db.list_templates.find_one({"id": tid, "group_id": gid})
    if not tpl:
        raise HTTPException(404, "Modelo não encontrado")
    added = 0
    for it in tpl.get("items", []):
        if not it.get("name"):
            continue
        await db.shopping_list.insert_one({
            "id": str(uuid.uuid4()),
            "group_id": gid,
            "product_id": None,
            "name": it["name"],
            "qty": int(it.get("qty") or 1),
            "checked": False,
            "created_at": now_utc(),
        })
        added += 1
    return {"ok": True, "added": added}

@api.delete("/list-templates/{tid}")
async def delete_template(tid: str, user: dict = Depends(get_current_user)):
    gid = get_group_id(user)
    res = await db.list_templates.delete_one({"id": tid, "group_id": gid})
    if not res.deleted_count:
        raise HTTPException(404, "Modelo não encontrado")
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
        # Don't leak account existence — but also don't generate a code
        return {"ok": False, "message": "E-mail não encontrado"}
    token = secrets.token_urlsafe(32)
    code = token[:8].upper()
    await db.password_resets.insert_one({"token": token, "code": code, "user_id": user["id"], "email": email, "created_at": now_utc(), "used": False})
    return {"ok": True, "message": "Código gerado", "code": code}

@api.post("/auth/reset-password")
async def reset_password(token: str, new_password: str):
    # Accept either the full token OR the 8-char uppercase code
    code = token.strip().upper() if len(token.strip()) <= 12 else None
    rec = None
    if code:
        rec = await db.password_resets.find_one({"code": code, "used": False})
    if not rec:
        rec = await db.password_resets.find_one({"token": token, "used": False})
    if not rec:
        raise HTTPException(400, "Código inválido ou expirado")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(new_password)}})
    await db.password_resets.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
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
