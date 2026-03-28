import sys
import os

# 确保在导入时模块路径正确
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base, SessionLocal
from models import User, ChatMessage
from auth import get_password_hash

def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)

    print("Initializing admin user...")
    db = SessionLocal()
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        hashed = get_password_hash("admin123")
        new_admin = User(username="admin", hashed_password=hashed)
        db.add(new_admin)
        db.commit()
        print("Admin user created.")
    else:
        print("Admin user already exists.")
    db.close()
    print("Done.")

if __name__ == "__main__":
    init()
