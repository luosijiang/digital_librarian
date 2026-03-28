from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import timedelta
from typing import List
from pydantic import BaseModel
import json

import models
import database
import auth
import llm

app = FastAPI(title="Ultimate Digital Librarian")

@app.get("/")
def read_root():
    return {"status": "Librarian System Online", "version": "1.0.0"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    query: str
    session_id: str

class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: str
    content: str
    
    class Config:
        from_attributes = True

class SessionResponse(BaseModel):
    session_id: str
    title: str

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == form_data.username).first()
    if not user or not auth.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/sessions", response_model=List[SessionResponse])
async def get_sessions(current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    subq = db.query(
        models.ChatMessage.session_id,
        func.min(models.ChatMessage.created_at).label('first_msg_time')
    ).filter(models.ChatMessage.user_id == current_user.id).group_by(models.ChatMessage.session_id).subquery()
    
    first_messages = db.query(models.ChatMessage)\
        .join(subq, (models.ChatMessage.session_id == subq.c.session_id) & (models.ChatMessage.created_at == subq.c.first_msg_time))\
        .filter(models.ChatMessage.user_id == current_user.id, models.ChatMessage.role == 'user')\
        .order_by(models.ChatMessage.created_at.desc())\
        .all()
        
    sessions = []
    for msg in first_messages:
        title = msg.content[:20] + "..." if len(msg.content) > 20 else msg.content
        sessions.append(SessionResponse(session_id=msg.session_id, title=title))
        
    return sessions

@app.get("/history", response_model=List[ChatMessageResponse])
async def get_history(session_id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    messages = db.query(models.ChatMessage)\
        .filter(models.ChatMessage.user_id == current_user.id, models.ChatMessage.session_id == session_id)\
        .order_by(models.ChatMessage.created_at.asc())\
        .all()
    return messages

@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    deleted = db.query(models.ChatMessage)\
        .filter(models.ChatMessage.user_id == current_user.id, models.ChatMessage.session_id == session_id)\
        .delete()
    db.commit()
    if deleted == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"status": "deleted", "session_id": session_id}

def save_assistant_message(user_id: int, session_id: str, content: str):
    new_db = database.SessionLocal()
    try:
        assistant_msg = models.ChatMessage(user_id=user_id, session_id=session_id, role="assistant", content=content)
        new_db.add(assistant_msg)
        new_db.commit()
    finally:
        new_db.close()

@app.post("/chat")
async def chat_endpoint(request: ChatRequest, current_user: models.User = Depends(auth.get_current_user), db: Session = Depends(database.get_db)):
    session_id = request.session_id
    
    # 1. 只取最近的4条历史（2轮对话），减少数据库和context压力
    recent_messages = db.query(models.ChatMessage)\
        .filter(models.ChatMessage.user_id == current_user.id, models.ChatMessage.session_id == session_id)\
        .order_by(models.ChatMessage.created_at.desc())\
        .limit(4)\
        .all()
    recent_messages.reverse()
    
    # 2. 落库用户消息
    user_msg = models.ChatMessage(user_id=current_user.id, session_id=session_id, role="user", content=request.query)
    db.add(user_msg)
    db.commit()
    
    # 3. 单次直接流式生成（零切换开销）
    async def generate_stream():
        full_response = ""
        async for chunk in llm.final_generation_stream(recent_messages, request.query):
            full_response += chunk
            yield json.dumps({"chunk": chunk}, ensure_ascii=False) + "\n"
        
        # 落库助手回复（后台异步）
        save_assistant_message(current_user.id, session_id, full_response)
        
    return StreamingResponse(generate_stream(), media_type="application/x-ndjson")

