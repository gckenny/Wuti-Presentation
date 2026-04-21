# Building Wuti-Presentation: A Field Report

## I Am Not Currently Speaking

**Building Wuti-Presentation**

A field report from someone tired of opening Google Slides

Kenny · Frontend Sharing · 2026-04-21

### Speaker Notes

大家好，我是 Kenny。今天這場分享，從頭到尾你們都不會看到我打開 Google Slides、PowerPoint，或任何一個簡報工具的分頁。因為我自己做了一個，叫 Wuti-Presentation。更荒謬的是，現在正在講話的不是我本人，是 Azure 的 TTS；我本人正站在旁邊喝水。所以等一下如果我講錯字，責任在微軟，不在我。今天想分享的，就是怎麼把「一份 markdown 筆記」變成「會自己講話的簡報」，以及路上踩過的坑。

---

## The Real Problem — It's Not About Slides

Every sharing session, the same ritual:

- Open slide tool
- Fight with text alignment for 40 minutes
- Realize the content is only 20 minutes of work
- Panic rehearse at 2am

**The slide tool is not the bottleneck. The rehearsal is.**

### Speaker Notes

先講動機。老實說，我不是因為討厭 Google Slides 才做這個工具，Google Slides 對齊其實做得很好。真正的問題是：每次做分享，流程都一樣。打開工具、對齊文字對半小時、發現內容其實只有二十分鐘、然後凌晨兩點在客廳對著貓練稿。貓完全不在乎我要講什麼。所以我想，如果可以把「講稿」跟「投影片」都寫在同一份 markdown 裡，再讓機器替我唸出來、排出來，那我就只要專心寫內容就好。Wuti-Presentation 要解決的，就是凌晨兩點對著貓練稿的那個人，也就是我。

---

## What is Wuti-Presentation? — Markdown In, Presentation Out

```
your-notes.md  →  [Wuti-Presentation]  →  A presentation that plays itself
```

**Input:** one markdown file with `## slide title` and `### Speaker Notes`

**Output:** reveal.js deck + per-slide MP3 + an auto-advancing player

That's it. No templates. No "AI-generated design". Just your notes.

### Speaker Notes

Wuti-Presentation 的 input output 很單純。你丟一份 markdown 給它，每個 `##` 是一頁投影片，`### Speaker Notes` 底下是那一頁的講稿。丟進去，它吐出一組 reveal.js 投影片，每一頁配一個 mp3，然後自己一頁一頁播。沒有版型選單，也沒有「AI 幫你生成設計」那種東西。因為我的信念是：如果你的內容不夠好，華麗的版型只會讓人更清楚看到你的內容不夠好。Wuti 念起來像「五體」，所以工具叫 Wuti-Presentation 也算是某種五體投地的分享。

---

## Credit Where It's Due — The Sermon I Heard Last Week

Last week, a senior frontend engineer on this team gave a talk on **Web Components**.

My five stages that evening:

1. *Denial* — "Custom elements? Nobody uses that."
2. *Anger* — "Why was I not told this earlier."
3. *Bargaining* — "Maybe just one component..."
4. *Depression* — "I've shipped so much unnecessary React."
5. *Acceptance* — Rewrote this project in Lit the next morning.

**Everything you're about to see is homework from that talk.**

### Speaker Notes

這一頁要鄭重聲明一件事。上週那場前端大大的 Web Components 分享，對我來說真的是醍醐灌頂。我當晚完整走過標準的哀傷五階段：第一階段否認，「custom element 誰在用啦」；第二階段憤怒，「為什麼沒有人早點告訴我」；第三階段討價還價，「那我只寫一個元件試試看就好」；第四階段沮喪，「天啊我過去這幾年到底送出去多少不必要的 React bundle」；最後第五階段接受，隔天早上我就把這個專案整個砍掉，用 Lit 重寫。所以你今天看到的 Wuti-Presentation，從 `wuti-app`、`wuti-uploader`、`wuti-player`、到 `wuti-editor`，全部都是 custom element，全部都是上週那場分享的課後作業。如果你今天覺得這個工具做得不錯，真正的功勞要歸給上週那位大大。如果你覺得很難用，那是我作業沒寫好，跟講師無關。

---

## The Stack — Boring on Purpose

| Layer | Choice | Why |
|---|---|---|
| UI | Lit + Tailwind | Web components, no React tax |
| Bundler | Vite | Fast, opinionated, done |
| Server | Express 5 + tsx | 200 lines, zero magic |
| Slides | reveal.js | Solved problem, don't reinvent |
| TTS | Azure Neural Voices | Actually sounds human-ish |
| Fallback | Gemini | When my regex gives up |

**No Next.js. No state library. No ORM.**

### Speaker Notes

