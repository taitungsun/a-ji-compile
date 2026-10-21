"""打包 Chrome 與 Firefox 版。

用法（在專案根目錄）：python tools/build.py
產出 dist/a-ji-compile-v{版本}.zip（Chrome / Brave / Edge，解壓縮後「載入未封裝項目」）
與 dist/a-ji-compile-firefox-v{版本}.zip（上傳到 addons.mozilla.org 簽署用）。

Firefox 版靠 updates.json 自動更新。拿到 AMO 簽署好的 xpi 後執行
python tools/build.py --update-json <簽署好的.xpi>
會在 updates.json 加入這一版（含 sha256），把 xpi 放上 release 後再 commit、push。

兩版共用同一份程式碼，只有 manifest 不同：Firefox 不支援 background.service_worker，
改用 background.scripts（事件頁），另外需要 gecko id 與資料收集聲明。
"""

import hashlib
import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
REPO = "taitungsun/a-ji-compile"
GECKO_ID = "a-ji-compile@taitungsun"

# 不放進安裝包的檔案（說明文件、截圖、打包腳本）
EXCLUDE_PREFIXES = ("docs/", "tools/", "dist/", ".git")
EXCLUDE_NAMES = {"README.md"}

FIREFOX_SETTINGS = {
    "gecko": {
        "id": GECKO_ID,
        "strict_min_version": "140.0",
        # 不公開版沒有 AMO 代管更新，Firefox 定期讀這份清單
        "update_url": f"https://raw.githubusercontent.com/{REPO}/main/updates.json",
        # 文章內容會送到 Google Gemini 翻譯
        "data_collection_permissions": {"required": ["websiteContent"]},
    }
}


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    for name in out.splitlines():
        if name.startswith(EXCLUDE_PREFIXES) or name in EXCLUDE_NAMES:
            continue
        if name.startswith("RELEASE_") or name == "manifest.json":
            continue
        yield name


def firefox_manifest(manifest):
    m = dict(manifest)
    m["background"] = {"scripts": [manifest["background"]["service_worker"]]}
    m["browser_specific_settings"] = FIREFOX_SETTINGS
    return m


def write_zip(path, manifest, prefix=""):
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            prefix + "manifest.json",
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        )
        for name in tracked_files():
            zf.write(ROOT / name, prefix + name)
    print(path.relative_to(ROOT))


def add_update_entry(xpi):
    xpi = Path(xpi)
    with zipfile.ZipFile(xpi) as zf:
        version = json.loads(zf.read("manifest.json"))["version"]
        if not any(n.startswith("META-INF/") for n in zf.namelist()):
            sys.exit(f"{xpi.name} 沒有簽署，請用 AMO 簽署好的 xpi")
    digest = hashlib.sha256(xpi.read_bytes()).hexdigest()
    path = ROOT / "updates.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"addons": {}}
    updates = data["addons"].setdefault(GECKO_ID, {"updates": []})["updates"]
    updates[:] = [u for u in updates if u["version"] != version]
    updates.append({
        "version": version,
        "update_link": f"https://github.com/{REPO}/releases/download/v{version}/a-ji-compile-firefox-v{version}.xpi",
        "update_hash": f"sha256:{digest}",
    })
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(f"updates.json：加入 {version}")


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--update-json":
        return add_update_entry(sys.argv[2])
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    # Chrome 版包一層資料夾，解壓縮後直接選那個資料夾載入
    write_zip(DIST / f"a-ji-compile-v{version}.zip", manifest, prefix="a-ji-compile/")
    # Firefox 版 manifest.json 必須在 zip 根目錄
    write_zip(DIST / f"a-ji-compile-firefox-v{version}.zip", firefox_manifest(manifest))


if __name__ == "__main__":
    sys.exit(main())
