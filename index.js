// dsh-hover-ai — hover over any text in the DeepSeek Harness web surface and a
// popup appears near the cursor with a random "AI knowledge point".
//
// Host half:
//   1. preloads: generates a batch of AI knowledge points via the `llm` service
//      as soon as the plugin mounts (boot time), and keeps refilling the pool in
//      the background — so the popup appears instantly, no per-hover latency;
//   2. serves the pool over /hover-ai/next (GET) and /hover-ai/status;
//   3. seeds the pool with a few built-in items so the very first hovers work
//      even before the first generation finishes.

export const name = 'dsh-hover-ai'
export const inject = ['llm', 'webServer', 'timer']

const SEED = [
  { t: '大语言模型 (LLM)', d: '在数十万亿 token 的文本上训练、通过"预测下一个词"学会语言的深度神经网络。ChatGPT、DeepSeek、Claude 都是它的应用形态。' },
  { t: 'Token', d: '模型处理文本的最小单位：一个汉字约 1~2 个 token，一个英文单词约 1~3 个。模型的上下文窗口和 API 计费都按 token 计算。' },
  { t: '提示词工程', d: '通过设计"角色 + 任务 + 要求 + 示例"的指令结构来提升 AI 回答质量的技术，是当下使用大模型最实用的技能之一。' },
  { t: 'RAG（检索增强生成）', d: '先从知识库检索相关内容，再让模型基于这些材料作答，能大幅减少"一本正经地胡说八道"（幻觉），是企业落地大模型的主流方案。' },
]

const PROMPT = '你是 AI 知识卡片生成器。生成 8 条面向普通用户的"AI 知识点"，主题覆盖：大语言模型原理与概念、提示词技巧、AI 工具使用、AI 历史与人物、AIGC、AI 伦理与趋势等，风格轻松有趣。\n只输出一个 JSON 数组（不要 markdown 代码块、不要多余文字），每项格式：{"t":"知识点标题（不超过14字）","d":"讲解（两到三句话，不超过100字）"}'

function parseItems(text) {
  const clean = String(text || '').trim()
  if (!clean) return []
  let data = null
  try { data = JSON.parse(clean) } catch { /* not bare JSON */ }
  if (!Array.isArray(data)) {
    const m = /\[\s*\{[\s\S]*\}\s*\]/.exec(clean)
    if (m) { try { data = JSON.parse(m[0]) } catch { /* keep null */ } }
  }
  const out = []
  if (Array.isArray(data)) {
    for (const raw of data) {
      if (!raw || typeof raw !== 'object') continue
      const t = String(raw.t || raw.title || raw.topic || '').trim()
      const d = String(raw.d || raw.desc || raw.text || raw.content || '').trim()
      if (t && d) out.push({ t: t.slice(0, 40), d: d.slice(0, 220) })
    }
    return out
  }
  for (const line of clean.split(/\n+/)) {
    const seg = line.split(/[：:|-]/)
    if (seg.length >= 2) {
      const t = seg[0].replace(/^[\d.\s、*#>]+/, '').trim()
      const d = seg.slice(1).join(' ').trim()
      if (t && d) out.push({ t: t.slice(0, 40), d: d.slice(0, 220) })
    }
  }
  return out
}

export function apply(ctx) {
  const pool = []
  let generating = false
  let lastAttempt = 0
  let counter = 0
  const waiters = new Set()

  for (const item of SEED) pool.push({ t: item.t, d: item.d })

  const notifyReady = (ok) => {
    for (const w of [...waiters]) { waiters.delete(w); w(ok) }
  }

  const pushItems = (items) => {
    if (!items || items.length === 0) return
    for (const it of items) pool.push({ t: it.t, d: it.d })
    notifyReady(true)
  }

  const resolveRoute = () => {
    let provider = ''
    let model = ''
    const modelSvc = ctx.get('agentDefaultModel')
    if (modelSvc) {
      try {
        const sel = modelSvc.currentSelection()
        if (sel && typeof sel.provider === 'string' && typeof sel.model === 'string') {
          provider = sel.provider
          model = sel.model
        }
      } catch { /* fall through */ }
    }
    return { provider, model }
  }

  const generate = async () => {
    if (generating) return
    generating = true
    lastAttempt = Date.now()
    try {
      let { provider, model } = resolveRoute()
      if (!provider) {
        const providers = ctx.llm.listProviders()
        if (!providers || providers.length === 0) throw new Error('没有已注册的模型提供商')
        provider = providers[0].id
        const models = await ctx.llm.listModels(provider)
        if (!models || models.length === 0) throw new Error('该提供商没有可用模型')
        model = models[0].id
      }
      const messages = [{
        id: 'hover-ai-' + (++counter),
        role: 'user',
        content: [{ type: 'text', text: '来一批新的 AI 知识点' }],
        source: { kind: 'user' },
      }]
      let out = ''
      for await (const chunk of ctx.llm.stream({
        provider,
        model,
        messages,
        system: PROMPT,
        temperature: 0.7,
      })) {
        if (chunk.type === 'text-delta') out += chunk.text
        else if (chunk.type === 'finish') break
        if (out.length > 12000) break
      }
      const items = parseItems(out)
      if (items.length === 0) throw new Error('模型没有返回有效的知识点')
      pushItems(items)
      ctx.logger?.info?.(`[dsh-hover-ai] generated ${items.length} knowledge points (pool=${pool.length})`)
    } catch (err) {
      ctx.logger?.warn?.(`[dsh-hover-ai] generation failed: ${err?.message ?? err}`)
      notifyReady(false)
    } finally {
      generating = false
    }
  }

  const ensurePool = () => {
    if (generating) return
    if (pool.length >= 3) return
    if (Date.now() - lastAttempt < 30000) return
    generate()
  }

  const waitForReady = (timeoutMs) => new Promise((resolve) => {
    let timer = null
    const w = (ok) => {
      if (timer) { try { timer() } catch { /* disposed */ } }
      waiters.delete(w)
      resolve(ok)
    }
    waiters.add(w)
    timer = ctx.setTimeout(() => w(false), timeoutMs)
  })

  const next = async () => {
    ensurePool()
    if (pool.length > 0) {
      const item = pool.shift()
      ensurePool()
      return { ok: true, t: item.t, d: item.d, left: pool.length }
    }
    const ok = await waitForReady(30000)
    if (ok && pool.length > 0) {
      const item = pool.shift()
      ensurePool()
      return { ok: true, t: item.t, d: item.d, left: pool.length }
    }
    return { ok: false, error: 'AI 知识点正在生成中，请稍后再试' }
  }

  ctx.webServer.register({
    kind: 'prefix',
    path: '/hover-ai',
    handler: async (req, res) => {
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)
      const json = (payload) => {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(payload))
      }
      if (pathname === '/hover-ai/next') { json(await next()); return }
      if (pathname === '/hover-ai/status') { json({ ok: true, pool: pool.length, generating }); return }
      res.writeHead(404)
      res.end()
    },
  })

  // Preload: generate the first batch as soon as the plugin mounts.
  generate()
}
