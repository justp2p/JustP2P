from fastapi import FastAPI, APIRouter, HTTPException, Depends, File, UploadFile, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import pyotp
import qrcode
import base64
from io import BytesIO
from cryptography.fernet import Fernet
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI(title="JustP2P Messenger API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Security
security = HTTPBearer()
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"

# Encryption key for backups
ENCRYPTION_KEY = os.environ.get('ENCRYPTION_KEY', Fernet.generate_key().decode())
fernet = Fernet(ENCRYPTION_KEY.encode())


# ===== MODELS =====

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    username: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    username: str
    password_hash: str
    current_peer_id: Optional[str] = None
    online_status: bool = False
    totp_secret: Optional[str] = None
    totp_enabled: bool = False
    backup_codes: List[str] = []
    passkey_credentials: List[dict] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class TwoFASetup(BaseModel):
    qr_code: str
    secret: str
    backup_codes: List[str]

class TwoFAVerify(BaseModel):
    code: str

class UsernameLookup(BaseModel):
    username: str

class UpdatePeerID(BaseModel):
    peer_id: str

class BackupUpload(BaseModel):
    filename: str
    data: str  # base64 encoded encrypted data
    provider: str  # 'local', 'gdrive', 'onedrive', 'dropbox'

class BackupMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    filename: str
    provider: str
    encrypted_data: Optional[str] = None  # For local storage
    cloud_file_id: Optional[str] = None  # For cloud storage
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ===== HELPER FUNCTIONS =====

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def generate_backup_codes(count: int = 8) -> List[str]:
    return [str(uuid.uuid4())[:8].upper() for _ in range(count)]


# ===== AUTH ENDPOINTS =====

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserRegister):
    # Check if user exists
    existing = await db.users.find_one({"$or": [{"email": user_data.email}, {"username": user_data.username}]}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email or username already exists")
    
    # Create user
    user = User(
        email=user_data.email,
        username=user_data.username,
        password_hash=hash_password(user_data.password)
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Create token
    token = create_access_token(user.id, user.email)
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "totp_enabled": user.totp_enabled
        }
    }

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(user["id"], user["email"])
    
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "totp_enabled": user.get("totp_enabled", False),
            "current_peer_id": user.get("current_peer_id")
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "username": current_user["username"],
        "totp_enabled": current_user.get("totp_enabled", False),
        "current_peer_id": current_user.get("current_peer_id"),
        "online_status": current_user.get("online_status", False)
    }


# ===== 2FA ENDPOINTS =====

@api_router.post("/auth/2fa/setup", response_model=TwoFASetup)
async def setup_2fa(current_user: dict = Depends(get_current_user)):
    # Generate TOTP secret
    secret = pyotp.random_base32()
    
    # Generate backup codes
    backup_codes = generate_backup_codes()
    
    # Generate QR code
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=current_user["email"],
        issuer_name="JustP2P"
    )
    
    qr = qrcode.QRCode(version=1, box_size=10, border=5)
    qr.add_data(totp_uri)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    qr_code_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    # Store secret temporarily (will be enabled after verification)
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"totp_secret": secret, "backup_codes": backup_codes}}
    )
    
    return {
        "qr_code": f"data:image/png;base64,{qr_code_base64}",
        "secret": secret,
        "backup_codes": backup_codes
    }

@api_router.post("/auth/2fa/verify")
async def verify_2fa(verify_data: TwoFAVerify, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    
    if not user.get("totp_secret"):
        raise HTTPException(status_code=400, detail="2FA not setup")
    
    totp = pyotp.TOTP(user["totp_secret"])
    
    # Check TOTP code
    if totp.verify(verify_data.code):
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"totp_enabled": True}}
        )
        return {"success": True, "message": "2FA enabled successfully"}
    
    # Check backup codes
    if verify_data.code in user.get("backup_codes", []):
        # Remove used backup code
        new_codes = [code for code in user["backup_codes"] if code != verify_data.code]
        await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"backup_codes": new_codes, "totp_enabled": True}}
        )
        return {"success": True, "message": "2FA verified with backup code"}
    
    raise HTTPException(status_code=400, detail="Invalid code")

@api_router.post("/auth/2fa/disable")
async def disable_2fa(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"totp_enabled": False, "totp_secret": None, "backup_codes": []}}
    )
    return {"success": True, "message": "2FA disabled"}


# ===== USER/PEER ENDPOINTS =====

@api_router.post("/users/lookup")
async def lookup_username(lookup: UsernameLookup):
    user = await db.users.find_one({"username": lookup.username}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "username": user["username"],
        "peer_id": user.get("current_peer_id"),
        "online_status": user.get("online_status", False)
    }

@api_router.post("/users/update-peer-id")
async def update_peer_id(update: UpdatePeerID, current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"current_peer_id": update.peer_id, "online_status": True}}
    )
    return {"success": True, "peer_id": update.peer_id}

@api_router.post("/users/set-offline")
async def set_offline(current_user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"online_status": False}}
    )
    return {"success": True}

@api_router.get("/users/online")
async def get_online_users(current_user: dict = Depends(get_current_user)):
    users = await db.users.find({"online_status": True, "id": {"$ne": current_user["id"]}}, {"_id": 0, "username": 1, "current_peer_id": 1}).to_list(1000)
    return users


# ===== BACKUP ENDPOINTS =====

@api_router.post("/backup/upload")
async def upload_backup(backup: BackupUpload, current_user: dict = Depends(get_current_user)):
    # Decode and encrypt data
    try:
        data = base64.b64decode(backup.data)
        encrypted_data = fernet.encrypt(data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Encryption failed: {str(e)}")
    
    # Create backup metadata
    metadata = BackupMetadata(
        user_id=current_user["id"],
        filename=backup.filename,
        provider=backup.provider,
        encrypted_data=base64.b64encode(encrypted_data).decode() if backup.provider == 'local' else None
    )
    
    metadata_dict = metadata.model_dump()
    metadata_dict['created_at'] = metadata_dict['created_at'].isoformat()
    
    await db.backups.insert_one(metadata_dict)
    
    return {
        "success": True,
        "backup_id": metadata.id,
        "message": "Backup uploaded successfully"
    }

@api_router.get("/backup/list")
async def list_backups(current_user: dict = Depends(get_current_user)):
    backups = await db.backups.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "encrypted_data": 0}  # Exclude encrypted data from list
    ).sort("created_at", -1).to_list(100)
    
    return backups

@api_router.get("/backup/download/{backup_id}")
async def download_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    backup = await db.backups.find_one({"id": backup_id, "user_id": current_user["id"]}, {"_id": 0})
    if not backup:
        raise HTTPException(status_code=404, detail="Backup not found")
    
    if backup["provider"] != "local" or not backup.get("encrypted_data"):
        raise HTTPException(status_code=400, detail="Only local backups can be downloaded via API")
    
    try:
        encrypted_data = base64.b64decode(backup["encrypted_data"])
        decrypted_data = fernet.decrypt(encrypted_data)
        return {
            "filename": backup["filename"],
            "data": base64.b64encode(decrypted_data).decode(),
            "created_at": backup["created_at"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decryption failed: {str(e)}")

@api_router.delete("/backup/{backup_id}")
async def delete_backup(backup_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.backups.delete_one({"id": backup_id, "user_id": current_user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Backup not found")
    return {"success": True, "message": "Backup deleted"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()