技術選型這頁重點只有一個：這份 stack 最值得驕傲的地方，就是它很無聊。前端用 Lit，不是因為 Lit 最潮，而是因為我想做的只是「一個頁面 + 三個元件」，Lit 的 web component 剛好。我不用 React 不是因為我討厭 React，是因為這個專案沒有需要 React 的理由，加進來反而要多背一整車的稅。後端 Express 加 tsx，兩百行程式碼，沒有任何魔法。投影片用 reveal.js，這是十年前就解決的問題，我沒必要再發明一次。TTS 用 Azure 的 neural voice，因為 Google 的聽起來像機器人在念菜單。唯一用到 AI 的地方是 Gemini，而且只是備案，等一下會講。

---

## Architecture — Four Boxes and a Hash

```
┌──────────┐   upload    ┌──────────┐   parse    ┌──────────┐
│ markdown │ ──────────> │ /api/up  │ ─────────> │ slides   │
└──────────┘             └──────────┘            │  .json   │
                              │                  └────┬─────┘
                              │ hash=sha1(md)         │
                              ▼                       ▼
                         ┌──────────┐            ┌──────────┐
                         │ storage/ │            │ render   │
                         │  <hash>/ │ <──────────│ slides   │
                         └──────────┘    html    └──────────┘
                              ▲
                              │ mp3 per slide (cache-keyed)
                              │
                         ┌──────────┐
                         │ Azure TTS│
                         └──────────┘
```

### Speaker Notes

整體架構就是四個盒子跟一個 hash。使用者上傳 markdown，伺服器先拿檔案內容算一個 sha1 當作 deck id，這個 id 也直接當資料夾名。`parse-md.ts` 把 markdown 切成投影片 JSON，`render-slides.ts` 用 marked 轉成 HTML。最有趣的是音檔這一塊：每次要產生音檔時，我不是拿 deck id 當 key，而是拿「語音 + 語速 + 語氣 + 所有講稿文字」再算一次 hash。這個決定等一下會再講，因為它讓我省了很多錢。你們現在在螢幕上看到的這個圖是我用 ASCII 畫的，因為我懶得開 Figma，而且 Wuti-Presentation 反正也不支援貼圖。

---

## The 80/20 Decision — Deterministic First, AI Second

```ts
let parsed = parseSlides(md)          // regex + split
if (parsed.slides.length < 2) {       // only if that fails...
  parsed = await geminiParseDeck(md)  // ...call the LLM
}
```

**Rule:** if a 30-line parser can do it, don't call an API.

**Reality:** my 30-line parser handles 95% of my markdown. Gemini cleans up the rest.

### Speaker Notes

這是整個專案我最想分享的一個決定。很多人現在做工具，第一個反應都是「丟給 LLM 做」。但 LLM 有三個問題：慢、貴、不穩定。我的 markdown parser 大概三十行，就是 split 加 regex，處理我 95% 的輸入沒問題。只有當我把一份結構很奇怪的文件丟進去，切不出兩頁以上時，我才會呼叫 Gemini 救場。這個模式我叫它「規則先行、AI 接手」，`parse-md.ts` 就是這樣寫的。它的好處是：我日常寫的筆記永遠都是零延遲、零成本；只有奇怪的格式才會觸發昂貴的路徑。LLM 不是 hammer，是 safety net。

---

## The Caching Trick That Saved My Azure Bill

Cache key is **not** the deck id. It's a hash of:

```
sha1({ voice, rate, tone, notes: [...] })
```

**Why it matters:**
- Edit slide 3's note → only slide 3 re-synthesizes
- Switch voice → new variant folder, old one still warm
- Practice same deck twice → 0 API calls

```
storage/<deck>/audio/<variant-hash>/slide-1.mp3
storage/<deck>/audio/<variant-hash>/slide-2.mp3
```

### Speaker Notes

做語音合成最痛的一件事就是，它很貴。Azure 的 neural voice 是按字元算錢的，一份十分鐘的講稿，每改一個字就重新合成整份，一個晚上可以燒掉一杯咖啡的錢。所以我做了一件很小、但效果很好的事：cache key 不是用 deck id，而是把「聲音 + 語速 + 語氣 + 講稿內容」一起算 hash。這樣當我只改第三頁的講稿，前兩頁跟後面所有頁的音檔 hash 都沒變，直接從硬碟拿；當我想換一個聲音試試，舊的那組音檔還在，也不會被覆蓋。這段程式碼在 `server/index.ts` 的 `/api/generate-audio` 裡面，大概二十行。有時候讓產品好用的，不是炫技，而是一個雜湊函式。

---

## Live Meta Moment — You're Inside the Demo

This slide is being narrated by:

- **Voice:** Yunyi Multilingual Neural (Azure)
- **Rate:** `+15%`
- **Tone:** `podcast`

