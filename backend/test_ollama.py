import httpx
import json
import asyncio

async def test():
    print("=== Testing with think:false + large num_predict ===")
    async with httpx.AsyncClient(trust_env=False, timeout=60) as client:
        collected = ""
        token_count = 0
        try:
            async with client.stream(
                "POST",
                'http://127.0.0.1:11434/api/generate',
                json={
                    'model': 'qwen3.5:9b',
                    'prompt': '你好',
                    'system': '你是助手，直接简洁回答。',
                    'stream': True,
                    'think': False,
                    'options': {'num_predict': 200, 'num_ctx': 512}
                }
            ) as response:
                print(f"HTTP Status: {response.status_code}")
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if data.get("done"):
                        print(f"\n--- DONE ---")
                        print(f"Tokens: {token_count}, Text: '{collected}'")
                        print(f"Done reason: {data.get('done_reason')}")
                        print(f"Total time: {data.get('total_duration',0)/1e6:.0f}ms")
                        break
                    token = data.get("response", "")
                    if token:
                        token_count += 1
                        collected += token
                        print(token, end="", flush=True)
        except Exception as e:
            print(f"ERROR: {e}")

asyncio.run(test())
