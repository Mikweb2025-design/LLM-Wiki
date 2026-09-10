"""Login / verifica sessione per pagina /dok/."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from app.utils.auth import check_credentials, create_token, verify_token, TOKEN_TTL_SECONDS

router = APIRouter(prefix="/api/auth", tags=["auth"])

class LoginIn(BaseModel):
    username: str = ""
    password: str = ""

@router.post("/login")
async def login(body: LoginIn):
    if not check_credentials(body.username.strip(), body.password):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    from app.utils.auth import get_user
    token = create_token(get_user())
    return {"ok": True, "token": token, "expires_in": TOKEN_TTL_SECONDS, "username": get_user()}

@router.get("/me")
async def me(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    info = verify_token(token) if token else None
    if not info:
        raise HTTPException(status_code=401, detail="Non autenticato")
    return {"ok": True, **info}
