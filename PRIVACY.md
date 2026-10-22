# 阿吉編譯隱私權政策

最後更新：2026-10-22

## 送出的資料

按下「編譯成中英雙語講義」（右鍵選單或 Alt+J）時，阿吉編譯會擷取目前網頁的文章正文，然後把以下內容送到 Google Gemini API（generativelanguage.googleapis.com）：

- 文章標題
- 文章正文段落
- 當天日期

網址、瀏覽紀錄和其他分頁的內容都不會送出。Google 怎麼處理這些資料，要看你的 API 金鑰適用的 Gemini API 條款（https://ai.google.dev/gemini-api/terms）。

## 存在本機的資料

- Gemini API 金鑰、模型、儲存資料夾等設定：存在瀏覽器的擴充功能儲存空間（storage.local），只會送到 Google 用來呼叫 API。
- 待編譯的文章：開啟講義頁面後就刪除，沒開啟的一天後清除。
- 講義的字級和深色模式偏好：存在瀏覽器裡。
- 編譯好的講義：存成 HTML 檔，放在你的下載資料夾。

## 不收集的資料

作者不經營伺服器，不收集任何資料，也沒有分析或追蹤程式。

## 聯絡

https://github.com/taitungsun/a-ji-compile/issues

---

# A-Ji Compile Privacy Policy

Last updated: 2026-10-22

When you run "編譯成中英雙語講義" (context menu or Alt+J), A-Ji Compile extracts the article on the current page. It sends the article title, the article paragraphs and today's date to the Google Gemini API (generativelanguage.googleapis.com), using your own API key. It does not send the page URL, your browsing history or the content of other tabs. Google handles this data under the Gemini API terms that apply to your key.

Your API key and settings are stored locally in the extension's storage and are sent only to Google to call the API. A pending article is deleted once the handout page opens, or after one day if the page never opens. Compiled handouts are saved as HTML files in your downloads folder.

The author runs no server and collects no data. The extension contains no analytics or tracking.

Contact: https://github.com/taitungsun/a-ji-compile/issues
