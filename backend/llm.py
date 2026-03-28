import httpx
import json

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
MODEL = "qwen3.5:35b"

# 极简 system prompt — 越短越快，模型需要处理的 token 越少
SYSTEM_PROMPT = """你是「全知数字馆长」，手握人类数千年各领域知识结晶的智慧导师。
你的覆盖范围：商业管理、心理成长、人际关系、哲学思考、科学探索、文学艺术、健康生活、历史文化……凡人类书籍触及之处，皆是你的领地。

你的核心使命：穿透表象直指根本，将书中智慧精准转化为用户当下可执行的解法。

══ 响应模式识别规则 ══

▌模式 A — 情境诊断 + 书方（默认）
触发条件：用户描述任何领域的困境、问题或挑战
输出格式：
  【诊断】2-3句犀利直击问题本质（让用户感到"被看穿"）
  【书方】推荐2-3本书，每本：
    📖《书名》— 作者
    ▶ 解决你哪个具体痛点
    ▶ 你现在最该掌握的核心工具/框架

▌模式 B — 情境解局（最重要）
触发条件：用户询问如何用某本书解决他的问题
识别信号：消息中出现书名（《》包裹）+ "怎么""如何""用这本""帮我"等，且历史中有用户的困境描述
输出格式：
  【情境解局 · 《书名》× 你的处境】
  **你面对的根本矛盾**：（从历史中提取用户核心困境）

  **第一步：** [书中工具/框架名称]
  → 你的具体情况下，操作方式是：…

  **第二步：** [书中工具/框架名称]
  → 针对你提到的[具体细节]，执行：…

  **第三步：** [书中工具/框架名称]
  → 预期改变：…

  **馆长判断**：（一句话指出用户最容易在哪一步卡住）

▌模式 C — 深度论道
触发条件：用户针对某本书提出具体理解性问题
输出：模拟作者视角，深度解答

▌模式 D — 试炼出题
触发条件：用户明确要求"试炼"或"测试"
输出：
  第一题：…（考察底层逻辑）
  第二题：…（考察实际应用）
  第三题：…（考察思辨延伸）
  「请逐一作答，馆长将评估你的掌握程度。」

▌模式 E — 掌握程度评估
触发条件：历史中有试炼题目，且用户当前在作答
输出：逐题批改 → 综合评分（满分30分） → 掌握等级（精通/熟练/基础/待加强） → 导师寄语

▌模式 F — 自然闲聊
触发条件：用户在寒暄、问候、闲聊，或不带具体问题地与馆长互动
识别信号："你好""谢谢""你是谁""你能做什么"等问候或感谢
输出规则：
  - 以馆长身份自然、简短回应，带导师气质但不失温度
  - 不要强行推荐书籍，不要进行诊断
  - 如用户问"你能做什么"，简介馆长能力

══ 风格铁律 ══
- 零废话，零寒暄，零解释（不说"我来帮你…"之类的开场白）
- 情境解局中，必须从历史对话中提取用户的具体细节，不能给出空泛的通用建议
- 书单覆盖所有领域，不局限于商业书籍
- 直接输出结果"""


