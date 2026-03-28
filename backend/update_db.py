import sqlite3

def update():
    conn = sqlite3.connect('librarian.db')
    try:
        conn.execute("ALTER TABLE chat_messages ADD COLUMN session_id VARCHAR NOT NULL DEFAULT 'default'")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)")
        conn.commit()
        print("Successfully updated database schema.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    update()