If you think my intonation is weird, that's a pull request opportunity.

*(Look, ma, no speaker!)*

### Speaker Notes

好，我們現在進入這場分享最詭異的一個時刻。這一頁你聽到的聲音，其實不是我。你現在聽到的是 Azure 的 Yunyi Multilingual Neural 語音，rate 加 15%，語氣設成 podcast。也就是說，我整場分享做的事，就是 demo 這個工具本身。這叫「吃自己的狗糧」，英文叫 dogfooding。如果你覺得我語調很怪，那不是我的問題，是微軟的問題，歡迎去微軟 GitHub 發 issue。如果你覺得流暢，那是我的功勞，因為這個聲音是我選的。這個選擇基於一個很科學的方法：我把每個聲音都拿來念「今天天氣真好」，再挑一個聽起來最不像推銷員的。

---

## Things I Got Wrong

1. **First version parsed with Gemini by default.** Slow, flaky, expensive. Inverted it to rule-first.
2. **First cache key was just the deck id.** Changing one slide re-billed the whole deck.
3. **First player polled for audio readiness.** Replaced with "mount now, stream later" — player appears before all mp3s are done.
4. **Tried to support PPTX import.** Abandoned after two days. Markdown only. Life is too short.

### Speaker Notes

這頁是懺悔時間。第一個版本我太興奮，把整份 markdown 直接丟給 Gemini 幫我切頁。結果上傳一份檔案要等70秒，而且它偶爾還會自己亂改我的字，我寫「Wuti」，它幫我改成「Wuteee」。所以我後來把順序倒過來，規則先、AI 後。第二個錯是 cache key 用 deck id，我改一個字，整份就重唸，一個晚上 Azure 帳單漲得像股價。第三個錯是我一開始等所有音檔都生完才顯示播放器，結果使用者以為當機了。現在是先把播放器掛上去，音檔一個一個 stream 進來，你看到的就是這個行為。第四個是支援 PPTX import，我試了兩小時就放棄了。支援 markdown 就好，人生苦短。

---

## What I'd Tell Myself on Day 0

- **Start with the demo, not the architecture.** I wasted a day on a plugin system nobody needed.
- **Every async boundary is a cache opportunity.** If it touches the network, it gets a hash key.
- **AI is a fallback, not a foundation.** Deterministic code is cheaper, faster, and debuggable.
- **Small scope beats big vision.** "Markdown to narrated deck" is shippable. "The future of presentations" is not.

### Speaker Notes

如果我可以回到第零天跟自己講四件事，就是這四件。第一，先做出能 demo 的東西，再想架構。我第一天花在設計一個插件系統，後來根本沒人用，包括我自己。第二，每個網路邊界都是一個快取機會，只要它會打外部 API，就給它一個 hash key，不要嫌麻煩。第三，AI 是備案，不是地基。用規則寫的東西便宜、快、debug 得動；用 LLM 寫的東西，你改一行 prompt，整個世界都會崩潰。第四，小範圍勝過大願景。「把 markdown 變成會講話的簡報」這句話你今天做得完；「重新定義簡報的未來」那種句子，你做十年也做不完，而且客戶會跑光。

---

## What's Next

- Per-slide timing marks (so animations can sync to the narration)
- A "rehearsal" mode where I can correct pronunciation before commit
- Export to MP4 so I can skip the sharing session entirely next time

Also: if you've heard this far, I didn't say a single word of it. Thanks, Yunyi.

### Speaker Notes

最後講一下之後想做什麼。第一，想加入每一頁內部的時間點標記，這樣如果我講到「看這裡」，箭頭就剛好出現，做出那種跟 TED talk 一樣精緻的感覺。第二，rehearsal mode，讓我可以在產生音檔前先聽聽看有沒有哪個字念錯。「Wuti」這個字它一直念成「屋提」，我想糾正它。第三，匯出成 MP4，這樣下次分享會我連出現都不用出現，直接送一個檔案給主辦單位。最後那句話是真的：從頭到尾這場分享我一個字都沒唸，都是 Yunyi 唸的。謝謝 Yunyi，謝謝大家。Q&A 時間我會親自上場，到時候講得不好請見諒，因為 Azure 沒有辦法幫我回答問題。

---

## Q&A — Back to Carbon-Based Speaker

**Repo:** (Not published yet)

**Stack:** Lit · Vite · Express · reveal.js · Azure TTS · Gemini (as referee)

**Philosophy:** boring tech, aggressive caching, markdown forever

### Speaker Notes

好，這一頁沒有腳本，因為從這一秒開始就是我本人上場了。有任何問題都可以問，包括「為什麼取這個名字」、「Azure 帳單到底多少」、「為什麼不用 Next.js」。前兩題我會誠實回答，第三題我會說「因為我想」，然後喝一口水。謝謝。