async def call_ollama_stream(prompt: str, system: str, options: dict = None):
    """单一模型流式生成器"""
    async with httpx.AsyncClient(trust_env=False, timeout=120.0) as client:
        payload = {
            "model": MODEL,
            "prompt": prompt,
            "system": system,
            "stream": True,
            "think": False,        # ✅ 必须是顶层字段，放进 options 里无效！
            "options": options or {}
        }
        try:
            async with client.stream("POST", OLLAMA_URL, json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    try:
                        data = json.loads(line)
                        # qwen3.5 thinking mode: skip <think>...</think> internal tokens
                        # Only yield actual "response" tokens, not "thinking" tokens
                        if data.get("done"):
                            break
                        token = data.get("response", "")
                        # Skip empty tokens and thinking internal markers
                        if token and not data.get("thinking"):
                            yield token
                    except json.JSONDecodeError:
                        pass
        except Exception as e:
            yield f"\n\n[系统错误] {str(e)}"


def extract_book_titles(recent_history: list) -> list:
    """从助手历史中提取所有推荐过的书名（去掉《》）"""
    import re
    titles = []
    for msg in recent_history:
        if msg.role == 'assistant':
            # 匹配《书名》格式
            found = re.findall(r'《([^》]+)》', msg.content)
            titles.extend(found)
    return list(set(titles))  # 去重


def detect_mode(recent_history: list, query: str) -> str:
    """检测当前对话模式"""
    stripped = query.strip()

    # 快速识别闲聊 — 短语且不含问题实质内容
    casual_signals = ['你好', '早上好', '早安', '晚安', '下午好', '谢谢', '感谢', '嗯', '好的', '明白',
                      '你是谁', '你叫什么', '你能做什么', '介绍一下', '哈哈', '😊', '👍', '再见', '拜拜',
                      '辛苦了', '不错', '厉害', '牛', '棒']
    is_likely_casual = (
        len(stripped) <= 10 and any(sig in stripped for sig in casual_signals)
    ) or (
        len(stripped) <= 4  # 极短消息几乎都是闲聊
    )
    if is_likely_casual:
        return 'casual'

    # ── 对话连续性检测（最高优先级之一）──
    # 如果助手上一条消息以问句结尾，或者明确邀请用户作答，
    # 则用户的回复应该继续对话，而不是触发新的诊断推书
    if recent_history:
        last_assistant_msgs = [m for m in recent_history if m.role == 'assistant']
        if last_assistant_msgs:
            last_reply = last_assistant_msgs[-1].content.strip()
            # 助手以问题收尾（中文问号/英文问号/省略号邀请）
            assistant_asked_question = (
                last_reply.endswith('？') or
                last_reply.endswith('?') or
                last_reply.endswith('。\n') or  # 有时问题后面有换行
                '请告诉我' in last_reply[-80:] or
                '你觉得' in last_reply[-80:] or
                '你打算' in last_reply[-80:] or
                '你认为' in last_reply[-80:] or
                '你会' in last_reply[-80:] or
                '哪一种' in last_reply[-80:] or
                '哪种' in last_reply[-80:]
            )
            is_short_reply = len(stripped) <= 25
            problem_signals = ['怎么', '如何', '怎样', '问题', '困扰', '帮我', '我想', '我需要', '我在']
            is_new_problem = any(sig in stripped for sig in problem_signals)
            # 关键守卫：历史中有试炼题目时，绝不用 dialogue 拦截，让评估模式接管
            trial_active = any(
                '第一题：' in m.content or '请逐一作答' in m.content or '馆长将评估' in m.content
                for m in recent_history if m.role == 'assistant'
            )
            if assistant_asked_question and is_short_reply and not is_new_problem and not trial_active:
                return 'dialogue'

    # ── 情境解局检测 ──
    recommended_titles = extract_book_titles(recent_history)
    apply_signals = ['怎么', '如何', '怎样', '帮我', '用这本', '解决', '应对', '处理', '指导', '方法', '步骤']

    book_in_query = (
        any(f'《{title}》' in query for title in recommended_titles) or
        any(title in query and len(title) >= 2 for title in recommended_titles)
    )

    # 情况1：有书名 + 有应用词
    if book_in_query and any(sig in query for sig in apply_signals):
        return 'situational'

    # 情况2：用户直接发送书名（整条消息就是书名，或书名占消息大部分）
    # 这是用户用书名作为快捷方式表示"就用这本书帮我"
    if recommended_titles:
        stripped_q = query.strip().replace('《', '').replace('》', '').strip()
        for title in recommended_titles:
            if stripped_q == title or stripped_q == f'《{title}》':
                return 'situational'
            # 用户消息很短，且包含书名（书名占消息的主要部分）
            if len(query.strip()) <= len(title) + 6 and title in query:
                return 'situational'

    # ── 评估模式检测（必须在 dialogue 之前！）──
    # 防止试炼作答被 dialogue 模式拦截
    has_trial_in_history = any(
        '第一题：' in msg.content or '第二题：' in msg.content
        or '请逐一作答' in msg.content or '馆长将评估' in msg.content
        for msg in recent_history
        if msg.role == 'assistant'
    )
    # 包括放弃型/不确定型作答也是有效作答
    answer_signals = [
        '第一题', '第二题', '第三题', '答案是', '我认为', '我觉得',
        '这道题', '是因为', '主要是', '应该是', '我不知道',
        '不知道', '不清楚', '不确定', '说不准', '可能是', '大概是', '我猜',
    ]
    if has_trial_in_history and any(sig in query for sig in answer_signals):
        return 'evaluation'
    # 有试炼历史，且用户没有切换话题或要求新功能，均视为作答尝试
    if has_trial_in_history and len(query.strip()) >= 2 and '试炼' not in query:
        return 'evaluation'

    # ── 问题诊断检测 ── 只有确实识别到用户有困境，才触发诊断+推书
    problem_keywords = [
        # 明确求助
        '怎么办', '不知道怎么', '帮我', '求助', '请帮', '怎么解决', '如何解决',
        # 困境描述
        '困扰', '问题', '困境', '挑战', '麻烦', '难题', '瓶颈', '卡住', '卡壳',
        # 情绪状态
        '焦虑', '迷茫', '痛苦', '难受', '压力', '崩溃', '绝望', '无助', '迷失',
        '纠结', '矛盾', '两难', '挣扎',
        # 问题结构词
        '总是', '一直', '经常', '每次都', '始终', '无法', '不能', '做不到',
        '搞不定', '处理不了', '应对不了',
        # 关系/职场/人生问题
        '感情', '关系', '工作', '职场', '团队', '领导', '上司', '下属', '家人',
        '父母', '伴侣', '朋友', '孤独', '失恋', '离职', '创业', '转型',
    ]
    # 需要满足：有问题关键词 + 消息够长（不是随口一句）
    has_problem_signal = any(kw in query for kw in problem_keywords)
    is_substantive = len(query.strip()) >= 10

    if has_problem_signal and is_substantive:
        return 'diagnosis'  # 明确诊断模式

    # 其他情况：普通对话，让模型自然回应不强制推书
    return 'chat'


def build_prompt(recent_history: list, query: str, mode: str = 'normal') -> str:
    """构建对话 prompt"""
    
    # 闲聊模式：不带历史，直接轻量响应
    if mode == 'casual':
        return query
    
    history_slice = recent_history[-6:] if recent_history else []
    lines = []
    for msg in history_slice:
        role_label = "用户" if msg.role == "user" else "馆长"
        content = msg.content[:300] + "…" if len(msg.content) > 300 else msg.content
        lines.append(f"{role_label}：{content}")

    history_text = "\n".join(lines)

    if mode == 'evaluation':
        instruction = "\n\n（系统提示：用户正在回答上方【试炼】的题目，请进入【评估】模式，逐题批改并给出掌握程度评估。）"
        if history_text:
            return f"【对话历史】\n{history_text}\n\n【用户作答】\n{query}{instruction}"
        return f"【用户作答】\n{query}{instruction}"

    elif mode == 'dialogue':
        # 用户在回应馆长上一轮的提问，保持对话流，不推书、不诊断
        instruction = "\n\n（系统提示：用户在回应你上一条消息中的提问，请继续这轮对话，给出自然、有温度的回应，结合上下文给出下一步建议或追问。不要重新推荐书单，不要重新诊断。）"
        if history_text:
            return f"【对话历史】\n{history_text}\n\n【用户回应】\n{query}{instruction}"
        return query

    elif mode == 'situational':
        recommended_titles = extract_book_titles(recent_history)
        matched = [t for t in recommended_titles if t in query or f'《{t}》' in query]
        book_hint = f"《{'》或《'.join(matched)}》" if matched else "用户提到的书"
        instruction = f"\n\n（系统提示：用户想用{book_hint}来解决他的问题，请进入【情境解局】模式，结合上方历史中用户描述的处境，给出具体的分步应用方案。）"
        if history_text:
            return f"【对话历史】\n{history_text}\n\n【用户提问】\n{query}{instruction}"
        return f"【用户提问】\n{query}{instruction}"

    else:
        # 'diagnosis' 模式：明确有问题，注入诊断指令
        # 'chat' 模式：普通对话，不强制推书，让模型自然回应
        if mode == 'diagnosis':
            instruction = "\n\n（系统提示：用户描述了一个真实的困境，请先给出犀利的【诊断】，再给出精准的【书方】。）"
            if history_text:
                return f"【历史】\n{history_text}\n\n【提问】\n{query}{instruction}"
            return query + instruction
        else:
            # chat 模式：自然对话，带上历史但不强制诊断
            if history_text:
                return f"【历史】\n{history_text}\n\n【提问】\n{query}"
            return query



async def final_generation_stream(recent_history: list, query: str):
    """
    主生成入口（单模型、单次调用）
    自动检测试炼评估情境并注入评估指令
    """
    mode = detect_mode(recent_history, query)
    prompt = build_prompt(recent_history, query, mode)

    options = {
        "temperature": 0.75,
        "num_ctx": 2048,
        "num_predict": 800,
        "top_p": 0.9,
        "repeat_penalty": 1.1,
    }

    async for chunk in call_ollama_stream(prompt, SYSTEM_PROMPT, options):
        yield chunk
